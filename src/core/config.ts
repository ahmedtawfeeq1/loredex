import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export interface Config {
  vaultPath: string
  sync: 'git' | 'none'
  projects: Record<string, { name: string }>
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
export function findProject(config: Config, dir: string): { path: string; name: string } | null {
  let current = resolve(dir)
  for (;;) {
    const entry = config.projects[current]
    if (entry) return { path: current, name: entry.name }
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}
