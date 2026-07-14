import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import pc from 'picocolors'
import type { ClientInfo } from '../core/agent-ops'
import { configPath, loadConfig } from '../core/config'
import { vaultSchemaStatus } from '../core/consume'
import { isAgentOps } from '../core/dex'
import { lintAgentOps } from '../core/doctor-agent-ops'
import { detectEditors } from '../core/editors'
import { claudeAvailable } from '../llm/claude-cli'
import { codexAvailable } from '../llm/codex-cli'

export function runDoctor(): void {
  const config = loadConfig()
  const checks: Array<[string, boolean, string]> = []

  checks.push(['config', config !== null, configPath()])
  if (config) {
    checks.push(['vault', existsSync(config.vaultPath), config.vaultPath])
    checks.push(['inbox', existsSync(join(config.vaultPath, '_inbox')), ''])
    checks.push([
      'projects registered',
      Object.keys(config.projects).length > 0,
      `${Object.keys(config.projects).length}`,
    ])
    if (config.sync === 'git') {
      checks.push(['vault git repo', existsSync(join(config.vaultPath, '.git')), ''])
    }
    checks.push(['editor for code links', true, config.editor ?? 'system default'])
    if (existsSync(config.vaultPath)) {
      const schema = vaultSchemaStatus(config.vaultPath)
      checks.push([
        'frontmatter schema',
        schema.ok,
        `vault declares ${schema.declared ?? 'unversioned'}, engine supports ${schema.supported}`,
      ])
      if (!schema.ok) {
        console.log(
          pc.yellow('!'),
          `vault notes declare loredex_schema ${schema.declared} but this engine supports ${schema.supported} — update loredex before writing to this vault`,
        )
      }
    }
  }

  const editors = detectEditors()
  if (editors.length > 0) {
    checks.push([
      'editors detected',
      true,
      editors.map((editor) => `${editor.name} (--editor ${editor.scheme})`).join(', '),
    ])
  }
  const claude = claudeAvailable()
  const codex = codexAvailable()
  checks.push(['claude CLI (classifier)', claude, ''])
  checks.push(['codex CLI (classifier)', codex, ''])
  const git = (() => {
    try {
      return spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0
    } catch {
      return false
    }
  })()
  checks.push(['git', git, ''])

  for (const [name, ok, detail] of checks) {
    console.log(ok ? pc.green('✓') : pc.red('✗'), name, detail ? pc.dim(detail) : '')
  }
  if (!claude && !codex) {
    console.log(
      pc.yellow('!'),
      'no LLM CLI found — classification falls back to filename/path heuristics',
    )
  }
  if (!config) {
    console.log(
      pc.yellow('!'),
      'run `npx -y loredex@latest init` (or `adopt` in an existing project)',
    )
  } else if (!config.editor && editors.length > 0) {
    console.log(
      pc.yellow('!'),
      `no editor configured — run \`npx -y loredex@latest init --editor ${editors[0]?.scheme}\` to open code links in ${editors[0]?.name}`,
    )
  }

  if (config && existsSync(config.vaultPath) && isAgentOps(config.vaultPath)) {
    reportAgentOps(config.vaultPath)
  }
}

function reportAgentOps(vaultPath: string): void {
  const { findings, fleet } = lintAgentOps(vaultPath)
  console.log()
  console.log(pc.bold('agent-ops dex'))
  printFleetTable(fleet)
  for (const finding of findings) {
    const mark =
      finding.level === 'error'
        ? pc.red('✗')
        : finding.level === 'warn'
          ? pc.yellow('!')
          : pc.cyan('•')
    console.log(mark, `${finding.client}/${finding.scope}`, pc.dim(finding.message))
  }
  if (findings.length === 0 && fleet.length > 0) {
    console.log(pc.green('✓'), 'fleet clean — every client passes the agent-ops schema')
  }
  if (findings.some((f) => f.level === 'error')) process.exitCode = 1
}

function printFleetTable(fleet: ClientInfo[]): void {
  if (fleet.length === 0) {
    console.log(pc.dim('no clients yet — `loredex new client <name>`'))
    return
  }
  const rows = fleet.map((c) => [
    c.slug,
    c.manager ?? '—',
    `${c.pipelines.length}`,
    `${c.pipelines.reduce((n, p) => n + p.stages.length, 0)}`,
    `${c.agents.length}`,
    `${c.knowledgeTables.length}`,
    `${c.inboxCount}`,
    c.tags.map((t) => `#${t}`).join(' '),
  ])
  const header = ['client', 'manager', 'pipelines', 'stages', 'agents', 'tables', 'inbox', 'tags']
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)))
  const pad = (text: string, width: number): string =>
    text + ' '.repeat(Math.max(0, width - text.length))
  console.log(pc.dim(header.map((h, i) => pad(h, widths[i] ?? h.length)).join('  ')))
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(cell, widths[i] ?? 0)).join('  '))
  }
}
