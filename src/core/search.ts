import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { isBriefName } from './curate'
import { loadDexType } from './dex'
import { type Meta, parseDoc } from './frontmatter'
import { listProjects, PRODUCT_BRIEF_NAME } from './product'
import { walkData, walkMarkdown } from './scan'
import { dataFileSummary } from './tables'

export interface SearchHit {
  name: string
  project: string
  topic: string
  date: string
  status: string
  kind: 'brief' | 'handoff' | 'note' | 'data'
  /** set on kind 'data' hits (agent-ops dexes index yaml/json/csv structurally) */
  fileType?: 'yaml' | 'json' | 'csv'
  excerpt: string
  path: string
  score: number
}

export interface SearchOptions {
  project?: string
  limit?: number
}

/** Strip control chars (incl. ANSI escapes) and collapse whitespace — search results flow into agent context. */
export function sanitizeForContext(text: string, max: number): string {
  return (
    text
      .replace(/\s+/g, ' ')
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, max)
  )
}

function noteKind(name: string, meta: Meta): SearchHit['kind'] {
  if (isBriefName(name) || meta.loredex === 'brief') return 'brief'
  if (meta.type === 'handoff' || meta.topic === 'handoffs') return 'handoff'
  return 'note'
}

/**
 * Deterministic term search over the whole vault, ranked for agent consumption:
 * briefs and handoffs (curated/coordination knowledge) score above raw notes,
 * stale/superseded notes sink. No LLM, no index — a vault walk is fast enough
 * well past a few thousand notes.
 */
export function searchVault(
  vaultPath: string,
  query: string,
  opts: SearchOptions = {},
): SearchHit[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 1)
  if (terms.length === 0) return []

  const files: Array<{ path: string; project: string }> = []
  for (const project of listProjects(vaultPath)) {
    if (opts.project && project !== opts.project) continue
    for (const path of walkMarkdown(join(vaultPath, 'projects', project))) {
      files.push({ path, project })
    }
  }
  const productBrief = join(vaultPath, PRODUCT_BRIEF_NAME)
  if (!opts.project && existsSync(productBrief)) files.push({ path: productBrief, project: '' })

  const hits: SearchHit[] = []
  for (const file of files) {
    let raw: string
    try {
      raw = readFileSync(file.path, 'utf8')
    } catch {
      continue
    }
    let meta: Meta
    let body: string
    try {
      const doc = parseDoc(raw)
      meta = doc.meta
      body = doc.body
    } catch {
      continue
    }
    const name = basename(file.path, '.md')
    const lowerName = name.toLowerCase()
    const lowerTopic = (meta.topic ?? '').toLowerCase()
    const lowerBody = body.toLowerCase()

    let score = 0
    let firstIndex = -1
    for (const term of terms) {
      if (lowerName.includes(term)) score += 3
      if (lowerTopic.includes(term)) score += 2
      let count = 0
      let index = lowerBody.indexOf(term)
      if (index !== -1 && (firstIndex === -1 || index < firstIndex)) firstIndex = index
      while (index !== -1 && count < 5) {
        count++
        index = lowerBody.indexOf(term, index + term.length)
      }
      score += count
    }
    if (score === 0) continue

    const kind = noteKind(name, meta)
    if (kind !== 'note') score *= 1.5
    if (meta.status === 'stale' || meta.status === 'superseded') score *= 0.4

    const start = Math.max(0, (firstIndex === -1 ? 0 : firstIndex) - 60)
    hits.push({
      name,
      project: file.project,
      topic: meta.topic ?? '',
      date: meta.date ?? '',
      status: meta.status ?? 'active',
      kind,
      excerpt: sanitizeForContext(body.slice(start, start + 400), 300),
      path: file.path,
      score,
    })
  }
  // agent-ops dexes: structural pass over data files (yaml/json keys, csv headers).
  // Early type check keeps research dexes byte- and time-identical.
  if (loadDexType(vaultPath) === 'agent-ops') {
    for (const project of listProjects(vaultPath)) {
      if (opts.project && project !== opts.project) continue
      for (const path of walkData(join(vaultPath, 'projects', project))) {
        const summary = dataFileSummary(path)
        if (!summary) continue
        const name = basename(path)
        const lowerName = name.toLowerCase()
        const lowerKeys = summary.keys.map((k) => k.toLowerCase())
        let score = 0
        for (const term of terms) {
          if (lowerName.includes(term)) score += 3
          score += 2 * lowerKeys.filter((k) => k.includes(term)).length
        }
        if (score === 0) continue
        const keyList = summary.keys.slice(0, 12).join(', ')
        const rows = summary.rowCount !== undefined ? ` · ${summary.rowCount} rows` : ''
        hits.push({
          name,
          project,
          topic: dataTopic(vaultPath, project, path),
          date: '',
          status: 'active',
          kind: 'data',
          fileType: summary.kind,
          excerpt: sanitizeForContext(`${summary.kind}${rows} — ${keyList}`, 300),
          path,
          score,
        })
      }
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 10)
}

/** First folder under the client dir, e.g. knowledge_tables / automation_workflows / pipelines. */
function dataTopic(vaultPath: string, project: string, path: string): string {
  const rel = path.slice(join(vaultPath, 'projects', project).length + 1)
  const first = rel.split('/')[0] ?? ''
  return first.includes('.') ? '' : first
}
