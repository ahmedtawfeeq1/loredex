import { basename, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import pc from 'picocolors'
import { type Config, defaultVaultPath, loadConfig, saveConfig } from '../core/config'
import type { PlanItem } from '../core/router'
import { executePlan, knownStructure, planFile } from '../core/router'
import { findCandidates } from '../core/scan'
import { scaffoldVault } from '../core/vault'

export interface AdoptOptions {
  move?: boolean
  dryRun?: boolean
  yes?: boolean
  llm: boolean
}

export async function runAdopt(target: string | undefined, opts: AdoptOptions): Promise<void> {
  const root = resolve(target ?? process.cwd())
  const projectName = basename(root)

  // zero-setup path: `npx loredex adopt` on a fresh machine just works
  const config: Config = loadConfig() ?? {
    vaultPath: defaultVaultPath(),
    sync: 'none',
    projects: {},
  }
  scaffoldVault(config.vaultPath)
  config.projects[root] = config.projects[root] ?? { name: projectName }
  saveConfig(config)

  const candidates = findCandidates(root)
  if (candidates.length === 0) {
    console.log(pc.dim('nothing to adopt — no unrouted research-shaped markdown found'))
    return
  }

  console.log(`found ${pc.bold(String(candidates.length))} candidate file(s), classifying…`)
  const known = knownStructure(config.vaultPath)
  const items: PlanItem[] = []
  for (const [index, candidate] of candidates.entries()) {
    const item = planFile(
      candidate.path,
      candidate.raw,
      opts.move ? 'move' : 'copy',
      config.vaultPath,
      {
        projectRoot: root,
        projectName: config.projects[root]?.name ?? projectName,
        useLlm: opts.llm,
        knownProjects: known.projects,
        knownTopics: known.topics,
      },
    )
    items.push(item)
    console.log(
      pc.dim(`  [${index + 1}/${candidates.length}]`),
      relative(root, candidate.path),
      pc.dim('→'),
      `${item.meta.project}/${item.meta.topic}`,
    )
  }

  console.log()
  for (const item of items) {
    console.log(
      ` ${relative(root, item.source)} ${pc.dim('→')} ${relative(
        config.vaultPath,
        `${item.destDir}/${item.destName}`,
      )}`,
    )
  }
  console.log()
  console.log(
    opts.move
      ? pc.yellow('files will be MOVED into the vault')
      : 'files will be copied into the vault; originals stay and get a `loredex: routed` marker',
  )

  if (opts.dryRun) {
    console.log(pc.dim(`dry run — ${items.length} file(s), nothing written`))
    return
  }

  if (!opts.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question('Proceed? [y/N] ')
    rl.close()
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log(pc.dim('aborted'))
      return
    }
  }

  const { written } = executePlan(items, config.vaultPath, config)
  console.log()
  console.log(pc.green('✓'), `adopted ${written.length} note(s) into ${config.vaultPath}`)
  console.log(pc.green('✓'), 'indexes rebuilt — open the vault folder in Obsidian')
}
