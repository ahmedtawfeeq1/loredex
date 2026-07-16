/**
 * Work items (desktop DESIGN v3 §8): ONE queryable plane over "what is there
 * to do" — tasks (notes carrying `kind: task`) ∪ handoffs/requests (their
 * existing schema-v2 notes, mapped read-only). Powers the desktop Plan view
 * (Board · Backlog · Sprints) and the work_* MCP verbs.
 *
 * Rules:
 *   - Handoffs KEEP the 8.1 lifecycle machine — this module never writes a
 *     handoff; their board status is a pure mapping (open→todo, accepted→
 *     doing, snoozed→backlog, consumed→consumed, declined→done).
 *   - Tasks are plain notes: `kind: task` + `status: backlog|todo|doing|
 *     review|done` (+ optional priority/sprint/owner/delegate). One writer
 *     (updateWorkItem) stamps fields, commits, syncs, emits — same shape as
 *     setHandoffStatus.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { Config } from './config'
import { emitLoredexEvent, type Identity } from './events'
import { type Meta, parseDoc, serializeDoc, stampSchema } from './frontmatter'
import { HandoffError } from './handoff'
import { listHandoffs } from './product'
import { gitAutoCommit, gitPullPush } from './router'
import { walkMarkdown } from './scan'
import { stampEngineSchema } from './vault'

export const WORK_STATUSES = ['backlog', 'todo', 'doing', 'review', 'done', 'consumed'] as const
export type WorkStatus = (typeof WORK_STATUSES)[number]

export type WorkKind = 'task' | 'handoff' | 'request'

export interface WorkItem {
  /** note name (task) or handoff id */
  id: string
  kind: WorkKind
  status: WorkStatus
  title: string
  /** owning project slug ('' = product level) */
  project: string
  priority?: string
  sprint?: string
  owner?: string
  delegate?: string
  path: string
  date?: string
}

/** The 8.1 handoff machine mapped onto the board plane — read-only, pure. */
export function handoffBoardStatus(status: string, expired: boolean): WorkStatus {
  if (expired || status === 'open') return 'todo'
  if (status === 'accepted') return 'doing'
  if (status === 'snoozed') return 'backlog'
  if (status === 'consumed') return 'consumed'
  return 'done' // declined + anything terminal
}

function isWorkStatus(v: unknown): v is WorkStatus {
  return typeof v === 'string' && (WORK_STATUSES as readonly string[]).includes(v)
}

/** Project slug for a vault-relative-ish path `projects/<slug>/…` ('' otherwise). */
function projectOf(vaultPath: string, path: string): string {
  const rel = path.startsWith(vaultPath) ? path.slice(vaultPath.length + 1) : path
  const m = /^projects\/([^/]+)\//.exec(rel)
  return m?.[1] ?? ''
}

/**
 * Every work item in the dex: task notes (kind: task) + every handoff/request
 * card mapped read-only. Sorted actionable-first (todo, doing, review,
 * backlog, done, consumed), then newest.
 */
export function listWorkItems(vaultPath: string, today?: string): WorkItem[] {
  const items: WorkItem[] = []
  for (const path of walkMarkdown(vaultPath)) {
    let meta: Meta
    try {
      meta = parseDoc(readFileSync(path, 'utf8')).meta
    } catch {
      continue
    }
    if (meta.kind !== 'task') continue
    const status = isWorkStatus(meta.status) ? meta.status : 'backlog'
    items.push({
      id: basename(path, '.md'),
      kind: 'task',
      status,
      title: typeof meta.title === 'string' ? meta.title : basename(path, '.md'),
      project: projectOf(vaultPath, path),
      ...(typeof meta.priority === 'string' ? { priority: meta.priority } : {}),
      ...(typeof meta.sprint === 'string' ? { sprint: meta.sprint } : {}),
      ...(typeof meta.owner === 'string' ? { owner: meta.owner } : {}),
      ...(typeof meta.delegate === 'string' ? { delegate: meta.delegate } : {}),
      path,
      ...(typeof meta.date === 'string' ? { date: meta.date } : {}),
    })
  }
  for (const card of listHandoffs(vaultPath, { direction: 'all' }, today)) {
    items.push({
      id: card.id,
      kind: card.kind === 'request' ? 'request' : 'handoff',
      status: handoffBoardStatus(card.status, card.expired),
      title: card.objective || card.name,
      project: card.to,
      path: card.path,
      date: card.date,
    })
  }
  const rank: Record<WorkStatus, number> = {
    todo: 0,
    doing: 1,
    review: 2,
    backlog: 3,
    done: 4,
    consumed: 5,
  }
  return items.sort(
    (a, b) => rank[a.status] - rank[b.status] || (b.date ?? '').localeCompare(a.date ?? ''),
  )
}

export interface WorkPatch {
  status?: WorkStatus
  priority?: string
  sprint?: string
  owner?: string
  delegate?: string
}

export interface WorkReceipt {
  id: string
  path: string
  by: Identity
  at: string
  before: Meta
  after: Meta
  pushed: boolean
}

function resolveTaskPath(vaultPath: string, id: string): string {
  const matches = walkMarkdown(vaultPath).filter((p) => {
    if (basename(p, '.md') !== id.split('/').pop()) return false
    try {
      return parseDoc(readFileSync(p, 'utf8')).meta.kind === 'task'
    } catch {
      return false
    }
  })
  if (matches.length === 0) throw new HandoffError('UNKNOWN_HANDOFF', `no task named "${id}"`)
  if (matches.length > 1)
    throw new HandoffError('AMBIGUOUS_HANDOFF', `task name "${id}" matches ${matches.length} notes`)
  return matches[0] as string
}

/**
 * The one task writer (work_update / work_claim / work_done all land here):
 * stamps only the patched fields + attribution, commits, best-effort syncs,
 * emits `work.updated`. Handoff ids are refused — their machine writes stay
 * with setHandoffStatus/consumeHandoff (anti-second-machine).
 */
export function updateWorkItem(
  vaultPath: string,
  config: Config,
  id: string,
  patch: WorkPatch,
  identity: Identity,
): WorkReceipt {
  if (patch.status !== undefined && !isWorkStatus(patch.status)) {
    throw new HandoffError('ILLEGAL_TRANSITION', `unknown work status "${patch.status}"`)
  }
  const path = resolveTaskPath(vaultPath, id)
  const doc = parseDoc(readFileSync(path, 'utf8'))
  const before = { ...doc.meta }
  const at = new Date().toISOString()
  const after: Meta = { ...doc.meta }
  for (const key of ['status', 'priority', 'sprint', 'owner', 'delegate'] as const) {
    if (patch[key] !== undefined) after[key] = patch[key]
  }
  after.updated_by = `${identity.name} <${identity.email}>`
  after.updated_at = at
  const stamped = stampSchema(after)
  writeFileSync(path, serializeDoc({ meta: stamped, body: doc.body }))
  stampEngineSchema(vaultPath)
  const name = basename(path, '.md')
  gitAutoCommit(vaultPath, config, `loredex: work ${name} ${describePatch(patch)}`)
  const { pushed } = gitPullPush(vaultPath)
  emitLoredexEvent('work.updated', { id: name, path, patch: { ...patch }, by: identity, at })
  return { id: name, path, by: identity, at, before, after: stamped, pushed }
}

function describePatch(patch: WorkPatch): string {
  return (
    Object.entries(patch)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ') || 'touch'
  )
}

/** work_claim: take a task — owner := caller, status := doing. */
export function claimWorkItem(
  vaultPath: string,
  config: Config,
  id: string,
  identity: Identity,
): WorkReceipt {
  return updateWorkItem(
    vaultPath,
    config,
    id,
    { owner: `${identity.name} <${identity.email}>`, status: 'doing' },
    identity,
  )
}

/** work_done: finish a task — status := done. */
export function finishWorkItem(
  vaultPath: string,
  config: Config,
  id: string,
  identity: Identity,
): WorkReceipt {
  return updateWorkItem(vaultPath, config, id, { status: 'done' }, identity)
}
