import matter from 'gray-matter'

export const TYPES = ['research', 'finding', 'analysis', 'snapshot', 'note'] as const
export type FindingType = (typeof TYPES)[number]

/**
 * Frontmatter schema version this engine writes. v1 = the first versioned schema
 * (adds consume attribution: consumed_by/consumed_at). v2 = the handoff lifecycle
 * (kind/replies_to/fulfills + accepted/declined/snoozed transitions, each attributed).
 * Notes without a `loredex_schema` key predate versioning and are always readable;
 * all v2 fields are additive so v1 engines keep reading and round-tripping them.
 */
export const LOREDEX_SCHEMA = 2

/** Stamp engine-written frontmatter with the schema version it conforms to. */
export function stampSchema(meta: Meta): Meta {
  return { ...meta, loredex_schema: LOREDEX_SCHEMA }
}

export interface Meta {
  project?: string
  /** the product this project belongs to (view grouping); mirror of `_index/products.json` */
  product?: string
  topic?: string
  type?: string
  date?: string
  source?: string
  session?: string
  tags?: string[]
  status?: string
  superseded_by?: string
  objective?: string
  source_path?: string
  /** sha256 of the source body at route time — lets route detect and refresh stale vault copies */
  source_hash?: string
  /** portable provenance: project slug + path relative to that project's root — resolvable on any teammate's machine via their own config.projects */
  source_project?: string
  source_rel?: string
  from_project?: string
  to_project?: string
  loredex?: string
  /** consume attribution — closed vocabulary, one writer per transition (schema v1) */
  consumed_by?: string
  consumed_at?: string
  /** handoff lifecycle v2 (all additive; absent = the documented defaults) */
  kind?: string
  /** note name (no .md, no path) of the handoff this note replies to */
  replies_to?: string
  /** note name of the request handoff this delivery fulfills */
  fulfills?: string
  declined_reason?: string
  /** YYYY-MM-DD; readers derive "expired" when < today — never auto-written back */
  snoozed_until?: string
  accepted_by?: string
  accepted_at?: string
  declined_by?: string
  declined_at?: string
  snoozed_by?: string
  snoozed_at?: string
  loredex_schema?: number
}

export interface Doc {
  meta: Meta
  body: string
}

export function parseDoc(raw: string): Doc {
  const { data, content } = matter(raw)
  // YAML parses bare dates into Date objects; the vault contract is YYYY-MM-DD strings
  if (data.date instanceof Date) data.date = data.date.toISOString().slice(0, 10)
  return { meta: data as Meta, body: content }
}

export function serializeDoc(doc: Doc): string {
  return matter.stringify(doc.body, doc.meta)
}

/**
 * Set one top-level frontmatter key on a source file WITHOUT reserializing the rest.
 * serializeDoc round-trips the whole YAML through js-yaml, which reflows long scalars
 * into `>-` blocks and drops blank lines — cosmetic churn in the user's own repo every
 * time we stamp `loredex: routed`. This edits the raw text: replace the key's line if
 * present, else insert it before the closing fence; every other byte is preserved.
 * ponytail: matches only a top-level `key:` inside the fence (indented/nested keys are
 * left alone); a fence-open with no close falls through to prepend (malformed input).
 */
export function stampFrontmatterKey(raw: string, key: string, value: string): string {
  const nl = raw.includes('\r\n') ? '\r\n' : '\n'
  const lines = raw.split(/\r?\n/)
  const keyLine = new RegExp(`^${key}\\s*:`)
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
    if (close > 0) {
      const at = lines.findIndex((line, i) => i > 0 && i < close && keyLine.test(line))
      if (at !== -1) lines[at] = `${key}: ${value}`
      else lines.splice(close, 0, `${key}: ${value}`)
      return lines.join(nl)
    }
  }
  return `---${nl}${key}: ${value}${nl}---${nl}${nl}${raw}`
}

/** Enough metadata to file deterministically — no LLM needed. */
export function isRoutable(meta: Meta): boolean {
  return Boolean(meta.project && meta.topic)
}

export function isRouted(meta: Meta): boolean {
  return meta.loredex === 'routed'
}

export function normalizeType(type: string | undefined): FindingType {
  return TYPES.includes(type as FindingType) ? (type as FindingType) : 'note'
}
