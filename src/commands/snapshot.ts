import pc from 'picocolors'
import { loadResolvedConfig } from '../core/config'
import { isAgentOps } from '../core/dex'
import { rebuildIndexes } from '../core/indexer'
import { gitAutoCommit } from '../core/router'
import { listSnapshots, snapshotUnit } from '../core/snapshot'

export interface SnapshotCmdOptions {
  tables?: boolean
  note?: string
  list?: boolean
}

/** `YYYY-MM-DD_HHMMSS` in local time — the snapshot stamp. */
function stampNow(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(
    d.getMinutes(),
  )}${p(d.getSeconds())}`
}

/**
 * `loredex snapshot <client> <unit> [--tables] [--note "..."]`
 * `loredex snapshot --list <client> [unit]`
 * Version a pipeline/agent's definition files into _versions/ (committed).
 */
export function runSnapshot(
  client: string | undefined,
  unit: string | undefined,
  opts: SnapshotCmdOptions,
): void {
  const config = loadResolvedConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `npx -y loredex@latest init` first'))
    process.exitCode = 1
    return
  }
  const vaultPath = config.vaultPath
  if (!isAgentOps(vaultPath)) {
    console.error(pc.red('this is a research dex — `loredex snapshot` applies to agent-ops dexes'))
    process.exitCode = 1
    return
  }
  if (!client) {
    console.error(pc.red('usage: loredex snapshot <client> <unit> [--tables] [--note "..."]'))
    console.error(pc.dim('       loredex snapshot --list <client> [unit]'))
    process.exitCode = 1
    return
  }

  try {
    if (opts.list) {
      const rows = listSnapshots(vaultPath, client, unit)
      if (rows.length === 0) {
        console.log(pc.dim(`no snapshots for ${client}${unit ? `/${unit}` : ''}`))
        return
      }
      for (const r of rows) {
        console.log(
          `${pc.bold(r.unit)}  ${r.stamp}  ${r.fileCount} file(s)${r.note ? `  — ${r.note}` : ''}`,
        )
      }
      return
    }
    if (!unit) {
      console.error(pc.red('usage: loredex snapshot <client> <unit> [--tables] [--note "..."]'))
      process.exitCode = 1
      return
    }
    const result = snapshotUnit(vaultPath, client, unit, stampNow(), {
      includeTables: opts.tables,
      note: opts.note,
    })
    rebuildIndexes(vaultPath)
    gitAutoCommit(vaultPath, config, `loredex: snapshot ${result.unit} ${result.stamp}`)
    console.log(pc.green('✓'), `snapshot ${result.dir}`)
    console.log(pc.dim(`  ${result.files.length} file(s)${result.note ? ` · ${result.note}` : ''}`))
  } catch (error) {
    console.error(pc.red(error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  }
}
