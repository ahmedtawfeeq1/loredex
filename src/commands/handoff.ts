import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import pc from 'picocolors'
import { findProject, loadConfig } from '../core/config'
import {
  buildDigest,
  type CurationPlan,
  collectNotes,
  filterNotes,
  projectDir,
  type ScopedNote,
} from '../core/curate'
import { type Meta, parseDoc, serializeDoc } from '../core/frontmatter'
import { rebuildIndexes } from '../core/indexer'
import { gitAutoCommit, gitPullPush, knownStructure } from '../core/router'
import { walkMarkdown } from '../core/scan'
import { slugify, uniquePath } from '../core/vault'
import { curateWithLlm } from '../llm/curator'

export interface HandoffOptions {
  to: string
  from?: string
  objective?: string
  since?: string
  topic?: string[]
  dryRun?: boolean
  yes?: boolean
  llm: boolean
}

/** LLM unavailable → a deterministic handoff still ships: objective + dated reading list. */
function fallbackPlan(objective: string, notes: ScopedNote[]): CurationPlan {
  const names = [...notes]
    .sort((a, b) => (b.meta.date ?? '').localeCompare(a.meta.date ?? ''))
    .slice(0, 10)
    .map((note) => note.name)
  return {
    objective,
    brief:
      'Generated without an LLM — the reading order below lists the most recent notes in ' +
      'scope. Read them newest-first; the interface/contract details live in the notes themselves.',
    reading_order: names,
    next_actions: [],
    stale: [],
    duplicates: [],
    clusters: [],
  }
}

export async function runHandoff(opts: HandoffOptions): Promise<void> {
  const config = loadConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `npx -y loredex@latest init` first'))
    process.exitCode = 1
    return
  }
  const from = opts.from ?? findProject(config, process.cwd())?.name
  if (!from || !existsSync(projectDir(config.vaultPath, from))) {
    const available = knownStructure(config.vaultPath).projects.join(', ') || '(none)'
    console.error(
      pc.red(`unknown source project${from ? `: ${from}` : ''} — available: ${available}`),
    )
    process.exitCode = 1
    return
  }
  const to = slugify(opts.to)

  const all = collectNotes(config.vaultPath, from)
  const notes = filterNotes(all, { topics: opts.topic, since: opts.since })
  if (notes.length === 0) {
    console.log(pc.dim('no notes in scope to hand off — check --since/--topic filters'))
    return
  }
  const objective = opts.objective ?? `consume the latest ${from} work`
  console.log(
    `handoff ${pc.bold(slugify(from))} → ${pc.bold(to)}: ${notes.length} note(s) in scope`,
  )

  let plan: CurationPlan | null = null
  if (opts.llm) {
    const digest = buildDigest(notes)
    console.log(pc.dim('LLM writing the handoff brief… (typically 30–90s)'))
    plan = await curateWithLlm({
      projectName: from,
      objective,
      digest: digest.text,
      audience: `the "${opts.to}" team, who must consume this work — focus on interfaces, payload/field semantics, decisions, and gotchas they need before building on it`,
    })
    if (!plan) console.log(pc.yellow('!'), 'LLM unavailable — writing a deterministic handoff')
  }
  plan ??= fallbackPlan(objective, notes)

  const known = new Set(notes.map((note) => note.name))
  const today = new Date().toISOString().slice(0, 10)
  const body = [
    `# Handoff — ${slugify(from)} → ${to}`,
    '',
    `**Objective:** ${plan.objective}`,
    '',
    plan.brief.trim(),
    '',
    '## Reading order',
    '',
    ...plan.reading_order
      .filter((name) => known.has(name))
      .map((name, i) => `${i + 1}. [[${name}]]`),
    ...(plan.next_actions.length > 0
      ? ['', '## Next actions', '', ...plan.next_actions.map((a) => `- ${a}`)]
      : []),
    '',
    '---',
    `_Consume with:_ \`npx -y loredex@latest handoffs --consume <this note's name>\``,
  ].join('\n')

  console.log()
  console.log(pc.bold('objective:'), plan.objective)
  console.log(pc.bold('brief:'), `${plan.brief.replace(/\s+/g, ' ').slice(0, 240)}…`)
  console.log(pc.bold('reading order:'), plan.reading_order.filter((n) => known.has(n)).join(', '))

  if (opts.dryRun) {
    console.log(pc.dim('dry run — nothing written'))
    return
  }
  if (!opts.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question(`Write handoff into projects/${to}/handoffs/? [y/N] `)
    rl.close()
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log(pc.dim('aborted'))
      return
    }
  }

  const meta: Meta = {
    project: opts.to,
    topic: 'handoffs',
    type: 'handoff',
    date: today,
    from_project: slugify(from),
    to_project: to,
    objective: plan.objective,
    status: 'open',
    source: 'loredex',
    loredex: 'routed',
  }
  const dest = uniquePath(
    join(config.vaultPath, 'projects', to, 'handoffs'),
    `${today}-handoff-${slugify(from)}.md`,
  )
  writeFileSync(dest, serializeDoc({ meta, body: `${body}\n` }))
  rebuildIndexes(config.vaultPath)
  gitAutoCommit(config.vaultPath, config, `loredex: handoff ${slugify(from)} -> ${to}`)
  const { pushed } = gitPullPush(config.vaultPath)

  console.log(pc.green('✓'), `handoff written: ${dest}`)
  console.log(
    pushed
      ? `${pc.green('✓')} synced to remote — the ${opts.to} team sees it on their next \`handoffs\` check`
      : `${pc.yellow('!')} not pushed (no remote reachable) — run \`npx -y loredex@latest sync\` when online`,
  )
}

export interface HandoffsOptions {
  project?: string
  consume?: string
}

/** List open handoffs addressed to a project; --consume marks one done. Pulls first so teammates' handoffs appear. */
export function runHandoffs(opts: HandoffsOptions): void {
  const config = loadConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `npx -y loredex@latest init` first'))
    process.exitCode = 1
    return
  }
  gitPullPush(config.vaultPath) // best-effort — offline just shows the local view

  const project = opts.project ?? findProject(config, process.cwd())?.name
  if (!project) {
    console.error(pc.red('no project given and cwd is not a registered project — pass --project'))
    process.exitCode = 1
    return
  }
  const dir = join(config.vaultPath, 'projects', slugify(project), 'handoffs')

  if (opts.consume) {
    const target = walkMarkdown(dir).find((file) => basename(file, '.md') === opts.consume)
    if (!target) {
      console.error(pc.red(`no handoff named "${opts.consume}" in ${dir}`))
      process.exitCode = 1
      return
    }
    const doc = parseDoc(readFileSync(target, 'utf8'))
    writeFileSync(
      target,
      serializeDoc({ meta: { ...doc.meta, status: 'consumed' }, body: doc.body }),
    )
    gitAutoCommit(config.vaultPath, config, `loredex: consume handoff ${opts.consume}`)
    gitPullPush(config.vaultPath)
    console.log(pc.green('✓'), `consumed: ${opts.consume}`)
    return
  }

  const open: Array<{ name: string; from: string; objective: string; path: string }> = []
  for (const file of walkMarkdown(dir)) {
    try {
      const meta = parseDoc(readFileSync(file, 'utf8')).meta
      if (meta.status === 'open') {
        open.push({
          name: basename(file, '.md'),
          from: meta.from_project ?? '?',
          objective: meta.objective ?? '',
          path: file,
        })
      }
    } catch {
      // unreadable note — skip
    }
  }
  if (open.length === 0) {
    console.log(pc.dim(`no open handoffs for ${slugify(project)}`))
    return
  }
  console.log(pc.bold(`${open.length} open handoff(s) for ${slugify(project)}:`))
  for (const handoff of open) {
    console.log(`  ${pc.green('●')} ${handoff.name} ${pc.dim(`(from ${handoff.from})`)}`)
    if (handoff.objective) console.log(`    ${pc.dim(handoff.objective)}`)
    console.log(`    ${pc.dim(handoff.path)}`)
  }
}
