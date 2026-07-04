import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import pc from 'picocolors'
import { configPath, loadConfig } from '../core/config'
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
}
