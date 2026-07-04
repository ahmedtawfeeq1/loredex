import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Meta } from './frontmatter'

export function scaffoldVault(vaultPath: string): void {
  for (const dir of ['_inbox', '_index', 'projects', 'research']) {
    mkdirSync(join(vaultPath, dir), { recursive: true })
  }
  const home = join(vaultPath, '_index', 'Home.md')
  if (!existsSync(home)) {
    writeFileSync(home, '# Home\n\nIndexes are rebuilt by `loredex route`.\n')
  }
}

export function inboxPath(vaultPath: string): string {
  return join(vaultPath, '_inbox')
}

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || 'untitled'
}

/** Directory a note belongs in. Notes without a project land under research/. */
export function targetDir(vaultPath: string, meta: Meta): string {
  const topic = slugify(meta.topic ?? 'general')
  return meta.project
    ? join(vaultPath, 'projects', slugify(meta.project), topic)
    : join(vaultPath, 'research', topic)
}

/** Normalized note filename: YYYY-MM-DD-slug.md (existing date prefixes are not doubled). */
export function targetName(meta: Meta, originalName: string): string {
  const date = meta.date ?? new Date().toISOString().slice(0, 10)
  const base = slugify(basename(originalName, '.md').replace(/^\d{4}-\d{2}-\d{2}[-_]?/, ''))
  return `${date}-${base}.md`
}

/** First non-colliding path for `name` inside `dir`; creates the directory. `taken` guards same-batch collisions. */
export function uniquePath(dir: string, name: string, taken?: Set<string>): string {
  mkdirSync(dir, { recursive: true })
  let candidate = join(dir, name)
  for (let i = 2; existsSync(candidate) || taken?.has(candidate); i++) {
    candidate = join(dir, name.replace(/\.md$/, `-${i}.md`))
  }
  return candidate
}
