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
import { STAGE_FILE_SUFFIXES, UNIT_FILES } from './agent-ops'
import { slugify } from './vault'

/**
 * Versioned snapshots for agent-ops units. A snapshot copies a pipeline or
 * agent's definition files — the four `_` unit files, then (pipelines) each
 * stage's NN-prefixed files — into `projects/<client>/_versions/<unit>/<stamp>/`
 * with a manifest, preserving the relative layout. Everything under `_versions/`
 * is committed (that IS the durability story) and is invisible to the fleet
 * scanner + doctor (a versions dir must never parse as a pipeline/agent/stage).
 *
 * Pure: the caller supplies the stamp so the function is deterministic/testable.
 */

const STAGE_DIR = /^(\d{2})_(.+)$/

export interface SnapshotOptions {
  /** also copy knowledge_tables/ (default false — tables are versioned by hand) */
  includeTables?: boolean
  note?: string
  /**
   * Live platform state captured by an agent (e.g. the live platform pipeline config
   * fetched via that client's MCP) — stored verbatim as `platform.json` in the
   * stamp dir. When set, the local unit need not exist (a platform-only
   * snapshot of a pipeline that lives on the platform, not in local files).
   */
  platformData?: unknown
  /** kind to record when there's no local unit to infer it from (default pipeline) */
  kind?: 'pipeline' | 'agent'
}

export interface SnapshotResult {
  unit: string
  kind: 'pipeline' | 'agent'
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
 * Snapshot one unit. `stamp` is the caller-supplied dir name (e.g.
 * `2026-07-20_141530`). Refuses unknown/empty units and never overwrites an
 * existing stamp dir.
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
  let unitAbs: string | null
  if (existsSync(pipelineAbs)) {
    kind = 'pipeline'
    unitAbs = pipelineAbs
  } else if (existsSync(agentAbs)) {
    kind = 'agent'
    unitAbs = agentAbs
  } else if (opts?.platformData !== undefined) {
    // platform-only snapshot: the unit lives on the platform, not local files
    kind = opts.kind ?? 'pipeline'
    unitAbs = null
  } else {
    throw new Error(`no pipeline or agent "${unit}" under client "${client}"`)
  }

  const destBase = join(clientAbs, '_versions', unit, stamp)
  if (existsSync(destBase)) {
    throw new Error(`snapshot "${stamp}" already exists for ${unit} — pass a fresh stamp`)
  }

  const files: string[] = []
  const copy = (srcAbs: string, rel: string): void => {
    if (!existsSync(srcAbs)) return
    const destAbs = join(destBase, rel)
    mkdirSync(dirname(destAbs), { recursive: true })
    copyFileSync(srcAbs, destAbs)
    files.push(rel)
  }

  if (unitAbs) {
    // 1. the four unit files
    for (const f of UNIT_FILES) copy(join(unitAbs, f), f)
    // 2. every stage's NN-prefixed files (pipelines only)
    if (kind === 'pipeline') {
      const stagesAbs = join(unitAbs, 'stages')
      const stageDirs = safeReaddir(stagesAbs)
        .filter((e) => e.isDirectory() && STAGE_DIR.test(e.name))
        .sort((a, b) => a.name.localeCompare(b.name))
      for (const e of stageDirs) {
        const nn = e.name.match(STAGE_DIR)?.[1] ?? ''
        for (const suffix of STAGE_FILE_SUFFIXES) {
          const name = `${nn}_${suffix}`
          copy(join(stagesAbs, e.name, name), join('stages', e.name, name))
        }
      }
    }
    // 3. knowledge tables (opt-in)
    if (opts?.includeTables) {
      const tablesAbs = join(clientAbs, 'knowledge_tables')
      for (const name of listFiles(tablesAbs)) {
        copy(join(tablesAbs, name), join('knowledge_tables', name))
      }
    }
  }

  // 4. live platform state captured by an agent (platform pipeline config, …)
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
    createdAt: stamp,
    files,
    ...(opts?.note ? { note: opts.note } : {}),
  }
  mkdirSync(destBase, { recursive: true })
  writeFileSync(join(destBase, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  return {
    unit,
    kind,
    stamp,
    dir: `projects/${client}/_versions/${unit}/${stamp}`,
    files,
    note: opts?.note,
  }
}

/** List snapshots for a client (all units, or one), newest stamp first. */
export function listSnapshots(
  vaultPath: string,
  clientName: string,
  unitName?: string,
): SnapshotSummary[] {
  const client = slugify(clientName)
  const versionsAbs = join(vaultPath, 'projects', client, '_versions')
  const units = unitName
    ? [slugify(unitName)]
    : safeReaddir(versionsAbs)
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
  const out: SnapshotSummary[] = []
  for (const unit of units) {
    const unitAbs = join(versionsAbs, unit)
    for (const e of safeReaddir(unitAbs)) {
      if (!e.isDirectory()) continue
      let fileCount = 0
      let note: string | undefined
      try {
        const m = JSON.parse(readFileSync(join(unitAbs, e.name, 'manifest.json'), 'utf8')) as {
          files?: unknown[]
          note?: string
        }
        fileCount = Array.isArray(m.files) ? m.files.length : 0
        note = m.note
      } catch {
        // no/invalid manifest — still list the stamp, count 0
      }
      out.push({ unit, stamp: e.name, fileCount, note })
    }
  }
  return out.sort((a, b) => b.stamp.localeCompare(a.stamp))
}
