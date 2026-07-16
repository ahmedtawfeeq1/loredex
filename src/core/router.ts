import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
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
import { loadDexSync } from './dex'
import { resolveSourceAbs } from './drift'
import { emitLoredexEvent } from './events'
import { type Meta, parseDoc, serializeDoc, stampFrontmatterKey, stampSchema } from './frontmatter'
import { rebuildIndexes } from './indexer'
import { addRelatedLinks } from './linker'
import { loadProducts, productOf } from './products'
import { loadReceipt, type RouteReceipt, RouteUndoError, writeReceipt } from './receipts'
import { buildVaultLinkIndex, rewriteLinks } from './relink'
import { sanitizeWikilinks } from './sanitize'
import { findRouted, walkMarkdown } from './scan'
import { matchNeverRoute, RouteScopeError } from './scope'
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
  /** id of the persisted receipt (present whenever anything was written) — PR-3 undo key */
  receiptId?: string
}

/**
 * The exact frontmatter `executePlan` writes for one plan item — shared with read-only
 * previews (`previewRoute`) so what a host confirms is what the executor stamps.
 * Provenance: copies keep a pointer to their origin (inbox moves have none worth
 * keeping). source_path is this machine's absolute path (fast, local);
 * source_project+source_rel are portable — teammates resolve them through their own
 * config.projects roots.
 */
export function plannedMeta(item: PlanItem, product?: string | null): Meta {
  const meta: Meta = stampSchema({
    ...item.meta,
    source: item.meta.source ?? 'manual',
    loredex: 'routed',
  })
  // mirror the project's product into frontmatter so Obsidian's dashboard can
  // group by it (the manifest stays authoritative for the CLI/desktop)
  if (product) meta.product = product
  if (item.mode === 'copy') {
    meta.source_path = resolve(item.source)
    meta.source_hash = hashBody(parseDoc(item.raw).body)
    if (item.sourceRoot && meta.project) {
      meta.source_project = slugify(meta.project)
      meta.source_rel = relative(resolve(item.sourceRoot), resolve(item.source))
    }
  }
  return meta
}

/** Content identity of a source body — what route stamps and refresh compares. */
export function hashBody(body: string): string {
  return createHash('sha256').update(body.trim()).digest('hex')
}

export function executePlan(items: PlanItem[], vaultPath: string, config: Config): ExecuteResult {
  // filing-scope policy (PR-3): one enforcement chokepoint — no route surface can
  // bypass never-route globs. A blocked route throws loudly, never a silent skip.
  const neverRoute = config.neverRoute ?? []
  for (const item of items) {
    const glob = matchNeverRoute(neverRoute, item.source)
    if (glob) throw new RouteScopeError(item.source, glob)
  }
  // capture each source's exact pre-route bytes BEFORE any write, so undo can
  // restore byte-identical state (move: recreate the deleted source; copy: revert
  // the routed stamp). null = the source did not exist (nothing to restore).
  const priorSources = items.map((item) => ({
    path: resolve(item.source),
    priorContent: existsSync(item.source) ? readFileSync(item.source, 'utf8') : null,
  }))
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
  // notes routed in EARLIER batches — without this, a wikilink to a sibling routed
  // last session never picks up its date-prefixed vault name and renders broken
  const vaultIndex = buildVaultLinkIndex(vaultPath)
  const editor = config.editor ?? 'system'
  const products = loadProducts(vaultPath)

  const written: string[] = []
  for (const [index, item] of items.entries()) {
    const { body } = parseDoc(item.raw)
    const meta = plannedMeta(
      item,
      item.meta.project ? productOf(products, slugify(item.meta.project)) : null,
    )

    // ghost-link hygiene, then rewire links: batch siblings → wikilinks,
    // existing files → editor/file deep links, unresolvable → untouched
    const cleaned = sanitizeWikilinks(body).body
    const relinked = rewriteLinks(cleaned, {
      sourceDir: dirname(resolve(item.source)),
      mapping,
      editor,
      vaultIndex,
    }).body

    const dest = dests[index] as string
    writeFileSync(dest, serializeDoc({ meta, body: relinked }))
    if (item.mode === 'move') {
      unlinkSync(item.source)
    } else if (existsSync(item.source)) {
      // stamp the original so it is never re-adopted — reread from disk, never item.raw:
      // the source may have been edited between planning and now, and writing the stale
      // snapshot back would silently destroy those edits. Surgical single-key edit (not
      // a serializeDoc round-trip) so the user's own frontmatter formatting is untouched.
      writeFileSync(
        item.source,
        stampFrontmatterKey(readFileSync(item.source, 'utf8'), 'loredex', 'routed'),
      )
    }
    addRelatedLinks(dest)
    written.push(dest)
  }
  if (written.length > 0) {
    // persist the receipt BEFORE committing so it rides the route's own git commit
    // (.loredex/ is tracked) — CLI and app then share one reversible history.
    const receipt: RouteReceipt = {
      id: randomUUID(),
      appliedAt: new Date().toISOString(),
      mode: items[0]?.mode ?? 'copy',
      contentHash: hashBody(parseDoc(items[0]?.raw ?? '').body),
      written,
      sources: priorSources,
    }
    writeReceipt(vaultPath, receipt)
    rebuildIndexes(vaultPath)
    gitAutoCommit(vaultPath, config, `loredex: route ${written.length} note(s)`)
    emitLoredexEvent('route', { paths: written })
    return { written, receiptId: receipt.id }
  }
  return { written }
}

/**
 * Reverse a route (PR-3): delete the vault copies it created and restore every
 * source to its exact pre-route bytes, then regenerate indexes and commit — the
 * result is byte-identical to before the route (F4: no irreversible write).
 * Receipts are append-only history, so undo marks the receipt `undone` (a second
 * undo throws) rather than deleting it. The undone flag is written before the
 * commit so it rides the same commit and the working tree stays clean.
 */
export function undoRoute(
  vaultPath: string,
  config: Config,
  receiptId: string,
): { removed: string[]; restored: string[] } {
  const receipt = loadReceipt(vaultPath, receiptId)
  if (!receipt) throw new RouteUndoError(`no route receipt ${receiptId}`, 'RECEIPT_NOT_FOUND')
  if (receipt.undone) {
    throw new RouteUndoError(`route ${receiptId} was already undone`, 'ALREADY_UNDONE')
  }

  const removed: string[] = []
  for (const w of receipt.written) {
    if (existsSync(w)) {
      unlinkSync(w)
      removed.push(w)
    }
  }
  const restored: string[] = []
  for (const s of receipt.sources) {
    if (s.priorContent !== null) {
      writeFileSync(s.path, s.priorContent)
      restored.push(s.path)
    }
  }
  writeReceipt(vaultPath, { ...receipt, undone: true })
  rebuildIndexes(vaultPath)
  gitAutoCommit(vaultPath, config, `loredex: undo route (${receipt.written.length} note(s))`)
  emitLoredexEvent('route', { paths: receipt.written })
  return { removed, restored }
}

/**
 * Re-sync vault copies of already-routed sources that changed since routing.
 * A routed source is skipped by findCandidates forever, so without this pass an
 * edit to an already-routed file never reaches its vault note — the copy goes
 * stale under the same name. Detection is source_hash (stamped at route time);
 * notes routed before source_hash existed fall back to a body comparison.
 */
export function refreshRoutedCopies(
  projectRoot: string,
  vaultPath: string,
  config: Config,
): string[] {
  // vault index: this-machine source path → vault notes copied from it
  const bySource = new Map<string, string[]>()
  const rootsBySlug = new Map(
    Object.entries(config.projects).map(([path, entry]) => [slugify(entry.name), path]),
  )
  for (const notePath of walkMarkdown(join(vaultPath, 'projects'))) {
    let meta: Meta
    try {
      meta = parseDoc(readFileSync(notePath, 'utf8')).meta
    } catch {
      continue
    }
    const abs = resolveSourceAbs(meta, (slug) => rootsBySlug.get(slug) ?? null)
    if (!abs) continue
    const notes = bySource.get(resolve(abs)) ?? []
    notes.push(notePath)
    bySource.set(resolve(abs), notes)
  }

  const editor = config.editor ?? 'system'
  const vaultIndex = buildVaultLinkIndex(vaultPath)
  const refreshed: string[] = []
  for (const { path, raw } of findRouted(projectRoot)) {
    const notes = bySource.get(resolve(path))
    if (!notes) continue
    const sourceBody = parseDoc(raw).body
    const hash = hashBody(sourceBody)
    // recompute the vault body the way route would (no batch mapping on a refresh)
    const cleaned = sanitizeWikilinks(sourceBody).body
    const newBody = rewriteLinks(cleaned, {
      sourceDir: dirname(resolve(path)),
      mapping: new Map(),
      editor,
      vaultIndex,
    }).body
    for (const notePath of notes) {
      const note = parseDoc(readFileSync(notePath, 'utf8'))
      if (note.meta.source_hash === hash) continue
      // pre-source_hash notes: compare bodies (minus the generated Related section)
      if (!note.meta.source_hash && stripRelated(note.body) === newBody.trim()) continue
      // ponytail: source wins — curated body edits to the vault copy are overwritten;
      // keep curation in frontmatter/Related, or edit the source instead
      writeFileSync(
        notePath,
        serializeDoc({ meta: { ...note.meta, source_hash: hash }, body: newBody }),
      )
      addRelatedLinks(notePath)
      refreshed.push(notePath)
    }
  }
  if (refreshed.length > 0) {
    rebuildIndexes(vaultPath)
    gitAutoCommit(vaultPath, config, `loredex: refresh ${refreshed.length} note(s)`)
    emitLoredexEvent('route', { paths: refreshed })
  }
  return refreshed
}

function stripRelated(body: string): string {
  const index = body.indexOf('## Related')
  return (index === -1 ? body : body.slice(0, index)).trim()
}

export function gitAutoCommit(vaultPath: string, config: Config, message: string): void {
  // the dex's own committed sync policy wins; config.sync is the machine-global fallback
  if ((loadDexSync(vaultPath) ?? config.sync) !== 'git') return
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
    // gitattributes has no backslash-escape for spaces — patterns with spaces must be quoted
    const rules = [
      '_index/** merge=loredex-generated',
      '"Start Here - Product.md" merge=loredex-generated',
    ]
    const brokenRule = 'Start\\ Here\\ -\\ Product.md merge=loredex-generated'
    let existing = existsSync(attributesPath) ? readFileSync(attributesPath, 'utf8') : ''
    if (existing.includes(brokenRule)) {
      existing = existing
        .split('\n')
        .filter((line) => line.trim() !== brokenRule)
        .join('\n')
      writeFileSync(attributesPath, existing)
    }
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
  emitLoredexEvent('sync', { pulled, pushed })
  return { pulled, pushed }
}
