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

/** The dex's declared type. Absent, unreadable, or unknown → 'research'; never throws. */
export function loadDexType(vaultPath: string): DexType {
  const path = manifestPath(vaultPath)
  if (!existsSync(path)) return 'research'
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { type?: unknown }
    const type = raw && typeof raw === 'object' ? raw.type : undefined
    return KNOWN_TYPES.includes(type as DexType) ? (type as DexType) : 'research'
  } catch {
    return 'research'
  }
}

export function saveDexType(vaultPath: string, type: DexType): void {
  mkdirSync(join(vaultPath, '_index'), { recursive: true })
  writeFileSync(manifestPath(vaultPath), `${JSON.stringify({ type }, null, 2)}\n`)
}

export function isAgentOps(vaultPath: string): boolean {
  return loadDexType(vaultPath) === 'agent-ops'
}
