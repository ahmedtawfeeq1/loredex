const WIKILINK = /\[\[([^[\]|]+?)(?:\|([^[\]]+?))?\]\]/g

/** Target with a non-.md file extension can never resolve to a vault note. */
function isGhostTarget(target: string): boolean {
  const match = target.trim().match(/\.([a-z0-9]{1,10})$/i)
  return match !== null && match[1]?.toLowerCase() !== 'md'
}

export interface SanitizeResult {
  body: string
  changed: number
}

/**
 * Rewrite wikilinks pointing at non-markdown files ([[x.py]] → `x.py`) so they stop
 * rendering as ghost nodes in Obsidian's graph. Fence-aware: fenced code blocks untouched.
 */
export function sanitizeWikilinks(body: string): SanitizeResult {
  let changed = 0
  let inFence = false
  const lines = body.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      return line
    }
    if (inFence) return line
    return line.replace(WIKILINK, (full, target: string, alias?: string) => {
      if (!isGhostTarget(target)) return full
      changed++
      return `\`${(alias ?? target).trim()}\``
    })
  })
  return { body: lines.join('\n'), changed }
}
