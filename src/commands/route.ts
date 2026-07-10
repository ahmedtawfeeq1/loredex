import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import pc from 'picocolors'
import { findProject, loadConfig } from '../core/config'
import { isRoutable, isRouted, parseDoc } from '../core/frontmatter'
import type { PlanItem } from '../core/router'
import { executePlan, knownStructure, planFile, refreshRoutedCopies } from '../core/router'
import { findCandidates, walkMarkdown } from '../core/scan'
import { inboxPath } from '../core/vault'

export interface RouteOptions {
  from?: string
  dryRun?: boolean
  quiet?: boolean
  strict?: boolean
  llm: boolean
}

export function runRoute(opts: RouteOptions): void {
  const config = loadConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `npx -y loredex@latest init` first'))
    process.exitCode = 1
    return
  }
  const log = opts.quiet ? () => {} : console.log
  const known = knownStructure(config.vaultPath)
  const items: PlanItem[] = []

  // 1. vault inbox — always processed, files move within the vault
  const inbox = inboxPath(config.vaultPath)
  for (const path of walkMarkdown(inbox)) {
    const raw = readFileSync(path, 'utf8')
    const { meta } = parseDoc(raw)
    if (isRouted(meta)) continue
    if (opts.strict && !isRoutable(meta)) continue
    items.push(
      planFile(path, raw, 'move', config.vaultPath, {
        projectRoot: inbox,
        projectName: '',
        useLlm: opts.llm,
        knownProjects: known.projects,
        knownTopics: known.topics,
      }),
    )
  }

  // 2. registered project — candidates are copied into the vault, originals stamped
  const project = findProject(config, resolve(opts.from ?? process.cwd()))
  if (project) {
    for (const candidate of findCandidates(project.path)) {
      const { meta } = parseDoc(candidate.raw)
      if (opts.strict && !isRoutable(meta)) continue
      items.push(
        planFile(candidate.path, candidate.raw, 'copy', config.vaultPath, {
          projectRoot: project.path,
          projectName: project.name,
          useLlm: opts.llm,
          knownProjects: known.projects,
          knownTopics: known.topics,
        }),
      )
    }
  }

  // already-routed sources whose content changed since routing — vault copies go stale otherwise
  if (project && !opts.dryRun) {
    const refreshed = refreshRoutedCopies(project.path, config.vaultPath, config)
    if (refreshed.length > 0)
      log(pc.green('✓'), `refreshed ${refreshed.length} stale vault note(s)`)
  }

  if (items.length === 0) {
    log(pc.dim('nothing to route'))
    return
  }

  if (opts.dryRun) {
    for (const item of items) {
      log(
        `${relative(process.cwd(), item.source)} ${pc.dim('→')} ${relative(
          config.vaultPath,
          `${item.destDir}/${item.destName}`,
        )} ${pc.dim(`(${item.mode})`)}`,
      )
    }
    log(pc.dim(`dry run — ${items.length} file(s), nothing written`))
    return
  }

  const { written } = executePlan(items, config.vaultPath, config)
  log(pc.green('✓'), `routed ${written.length} note(s) into ${config.vaultPath}`)
}
