import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** One authoritative picture of vault sync health — the observe side of gitPullPush. */
export interface SyncHealth {
  state: 'ok' | 'ahead' | 'behind' | 'diverged' | 'error'
  /** currently checked-out branch */
  branch: string | null
  /** the remote's canonical branch (its HEAD), when known */
  canonicalBranch: string | null
  branchMatches: boolean
  /** first configured remote name */
  remote: string | null
  remoteReachable: boolean
  ahead: number
  behind: number
  /** keep-local merge driver for generated files is configured */
  mergeDriverInstalled: boolean
  /** repo-local attributes carry the valid quoted patterns (and not the broken escaped one) */
  gitattributesValid: boolean
  /** ISO timestamp of the last pull recorded in HEAD's reflog */
  lastPull: string | null
  /** ISO timestamp of the last push recorded in the remote-tracking ref's reflog */
  lastPush: string | null
  warnings: string[]
}

const VALID_RULES = [
  '_index/** merge=loredex-generated',
  '"Start Here - Product.md" merge=loredex-generated',
]
const BROKEN_RULE = 'Start\\ Here\\ -\\ Product.md merge=loredex-generated'

/**
 * Read-only sync health for the vault repo. Runs git queries only — never fetches,
 * never writes. Ahead/behind counts are measured against the last-fetched remote ref,
 * so freshness equals the caller's last `git fetch`; callers decide when to fetch.
 */
export function syncStatus(vaultPath: string, opts: { remoteTimeoutMs?: number } = {}): SyncHealth {
  const warnings: string[] = []
  const git = (args: string[], timeout?: number): string | null => {
    try {
      return execFileSync('git', args, { cwd: vaultPath, encoding: 'utf8', timeout }).trim()
    } catch {
      return null
    }
  }

  const health: SyncHealth = {
    state: 'error',
    branch: null,
    canonicalBranch: null,
    branchMatches: false,
    remote: null,
    remoteReachable: false,
    ahead: 0,
    behind: 0,
    mergeDriverInstalled: false,
    gitattributesValid: false,
    lastPull: null,
    lastPush: null,
    warnings,
  }

  if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') {
    warnings.push('vault is not a git repository — nothing syncs')
    return health
  }

  health.branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  health.remote = git(['remote'])?.split('\n')[0] || null

  if (health.remote) {
    health.remoteReachable =
      git(['ls-remote', '--heads', health.remote], opts.remoteTimeoutMs ?? 5000) !== null
    if (!health.remoteReachable) warnings.push(`remote "${health.remote}" is not reachable`)

    const remoteHead = git([
      'symbolic-ref',
      '--quiet',
      '--short',
      `refs/remotes/${health.remote}/HEAD`,
    ])
    health.canonicalBranch = remoteHead ? remoteHead.slice(health.remote.length + 1) : null
  } else {
    warnings.push('no git remote configured — vault is local-only')
  }

  health.branchMatches = health.canonicalBranch === null || health.branch === health.canonicalBranch
  if (!health.branchMatches) {
    warnings.push(
      `on branch "${health.branch}" but the team branch is "${health.canonicalBranch}" — syncs will miss teammates' notes`,
    )
  }

  // ahead/behind vs the last-fetched remote-tracking ref (no implicit fetch)
  if (health.remote) {
    const upstream = `${health.remote}/${health.canonicalBranch ?? health.branch}`
    const counts = git(['rev-list', '--left-right', '--count', `HEAD...${upstream}`])
    if (counts) {
      const [ahead, behind] = counts.split(/\s+/).map(Number)
      health.ahead = ahead ?? 0
      health.behind = behind ?? 0
    } else {
      warnings.push(`no remote-tracking ref for ${upstream} — never fetched?`)
    }
  }

  // merge-driver status is first-class: the F8 gitattributes bug warned on every op unseen
  health.mergeDriverInstalled = git(['config', 'merge.loredex-generated.driver']) === 'true'
  const gitDir = git(['rev-parse', '--absolute-git-dir'])
  if (gitDir) {
    const attributesPath = join(gitDir, 'info', 'attributes')
    const attributes = existsSync(attributesPath) ? readFileSync(attributesPath, 'utf8') : ''
    health.gitattributesValid =
      VALID_RULES.every((rule) => attributes.includes(rule)) && !attributes.includes(BROKEN_RULE)
  }
  if (!health.mergeDriverInstalled || !health.gitattributesValid) {
    warnings.push(
      'generated-files merge driver is missing or its gitattributes pattern is invalid — concurrent syncs will conflict on generated indexes (run `loredex sync` to repair)',
    )
  }

  health.lastPull = reflogTimestamp(git, 'HEAD', /\bpull\b/)
  if (health.remote && health.branch) {
    health.lastPush = reflogTimestamp(
      git,
      `refs/remotes/${health.remote}/${health.branch}`,
      /update by push/,
    )
  }

  health.state =
    health.ahead > 0 && health.behind > 0
      ? 'diverged'
      : health.behind > 0
        ? 'behind'
        : health.ahead > 0
          ? 'ahead'
          : 'ok'
  if (health.state === 'diverged') {
    warnings.push('local and remote histories diverged — next sync will rebase')
  }
  return health
}

function reflogTimestamp(
  git: (args: string[]) => string | null,
  ref: string,
  pattern: RegExp,
): string | null {
  const log = git(['log', '-g', '--date=iso-strict', '--format=%gd|%gs', ref])
  if (!log) return null
  for (const line of log.split('\n')) {
    const [selector, subject] = line.split('|')
    if (subject && pattern.test(subject)) {
      return selector?.match(/@\{(.+)\}/)?.[1] ?? null
    }
  }
  return null
}
