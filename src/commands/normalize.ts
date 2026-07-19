import pc from 'picocolors'
import { loadResolvedConfig } from '../core/config'
import { isAgentOps } from '../core/dex'
import { rebuildIndexes } from '../core/indexer'
import { gitAutoCommit } from '../core/router'
import { listProjects, normalizeClient } from '../lib'

export interface NormalizeCmdOptions {
  pipeline?: string
  stage?: string
  agent?: string
}

/**
 * `loredex normalize [client]` — bring one client (or the whole fleet) up to
 * the canonical agent-ops structure: the six folders, a .gitkeep in each empty
 * container, and a starter pipeline/stage/agent where none exist. Idempotent.
 */
export function runNormalize(client: string | undefined, opts: NormalizeCmdOptions): void {
  const config = loadResolvedConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `npx -y loredex@latest init` first'))
    process.exitCode = 1
    return
  }
  const vaultPath = config.vaultPath
  if (!isAgentOps(vaultPath)) {
    console.error(pc.red('this is a research dex — `loredex normalize` applies to agent-ops dexes'))
    process.exitCode = 1
    return
  }

  const targets = client ? [client] : listProjects(vaultPath)
  if (targets.length === 0) {
    console.log(pc.dim('no clients to normalize'))
    return
  }

  try {
    let changed = 0
    for (const name of targets) {
      const result = normalizeClient(vaultPath, name, opts)
      if (result.alreadyCanonical) continue
      changed++
      console.log(pc.green('✓'), `${result.slug}: +${result.created.length} path(s)`)
      for (const rel of result.created) console.log(pc.dim(`    ${rel}`))
    }
    if (changed === 0) {
      console.log(pc.green('✓'), 'every client is already canonical — nothing to do')
      return
    }
    rebuildIndexes(vaultPath)
    gitAutoCommit(
      vaultPath,
      config,
      client
        ? `loredex: normalize client ${client}`
        : `loredex: normalize fleet structure (${changed} client${changed === 1 ? '' : 's'})`,
    )
    console.log(pc.green('✓'), `normalized ${changed} client${changed === 1 ? '' : 's'}`)
  } catch (error) {
    console.error(pc.red(error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  }
}
