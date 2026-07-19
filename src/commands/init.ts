import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import pc from 'picocolors'
import { type Config, defaultVaultPath, loadConfig, saveConfig } from '../core/config'
import { type DexType, hasDexManifest, loadDexSync, loadDexType, saveDexSync } from '../core/dex'
import { detectEditors } from '../core/editors'
import { setProduct } from '../core/products'
import { inboxPath, scaffoldVault, slugify } from '../core/vault'
import { windowsSafeCommand } from '../core/workspace'
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
  type?: string
  /** seed the dex with a small demo product (notes + an open handoff + a task) */
  demo?: boolean
}

export function runInit(opts: InitOptions): void {
  const cwd = process.cwd()
  const dexType = (opts.type ?? 'research') as DexType
  if (dexType !== 'research' && dexType !== 'agent-ops') {
    console.error(pc.red(`unknown dex type "${opts.type}" — use research | agent-ops`))
    process.exitCode = 1
    return
  }
  const existing = loadConfig()
  const vaultPath = resolve(opts.vault ?? existing?.vaultPath ?? defaultVaultPath())
  const projectName = opts.project ?? basename(cwd)

  // never absorb an existing dex into a different type — the manifest (or, for
  // pre-manifest dexes, a scaffolded _index/) is proof of what it already is
  const declared = hasDexManifest(vaultPath) ? loadDexType(vaultPath) : null
  const implicitResearch = !declared && existsSync(join(vaultPath, '_index'))
  if ((declared ?? (implicitResearch ? 'research' : dexType)) !== dexType) {
    console.error(
      pc.red(
        `dex at ${vaultPath} is type "${declared ?? 'research'}" — refusing to re-type as "${dexType}"`,
      ),
    )
    console.error(pc.dim('edit _index/dex.json by hand if you really mean it'))
    process.exitCode = 1
    return
  }

  // global vaultPath is written once at bootstrap; after that, a project pointing
  // at a different dex records it on its own entry — init never repoints the machine
  const config: Config = existing ?? { vaultPath, sync: 'none', projects: {} }
  const isDefaultVault = vaultPath === resolve(config.vaultPath)
  config.projects[cwd] = isDefaultVault ? { name: projectName } : { name: projectName, vaultPath }
  if (opts.sync === 'git' && isDefaultVault) config.sync = 'git'
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

  scaffoldVault(vaultPath, dexType)
  // sync is a property of the dex (committed, team-shared), not of this machine
  if (opts.sync === 'git') saveDexSync(vaultPath, 'git')
  const effectiveSync = (loadDexSync(vaultPath) ?? config.sync) === 'git'
  saveConfig(config)

  // product grouping (view layer): file this project under a product in the
  // vault's shared manifest. Slug-keyed to match the projects/<slug>/ dirs.
  if (opts.product) setProduct(vaultPath, slugify(projectName), opts.product)

  if (effectiveSync) setupGitSync(vaultPath)
  injectConventions(cwd, projectName, inboxPath(vaultPath))
  const mcpWired = wireMcpServer(cwd)

  console.log(
    pc.green('✓'),
    `dex: ${vaultPath}${dexType === 'agent-ops' ? pc.dim(' (agent-ops)') : ''}`,
  )
  console.log(pc.green('✓'), `project registered: ${projectName} (${cwd})`)
  if (dexType === 'agent-ops') {
    console.log(pc.dim('next: loredex new client <name> --manager <m> --tags <a,b>'))
  }
  if (effectiveSync) console.log(pc.green('✓'), 'git sync: auto-commit after each route')
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

  if (opts.demo) {
    const seeded = loadConfig()
    if (seeded) seedDemoDex(seeded)
  }
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
  // Windows can't spawn the npx shim directly — wrap in `cmd /c` there
  const safe = windowsSafeCommand('npx', ['-y', 'loredex@latest', 'mcp'])
  json.mcpServers.loredex = { command: safe.command, args: safe.args }
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

/**
 * `loredex init --demo` (desktop v3 first-run): seed a fresh dex with a tiny
 * two-project product — two filed notes, one OPEN handoff between them, one
 * task work item — everything written through the real engine writers, so
 * Today/Inbox/Plan/Atlas have honest data on first launch.
 */
export function seedDemoDex(config: Config): void {
  const { storeNote } = require('../core/store') as typeof import('../core/store')
  const { createHandoff } = require('../core/handoff') as typeof import('../core/handoff')
  const { parseDoc, serializeDoc } =
    require('../core/frontmatter') as typeof import('../core/frontmatter')
  const identity = { name: 'demo', email: 'demo@loredex.local' }

  const notePath = storeNote(config, {
    project: 'demo-backend',
    topic: 'auth',
    title: 'Auth flow findings',
    content:
      'Session tokens rotate every 24h; refresh happens in middleware.\n\nSee the task on the Plan board for the follow-up.',
    type: 'finding',
    tags: ['demo'],
  })
  storeNote(config, {
    project: 'demo-frontend',
    topic: 'onboarding',
    title: 'Onboarding research',
    content: 'Users drop at step 3 — shorten the form and defer email verification.',
    type: 'research',
    tags: ['demo'],
  })

  createHandoff(
    config.vaultPath,
    config,
    {
      fromProject: 'demo-backend',
      toProject: 'demo-frontend',
      objective: 'Adopt the rotated-session auth contract in the web client',
      kind: 'request',
      notes: [basename(notePath, '.md')],
      nextActions: ['Read the auth findings', 'Swap the token refresh call'],
    },
    identity,
  )

  // one task work item (kind: task — Plan board's task lane)
  const taskPath = storeNote(config, {
    project: 'demo-backend',
    topic: 'auth',
    title: 'Rotate refresh tokens on password change',
    content: 'Follow-up from the auth findings: invalidate refresh tokens on password change.',
    type: 'note',
    tags: ['demo'],
  })
  const doc = parseDoc(readFileSync(taskPath, 'utf8'))
  doc.meta.kind = 'task'
  doc.meta.status = 'todo'
  doc.meta.priority = 'P2'
  doc.meta.title = 'Rotate refresh tokens on password change'
  writeFileSync(taskPath, serializeDoc(doc))

  console.log(pc.green('demo dex seeded — two projects, one open handoff, one task'))
}
