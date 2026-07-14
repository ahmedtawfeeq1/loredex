import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Client metadata for agent-ops dexes: category tags shown as chips on the client
 * name (industry, platform generation, …) — metadata, never a folder level. Lives
 * IN the dex (`_index/clients.json`) beside products.json, which carries the
 * Manager → Client grouping. A client absent here simply has no tags.
 */
export type ClientMap = Record<string, { tags: string[] }>

const MANIFEST = 'clients.json'

function manifestPath(vaultPath: string): string {
  return join(vaultPath, '_index', MANIFEST)
}

/** Read the client → tags map. Tolerates a `{clients:{…}}` wrapper or a flat map; never throws. */
export function loadClients(vaultPath: string): ClientMap {
  const path = manifestPath(vaultPath)
  if (!existsSync(path)) return {}
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    const map = raw && typeof raw === 'object' && raw.clients ? raw.clients : raw
    const out: ClientMap = {}
    for (const [client, entry] of Object.entries(map ?? {})) {
      if (!entry || typeof entry !== 'object') continue
      const tags = (entry as { tags?: unknown }).tags
      out[client] = {
        tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [],
      }
    }
    return out
  } catch {
    return {}
  }
}

/** Deterministic write: sorted clients, deduped sorted tags. Tagless clients are kept — a client with no tags is valid. */
export function saveClients(vaultPath: string, map: ClientMap): void {
  const clean: ClientMap = {}
  for (const client of Object.keys(map).sort()) {
    clean[client] = { tags: [...new Set(map[client]?.tags ?? [])].sort() }
  }
  mkdirSync(join(vaultPath, '_index'), { recursive: true })
  writeFileSync(manifestPath(vaultPath), `${JSON.stringify({ clients: clean }, null, 2)}\n`)
}

/** Tags for a client, [] when unknown. */
export function clientTags(map: ClientMap, client: string): string[] {
  return map[client]?.tags ?? []
}

/** Replace a client's tags. Returns the reloaded map. */
export function setClientTags(vaultPath: string, client: string, tags: string[]): ClientMap {
  const map = loadClients(vaultPath)
  map[client] = { tags }
  saveClients(vaultPath, map)
  return loadClients(vaultPath)
}

export function addClientTag(vaultPath: string, client: string, tag: string): ClientMap {
  const map = loadClients(vaultPath)
  return setClientTags(vaultPath, client, [...clientTags(map, client), tag])
}

export function removeClientTag(vaultPath: string, client: string, tag: string): ClientMap {
  const map = loadClients(vaultPath)
  return setClientTags(
    vaultPath,
    client,
    clientTags(map, client).filter((t) => t !== tag),
  )
}
