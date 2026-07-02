import { statSync } from 'node:fs'
import { basename, dirname, relative, sep } from 'node:path'
import type { Meta } from '../core/frontmatter'
import { normalizeType } from '../core/frontmatter'

const GENERIC_DIRS = new Set([
  'docs',
  'doc',
  'notes',
  'research',
  'findings',
  'reports',
  'analysis',
  'specs',
  'plans',
  '_inbox',
])

const TYPE_HINTS: Array<[RegExp, string]> = [
  [/research/i, 'research'],
  [/(finding|discovery)/i, 'finding'],
  [/(analysis|audit|review|gap)/i, 'analysis'],
  [/(snapshot|current|state)/i, 'snapshot'],
]

/** Rules-only classification: topic from the deepest non-generic directory, type from filename keywords. */
export function classifyHeuristic(path: string, projectRoot: string, projectName: string): Meta {
  const parts = dirname(relative(projectRoot, path))
    .split(sep)
    .filter((part) => part !== '.' && part !== '')
  const meaningful = parts.filter((part) => !GENERIC_DIRS.has(part.toLowerCase()))
  const topic = meaningful.length > 0 ? (meaningful.at(-1) as string) : 'general'
  const name = basename(path)
  const type = TYPE_HINTS.find(([pattern]) => pattern.test(name))?.[1] ?? 'note'
  let date: string
  try {
    date = statSync(path).mtime.toISOString().slice(0, 10)
  } catch {
    date = new Date().toISOString().slice(0, 10)
  }
  return { project: projectName, topic, type: normalizeType(type), date, tags: [] }
}
