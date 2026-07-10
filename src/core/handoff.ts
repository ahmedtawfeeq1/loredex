/**
 * Handoff write APIs (schema v2, lib PR-11): create, reply, lifecycle transitions,
 * comments, and programmatic routing. Every vault write in every host (CLI, MCP,
 * desktop app) flows through these — the anti-second-engine rule. NO LLM anywhere:
 * briefs are assembled verbatim from caller inputs.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Config } from './config'
import { collectNotes } from './curate'
import { emitLoredexEvent, type Identity } from './events'
import { type Meta, parseDoc, serializeDoc, stampSchema } from './frontmatter'
import { rebuildIndexes } from './indexer'
import { listProjects } from './product'
import {
  executePlan,
  gitAutoCommit,
  gitPullPush,
  knownStructure,
  type PlanItem,
  planFile,
  plannedMeta,
} from './router'
import { walkMarkdown } from './scan'
import { slugify, stampEngineSchema, uniquePath } from './vault'

export type HandoffErrorCode = 'ILLEGAL_TRANSITION' | 'AMBIGUOUS_HANDOFF' | 'UNKNOWN_HANDOFF'

/** Typed vault-write failure — hosts map `code` straight onto their error envelopes. */
export class HandoffError extends Error {
  constructor(
    readonly code: HandoffErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'HandoffError'
  }
}

/**
 * The one resolve-by-id walk (shared with `consumeHandoff`). `id` is a note name, or
 * `"<project>/<name>"` to disambiguate cross-project basename collisions; a bare name
 * matching more than one handoff throws AMBIGUOUS_HANDOFF, unknown throws UNKNOWN_HANDOFF.
 */
export function resolveHandoffPath(
  vaultPath: string,
  id: string,
  opts: { project?: string } = {},
): string {
  const slash = id.indexOf('/')
  const qualifier = slash > 0 ? id.slice(0, slash) : opts.project
  const name = slash > 0 ? id.slice(slash + 1) : id
  const projects = qualifier ? [slugify(qualifier)] : listProjects(vaultPath)
  const matches = projects
    .flatMap((project) => walkMarkdown(join(vaultPath, 'projects', project, 'handoffs')))
    .filter((file) => basename(file, '.md') === name)
  if (matches.length === 0) throw new HandoffError('UNKNOWN_HANDOFF', `no handoff named "${id}"`)
  if (matches.length > 1) {
    const qualified = matches
      .map((file) => `${basename(dirname(dirname(file)))}/${name}`)
      .join(', ')
    throw new HandoffError(
      'AMBIGUOUS_HANDOFF',
      `"${id}" matches ${matches.length} handoffs — qualify it as "<project>/<name>": ${qualified}`,
    )
  }
  return matches[0] as string
}

export interface CreateHandoffInput {
  fromProject: string
  toProject: string
  objective: string
  kind: 'request' | 'delivery'
  /** note names of `fromProject` → the Reading order section, in given order */
  notes: string[]
  nextActions?: string[]
  repliesTo?: string
  /** note name of the request handoff this delivery fulfills */
  fulfills?: string
  /** optional prose section; written verbatim, never generated */
  body?: string
}

export interface HandoffCreateResult {
  id: string
  path: string
  pushed: boolean
}

/**
 * Write a handoff note into `projects/<to>/handoffs/` — the sender's one create writer.
 * The brief is assembled verbatim from the inputs (no LLM); every named note must exist
 * in `fromProject` (unknown name → throw, never silently drop).
 */
export function createHandoff(
  vaultPath: string,
  config: Config,
  input: CreateHandoffInput,
  identity: Identity,
): HandoffCreateResult {
  const from = slugify(input.fromProject)
  const to = slugify(input.toProject)
  const known = new Set(collectNotes(vaultPath, from).map((note) => note.name))
  for (const name of input.notes) {
    if (!known.has(name)) {
      throw new Error(`unknown note "${name}" in project "${from}" — handoff not written`)
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const kind = input.kind ?? 'delivery'
  const meta: Meta = stampSchema({
    project: to,
    topic: 'handoffs',
    type: 'handoff',
    date: today,
    from_project: from,
    to_project: to,
    objective: input.objective,
    status: 'open',
    kind,
    ...(input.repliesTo ? { replies_to: input.repliesTo } : {}),
    ...(input.fulfills ? { fulfills: input.fulfills } : {}),
    source: 'loredex',
    loredex: 'routed',
  })

  const body = [
    `# Handoff — ${from} → ${to}`,
    '',
    `**Objective:** ${input.objective}`,
    ...(input.body ? ['', input.body.trim()] : []),
    // no notes (replies often carry none) → no section: an empty "## Reading
    // order" renders as a silent empty list in every reader (desktop 16.1)
    ...(input.notes.length > 0
      ? ['', '## Reading order', '', ...input.notes.map((name, i) => `${i + 1}. [[${name}]]`)]
      : []),
    ...(input.nextActions?.length
      ? ['', '## Next actions', '', ...input.nextActions.map((action) => `- ${action}`)]
      : []),
    '',
    '---',
    `_Consume with:_ \`loredex handoffs --consume <this note's name>\` (use this project's own loredex invocation — do not switch to a global install)`,
  ].join('\n')

  const dest = uniquePath(
    join(vaultPath, 'projects', to, 'handoffs'),
    `${today}-handoff-${from}.md`,
  )
  writeFileSync(dest, serializeDoc({ meta, body: `${body}\n` }))
  stampEngineSchema(vaultPath)
  rebuildIndexes(vaultPath)
  gitAutoCommit(vaultPath, config, `loredex: handoff ${from} -> ${to} (${identity.name})`)
  const { pushed } = gitPullPush(vaultPath)
  const id = basename(dest, '.md')
  emitLoredexEvent('handoff.created', { id, path: dest, from, to, kind })
  return { id, path: dest, pushed }
}

/**
 * Reply sugar: parent lookup (qualified ids welcome), inverted route, `replies_to` set.
 * A reply to a `request` defaults to `delivery` when `kind` is not given at runtime.
 */
export function replyToHandoff(
  vaultPath: string,
  config: Config,
  parentId: string,
  input: Omit<CreateHandoffInput, 'fromProject' | 'toProject' | 'repliesTo'>,
  identity: Identity,
): HandoffCreateResult {
  const parentPath = resolveHandoffPath(vaultPath, parentId)
  const parent = parseDoc(readFileSync(parentPath, 'utf8')).meta
  if (!parent.from_project || !parent.to_project) {
    throw new HandoffError('UNKNOWN_HANDOFF', `"${parentId}" is not a routable handoff note`)
  }
  return createHandoff(
    vaultPath,
    config,
    {
      ...input,
      kind: input.kind ?? 'delivery',
      fromProject: parent.to_project,
      toProject: parent.from_project,
      repliesTo: basename(parentPath, '.md'),
    },
    identity,
  )
}

export type HandoffTransition =
  | { to: 'accepted' }
  | { to: 'declined'; reason: string }
  | { to: 'snoozed'; until: string } // YYYY-MM-DD
  | { to: 'open' } // reopen, from declined|snoozed only

/** Exactly what a transition changed — shape mirrors ConsumeReceipt. */
export interface StatusReceipt {
  handoffId: string
  path: string
  by: Identity
  at: string
  before: Meta
  after: Meta
  pushed: boolean
}

/** legal `status → transition.to` pairs; consume stays with consumeHandoff (v1 path). */
const LEGAL_TRANSITIONS: Record<string, string[]> = {
  accepted: ['open', 'snoozed'],
  declined: ['open'],
  snoozed: ['open'],
  open: ['declined', 'snoozed'],
}

/**
 * The one writer for every non-consume lifecycle transition. Writes only the fields in
 * the writer-semantics table, never erases prior attribution (except snooze fields on
 * reopen), stamps schema v2, commits, best-effort syncs, and emits `handoff.status`.
 */
export function setHandoffStatus(
  vaultPath: string,
  config: Config,
  id: string,
  transition: HandoffTransition,
  identity: Identity,
): StatusReceipt {
  const path = resolveHandoffPath(vaultPath, id)
  const doc = parseDoc(readFileSync(path, 'utf8'))
  const before = { ...doc.meta }
  const current = doc.meta.status ?? 'open'

  if (!LEGAL_TRANSITIONS[transition.to]?.includes(current)) {
    throw new HandoffError(
      'ILLEGAL_TRANSITION',
      `cannot move handoff "${id}" from "${current}" to "${transition.to}"`,
    )
  }
  if (transition.to === 'declined' && !transition.reason?.trim()) {
    throw new HandoffError('ILLEGAL_TRANSITION', 'decline requires a reason')
  }
  if (transition.to === 'snoozed' && !/^\d{4}-\d{2}-\d{2}$/.test(transition.until ?? '')) {
    throw new HandoffError('ILLEGAL_TRANSITION', 'snooze requires an until date (YYYY-MM-DD)')
  }

  const at = new Date().toISOString()
  const by = `${identity.name} <${identity.email}>`
  const after: Meta = { ...doc.meta, status: transition.to }
  switch (transition.to) {
    case 'accepted':
      after.accepted_by = by
      after.accepted_at = at
      break
    case 'declined':
      after.declined_by = by
      after.declined_at = at
      after.declined_reason = transition.reason
      break
    case 'snoozed':
      after.snoozed_by = by
      after.snoozed_at = at
      after.snoozed_until = transition.until
      break
    case 'open':
      // snooze fields go; decline/accept attribution stays (history)
      delete after.snoozed_by
      delete after.snoozed_at
      delete after.snoozed_until
      break
  }
  const stamped = stampSchema(after)
  writeFileSync(path, serializeDoc({ meta: stamped, body: doc.body }))
  stampEngineSchema(vaultPath)
  const name = basename(path, '.md')
  gitAutoCommit(vaultPath, config, `loredex: handoff ${name} ${current} -> ${transition.to}`)
  const { pushed } = gitPullPush(vaultPath)
  emitLoredexEvent('handoff.status', {
    id: name,
    path,
    from: current,
    to: transition.to,
    by: identity,
    at,
  })
  return { handoffId: name, path, by: identity, at, before, after: stamped, pushed }
}

/**
 * Attach a comment as a NEW note (`type: 'comment'`, `replies_to: <handoff>`) filed in
 * the handoff's own handoffs/ dir — the handoff note itself is never mutated. Comments
 * carry no `status`/`from_project`, so they never appear as board cards.
 */
export function annotateHandoff(
  vaultPath: string,
  config: Config,
  id: string,
  comment: { title: string; body: string },
  identity: Identity,
): HandoffCreateResult {
  const parentPath = resolveHandoffPath(vaultPath, id)
  const parentName = basename(parentPath, '.md')
  const dir = dirname(parentPath)
  const project = basename(dirname(dir))
  const today = new Date().toISOString().slice(0, 10)

  const meta: Meta = stampSchema({
    project,
    topic: 'handoffs',
    type: 'comment',
    date: today,
    replies_to: parentName,
    source: 'loredex',
    loredex: 'routed',
  })
  const body = [
    `# ${comment.title}`,
    '',
    `On [[${parentName}]]:`,
    '',
    comment.body.trim(),
    '',
    `— ${identity.name} <${identity.email}>`,
  ].join('\n')

  const dest = uniquePath(dir, `${today}-comment-${slugify(comment.title)}.md`)
  writeFileSync(dest, serializeDoc({ meta, body: `${body}\n` }))
  stampEngineSchema(vaultPath)
  rebuildIndexes(vaultPath)
  gitAutoCommit(vaultPath, config, `loredex: comment on ${parentName}`)
  const { pushed } = gitPullPush(vaultPath)
  emitLoredexEvent('store', { path: dest })
  return { id: basename(dest, '.md'), path: dest, pushed }
}

export interface RouteOptions {
  mode: 'move' | 'copy'
  projectName?: string
  projectRoot?: string
}

function buildRoutePlan(vaultPath: string, path: string, opts: RouteOptions): PlanItem {
  const raw = readFileSync(path, 'utf8')
  const known = knownStructure(vaultPath)
  return planFile(path, raw, opts.mode, vaultPath, {
    projectRoot: opts.projectRoot ?? dirname(path),
    projectName: opts.projectName ?? '',
    useLlm: false,
    knownProjects: known.projects,
    knownTopics: known.topics,
  })
}

export interface RoutePlanPreview {
  /** absolute destination path, collision-suffixed exactly like the executor would */
  destination: string
  /** the exact frontmatter the route would stamp (shared with executePlan) */
  meta: Meta
}

/**
 * The plan half of `routeFile`, read-only: destination + invented frontmatter so a
 * host can show a confirm step before anything is written. Same collision walk as
 * `uniquePath`, minus the mkdir — a preview must not touch the vault.
 */
export function previewRoute(
  vaultPath: string,
  path: string,
  opts: RouteOptions,
): RoutePlanPreview {
  const plan = buildRoutePlan(vaultPath, path, opts)
  let destination = join(plan.destDir, plan.destName)
  for (let i = 2; existsSync(destination); i++) {
    destination = join(plan.destDir, plan.destName.replace(/\.md$/, `-${i}.md`))
  }
  return { destination, meta: plannedMeta(plan) }
}

/**
 * Route one file into the vault, plan+execute in one call — pure composition of the
 * router (`knownStructure` + `planFile` + `executePlan`), heuristics only (no LLM).
 */
export function routeFile(
  vaultPath: string,
  config: Config,
  path: string,
  opts: RouteOptions,
): { written: string[] } {
  return executePlan([buildRoutePlan(vaultPath, path, opts)], vaultPath, config)
}
