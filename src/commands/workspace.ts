import pc from 'picocolors'
import { loadConfig } from '../core/config'
import { isAgentOps } from '../core/dex'
import { slugify } from '../core/vault'
import { materializeWorkspace } from '../core/workspace'

export interface WorkspaceOptions {
  check?: boolean
}

/** `loredex workspace <client> [--check]` — generate (or verify) the client's agent tooling. */
export function runWorkspace(client: string, opts: WorkspaceOptions): void {
  const config = loadConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `npx -y loredex@latest init` first'))
    process.exitCode = 1
    return
  }
  if (!isAgentOps(config.vaultPath)) {
    console.error(pc.red('this is a research dex — `loredex workspace` applies to agent-ops dexes'))
    process.exitCode = 1
    return
  }
  try {
    const result = materializeWorkspace(config.vaultPath, slugify(client), {
      check: opts.check,
    })
    for (const rel of result.wrote) console.log(pc.green('✓'), `wrote ${rel}`)
    for (const rel of result.wouldChange) console.log(pc.yellow('!'), `out of date: ${rel}`)
    for (const name of result.missingEnv) {
      console.log(pc.yellow('!'), `missing env var \${${name}} — value left unexpanded`)
    }
    if (opts.check) {
      if (result.ok) {
        console.log(pc.green('✓'), 'workspace up to date')
      } else {
        console.log(pc.red('✗'), `run \`loredex workspace ${client}\` to regenerate`)
        process.exitCode = 1
      }
      return
    }
    if (result.wrote.length === 0) console.log(pc.green('✓'), 'workspace already up to date')
    if (result.missingEnv.length > 0) process.exitCode = 1
  } catch (error) {
    console.error(pc.red(error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  }
}
