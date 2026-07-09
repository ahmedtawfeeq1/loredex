import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureGeneratedMergeDriver } from '../src/core/router'
import { syncStatus } from '../src/core/sync-status'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function commit(cwd: string, name: string): void {
  writeFileSync(join(cwd, `${name}.md`), `# ${name}\n`)
  git(cwd, 'add', '-A')
  git(
    cwd,
    '-c',
    'user.email=t@t.dev',
    '-c',
    'user.name=T',
    'commit',
    '-m',
    `loredex: route 1 note(s) [${name}]`,
  )
}

/** bare origin + a clone with one pushed commit */
function fixture(): { origin: string; clone: string } {
  const sandbox = mkdtempSync(join(tmpdir(), 'loredex-syncstatus-'))
  const origin = join(sandbox, 'origin.git')
  mkdirSync(origin)
  git(origin, 'init', '--bare', '--initial-branch=main')
  const clone = join(sandbox, 'clone')
  git(sandbox, 'clone', origin, clone)
  git(clone, 'checkout', '-b', 'main')
  commit(clone, 'base')
  git(clone, 'push', '-u', 'origin', 'main')
  git(clone, 'remote', 'set-head', 'origin', 'main')
  ensureGeneratedMergeDriver(clone)
  return { origin, clone }
}

describe('syncStatus', { timeout: 30_000 }, () => {
  it('clean repo: ok, branch matches, merge driver healthy, push/pull timestamps', () => {
    const { clone } = fixture()
    const health = syncStatus(clone)
    expect(health.state).toBe('ok')
    expect(health.branch).toBe('main')
    expect(health.canonicalBranch).toBe('main')
    expect(health.branchMatches).toBe(true)
    expect(health.remote).toBe('origin')
    expect(health.remoteReachable).toBe(true)
    expect(health.ahead).toBe(0)
    expect(health.behind).toBe(0)
    expect(health.mergeDriverInstalled).toBe(true)
    expect(health.gitattributesValid).toBe(true)
    expect(health.lastPush).toBeTruthy()
    expect(health.warnings).toEqual([])
  })

  it('is strictly read-only: HEAD, status, and remote refs are untouched', () => {
    const { clone } = fixture()
    commit(clone, 'local-only')
    const before = {
      head: git(clone, 'rev-parse', 'HEAD'),
      status: git(clone, 'status', '--porcelain'),
      refs: git(clone, 'for-each-ref'),
    }
    syncStatus(clone)
    expect(git(clone, 'rev-parse', 'HEAD')).toBe(before.head)
    expect(git(clone, 'status', '--porcelain')).toBe(before.status)
    expect(git(clone, 'for-each-ref')).toBe(before.refs)
  })

  it('ahead: local commit not pushed', () => {
    const { clone } = fixture()
    commit(clone, 'ahead-note')
    const health = syncStatus(clone)
    expect(health.state).toBe('ahead')
    expect(health.ahead).toBe(1)
    expect(health.behind).toBe(0)
  })

  it('behind and diverged: measured against the fetched ref, no implicit fetch', () => {
    const { origin, clone } = fixture()
    const sandbox = join(clone, '..')
    const other = join(sandbox, 'other')
    git(sandbox, 'clone', origin, other)
    commit(other, 'teammate-note')
    git(other, 'push')

    // before fetching, the local view is still "ok" — freshness = last fetch (documented)
    expect(syncStatus(clone).state).toBe('ok')

    git(clone, 'fetch')
    const behind = syncStatus(clone)
    expect(behind.state).toBe('behind')
    expect(behind.behind).toBe(1)

    commit(clone, 'my-conflicting-note')
    const diverged = syncStatus(clone)
    expect(diverged.state).toBe('diverged')
    expect(diverged.ahead).toBe(1)
    expect(diverged.behind).toBe(1)
    expect(diverged.warnings.join(' ')).toContain('diverged')
  })

  it('wrong branch: mismatch is a warning', () => {
    const { clone } = fixture()
    git(clone, 'checkout', '-b', 'feature')
    const health = syncStatus(clone)
    expect(health.branch).toBe('feature')
    expect(health.canonicalBranch).toBe('main')
    expect(health.branchMatches).toBe(false)
    expect(health.warnings.join(' ')).toContain('team branch is "main"')
  })

  it('missing remote: local-only warning, reachable false', () => {
    const local = mkdtempSync(join(tmpdir(), 'loredex-syncstatus-local-'))
    git(local, 'init', '--initial-branch=main')
    ensureGeneratedMergeDriver(local)
    const health = syncStatus(local)
    expect(health.remote).toBeNull()
    expect(health.remoteReachable).toBe(false)
    expect(health.warnings.join(' ')).toContain('no git remote')
  })

  it('broken gitattributes pattern is a first-class warning (F8)', () => {
    const { clone } = fixture()
    const attributes = join(git(clone, 'rev-parse', '--absolute-git-dir'), 'info', 'attributes')
    writeFileSync(
      attributes,
      'Start\\ Here\\ -\\ Product.md merge=loredex-generated\n_index/** merge=loredex-generated\n',
    )
    const health = syncStatus(clone)
    expect(health.gitattributesValid).toBe(false)
    expect(health.warnings.join(' ')).toContain('gitattributes pattern is invalid')

    ensureGeneratedMergeDriver(clone) // the repair path
    expect(readFileSync(attributes, 'utf8')).toContain('"Start Here - Product.md"')
    expect(syncStatus(clone).gitattributesValid).toBe(true)
  })

  it('not a repo at all: error state, never a throw', () => {
    const plain = mkdtempSync(join(tmpdir(), 'loredex-syncstatus-norepo-'))
    const health = syncStatus(plain)
    expect(health.state).toBe('error')
    expect(health.warnings.join(' ')).toContain('not a git repository')
  })
})
