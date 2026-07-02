import { existsSync } from 'node:fs'
import { join } from 'node:path'
import pc from 'picocolors'
import { findProject, loadConfig } from '../core/config'
import { knownStructure } from '../core/router'
import { findCandidates, walkMarkdown } from '../core/scan'
import { inboxPath } from '../core/vault'

export function runStatus(): void {
  const config = loadConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `loredex init` first'))
    process.exitCode = 1
    return
  }
  const vault = config.vaultPath
  if (!existsSync(vault)) {
    console.error(pc.red(`vault missing: ${vault} — run \`loredex init\``))
    process.exitCode = 1
    return
  }

  const total =
    walkMarkdown(join(vault, 'projects')).length + walkMarkdown(join(vault, 'research')).length
  const pending = walkMarkdown(inboxPath(vault)).length
  const { projects, topics } = knownStructure(vault)

  console.log(pc.bold('vault'), vault)
  console.log(`  notes: ${total}   projects: ${projects.length}   topics: ${topics.length}`)
  console.log(`  inbox pending: ${pending}`)
  console.log(`  sync: ${config.sync}`)

  const project = findProject(config, process.cwd())
  if (project) {
    const unrouted = findCandidates(project.path).length
    console.log(pc.bold('project'), `${project.name} (${project.path})`)
    console.log(`  unrouted candidates: ${unrouted}`)
  }
}
