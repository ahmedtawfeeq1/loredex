import {
  copyFileSync,
  type Dirent,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { slugify } from './vault'

/**
 * Versioned snapshots for agent-ops units.
 *
 * A snapshot captures a pipeline or agent's WHOLE definition — every file the
 * unit owns, at whatever depth — into
 * `projects/<client>/pipelines/<unit>/versions/vNN_<date>/`, preserving the
 * relative layout, plus a manifest.
 *
 * Two things here were wrong before and are worth stating so they stay fixed:
 *
 *  1. It copied a fixed LIST of filenames. When the platform's schema moved, the
 *     list went stale silently and a "snapshot" captured one file out of thirty
 *     while still reporting success — worse than failing, because it looked like
 *     a backup. It now walks the unit, so a snapshot cannot go stale again.
 *
 *  2. Snapshots lived in a client-level `_versions/<unit>/<timestamp>/`, away
 *     from the thing they version. They now sit inside the unit as
 *     `versions/vNN_<date>/`, which is the convention the platform's own tooling
 *     writes when it pushes an edit — same folder, same names, so both tools'
 *     history interleaves in one place instead of forming two partial ones.
 *
 * `versions/` is invisible to the fleet scanner (which reads only direct
 * children of `pipelines/`) and is skipped when walking a unit, so snapshots
 * never nest inside each other.
 *
 * Pure apart from the fs: the caller supplies the date so results are testable.
 */

/** Directories inside a unit that a snapshot must never descend into. */
const NOT_UNIT_CONTENT = new Set(['versions', '_versions'])

export interface SnapshotOptions {
  /** also copy knowledge_tables/ (default false — tables are versioned by hand) */
  includeTables?: boolean
  note?: string
  /**
   * Live platform state captured by an agent (e.g. the live platform pipeline config
   * fetched via that client's MCP) — stored verbatim as `platform.json` in the
   * version dir. When set, the local unit need not exist (a platform-only
   * snapshot of a pipeline that lives on the platform, not in local files).
   */
  platformData?: unknown
  /** kind to record when there's no local unit to infer it from (default pipeline) */
  kind?: 'pipeline' | 'agent'
}

export interface SnapshotResult {
  unit: string
  kind: 'pipeline' | 'agent'
  /** version folder name, e.g. `v03_2026-07-21` */
  stamp: string
  /** vault-relative snapshot dir */
  dir: string
  /** relative paths copied into the snapshot */
  files: string[]
  note?: string
}

export interface SnapshotSummary {
  unit: string
  stamp: string
  fileCount: number
  note?: string
  /** vault-relative dir, so a caller can open it without rebuilding the path */
  dir: string
}

function safeReaddir(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function listFiles(dir: string): string[] {
  return safeReaddir(dir)
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()
}

/**
 * Every file the unit owns, as paths relative to the unit dir, sorted.
 * Skips dotfiles and `versions/` — a snapshot of the snapshots is not a snapshot.
 */
export function unitFiles(unitAbs: string): string[] {
  const out: string[] = []
  const walk = (relDir: string): void => {
    for (const entry of safeReaddir(join(unitAbs, relDir))) {
      if (entry.name.startsWith('.')) continue
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!relDir && NOT_UNIT_CONTENT.has(entry.name)) continue
        walk(rel)
      } else if (entry.isFile()) {
        out.push(rel)
      }
    }
  }
  walk('')
  return out.sort()
}

/** `v01_2026-07-21` — NN is one past the highest already in `versions/`. */
export function nextVersionName(versionsAbs: string, date: string): string {
  let highest = 0
  for (const entry of safeReaddir(versionsAbs)) {
    if (!entry.isDirectory()) continue
    const n = /^v(\d+)/.exec(entry.name)
    if (n?.[1]) highest = Math.max(highest, Number.parseInt(n[1], 10))
  }
  return `v${String(highest + 1).padStart(2, '0')}_${date}`
}

/** `2026-07-21_092440` → `2026-07-21`; anything without a date is used as-is. */
function dateOf(stamp: string): string {
  return /^(\d{4}-\d{2}-\d{2})/.exec(stamp)?.[1] ?? stamp
}

/**
 * Snapshot one unit. `stamp` supplies the DATE (a full `2026-07-21_092440` is
 * accepted and trimmed); the `vNN` is assigned from what is already in
 * `versions/`, so two snapshots on the same day get distinct folders and the
 * numbering reads as a history rather than a pile of timestamps.
 */
export function snapshotUnit(
  vaultPath: string,
  clientName: string,
  unitName: string,
  stamp: string,
  opts?: SnapshotOptions,
): SnapshotResult {
  const client = slugify(clientName)
  const unit = slugify(unitName)
  const clientAbs = join(vaultPath, 'projects', client)
  if (!existsSync(clientAbs)) throw new Error(`no client "${client}" in this dex`)

  const pipelineAbs = join(clientAbs, 'pipelines', unit)
  const agentAbs = join(clientAbs, 'agents', unit)
  let kind: 'pipeline' | 'agent'
  let unitAbs: string
  if (existsSync(pipelineAbs)) {
    kind = 'pipeline'
    unitAbs = pipelineAbs
  } else if (existsSync(agentAbs)) {
    kind = 'agent'
    unitAbs = agentAbs
  } else if (opts?.platformData !== undefined) {
    // platform-only snapshot: the unit lives on the platform, not local files.
    // The folder is created so the capture lands where the unit will be once
    // it is pulled, rather than in a separate orphan tree.
    kind = opts.kind ?? 'pipeline'
    unitAbs = kind === 'pipeline' ? pipelineAbs : agentAbs
  } else {
    throw new Error(`no pipeline or agent "${unit}" under client "${client}"`)
  }

  const group = kind === 'pipeline' ? 'pipelines' : 'agents'
  const versionsAbs = join(unitAbs, 'versions')
  const version = nextVersionName(versionsAbs, dateOf(stamp))
  const destBase = join(versionsAbs, version)
  if (existsSync(destBase)) {
    throw new Error(`snapshot "${version}" already exists for ${unit} — pass a fresh stamp`)
  }

  const files: string[] = []
  const copy = (srcAbs: string, rel: string): void => {
    if (!existsSync(srcAbs)) return
    const destAbs = join(destBase, rel)
    mkdirSync(dirname(destAbs), { recursive: true })
    copyFileSync(srcAbs, destAbs)
    files.push(rel)
  }

  // 1. the whole unit — persona, instructions, config, every stage, at any depth
  for (const rel of unitFiles(unitAbs)) copy(join(unitAbs, rel), rel)

  // 2. knowledge tables (opt-in)
  if (opts?.includeTables) {
    const tablesAbs = join(clientAbs, 'knowledge_tables')
    for (const name of listFiles(tablesAbs)) {
      copy(join(tablesAbs, name), join('knowledge_tables', name))
    }
  }

  // 3. live platform state captured by an agent (platform pipeline config, …)
  if (opts?.platformData !== undefined) {
    mkdirSync(destBase, { recursive: true })
    writeFileSync(
      join(destBase, 'platform.json'),
      `${JSON.stringify(opts.platformData, null, 2)}\n`,
    )
    files.push('platform.json')
  }

  if (files.length === 0) {
    throw new Error(`${kind} "${unit}" has no definition files yet — nothing to snapshot`)
  }

  const manifest = {
    unit,
    kind,
    version,
    createdAt: stamp,
    files,
    ...(opts?.note ? { note: opts.note } : {}),
  }
  mkdirSync(destBase, { recursive: true })
  writeFileSync(join(destBase, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  return {
    unit,
    kind,
    stamp: version,
    dir: `projects/${client}/${group}/${unit}/versions/${version}`,
    files,
    note: opts?.note,
  }
}

function readManifest(dirAbs: string): { fileCount: number; note?: string } {
  try {
    const m = JSON.parse(readFileSync(join(dirAbs, 'manifest.json'), 'utf8')) as {
      files?: unknown[]
      note?: string
    }
    return { fileCount: Array.isArray(m.files) ? m.files.length : 0, note: m.note }
  } catch {
    return { fileCount: 0 }
  }
}

/** `v03_2026-07-21` → `2026-07-21#0003`; `2026-07-21_0924` → `2026-07-21#0924`.
 *  Sorting on this makes `v10_` land after `v09_`, and keeps snapshots from the
 *  retired timestamp layout interleaved by date rather than dumped at one end. */
function sortKey(stamp: string): string {
  const v = /^v(\d+)_(\d{4}-\d{2}-\d{2})$/.exec(stamp)
  if (v?.[1] && v[2]) return `${v[2]}#${v[1].padStart(4, '0')}`
  const d = /^(\d{4}-\d{2}-\d{2})[_-]?(.*)$/.exec(stamp)
  return d?.[1] ? `${d[1]}#${d[2] ?? ''}` : stamp
}

/**
 * List snapshots for a client (all units, or one), newest first.
 *
 * Reads the current `pipelines|agents/<unit>/versions/` layout AND the retired
 * client-level `_versions/<unit>/<stamp>/`, so history taken before the move
 * stays visible instead of appearing to have been deleted.
 */
export function listSnapshots(
  vaultPath: string,
  clientName: string,
  unitName?: string,
): SnapshotSummary[] {
  const client = slugify(clientName)
  const clientAbs = join(vaultPath, 'projects', client)
  const want = unitName ? slugify(unitName) : null
  const out: SnapshotSummary[] = []

  const collect = (unit: string, versionsAbs: string, relBase: string): void => {
    for (const e of safeReaddir(versionsAbs)) {
      if (!e.isDirectory()) continue
      out.push({
        unit,
        stamp: e.name,
        dir: `${relBase}/${e.name}`,
        ...readManifest(join(versionsAbs, e.name)),
      })
    }
  }

  for (const group of ['pipelines', 'agents'] as const) {
    const groupAbs = join(clientAbs, group)
    const units = want
      ? [want]
      : safeReaddir(groupAbs)
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
    for (const unit of units) {
      collect(
        unit,
        join(groupAbs, unit, 'versions'),
        `projects/${client}/${group}/${unit}/versions`,
      )
    }
  }

  // retired layout — read so old history stays visible; never written to again
  const legacyAbs = join(clientAbs, '_versions')
  const legacyUnits = want
    ? [want]
    : safeReaddir(legacyAbs)
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
  for (const unit of legacyUnits) {
    collect(unit, join(legacyAbs, unit), `projects/${client}/_versions/${unit}`)
  }

  return out.sort(
    (a, b) => sortKey(b.stamp).localeCompare(sortKey(a.stamp)) || a.unit.localeCompare(b.unit),
  )
}
