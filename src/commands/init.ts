import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import pc from 'picocolors'
import { type Config, defaultVaultPath, loadConfig, saveConfig } from '../core/config'
import { inboxPath, scaffoldVault } from '../core/vault'
import { agentsSnippet, claudePointer, MARKER_START } from '../templates'

export interface InitOptions {
  vault?: string
  project?: string
  sync?: string
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

  scaffoldVault(vaultPath)
  saveConfig(config)

  if (config.sync === 'git') setupGitSync(vaultPath)
  injectConventions(cwd, projectName, inboxPath(vaultPath))

  console.log(pc.green('✓'), `vault: ${vaultPath}`)
  console.log(pc.green('✓'), `project registered: ${projectName} (${cwd})`)
  if (config.sync === 'git') console.log(pc.green('✓'), 'git sync: auto-commit after each route')
  console.log(pc.green('✓'), 'conventions written to AGENTS.md + CLAUDE.md')
  console.log()
  console.log('Next:', pc.bold('loredex adopt'), 'to organize existing markdown,')
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
}
