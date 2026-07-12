import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import pc from 'picocolors'
import { type Config, defaultVaultPath, loadConfig, saveConfig } from '../core/config'
import { detectEditors } from '../core/editors'
import { setProduct } from '../core/products'
import { inboxPath, scaffoldVault, slugify } from '../core/vault'
import {
  agentsSnippet,
  claudePointer,
  cursorRuleFrontmatter,
  cursorRuleSnippet,
  MARKER_START,
} from '../templates'

export interface InitOptions {
  vault?: string
  project?: string
  sync?: string
  editor?: string
  product?: string
}

export function runInit(opts: InitOptions): void {
  const cwd = process.cwd()
  const existing = loadConfig()
  const vaultPath = resolve(opts.vault ?? existing?.vaultPath ?? defaultVaultPath())
  const projectName = opts.project ?? basename(cwd)

  const config: Config = existing ?? { vaultPath, sync: 'none', projects: {} }
  config.vaultPath = vaultPath
  config.projects[cwd] = { name: projectName }
  if (opts.sync === 'git') config.sync = 'git'
  if (opts.editor) config.editor = opts.editor

  // auto-pick when there's exactly one installed editor and the user hasn't chosen one yet —
  // ambiguous when several are installed, so leave those to an explicit --editor
  let autoDetected: string | null = null
  if (!config.editor) {
    const editors = detectEditors()
    if (editors.length === 1) {
      config.editor = editors[0]?.scheme
      autoDetected = editors[0]?.name ?? null
    }
  }

  scaffoldVault(vaultPath)
  saveConfig(config)

  // product grouping (view layer): file this project under a product in the
  // vault's shared manifest. Slug-keyed to match the projects/<slug>/ dirs.
  if (opts.product) setProduct(vaultPath, slugify(projectName), opts.product)

  if (config.sync === 'git') setupGitSync(vaultPath)
  injectConventions(cwd, projectName, inboxPath(vaultPath))
  const mcpWired = wireMcpServer(cwd)

  console.log(pc.green('✓'), `vault: ${vaultPath}`)
  console.log(pc.green('✓'), `project registered: ${projectName} (${cwd})`)
  if (config.sync === 'git') console.log(pc.green('✓'), 'git sync: auto-commit after each route')
  if (autoDetected) {
    console.log(
      pc.green('✓'),
      `code links open in: ${autoDetected}`,
      pc.dim('(auto-detected — change with --editor)'),
    )
  } else {
    console.log(
      pc.green('✓'),
      `code links open in: ${config.editor ?? 'system default'}`,
      pc.dim(
        "(--editor vscode|cursor|windsurf|... — see `npx -y loredex@latest doctor` for what's installed)",
      ),
    )
  }
  console.log(pc.green('✓'), 'conventions written to AGENTS.md + CLAUDE.md + .cursor/rules')
  if (mcpWired) {
    console.log(
      pc.green('✓'),
      'MCP server wired in .mcp.json — agents get vault_search/handoffs/product_state/vault_store',
    )
  }
  console.log()
  console.log('Next:', pc.bold('npx -y loredex@latest adopt'), 'to organize existing markdown,')
  console.log('      or open the vault folder in Obsidian.')
}

function setupGitSync(vaultPath: string): void {
  if (existsSync(join(vaultPath, '.git'))) return
  try {
    execFileSync('git', ['init'], { cwd: vaultPath, stdio: 'ignore' })
    writeFileSync(join(vaultPath, '.gitignore'), '.obsidian/workspace.json\n.DS_Store\n')
    execFileSync('git', ['add', '-A'], { cwd: vaultPath, stdio: 'ignore' })
    execFileSync('git', ['commit', '-m', 'loredex: initialize vault'], {
      cwd: vaultPath,
      stdio: 'ignore',
    })
  } catch {
    console.error(pc.yellow('!'), 'git not available — sync disabled for now')
  }
}

/**
 * Merge the loredex MCP server into the project's .mcp.json (the file Claude Code and
 * other MCP clients read at the project root). Idempotent; never clobbers other servers.
 * Returns false when an existing file is unreadable — better to skip than destroy it.
 */
function wireMcpServer(projectRoot: string): boolean {
  const mcpPath = join(projectRoot, '.mcp.json')
  let json: { mcpServers?: Record<string, unknown> } = {}
  if (existsSync(mcpPath)) {
    try {
      json = JSON.parse(readFileSync(mcpPath, 'utf8'))
    } catch {
      console.error(pc.yellow('!'), '.mcp.json exists but is not valid JSON — not touching it')
      return false
    }
  }
  json.mcpServers ??= {}
  if (json.mcpServers.loredex) return true // already wired
  json.mcpServers.loredex = { command: 'npx', args: ['-y', 'loredex@latest', 'mcp'] }
  writeFileSync(mcpPath, `${JSON.stringify(json, null, 2)}\n`)
  return true
}

/** Idempotent: the loredex block is only ever added once per file (marker-guarded). */
function injectConventions(projectRoot: string, projectName: string, inbox: string): void {
  const agents = join(projectRoot, 'AGENTS.md')
  const snippet = agentsSnippet(projectName, inbox)
  if (!existsSync(agents)) {
    writeFileSync(agents, `# Agent instructions\n\n${snippet}`)
  } else if (!readFileSync(agents, 'utf8').includes(MARKER_START)) {
    appendFileSync(agents, `\n${snippet}`)
  }

  const claude = join(projectRoot, 'CLAUDE.md')
  if (!existsSync(claude)) {
    writeFileSync(claude, claudePointer())
  } else if (!readFileSync(claude, 'utf8').includes(MARKER_START)) {
    appendFileSync(claude, `\n${claudePointer()}`)
  }

  const cursorRule = join(projectRoot, '.cursor', 'rules', 'loredex.mdc')
  const ruleBody = cursorRuleSnippet(projectName, inbox)
  if (!existsSync(cursorRule)) {
    mkdirSync(join(projectRoot, '.cursor', 'rules'), { recursive: true })
    writeFileSync(cursorRule, cursorRuleFrontmatter() + ruleBody)
  } else if (!readFileSync(cursorRule, 'utf8').includes(MARKER_START)) {
    appendFileSync(cursorRule, `\n${ruleBody}`)
  }
}
