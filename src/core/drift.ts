import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize } from 'node:path'

/** Date (YYYY-MM-DD) of the last commit touching `path`, or null outside git / no history / git unavailable. */
export function lastCommitDate(path: string): string | null {
  // source_path comes from note frontmatter — untrusted if a vault note was crafted by
  // someone else. execFileSync never invokes a shell so injection isn't possible, but a
  // relative or empty value could still probe an unintended cwd; require a real absolute path.
  if (!path || !isAbsolute(path)) return null
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ad', '--date=short', '--', path], {
      cwd: dirname(path),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return out || null
  } catch {
    return null
  }
}

export interface DriftEntry {
  note: string
  reason: string
}

export interface DriftableNote {
  name: string
  meta: {
    source_path?: string
    source_project?: string
    source_rel?: string
    date?: string
    status?: string
  }
}

/** Maps a project slug to this machine's checkout root, or null if not registered here. */
export type ProjectRootResolver = (projectSlug: string) => string | null

/**
 * Where a note's source file lives ON THIS MACHINE. source_path is the authoring machine's
 * absolute path (fastest when it's the same machine); source_project + source_rel are the
 * portable form — a teammate's clone resolves them through their own registered projects.
 */
export function resolveSourceAbs(
  meta: DriftableNote['meta'],
  resolveRoot?: ProjectRootResolver,
): string | null {
  if (meta.source_path && isAbsolute(meta.source_path) && existsSync(meta.source_path)) {
    return meta.source_path
  }
  if (meta.source_project && meta.source_rel && resolveRoot) {
    // a crafted source_rel must not escape the project root
    const root = resolveRoot(meta.source_project)
    if (root) {
      const abs = normalize(join(root, meta.source_rel))
      if (abs.startsWith(normalize(root)) && existsSync(abs)) return abs
    }
  }
  return null
}

/** Notes whose source file has git commits after the note's own filed date — the code moved on, the note didn't. */
export function findDrifted(
  notes: DriftableNote[],
  resolveRoot?: ProjectRootResolver,
): DriftEntry[] {
  const drifted: DriftEntry[] = []
  for (const note of notes) {
    const { date, status } = note.meta
    if (!date || status === 'stale' || status === 'superseded') continue
    const abs = resolveSourceAbs(note.meta, resolveRoot)
    if (!abs) continue
    const changed = lastCommitDate(abs)
    if (changed && changed > date) {
      drifted.push({
        note: note.name,
        reason: `source changed ${changed}, filed ${date}`,
      })
    }
  }
  return drifted
}
