import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export interface Config {
  vaultPath: string
  sync: 'git' | 'none'
  /** link-target editor: 'system' (file://) or a URI scheme — vscode | cursor | windsurf | custom */
  editor?: string
  /**
   * "Internal, never route" globs (PR-3, epic4.story3): sources matching any of
   * these are refused by `executePlan` so scratch/internal files can't be filed
   * into the shared vault. Team-visible routing policy, so it lives here (shared
   * config the CLI honors), not in a host-local store. Minimatch-ish (see scope.ts).
   */
  neverRoute?: string[]
  /** vaultPath: this project's own dex when it differs from the global default */
  projects: Record<string, { name: string; vaultPath?: string }>
}

export function configDir(): string {
  return process.env.LOREDEX_CONFIG_DIR ?? join(homedir(), '.config', 'loredex')
}

export function configPath(): string {
  return join(configDir(), 'config.json')
}

export function defaultVaultPath(): string {
  return join(homedir(), 'Loredex')
}

export function loadConfig(): Config | null {
  const path = configPath()
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as Config
}

export function saveConfig(config: Config): void {
  mkdirSync(dirname(configPath()), { recursive: true })
  writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`)
}

/** Find the registered project containing `dir`, walking up toward the filesystem root. */
export function findProject(
  config: Config,
  dir: string,
): { path: string; name: string; vaultPath?: string } | null {
  let current = resolve(dir)
  for (;;) {
    const entry = config.projects[current]
    if (entry) return { path: current, name: entry.name, vaultPath: entry.vaultPath }
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

/** Where the invocation's dex came from — surfaced by status/doctor to kill "which dex?" confusion. */
export type VaultSource = 'flag' | 'dex-marker' | 'project' | 'global'

export type ResolvedConfig = Config & { vaultSource: VaultSource }

// Set once by the CLI entry from the program-level --vault flag; lib hosts (desktop,
// MCP embedding) never touch it and keep passing explicit paths into core functions.
let vaultOverride: string | undefined
export function setVaultOverride(path: string | undefined): void {
  vaultOverride = path ? resolve(path) : undefined
}

/** Nearest ancestor of `dir` that is a dex root (marked by `_index/dex.json`). */
export function findDexRoot(dir: string): string | null {
  let current = resolve(dir)
  for (;;) {
    if (existsSync(join(current, '_index', 'dex.json'))) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

/**
 * Which dex does this invocation target? --vault flag → nearest `_index/dex.json`
 * ancestor → the registered project's own vaultPath → global config.vaultPath.
 * Returns a copy with vaultPath pinned to the winner, so callers keep reading
 * `config.vaultPath` unchanged; never mutates what saveConfig would persist.
 * A flag or dex-marker hit works with no config file at all (teammate clone) —
 * only the final fallback still requires one.
 */
export function loadResolvedConfig(cwd: string = process.cwd()): ResolvedConfig | null {
  const config = loadConfig()
  const base: Config = config ?? { vaultPath: '', sync: 'none', projects: {} }
  if (vaultOverride) return { ...base, vaultPath: vaultOverride, vaultSource: 'flag' }
  const dexRoot = findDexRoot(cwd)
  if (dexRoot) return { ...base, vaultPath: dexRoot, vaultSource: 'dex-marker' }
  if (!config) return null
  const project = findProject(config, cwd)
  if (project?.vaultPath) {
    return { ...config, vaultPath: resolve(project.vaultPath), vaultSource: 'project' }
  }
  return { ...config, vaultSource: 'global' }
}
