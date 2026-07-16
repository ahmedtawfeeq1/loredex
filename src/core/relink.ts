import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { mapOutsideCode } from './sanitize'
import { walkMarkdown } from './scan'

/** Extensions that open sensibly in a code editor (deep link with line support). */
const TEXT_EXTS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'md',
  'mdx',
  'json',
  'yaml',
  'yml',
  'toml',
  'go',
  'rs',
  'java',
  'rb',
  'php',
  'sh',
  'bash',
  'zsh',
  'css',
  'scss',
  'html',
  'xml',
  'sql',
  'txt',
  'csv',
  'env',
  'ini',
  'cfg',
  'conf',
  'c',
  'h',
  'cpp',
  'hpp',
  'swift',
  'kt',
  'vue',
  'svelte',
  'prisma',
  'graphql',
  'proto',
  'tf',
])

// [text](target) — capture leading ! to skip image embeds; target may be <angled> or plain; optional "title"
const MD_LINK = /(!?)\[([^\]]*)\]\(\s*(?:<([^>]*)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g

const WIKILINK = /\[\[([^[\]|]+?)(?:\|([^[\]]+?))?\]\]/g

// any scheme (http:, mailto:, file:, vscode:, obsidian:, …) or a pure in-document anchor
const SKIP_TARGET = /^(?:[a-z][a-z0-9+.-]*:|#)/i

export interface RelinkContext {
  /** directory of the ORIGINAL file — relative links resolve against it */
  sourceDir: string
  /** absolute original path → new vault note name (no .md) for everything routed in this batch */
  mapping: Map<string, string>
  /** 'system' → file://; otherwise a URI scheme: vscode | cursor | windsurf | <custom> */
  editor: string
  /**
   * date-stripped slug → existing vault note names — fallback for wikilinks whose
   * target was routed in an EARLIER batch (route renames notes to YYYY-MM-DD-slug,
   * so `[[slug]]` written after that batch would otherwise never resolve).
   */
  vaultIndex?: Map<string, string[]>
}

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}[-_]?/

/** Existing vault notes keyed by date-stripped lowercased slug. `_inbox` is excluded — those notes are renamed on route. */
export function buildVaultLinkIndex(vaultPath: string): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const path of walkMarkdown(vaultPath)) {
    if (relative(vaultPath, path).split(sep)[0] === '_inbox') continue
    const name = basename(path, '.md')
    const slug = name.replace(DATE_PREFIX, '').toLowerCase()
    const names = index.get(slug)
    if (names) names.push(name)
    else index.set(slug, [name])
  }
  return index
}

/** Unique vault note name for a bare wikilink target, or null (ambiguity is never guessed). */
function resolveByIndex(
  target: string,
  vaultIndex: Map<string, string[]> | undefined,
): { name: string; anchor: string } | null {
  if (!vaultIndex) return null
  const hashAt = target.indexOf('#')
  const base = hashAt === -1 ? target : target.slice(0, hashAt)
  const anchor = hashAt === -1 ? '' : target.slice(hashAt)
  if (!base || base.includes('/')) return null
  const names = vaultIndex.get(base.replace(/\.md$/i, '').toLowerCase())
  const name = names?.length === 1 ? names[0] : undefined
  if (!name || name.toLowerCase() === base.toLowerCase()) return null
  return { name, anchor }
}

/** Deep link that opens the file in the configured editor (line-aware), or the OS default. */
export function editorUri(editor: string, absPath: string, line?: number): string {
  if (!editor || editor === 'system') return `file://${encodeURI(absPath)}`
  return `${editor}://file${encodeURI(absPath)}${line ? `:${line}` : ''}`
}

export interface RelinkResult {
  body: string
  changed: number
}

/**
 * Rewire a note's links after it moves into the vault:
 * - links to files adopted in the same batch → vault wikilinks (graph edges)
 * - links to files that exist on disk → editor deep link (text) or file:// (binary)
 * - anything unresolvable stays untouched — never invent a link
 */
export function rewriteLinks(body: string, ctx: RelinkContext): RelinkResult {
  let changed = 0

  const resolveTarget = (raw: string): string => {
    let decoded: string
    try {
      decoded = decodeURIComponent(raw)
    } catch {
      decoded = raw
    }
    return isAbsolute(decoded) ? decoded : resolve(ctx.sourceDir, decoded)
  }

  const result = mapOutsideCode(body, (segment) => {
    // wikilinks whose target resolves to an adopted file get the new note name;
    // otherwise fall back to notes already in the vault from earlier batches
    const wikiPass = segment.replace(WIKILINK, (full, target: string, alias?: string) => {
      const trimmed = target.trim()
      const hit =
        ctx.mapping.get(resolveTarget(trimmed)) ?? ctx.mapping.get(resolveTarget(`${trimmed}.md`))
      if (hit) {
        if (hit === trimmed) return full
        changed++
        return alias ? `[[${hit}|${alias}]]` : `[[${hit}]]`
      }
      const vaulted = resolveByIndex(trimmed, ctx.vaultIndex)
      if (!vaulted) return full
      changed++
      const renamed = `${vaulted.name}${vaulted.anchor}`
      return alias ? `[[${renamed}|${alias}]]` : `[[${renamed}]]`
    })

    return wikiPass.replace(
      MD_LINK,
      (full, bang: string, text: string, angled?: string, plain?: string) => {
        if (bang === '!') return full // image embed — file:// images don't render in Obsidian
        let target = (angled ?? plain ?? '').trim()
        if (!target || SKIP_TARGET.test(target)) return full

        let line: number | undefined
        const lineMatch = target.match(/(?:#L(\d+)|:(\d+))$/)
        if (lineMatch) {
          line = Number(lineMatch[1] ?? lineMatch[2])
          target = target.slice(0, target.length - lineMatch[0].length)
        }
        const hashIndex = target.indexOf('#')
        if (hashIndex > 0) target = target.slice(0, hashIndex) // path.md#heading → path.md

        const abs = resolveTarget(target)
        const mapped = ctx.mapping.get(abs)
        if (mapped) {
          changed++
          return text && text !== mapped ? `[[${mapped}|${text}]]` : `[[${mapped}]]`
        }
        if (!existsSync(abs)) return full // never invent a link

        changed++
        const ext = extname(abs).slice(1).toLowerCase()
        const uri = TEXT_EXTS.has(ext)
          ? editorUri(ctx.editor, abs, line)
          : `file://${encodeURI(abs)}`
        return `[${text || target}](${uri})`
      },
    )
  })

  return { body: result, changed }
}

export interface RepairedFile {
  path: string
  changed: number
}

/**
 * Vault-wide repair for links broken by cross-batch routing: rewrite bare
 * wikilinks that uniquely match a date-prefixed vault note. Frontmatter and
 * code spans are never touched; `_inbox` waits for route. Idempotent.
 */
export function repairVaultLinks(vaultPath: string, opts?: { dryRun?: boolean }): RepairedFile[] {
  const vaultIndex = buildVaultLinkIndex(vaultPath)
  const repaired: RepairedFile[] = []
  for (const path of walkMarkdown(vaultPath)) {
    if (relative(vaultPath, path).split(sep)[0] === '_inbox') continue
    const raw = readFileSync(path, 'utf8')
    // split frontmatter off byte-exactly — a parse/serialize round-trip would reformat it
    const fmMatch = raw.startsWith('---\n') ? raw.match(/^---\n[\s\S]*?\n---\n/) : null
    const head = fmMatch?.[0] ?? ''
    let changed = 0
    const body = mapOutsideCode(raw.slice(head.length), (segment) =>
      segment.replace(WIKILINK, (full, target: string, alias?: string) => {
        const vaulted = resolveByIndex(target.trim(), vaultIndex)
        if (!vaulted) return full
        changed++
        const renamed = `${vaulted.name}${vaulted.anchor}`
        return alias ? `[[${renamed}|${alias}]]` : `[[${renamed}]]`
      }),
    )
    if (changed === 0) continue
    if (!opts?.dryRun) writeFileSync(path, head + body)
    repaired.push({ path, changed })
  }
  return repaired
}
