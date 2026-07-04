import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { type ClassifyOptions, resolveMeta } from './classify'
import type { Config } from './config'
import { type Meta, parseDoc, serializeDoc } from './frontmatter'
import { rebuildIndexes } from './indexer'
import { addRelatedLinks } from './linker'
import { rewriteLinks } from './relink'
import { sanitizeWikilinks } from './sanitize'
import { slugify, targetDir, targetName, uniquePath } from './vault'

export interface PlanItem {
  source: string
  raw: string
  meta: Meta
  /** move: delete source after writing (inbox files). copy: stamp source as routed, leave it in place. */
  mode: 'move' | 'copy'
  destDir: string
  destName: string
  /** project root the source lives under — enables portable source_rel provenance */
  sourceRoot?: string
}

/** Existing project/topic folder names — fed to the classifier so it reuses them. */
export function knownStructure(vaultPath: string): { projects: string[]; topics: string[] } {
  const projects: string[] = []
  const topics = new Set<string>()
  const projectsDir = join(vaultPath, 'projects')
  if (existsSync(projectsDir)) {
    for (const project of readdirSync(projectsDir, { withFileTypes: true })) {
      if (!project.isDirectory()) continue
      projects.push(project.name)
      for (const topic of readdirSync(join(projectsDir, project.name), { withFileTypes: true })) {
        if (topic.isDirectory()) topics.add(topic.name)
      }
    }
  }
  return { projects, topics: [...topics] }
}

export function planFile(
  path: string,
  raw: string,
  mode: 'move' | 'copy',
  vaultPath: string,
  opts: ClassifyOptions,
): PlanItem {
  const meta = resolveMeta(path, raw, opts)
  return {
    source: path,
    raw,
    meta,
    mode,
    destDir: targetDir(vaultPath, meta),
    destName: targetName(meta, basename(path)),
    // copies come from a real project checkout; inbox moves have no meaningful root
    sourceRoot: mode === 'copy' ? opts.projectRoot : undefined,
  }
}

export interface ExecuteResult {
  written: string[]
}

export function executePlan(items: PlanItem[], vaultPath: string, config: Config): ExecuteResult {
  // resolve every destination first so same-batch collisions suffix correctly and
  // cross-references between adopted files can be rewritten to vault wikilinks
  const taken = new Set<string>()
  const dests = items.map((item) => {
    const dest = uniquePath(item.destDir, item.destName, taken)
    taken.add(dest)
    return dest
  })
  const mapping = new Map<string, string>()
  for (const [index, item] of items.entries()) {
    mapping.set(resolve(item.source), basename(dests[index] as string, '.md'))
  }
  const editor = config.editor ?? 'system'

  const written: string[] = []
  for (const [index, item] of items.entries()) {
    const { body } = parseDoc(item.raw)
    const meta: Meta = {
      ...item.meta,
      source: item.meta.source ?? 'manual',
      loredex: 'routed',
    }
    // provenance: copies keep a pointer to their origin (inbox moves have none worth keeping).
    // source_path is this machine's absolute path (fast, local); source_project+source_rel
    // are portable — teammates resolve them through their own config.projects roots.
    if (item.mode === 'copy') {
      meta.source_path = resolve(item.source)
      if (item.sourceRoot && meta.project) {
        meta.source_project = slugify(meta.project)
        meta.source_rel = relative(resolve(item.sourceRoot), resolve(item.source))
      }
    }

    // ghost-link hygiene, then rewire links: batch siblings → wikilinks,
    // existing files → editor/file deep links, unresolvable → untouched
    const cleaned = sanitizeWikilinks(body).body
    const relinked = rewriteLinks(cleaned, {
      sourceDir: dirname(resolve(item.source)),
      mapping,
      editor,
    }).body

    const dest = dests[index] as string
    writeFileSync(dest, serializeDoc({ meta, body: relinked }))
    if (item.mode === 'move') {
      unlinkSync(item.source)
    } else {
      // stamp the original so it is never re-adopted; content stays put
      const original = parseDoc(item.raw)
      writeFileSync(
        item.source,
        serializeDoc({ meta: { ...original.meta, loredex: 'routed' }, body: original.body }),
      )
    }
    addRelatedLinks(dest)
    written.push(dest)
  }
  if (written.length > 0) {
    rebuildIndexes(vaultPath)
    gitAutoCommit(vaultPath, config, `loredex: route ${written.length} note(s)`)
  }
  return { written }
}

export function gitAutoCommit(vaultPath: string, config: Config, message: string): void {
  if (config.sync !== 'git') return
  try {
    execFileSync('git', ['add', '-A'], { cwd: vaultPath, stdio: 'ignore' })
    execFileSync('git', ['commit', '-m', message], { cwd: vaultPath, stdio: 'ignore' })
  } catch {
    // git missing or nothing to commit — sync is best-effort
  }
}

/**
 * Generated files (indexes, the product brief) are regenerated wholesale on every run —
 * merging them line-by-line is meaningless and two teammates syncing concurrently would
 * conflict on them constantly. Register a keep-local merge driver (`true` = take the
 * current side, no conflict) for those paths; rebuildIndexes after every sync makes the
 * content right regardless of which side "won".
 */
export function ensureGeneratedMergeDriver(vaultPath: string): void {
  try {
    execFileSync('git', ['config', 'merge.loredex-generated.driver', 'true'], {
      cwd: vaultPath,
      stdio: 'ignore',
    })
    // .git/info/attributes, NOT a worktree .gitattributes: an uncommitted worktree file
    // would be swept away by pull --rebase --autostash at exactly the moment the rebase
    // needs it, and repo-local attributes never need committing or syncing
    const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
      cwd: vaultPath,
      encoding: 'utf8',
    }).trim()
    const infoDir = join(gitDir, 'info')
    mkdirSync(infoDir, { recursive: true })
    const attributesPath = join(infoDir, 'attributes')
    const rules = [
      '_index/** merge=loredex-generated',
      'Start\\ Here\\ -\\ Product.md merge=loredex-generated',
    ]
    const existing = existsSync(attributesPath) ? readFileSync(attributesPath, 'utf8') : ''
    const missing = rules.filter((rule) => !existing.includes(rule))
    if (missing.length > 0) {
      writeFileSync(
        attributesPath,
        `${existing}${existing.endsWith('\n') || !existing ? '' : '\n'}${missing.join('\n')}\n`,
      )
    }
  } catch {
    // git missing — sync is best-effort everywhere
  }
}

/**
 * Pull-rebase then push the vault repo so teammates see each other's notes.
 * Best-effort: no remote / offline / conflicts all degrade to a false return, never a throw —
 * the vault must keep working fully offline.
 */
export function gitPullPush(vaultPath: string): { pulled: boolean; pushed: boolean } {
  const run = (...args: string[]): boolean => {
    try {
      execFileSync('git', args, { cwd: vaultPath, stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }
  if (!run('rev-parse', '--is-inside-work-tree')) return { pulled: false, pushed: false }
  const hasRemote = (() => {
    try {
      return execFileSync('git', ['remote'], { cwd: vaultPath, encoding: 'utf8' }).trim().length > 0
    } catch {
      return false
    }
  })()
  if (!hasRemote) return { pulled: false, pushed: false }
  ensureGeneratedMergeDriver(vaultPath) // idempotent — every pull path gets conflict-free generated files
  const pulled = run('pull', '--rebase', '--autostash')
  const pushed = run('push')
  return { pulled, pushed }
}
