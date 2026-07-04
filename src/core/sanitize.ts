const WIKILINK = /\[\[([^[\]|]+?)(?:\|([^[\]]+?))?\]\]/g

/** Target with a non-.md file extension can never resolve to a vault note. */
function isGhostTarget(target: string): boolean {
  const match = target.trim().match(/\.([a-z0-9]{1,10})$/i)
  return match !== null && match[1]?.toLowerCase() !== 'md'
}

/**
 * Apply fn to the parts of the body that are prose — skips fenced code blocks
 * and inline code spans, so link/wikilink rewrites never touch code examples.
 */
export function mapOutsideCode(body: string, fn: (segment: string) => string): string {
  let inFence = false
  return body
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence
        return line
      }
      if (inFence) return line
      return line
        .split(/(`[^`]*`)/)
        .map((part) => (part.startsWith('`') ? part : fn(part)))
        .join('')
    })
    .join('\n')
}

export interface SanitizeResult {
  body: string
  changed: number
}

/**
 * Rewrite wikilinks pointing at non-markdown files ([[x.py]] → `x.py`) so they stop
 * rendering as ghost nodes in Obsidian's graph.
 */
export function sanitizeWikilinks(body: string): SanitizeResult {
  let changed = 0
  const result = mapOutsideCode(body, (segment) =>
    segment.replace(WIKILINK, (full, target: string, alias?: string) => {
      if (!isGhostTarget(target)) return full
      changed++
      return `\`${(alias ?? target).trim()}\``
    }),
  )
  return { body: result, changed }
}
