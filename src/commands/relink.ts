import { existsSync } from 'node:fs'
import { relative } from 'node:path'
import pc from 'picocolors'
import { loadResolvedConfig } from '../core/config'
import { rebuildIndexes } from '../core/indexer'
import { repairVaultLinks } from '../core/relink'
import { gitAutoCommit } from '../core/router'

export function runRelink(opts: { dryRun?: boolean }): void {
  const config = loadResolvedConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `npx -y loredex@latest init` first'))
    process.exitCode = 1
    return
  }
  const vault = config.vaultPath
  if (!existsSync(vault)) {
    console.error(pc.red(`vault missing: ${vault}`))
    process.exitCode = 1
    return
  }

  const repaired = repairVaultLinks(vault, { dryRun: opts.dryRun })
  if (repaired.length === 0) {
    console.log(pc.green('✓'), 'no repairable wikilinks — vault links are clean')
    return
  }
  for (const { path, changed } of repaired) {
    console.log(
      opts.dryRun ? pc.yellow('would fix') : pc.green('fixed'),
      relative(vault, path),
      pc.dim(`${changed} link(s)`),
    )
  }
  if (!opts.dryRun) {
    rebuildIndexes(vault)
    gitAutoCommit(vault, config, `loredex: relink ${repaired.length} note(s)`)
  }
}
