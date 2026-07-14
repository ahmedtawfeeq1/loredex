import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { runInit } from '../src/commands/init'
import {
  type Config,
  findDexRoot,
  loadResolvedConfig,
  saveConfig,
  setVaultOverride,
} from '../src/core/config'
import { loadDexSync, loadDexType, saveDexSync, saveDexType } from '../src/core/dex'

function sandbox(): string {
  // realpath: process.cwd() canonicalizes the macOS /var → /private/var symlink,
  // and init keys project entries by cwd — compare like with like
  return realpathSync(mkdtempSync(join(tmpdir(), 'loredex-resolve-')))
}

function markDex(dir: string, type: 'research' | 'agent-ops' = 'research'): void {
  saveDexType(dir, type)
}

function writeConfig(configDir: string, config: Config): void {
  process.env.LOREDEX_CONFIG_DIR = configDir
  saveConfig(config)
}

describe('loadResolvedConfig: per-invocation dex resolution', () => {
  const root = sandbox()
  const globalVault = join(root, 'global-vault')
  const fleet = join(root, 'fleet')
  const configDir = join(root, 'config')

  beforeAll(() => {
    mkdirSync(globalVault, { recursive: true })
    mkdirSync(join(fleet, 'projects', 'someclient'), { recursive: true })
    markDex(fleet, 'agent-ops')
    writeConfig(configDir, { vaultPath: globalVault, sync: 'none', projects: {} })
  })

  afterEach(() => setVaultOverride(undefined))
  afterAll(() => {
    delete process.env.LOREDEX_CONFIG_DIR
  })

  it('global fallback: cwd outside any dex or registered project', () => {
    const elsewhere = join(root, 'elsewhere')
    mkdirSync(elsewhere, { recursive: true })
    const resolved = loadResolvedConfig(elsewhere)
    expect(resolved?.vaultPath).toBe(globalVault)
    expect(resolved?.vaultSource).toBe('global')
  })

  it('dex-marker: cwd inside a dex resolves to that dex, even deep inside', () => {
    const deep = join(fleet, 'projects', 'someclient')
    const resolved = loadResolvedConfig(deep)
    expect(resolved?.vaultPath).toBe(fleet)
    expect(resolved?.vaultSource).toBe('dex-marker')
  })

  it('nested dexes: nearest marker wins', () => {
    const inner = join(fleet, 'projects', 'someclient', 'inner-dex')
    markDex(inner, 'research')
    expect(findDexRoot(join(inner, 'sub'))).toBe(inner)
    const resolved = loadResolvedConfig(inner)
    expect(resolved?.vaultPath).toBe(inner)
  })

  it('project entry vaultPath: registered project with its own dex', () => {
    const proj = join(root, 'proj')
    mkdirSync(join(proj, 'src'), { recursive: true })
    writeConfig(configDir, {
      vaultPath: globalVault,
      sync: 'none',
      projects: { [proj]: { name: 'proj', vaultPath: fleet } },
    })
    const resolved = loadResolvedConfig(join(proj, 'src'))
    expect(resolved?.vaultPath).toBe(fleet)
    expect(resolved?.vaultSource).toBe('project')
  })

  it('--vault flag beats everything', () => {
    setVaultOverride(globalVault)
    const resolved = loadResolvedConfig(join(fleet, 'projects'))
    expect(resolved?.vaultPath).toBe(globalVault)
    expect(resolved?.vaultSource).toBe('flag')
  })

  it('no config + dex marker still works (teammate clone)', () => {
    process.env.LOREDEX_CONFIG_DIR = join(root, 'no-such-config')
    const resolved = loadResolvedConfig(join(fleet, 'projects', 'someclient'))
    expect(resolved?.vaultPath).toBe(fleet)
    expect(resolved?.vaultSource).toBe('dex-marker')
    expect(resolved?.projects).toEqual({})
  })

  it('no config + no marker → null, same as today', () => {
    process.env.LOREDEX_CONFIG_DIR = join(root, 'no-such-config')
    const elsewhere = join(root, 'elsewhere')
    expect(loadResolvedConfig(elsewhere)).toBeNull()
  })
})

describe('dex sync policy in the manifest', () => {
  it('round-trips and survives saveDexType', () => {
    const v = sandbox()
    expect(loadDexSync(v)).toBeNull()
    saveDexSync(v, 'git')
    expect(loadDexSync(v)).toBe('git')
    saveDexType(v, 'agent-ops')
    expect(loadDexSync(v)).toBe('git')
    expect(loadDexType(v)).toBe('agent-ops')
  })
})

describe('init: multi-dex guards', () => {
  const root = sandbox()
  const project = join(root, 'project')
  const otherProject = join(root, 'other-project')
  const globalVault = join(root, 'global-vault')
  const fleet = join(root, 'fleet')
  let cwd: string

  beforeAll(() => {
    cwd = process.cwd()
    process.env.LOREDEX_CONFIG_DIR = join(root, 'config')
    mkdirSync(project, { recursive: true })
    mkdirSync(otherProject, { recursive: true })
  })

  afterEach(() => {
    process.exitCode = 0
  })

  afterAll(() => {
    process.chdir(cwd)
    delete process.env.LOREDEX_CONFIG_DIR
  })

  it('bootstrap init sets the global vaultPath and writes an explicit manifest', () => {
    process.chdir(project)
    runInit({ vault: globalVault, project: 'project' })
    const config = JSON.parse(readFileSync(join(root, 'config', 'config.json'), 'utf8')) as Config
    expect(config.vaultPath).toBe(globalVault)
    expect(config.projects[project]?.vaultPath).toBeUndefined()
    expect(loadDexType(globalVault)).toBe('research')
    expect(existsSync(join(globalVault, '_index', 'dex.json'))).toBe(true)
  })

  // git init + commit under full-suite load can exceed the 5s default
  it('second init with a different --vault records it on the project entry, global untouched', {
    timeout: 30000,
  }, () => {
    process.chdir(otherProject)
    runInit({ vault: fleet, project: 'other-project', type: 'agent-ops', sync: 'git' })
    const config = JSON.parse(readFileSync(join(root, 'config', 'config.json'), 'utf8')) as Config
    expect(config.vaultPath).toBe(globalVault)
    expect(config.projects[otherProject]?.vaultPath).toBe(fleet)
    expect(config.sync).toBe('none')
    expect(loadDexType(fleet)).toBe('agent-ops')
    expect(loadDexSync(fleet)).toBe('git')
  })

  it('refuses to re-type a dex with a declared manifest', () => {
    process.chdir(project)
    runInit({ vault: globalVault, project: 'project', type: 'agent-ops' })
    expect(process.exitCode).toBe(1)
    expect(loadDexType(globalVault)).toBe('research')
  })

  it('refuses agent-ops on a pre-manifest research dex (scaffolded _index, no dex.json)', () => {
    const legacy = join(root, 'legacy-vault')
    mkdirSync(join(legacy, '_index'), { recursive: true })
    writeFileSync(join(legacy, '_index', 'Home.md'), '# Home\n')
    process.chdir(project)
    runInit({ vault: legacy, project: 'project', type: 'agent-ops' })
    expect(process.exitCode).toBe(1)
    expect(existsSync(join(legacy, '_index', 'dex.json'))).toBe(false)
  })
})
