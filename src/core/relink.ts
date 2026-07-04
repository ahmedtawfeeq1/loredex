import { existsSync } from 'node:fs'
import { extname, isAbsolute, resolve } from 'node:path'
import { mapOutsideCode } from './sanitize'

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
    // wikilinks whose target resolves to an adopted file get the new note name
    const wikiPass = segment.replace(WIKILINK, (full, target: string, alias?: string) => {
      const trimmed = target.trim()
      const hit =
        ctx.mapping.get(resolveTarget(trimmed)) ?? ctx.mapping.get(resolveTarget(`${trimmed}.md`))
      if (!hit || hit === trimmed) return full
      changed++
      return alias ? `[[${hit}|${alias}]]` : `[[${hit}]]`
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
