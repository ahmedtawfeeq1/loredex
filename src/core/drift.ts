import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'

/** Date (YYYY-MM-DD) of the last commit touching `path`, or null outside git / no history / git unavailable. */
export function lastCommitDate(path: string): string | null {
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
  meta: { source_path?: string; date?: string; status?: string }
}

/** Notes whose source file has git commits after the note's own filed date — the code moved on, the note didn't. */
export function findDrifted(notes: DriftableNote[]): DriftEntry[] {
  const drifted: DriftEntry[] = []
  for (const note of notes) {
    const { source_path: sourcePath, date, status } = note.meta
    if (!sourcePath || !date || status === 'stale' || status === 'superseded') continue
    const changed = lastCommitDate(sourcePath)
    if (changed && changed > date) {
      drifted.push({
        note: note.name,
        reason: `source changed ${changed}, filed ${date}`,
      })
    }
  }
  return drifted
}
