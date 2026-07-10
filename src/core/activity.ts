import type { Identity } from './events'

/**
 * The one activity-event grammar shared by CLI and app (FR15): the vault's git log
 * already IS the feed — this module types it.
 *
 * Commit-message grammar the engine writes (via gitAutoCommit) and this parser relies on —
 * future engine writes must stay within it:
 *
 *   `loredex: route <n> note(s)`          → route
 *   `loredex: consume handoff <id>`       → consume
 *   `loredex: handoff <from> -> <to>[ (<author>)]` → handoff
 *   `loredex: handoff <id> <from-status> -> <to-status>` → status (PR-11 setHandoffStatus)
 *   anything else                         → sync (generic engine/teammate activity — never dropped)
 *
 * Identity attribution comes from the commit author (`-c` injection in hosts, ambient
 * git config in the CLI).
 */

/** Pass these args to `git log` (append e.g. `-n 200` or `--since`) so every caller invokes git identically. */
export const ACTIVITY_LOG_ARGS = [
  'log',
  '--pretty=format:%x1e%H%x1f%an%x1f%ae%x1f%aI%x1f%s',
  '--name-status',
] as const

export interface ActivityEvent {
  kind: 'route' | 'consume' | 'handoff' | 'status' | 'sync'
  actor: Identity
  /** ISO author date — also the day-grouping key (slice to 10) */
  at: string
  subject: { path?: string; handoffId?: string; project?: string }
  summary: string
  sha: string
}

const HEADER_FIELDS = 5
const CONSUME = /^loredex: consume handoff (.+)$/
// PR-11's createHandoff appends the author: `loredex: handoff <from> -> <to> (<name>)`.
// The optional suffix keeps every history parseable — pre-PR-11 and post-PR-11 alike.
const HANDOFF = /^loredex: handoff (\S+) -> (\S+)(?: \(.+\))?$/
// PR-11's setHandoffStatus writes `loredex: handoff <id> <from> -> <to>` — the extra
// token before the arrow keeps it disjoint from HANDOFF (\S+ never spans a space).
const STATUS = /^loredex: handoff (\S+) (\S+) -> (\S+)$/
const ROUTE = /^loredex: route \d+ note\(s\)$/

/**
 * Parse `git log` output produced with ACTIVITY_LOG_ARGS into typed, identity-attributed
 * events, newest first (input order preserved). Unknown commits become generic `sync`
 * events — never dropped silently; malformed records are skipped without throwing.
 */
export function parseActivity(gitLog: string): ActivityEvent[] {
  const events: ActivityEvent[] = []
  for (const record of gitLog.split('\x1e')) {
    if (!record.trim()) continue
    const [header = '', ...rest] = record.split('\n')
    const fields = header.split('\x1f')
    if (fields.length < HEADER_FIELDS) continue // malformed header — resilience over strictness
    const [sha, name, email, at, summary] = fields as [string, string, string, string, string]
    if (!sha || !at) continue

    // name-status lines: "A\tprojects/x/topic/note.md" — first changed note is the subject
    const paths = rest
      .map((line) => line.split('\t')[1])
      .filter((path): path is string => Boolean(path?.endsWith('.md')))
    const notePath = paths.find((path) => path.startsWith('projects/')) ?? paths[0]

    const subject: ActivityEvent['subject'] = {}
    if (notePath) {
      subject.path = notePath
      const project = notePath.match(/^projects\/([^/]+)\//)?.[1]
      if (project) subject.project = project
    }

    let kind: ActivityEvent['kind'] = 'sync'
    const consume = summary.match(CONSUME)
    const status = summary.match(STATUS)
    const handoff = summary.match(HANDOFF)
    if (consume) {
      kind = 'consume'
      subject.handoffId = consume[1] as string
    } else if (status) {
      kind = 'status'
      subject.handoffId = status[1] as string
    } else if (handoff) {
      kind = 'handoff'
      subject.project = handoff[2] as string
      if (notePath?.includes('/handoffs/')) {
        subject.handoffId = notePath.split('/').at(-1)?.replace(/\.md$/, '')
      }
    } else if (ROUTE.test(summary)) {
      kind = 'route'
    }

    events.push({ kind, actor: { name, email }, at, subject, summary, sha })
  }
  return events
}
