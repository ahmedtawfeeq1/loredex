import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import pc from 'picocolors'
import { loadConfig } from '../core/config'
import { serializeDoc } from '../core/frontmatter'
import { rebuildIndexes } from '../core/indexer'
import { buildDashboard, PRODUCT_BRIEF_NAME, renderDashboardMarkdown } from '../core/product'
import { gitAutoCommit, gitPullPush } from '../core/router'
import { curateProductWithLlm, type ProductPlan } from '../llm/product-curator'

/** The LLM sections of the product brief — rendered above the deterministic dashboard. */
function renderPlanMarkdown(plan: ProductPlan): string {
  const lines: string[] = [`**Objective:** ${plan.objective}`, '', plan.brief.trim()]
  if (plan.project_states.length > 0) {
    lines.push('', '## Where each project stands', '')
    for (const state of plan.project_states) {
      lines.push(`- **${state.project}** — ${state.state} _Next: ${state.next}_`)
    }
  }
  if (plan.reading_order.length > 0) {
    lines.push('', '## Reading order for the full picture', '')
    plan.reading_order.forEach((entry, i) => {
      const note = entry.includes('/') ? (entry.split('/').pop() as string) : entry
      lines.push(`${i + 1}. [[${note}]] ${entry.includes('/') ? `(${entry.split('/')[0]})` : ''}`)
    })
  }
  if (plan.risks.length > 0) {
    lines.push('', '## Risks and contradictions (review — not auto-applied)', '')
    for (const risk of plan.risks) {
      lines.push(`- ${risk.description} — ${risk.notes.map((n) => `[[${n}]]`).join(', ')}`)
    }
  }
  if (plan.duplicates.length > 0) {
    lines.push('', '## Duplicate coverage across projects', '')
    for (const dup of plan.duplicates) {
      lines.push(`- ${dup.description} — ${dup.notes.map((n) => `[[${n}]]`).join(', ')}`)
    }
  }
  if (plan.next_actions.length > 0) {
    lines.push('', '## Product next actions', '')
    for (const action of plan.next_actions) lines.push(`- ${action}`)
  }
  return lines.join('\n')
}

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

  let plan: ProductPlan | null = null
  if (opts.llm) {
    const started = Date.now()
    const tick = () => {
      const elapsed = Math.round((Date.now() - started) / 1000)
      process.stdout.write(
        `\r${pc.dim(`LLM reducing ${dashboard.states.length} project brief(s) into the product view… ${elapsed}s`)}   `,
      )
    }
    // \r line-rewrites only make sense on a real terminal; piped output gets one line
    const interactive = process.stdout.isTTY === true
    if (interactive) tick()
    else console.log(pc.dim('LLM reducing project briefs into the product view…'))
    const ticker = interactive ? setInterval(tick, 1000) : null
    plan = await curateProductWithLlm(dashboard, opts.objective)
    if (ticker) clearInterval(ticker)
    if (interactive) process.stdout.write(`\r${' '.repeat(100)}\r`)
    if (plan) {
      console.log(pc.bold('objective:'), plan.objective)
      console.log(pc.bold('brief:'), `${plan.brief.replace(/\s+/g, ' ').slice(0, 240)}…`)
      if (plan.risks.length > 0) {
        console.log(pc.bold('risks/contradictions:'))
        for (const risk of plan.risks) console.log(`  - ${risk.description}`)
      }
      if (plan.duplicates.length > 0) {
        console.log(pc.bold('duplicate coverage:'))
        for (const dup of plan.duplicates) console.log(`  - ${dup.description}`)
      }
    } else {
      console.log(pc.yellow('!'), 'no LLM available or call failed — dashboard-only product brief')
    }
  }

  const body = [
    '# Start here — Product',
    '',
    ...(plan ? [renderPlanMarkdown(plan), '', '---', ''] : []),
    renderDashboardMarkdown(dashboard, today),
  ].join('\n')

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
