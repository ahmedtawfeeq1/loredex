import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import pc from 'picocolors'
import { loadConfig } from '../core/config'
import { serializeDoc } from '../core/frontmatter'
import { rebuildIndexes } from '../core/indexer'
import { buildDashboard, PRODUCT_BRIEF_NAME, renderDashboardMarkdown } from '../core/product'
import { gitAutoCommit, gitPullPush } from '../core/router'

export interface ProductOptions {
  objective?: string
  refreshStale?: boolean
  dryRun?: boolean
  yes?: boolean
  llm: boolean
}

export async function runCurateProduct(opts: ProductOptions): Promise<void> {
  const config = loadConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `npx -y loredex@latest init` first'))
    process.exitCode = 1
    return
  }
  gitPullPush(config.vaultPath) // see teammates' latest before summarizing the product

  const today = new Date().toISOString().slice(0, 10)
  const dashboard = buildDashboard(config.vaultPath, today)
  if (dashboard.states.length === 0) {
    console.log(pc.dim('vault has no projects yet — adopt or route something first'))
    return
  }

  // deterministic dashboard always prints — with --no-llm it IS the product view
  console.log(pc.bold(`product: ${dashboard.states.length} project(s)`))
  for (const state of dashboard.states) {
    const brief =
      state.briefPath === null
        ? pc.yellow('no brief')
        : state.notesNewerThanBrief > 0
          ? pc.yellow(`brief stale (${state.notesNewerThanBrief} newer notes)`)
          : pc.green('brief current')
    console.log(
      `  ${state.project}: ${state.noteCount} notes, last ${state.lastDate || '-'}, ${state.staleCount} stale — ${brief}`,
    )
  }
  const open = dashboard.handoffs.filter((handoff) => handoff.status === 'open')
  console.log(
    open.length === 0 ? pc.dim('  no open handoffs') : pc.bold(`  ${open.length} open handoff(s):`),
  )
  for (const handoff of open) {
    console.log(`    ${handoff.from} → ${handoff.to} (${handoff.ageDays}d): ${handoff.objective}`)
  }

  const body = ['# Start here — Product', '', renderDashboardMarkdown(dashboard, today)].join('\n')

  if (opts.dryRun) {
    console.log(pc.dim('dry run — nothing written'))
    return
  }
  if (!opts.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question(`Write ${PRODUCT_BRIEF_NAME} at the vault root? [y/N] `)
    rl.close()
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log(pc.dim('aborted'))
      return
    }
  }

  const briefPath = join(config.vaultPath, PRODUCT_BRIEF_NAME)
  writeFileSync(
    briefPath,
    serializeDoc({
      // js-yaml refuses undefined values — only include objective when one was given
      meta: {
        type: 'brief',
        date: today,
        ...(opts.objective ? { objective: opts.objective } : {}),
        loredex: 'brief',
      },
      body: `${body}\n`,
    }),
  )
  rebuildIndexes(config.vaultPath)
  gitAutoCommit(config.vaultPath, config, 'loredex: curate --product')
  gitPullPush(config.vaultPath)
  console.log(pc.green('✓'), `product brief written: ${briefPath}`)
}
