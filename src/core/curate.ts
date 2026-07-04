import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { type Meta, parseDoc, serializeDoc } from './frontmatter'
import { replaceRelated } from './linker'
import { sanitizeWikilinks } from './sanitize'
import { walkMarkdown } from './scan'
import { slugify } from './vault'

export interface CurationPlan {
  objective: string
  brief: string
  reading_order: string[]
  next_actions: string[]
  stale: Array<{ note: string; superseded_by?: string | null; reason: string }>
  duplicates: Array<{ canonical: string; redundant: string[]; reason: string }>
  clusters: Array<{ theme: string; notes: string[] }>
}

export interface ScopedNote {
  path: string
  name: string
  topic: string
  meta: Meta
  body: string
}

export interface ScopeFilters {
  topics?: string[]
  since?: string
}

export function projectDir(vaultPath: string, project: string): string {
  return join(vaultPath, 'projects', slugify(project))
}

/** All curatable notes of a project (briefs excluded). */
export function collectNotes(vaultPath: string, project: string): ScopedNote[] {
  const root = projectDir(vaultPath, project)
  const notes: ScopedNote[] = []
  for (const path of walkMarkdown(root)) {
    const name = basename(path, '.md')
    if (isBriefName(name)) continue
    let doc: ReturnType<typeof parseDoc>
    try {
      doc = parseDoc(readFileSync(path, 'utf8'))
    } catch {
      continue
    }
    const parts = relative(root, path).split(sep)
    notes.push({
      path,
      name,
      topic: parts.length > 1 ? (parts[0] as string) : '',
      meta: doc.meta,
      body: doc.body,
    })
  }
  return notes
}

export function filterNotes(notes: ScopedNote[], filters: ScopeFilters): ScopedNote[] {
  return notes.filter((note) => {
    if (filters.topics?.length && !filters.topics.includes(note.topic)) return false
    if (filters.since && (note.meta.date ?? '') < filters.since) return false
    return true
  })
}

const WIKILINK_TARGET = /\[\[([^[\]|]+?)(?:\|[^[\]]+?)?\]\]/g

/**
 * Notes nobody links to. Checked against ALL notes in the project (not just scope) since a
 * reference can live outside the current --since/--topic window; only names within `scope`
 * (when given) are reported.
 */
export function findOrphans(allNotes: ScopedNote[], scope?: Set<string>): string[] {
  const referenced = new Set<string>()
  for (const note of allNotes) {
    for (const match of note.body.matchAll(WIKILINK_TARGET)) {
      referenced.add((match[1] as string).trim())
    }
  }
  return allNotes
    .filter((note) => (!scope || scope.has(note.name)) && !referenced.has(note.name))
    .map((note) => note.name)
}

/** Stamp drift-flagged notes stale. Mirrors sanitizeNotes: write=false only counts (dry-run). */
export function stampDrift(
  notes: ScopedNote[],
  drift: Array<{ note: string }>,
  write: boolean,
): number {
  const byName = new Map(notes.map((note) => [note.name, note]))
  let count = 0
  for (const entry of drift) {
    const note = byName.get(entry.note)
    if (!note) continue
    count++
    if (write) {
      const meta: Meta = { ...note.meta, status: 'stale' }
      writeFileSync(note.path, serializeDoc({ meta, body: note.body }))
      note.meta = meta
    }
  }
  return count
}

/** Ghost-link cleanup over scoped notes. write=false only counts (dry-run). */
export function sanitizeNotes(notes: ScopedNote[], write: boolean): number {
  let total = 0
  for (const note of notes) {
    const { body, changed } = sanitizeWikilinks(note.body)
    if (changed === 0) continue
    total += changed
    if (write) {
      writeFileSync(note.path, serializeDoc({ meta: note.meta, body }))
      note.body = body
    }
  }
  return total
}

export interface DigestResult {
  text: string
  detailedCount: number
  indexOnlyCount: number
}

export const DEFAULT_MAX_DETAILED = 60

function digestEntry(note: ScopedNote): string {
  const headings = note.body
    .split('\n')
    .filter((line) => /^#{1,3} /.test(line))
    .slice(0, 8)
    .map((line) => line.replace(/^#+ /, ''))
    .join(' | ')
  const excerpt = note.body.replace(/\s+/g, ' ').trim().slice(0, 400)
  const meta = note.meta
  return [
    `### ${note.name}`,
    `topic: ${note.topic || '-'} · type: ${meta.type ?? '-'} · date: ${meta.date ?? '-'} · status: ${meta.status ?? 'active'}`,
    headings ? `headings: ${headings}` : '',
    `excerpt: ${excerpt}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Compact per-note digest the curator LLM reads instead of the full project. Bounded so
 * prompt size stays roughly flat as a vault grows: the `maxDetailed` most recently filed
 * notes get full headings+excerpt; everything older gets a one-line metadata index entry
 * instead of its content — the same titles/tags-first, bodies-on-demand shape obsidian-wiki
 * uses to keep query cost flat from 20 to 2,000 notes.
 */
export function buildDigest(notes: ScopedNote[], maxDetailed = DEFAULT_MAX_DETAILED): DigestResult {
  const ranked = [...notes].sort((a, b) => (b.meta.date ?? '').localeCompare(a.meta.date ?? ''))
  const detailed = ranked.slice(0, maxDetailed)
  const indexOnly = ranked.slice(maxDetailed)
  const detailedText = detailed.map(digestEntry).join('\n\n')

  if (indexOnly.length === 0) {
    return { text: detailedText, detailedCount: detailed.length, indexOnlyCount: 0 }
  }

  const indexText = indexOnly
    .map(
      (note) =>
        `- ${note.name} — topic: ${note.topic || '-'}, type: ${note.meta.type ?? '-'}, date: ${note.meta.date ?? '-'}`,
    )
    .join('\n')
  const text = [
    detailedText,
    '',
    `### Index only (${indexOnly.length} older note(s) — metadata only, no content shown)`,
    "Only place these in reading_order/stale/duplicates if their name, topic, or date alone justifies it — don't invent claims about content you can't see.",
    indexText,
  ].join('\n')
  return { text, detailedCount: detailed.length, indexOnlyCount: indexOnly.length }
}

// filler words that carry no meaning in a brief filename
const SLUG_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'for',
  'to',
  'and',
  'in',
  'on',
  'with',
  'draft',
  'write',
  'create',
  'make',
])

/** Legacy `_START-HERE` prefix kept so pre-v0.4 vaults still index their old briefs. */
export function isBriefName(name: string): boolean {
  return name.startsWith('Start Here') || name.startsWith('_START-HERE')
}

export function briefFileName(project: string, scoped: boolean, objective?: string): string {
  const base = `Start Here - ${slugify(project)}`
  if (!scoped) return `${base}.md`
  let slug = ''
  if (objective) {
    for (const word of slugify(objective).split('-')) {
      if (SLUG_STOPWORDS.has(word)) continue
      const next = slug ? `${slug}-${word}` : word
      if (next.length > 24) break
      slug = next
    }
  }
  if (!slug) slug = new Date().toISOString().slice(0, 10)
  return `${base} - ${slug}.md`
}

export interface ApplyResult {
  briefPath: string
  staleStamped: number
  duplicatesStamped: number
  relinked: number
}

export function applyCuration(
  vaultPath: string,
  project: string,
  plan: CurationPlan,
  notes: ScopedNote[],
  opts: { scoped: boolean; objective?: string },
): ApplyResult {
  const known = new Map(notes.map((note) => [note.name, note]))
  const today = new Date().toISOString().slice(0, 10)

  const briefBody = [
    `# Start here — ${project}`,
    '',
    `**Objective:** ${plan.objective}`,
    '',
    plan.brief.trim(),
    '',
    '## Reading order',
    '',
    ...plan.reading_order
      .filter((name) => known.has(name))
      .map((name, i) => `${i + 1}. [[${name}]]`),
    '',
    '## Next actions',
    '',
    ...plan.next_actions.map((action) => `- ${action}`),
  ]
  if (plan.stale.length > 0) {
    briefBody.push('', '## Flagged stale', '')
    for (const entry of plan.stale.filter((e) => known.has(e.note))) {
      const successor =
        entry.superseded_by && known.has(entry.superseded_by) ? ` → [[${entry.superseded_by}]]` : ''
      briefBody.push(`- [[${entry.note}]]${successor} — ${entry.reason}`)
    }
  }
  if (plan.duplicates.length > 0) {
    briefBody.push('', '## Merge candidates', '')
    for (const dup of plan.duplicates.filter((d) => known.has(d.canonical))) {
      const redundant = dup.redundant.filter((name) => known.has(name))
      if (redundant.length === 0) continue
      briefBody.push(
        `- keep [[${dup.canonical}]], superseded: ${redundant.map((n) => `[[${n}]]`).join(', ')} — ${dup.reason}`,
      )
    }
  }

  const briefPath = join(
    projectDir(vaultPath, project),
    briefFileName(project, opts.scoped, opts.objective),
  )
  writeFileSync(
    briefPath,
    serializeDoc({
      meta: {
        project,
        type: 'brief',
        date: today,
        objective: plan.objective,
        loredex: 'brief',
      },
      body: `${briefBody.join('\n').trimEnd()}\n`,
    }),
  )

  const stamp = (name: string, status: string, supersededBy?: string | null): boolean => {
    const note = known.get(name)
    if (!note) return false
    const meta: Meta = { ...note.meta, status }
    if (supersededBy && known.has(supersededBy)) meta.superseded_by = supersededBy
    writeFileSync(note.path, serializeDoc({ meta, body: note.body }))
    note.meta = meta
    return true
  }

  let staleStamped = 0
  for (const entry of plan.stale) {
    if (stamp(entry.note, 'stale', entry.superseded_by)) staleStamped++
  }
  let duplicatesStamped = 0
  for (const dup of plan.duplicates) {
    for (const name of dup.redundant) {
      if (name !== dup.canonical && stamp(name, 'superseded', dup.canonical)) duplicatesStamped++
    }
  }

  let relinked = 0
  for (const cluster of plan.clusters) {
    const members = cluster.notes.filter((name) => known.has(name))
    if (members.length < 2) continue
    for (const name of members) {
      const siblings = members.filter((other) => other !== name).slice(0, 5)
      replaceRelated((known.get(name) as ScopedNote).path, siblings)
      relinked++
    }
  }

  return { briefPath, staleStamped, duplicatesStamped, relinked }
}
