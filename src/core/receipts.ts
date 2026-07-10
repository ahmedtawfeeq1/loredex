/**
 * Route receipts (epic4.story1 / PR-3): every route persists a reversible record
 * under `<vault>/.loredex/receipts/<id>.json` so CLI and app share one history
 * and no vault write is irreversible (F4). A receipt captures the exact pre-route
 * bytes of every source it touched plus the vault files it created — enough for
 * `undoRoute` (in router.ts, where the git/index machinery lives) to restore
 * byte-identical state. Receipts are shared operational metadata, not note
 * frontmatter; they ride the route's own git commit (`.loredex/` is tracked).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface RouteReceipt {
  id: string
  /** ISO timestamp the route was applied */
  appliedAt: string
  mode: 'move' | 'copy'
  /** sha256 of the routed source body — the dedup key (equals note `source_hash`) */
  contentHash: string
  /** vault files this route created; removed on undo */
  written: string[]
  /**
   * Source files + their exact pre-route content, restored on undo.
   * priorContent null = the source did not exist before (nothing to restore).
   */
  sources: { path: string; priorContent: string | null }[]
  /** set once undone; a second undo throws (append-only history) */
  undone?: boolean
}

/** Routing refused because the receipt is missing or already reversed. */
export class RouteUndoError extends Error {
  constructor(
    message: string,
    readonly code: 'RECEIPT_NOT_FOUND' | 'ALREADY_UNDONE',
  ) {
    super(message)
    this.name = 'RouteUndoError'
  }
}

export function receiptsDir(vaultPath: string): string {
  return join(vaultPath, '.loredex', 'receipts')
}

export function writeReceipt(vaultPath: string, receipt: RouteReceipt): void {
  const dir = receiptsDir(vaultPath)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${receipt.id}.json`), `${JSON.stringify(receipt, null, 2)}\n`)
}

export function loadReceipt(vaultPath: string, id: string): RouteReceipt | null {
  const file = join(receiptsDir(vaultPath), `${id}.json`)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as RouteReceipt
  } catch {
    return null
  }
}

/** Persisted receipts, newest first, optionally capped. */
export function listReceipts(vaultPath: string, limit?: number): RouteReceipt[] {
  const dir = receiptsDir(vaultPath)
  if (!existsSync(dir)) return []
  const all: RouteReceipt[] = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    try {
      all.push(JSON.parse(readFileSync(join(dir, name), 'utf8')) as RouteReceipt)
    } catch {
      // a corrupt receipt never breaks the list — skip it
    }
  }
  all.sort((a, b) => (a.appliedAt < b.appliedAt ? 1 : -1))
  return limit ? all.slice(0, limit) : all
}
