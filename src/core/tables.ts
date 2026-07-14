import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { load as yamlLoad } from 'js-yaml'

/**
 * Structural summaries of data files (yaml/json/csv) for agent-ops indexing and
 * search: filename + top-level keys / csv headers + row count. Contents are never
 * rewritten and never parsed deeper than one level — machine truth stays raw.
 */

/** First-line headers (simple double-quote aware) + count of non-empty data rows. */
export function csvHead(raw: string): { headers: string[]; rowCount: number } {
  const text = raw.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const first = lines[0]
  if (!first) return { headers: [], rowCount: 0 }
  const headers: string[] = []
  let current = ''
  let quoted = false
  for (const char of first) {
    if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) {
      headers.push(current.trim())
      current = ''
    } else current += char
  }
  headers.push(current.trim())
  return { headers: headers.filter(Boolean), rowCount: lines.length - 1 }
}

/** Top-level keys of a YAML map; [] for scalars, arrays, or parse errors. */
export function yamlTopLevelKeys(raw: string): string[] {
  try {
    const value = yamlLoad(raw)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).sort()
    }
  } catch {
    // unreadable yaml — no keys
  }
  return []
}

/** Top-level keys of a JSON object; [] for scalars, arrays, or parse errors. */
export function jsonTopLevelKeys(raw: string): string[] {
  try {
    const value = JSON.parse(raw)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).sort()
    }
  } catch {
    // unreadable json — no keys
  }
  return []
}

export interface DataFileSummary {
  kind: 'yaml' | 'json' | 'csv'
  /** top-level keys (yaml/json) or headers (csv) */
  keys: string[]
  rowCount?: number
}

/** Structural summary of one data file, or null when unreadable / not a data file. */
export function dataFileSummary(path: string): DataFileSummary | null {
  const name = basename(path)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return null
  }
  if (name.endsWith('.csv')) {
    const { headers, rowCount } = csvHead(raw)
    return { kind: 'csv', keys: headers, rowCount }
  }
  if (name.endsWith('.yaml') || name.endsWith('.yml')) {
    return { kind: 'yaml', keys: yamlTopLevelKeys(raw) }
  }
  if (name.endsWith('.json')) {
    return { kind: 'json', keys: jsonTopLevelKeys(raw) }
  }
  return null
}
