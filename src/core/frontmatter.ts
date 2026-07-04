import matter from 'gray-matter'

export const TYPES = ['research', 'finding', 'analysis', 'snapshot', 'note'] as const
export type FindingType = (typeof TYPES)[number]

export interface Meta {
  project?: string
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
  /** portable provenance: project slug + path relative to that project's root — resolvable on any teammate's machine via their own config.projects */
  source_project?: string
  source_rel?: string
  from_project?: string
  to_project?: string
  loredex?: string
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
