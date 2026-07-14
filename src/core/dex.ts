import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Dex types: what a dex is *for*. The type lives IN the dex (`_index/dex.json`)
 * so every engine and teammate sees the same behavior. A dex without the manifest
 * is a `research` dex — today's behavior, unchanged. Type-specific branching always
 * happens inside existing entry points (rebuildIndexes, searchVault, doctor), never
 * via new signatures, so hosts that pass only a vault path ride along for free.
 */
export type DexType = 'research' | 'agent-ops'

const MANIFEST = 'dex.json'

const KNOWN_TYPES: readonly DexType[] = ['research', 'agent-ops']

function manifestPath(vaultPath: string): string {
  return join(vaultPath, '_index', MANIFEST)
}

interface DexManifest {
  type?: unknown
  sync?: unknown
}

/** Committed manifest, `{}` when absent/unreadable — never throws. */
function loadManifest(vaultPath: string): DexManifest {
  const path = manifestPath(vaultPath)
  if (!existsSync(path)) return {}
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    return raw && typeof raw === 'object' ? (raw as DexManifest) : {}
  } catch {
    return {}
  }
}

function saveManifest(vaultPath: string, manifest: DexManifest): void {
  mkdirSync(join(vaultPath, '_index'), { recursive: true })
  writeFileSync(manifestPath(vaultPath), `${JSON.stringify(manifest, null, 2)}\n`)
}

/** An explicit manifest exists — the dex declared its type rather than defaulting. */
export function hasDexManifest(vaultPath: string): boolean {
  return existsSync(manifestPath(vaultPath))
}

/** The dex's declared type. Absent, unreadable, or unknown → 'research'; never throws. */
export function loadDexType(vaultPath: string): DexType {
  const type = loadManifest(vaultPath).type
  return KNOWN_TYPES.includes(type as DexType) ? (type as DexType) : 'research'
}

export function saveDexType(vaultPath: string, type: DexType): void {
  saveManifest(vaultPath, { ...loadManifest(vaultPath), type })
}

/**
 * Per-dex sync policy (committed, so team-shared); null → caller falls back to
 * the machine-global config.sync. Lets two dexes on one machine disagree.
 */
export function loadDexSync(vaultPath: string): 'git' | 'none' | null {
  const sync = loadManifest(vaultPath).sync
  return sync === 'git' || sync === 'none' ? sync : null
}

export function saveDexSync(vaultPath: string, sync: 'git' | 'none'): void {
  saveManifest(vaultPath, { ...loadManifest(vaultPath), sync })
}

export function isAgentOps(vaultPath: string): boolean {
  return loadDexType(vaultPath) === 'agent-ops'
}
