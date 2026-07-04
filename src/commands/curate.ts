import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import pc from 'picocolors'
import { findProject, loadConfig } from '../core/config'
import {
  applyCuration,
  buildDigest,
  collectNotes,
  filterNotes,
  findOrphans,
  projectDir,
  sanitizeNotes,
  stampDrift,
} from '../core/curate'
import { findDrifted } from '../core/drift'
import { rebuildIndexes } from '../core/indexer'
import { gitAutoCommit, knownStructure } from '../core/router'
import { slugify } from '../core/vault'
import { curateWithLlm } from '../llm/curator'

export interface CurateOptions {
  objective?: string
  topic?: string[]
  since?: string
  dryRun?: boolean
  yes?: boolean
  llm: boolean
  maxDetailed?: number
}

export async function runCurate(
  projectArg: string | undefined,
  opts: CurateOptions,
): Promise<void> {
  const config = loadConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `npx -y loredex@latest init` first'))
    process.exitCode = 1
    return
  }

  const project = projectArg ?? findProject(config, process.cwd())?.name
  if (!project || !existsSync(projectDir(config.vaultPath, project))) {
    const available = knownStructure(config.vaultPath).projects.join(', ') || '(none)'
    console.error(
      pc.red(`unknown project${project ? `: ${project}` : ''} — available: ${available}`),
    )
    process.exitCode = 1
    return
  }

  const all = collectNotes(config.vaultPath, project)
  const scoped = Boolean(opts.topic?.length || opts.since)
  const notes = filterNotes(all, { topics: opts.topic, since: opts.since })
  if (notes.length === 0) {
    console.log(pc.dim('no notes in scope — check --topic/--since filters'))
    return
  }
  console.log(
    `curating ${pc.bold(String(notes.length))} of ${all.length} notes in ${slugify(project)}`,
  )

  const ghostLinks = sanitizeNotes(notes, false)
  if (ghostLinks > 0) console.log(`ghost wikilinks to clean (e.g. [[x.py]]): ${ghostLinks}`)

  const orphans = findOrphans(all, new Set(notes.map((note) => note.name)))
  if (orphans.length > 0) console.log(`orphaned (no inbound links): ${orphans.join(', ')}`)

  const drift = findDrifted(notes)
  if (drift.length > 0) {
    console.log(`drifted (source changed since filing): ${drift.length}`)
    for (const entry of drift) console.log(pc.dim(`  ${entry.note} — ${entry.reason}`))
  }

  let plan = null
  if (opts.llm) {
    const started = Date.now()
    const tick = () => {
      const elapsed = Math.round((Date.now() - started) / 1000)
      process.stdout.write(
        `\r${pc.dim(`LLM reading ${notes.length}-note digest and writing the brief… ${elapsed}s (typically 30–90s)`)}   `,
      )
    }
    const digest = buildDigest(notes, opts.maxDetailed)
    if (digest.indexOnlyCount > 0) {
      console.log(
        pc.dim(
          `digest: ${digest.detailedCount} note(s) in full, ${digest.indexOnlyCount} older note(s) as metadata-only index`,
        ),
      )
    }
    tick()
    const ticker = setInterval(tick, 1000)
    plan = await curateWithLlm({
      projectName: project,
      objective: opts.objective,
      digest: digest.text,
    })
    clearInterval(ticker)
    process.stdout.write(`\r${' '.repeat(90)}\r`)
    if (!plan) {
      console.log(
        pc.yellow('!'),
        'no LLM available or call failed — running the deterministic pass only',
      )
    }
  }

  if (plan) {
    console.log()
    console.log(pc.bold('objective:'), plan.objective)
    console.log(pc.bold('brief:'), `${plan.brief.replace(/\s+/g, ' ').slice(0, 240)}…`)
    console.log(pc.bold('reading order:'))
    for (const [i, name] of plan.reading_order.entries()) console.log(`  ${i + 1}. ${name}`)
    if (plan.stale.length > 0) {
      console.log(pc.bold('stale:'))
      for (const entry of plan.stale) console.log(`  - ${entry.note} — ${entry.reason}`)
    }
    if (plan.duplicates.length > 0) {
      console.log(pc.bold('merge candidates:'))
      for (const dup of plan.duplicates) {
        console.log(`  - keep ${dup.canonical}; superseded: ${dup.redundant.join(', ')}`)
      }
    }
    console.log(pc.bold('semantic clusters:'), String(plan.clusters.length))
  }

  if (opts.dryRun) {
    console.log(pc.dim('dry run — nothing written'))
    return
  }

  if (!opts.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question('Apply? [y/N] ')
    rl.close()
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log(pc.dim('aborted'))
      return
    }
  }

  const cleaned = sanitizeNotes(notes, true)
  if (cleaned > 0) console.log(pc.green('✓'), `rewrote ${cleaned} ghost wikilink(s)`)

  if (plan) {
    // drift is deterministic and already correct — fold it into the LLM's stale list
    // instead of stamping twice or asking the model to re-derive what git already told us
    for (const entry of drift) {
      if (!plan.stale.some((s) => s.note === entry.note)) plan.stale.push(entry)
    }
    const result = applyCuration(config.vaultPath, project, plan, notes, {
      scoped,
      objective: opts.objective,
    })
    console.log(pc.green('✓'), `brief written: ${result.briefPath}`)
    if (result.staleStamped > 0)
      console.log(pc.green('✓'), `stale-stamped ${result.staleStamped} note(s)`)
    if (result.duplicatesStamped > 0)
      console.log(pc.green('✓'), `superseded-stamped ${result.duplicatesStamped} duplicate(s)`)
    if (result.relinked > 0)
      console.log(pc.green('✓'), `semantic Related links on ${result.relinked} note(s)`)
  } else if (drift.length > 0) {
    const stamped = stampDrift(notes, drift, true)
    console.log(pc.green('✓'), `stale-stamped ${stamped} drifted note(s)`)
  }

  rebuildIndexes(config.vaultPath)
  gitAutoCommit(config.vaultPath, config, `loredex: curate ${slugify(project)}`)
  console.log(pc.green('✓'), 'indexes rebuilt')
}
