/**
 * Filing-scope policy (epic4.story3 / PR-3): "internal, never route" globs.
 * A team-visible routing rule — it lives in shared config (`Config.neverRoute`)
 * so the CLI honors the same list the app shows. Matching is minimatch-ish but
 * dependency-free (the lib ships no glob library): `*` = anything but `/`,
 * `**` = anything, `?` = one non-slash char. Patterns test against both the full
 * POSIX path and the bare filename, so `FINDINGS.md`, `**​/scratch/**`, and
 * `*.internal.md` all work. Enforcement is a single chokepoint (`executePlan`),
 * so no route surface — app, CLI, store — can bypass the policy.
 */

/** Routing was refused because the source matched a never-route glob. */
export class RouteScopeError extends Error {
  constructor(
    readonly file: string,
    readonly glob: string,
  ) {
    super(`routing blocked: ${file} matches never-route glob "${glob}"`)
    this.name = 'RouteScopeError'
  }
}

function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*'
        i++
        if (glob[i + 1] === '/') i++ // "**​/x" also matches a bare "x"
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${re}$`)
}

/** The first glob in `patterns` that matches `filePath`, or null. */
export function matchNeverRoute(patterns: readonly string[], filePath: string): string | null {
  const posix = filePath.replace(/\\/g, '/')
  const base = posix.split('/').pop() ?? posix
  for (const raw of patterns) {
    const pattern = raw.trim()
    if (!pattern) continue
    const re = globToRegExp(pattern)
    if (re.test(posix) || re.test(base)) return pattern
  }
  return null
}
