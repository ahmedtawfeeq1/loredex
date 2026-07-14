import { type Dirent, readdirSync, readFileSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { isRouted, parseDoc } from './frontmatter'

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  'venv',
  'target',
])

const SKIP_FILES =
  /^(readme|changelog|license|licence|contributing|code_of_conduct|security|agents|claude|gemini)(\..*)?\.md$/i

const SIGNAL_NAME =
  /(analysis|research|finding|report|summary|plan|audit|gap|review|notes?|spec|design|objective|snapshot|roadmap|checklist|state)/i

const SIGNAL_DIR = /(^|\/)(docs?|research|findings|notes|analysis|reports?|specs?|plans?)(\/|$)/i

/** One prune implementation for every walker: dependency/build/hidden dirs skipped. */
function walkFiles(root: string, match: (name: string) => boolean): string[] {
  const results: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          stack.push(join(dir, entry.name))
        }
      } else if (match(entry.name)) {
        results.push(join(dir, entry.name))
      }
    }
  }
  return results.sort()
}

/** All .md files under root, pruning dependency/build/hidden directories. */
export function walkMarkdown(root: string): string[] {
  return walkFiles(root, (name) => name.endsWith('.md'))
}

export const DATA_EXTS = ['.yaml', '.yml', '.json', '.csv'] as const

/** Structured data files (yaml/json/csv) under root — agent-ops dexes index these too. */
export function walkData(root: string): string[] {
  return walkFiles(root, (name) => DATA_EXTS.some((ext) => name.endsWith(ext)))
}

export interface Candidate {
  path: string
  raw: string
}

/** Already-routed markdown files under root — candidates for a vault-copy freshness check. */
export function findRouted(root: string): Candidate[] {
  const out: Candidate[] = []
  for (const path of walkMarkdown(root)) {
    if (SKIP_FILES.test(basename(path))) continue
    let raw: string
    try {
      raw = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    try {
      if (isRouted(parseDoc(raw).meta)) out.push({ path, raw })
    } catch {
      // broken frontmatter — leave the file alone
    }
  }
  return out
}

/** Markdown files that look research-shaped (frontmatter, signal name, or signal dir) and are not yet routed. */
export function findCandidates(root: string): Candidate[] {
  const out: Candidate[] = []
  for (const path of walkMarkdown(root)) {
    const name = basename(path)
    if (SKIP_FILES.test(name)) continue
    const rel = relative(root, path).split(sep).join('/')
    let raw: string
    try {
      raw = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    let meta: Record<string, unknown>
    try {
      meta = parseDoc(raw).meta as Record<string, unknown>
    } catch {
      continue // broken frontmatter — leave the file alone
    }
    if (isRouted(meta)) continue
    const hasFrontmatter = Object.keys(meta).length > 0
    if (hasFrontmatter || SIGNAL_NAME.test(name) || SIGNAL_DIR.test(rel)) {
      out.push({ path, raw })
    }
  }
  return out
}
