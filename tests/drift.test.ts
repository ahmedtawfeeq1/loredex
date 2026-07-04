import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { findDrifted, lastCommitDate } from '../src/core/drift'

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}

describe('drift', () => {
  const repo = mkdtempSync(join(tmpdir(), 'loredex-drift-'))
  const srcPath = join(repo, 'src', 'agent.ts')

  beforeAll(() => {
    mkdirSync(join(repo, 'src'), { recursive: true })
    git(repo, 'init', '-q')
    git(repo, 'config', 'user.email', 'a@b.c')
    git(repo, 'config', 'user.name', 'test')
    writeFileSync(srcPath, 'v1')
    git(repo, 'add', '-A')
    // deterministic, backdated commit — avoids relying on the sandbox clock
    execFileSync('git', ['commit', '-q', '-m', 'v1', '--date=2020-01-01T00:00:00'], {
      cwd: repo,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2020-01-01T00:00:00',
        GIT_COMMITTER_DATE: '2020-01-01T00:00:00',
      },
    })
  })

  it('lastCommitDate reads the last commit touching a path', () => {
    expect(lastCommitDate(srcPath)).toBe('2020-01-01')
  })

  it('returns null outside a git repo', () => {
    expect(lastCommitDate(join(tmpdir(), 'not-a-repo-file.ts'))).toBeNull()
  })

  it('flags a note whose source changed after it was filed', () => {
    const drifted = findDrifted([
      { name: 'old-note', meta: { source_path: srcPath, date: '2019-01-01' } },
    ])
    expect(drifted).toEqual([
      { note: 'old-note', reason: 'source changed 2020-01-01, filed 2019-01-01' },
    ])
  })

  it('does not flag a note filed after the last source change', () => {
    const drifted = findDrifted([
      { name: 'fresh-note', meta: { source_path: srcPath, date: '2021-01-01' } },
    ])
    expect(drifted).toEqual([])
  })

  it('skips notes without a source_path, date, or already stale/superseded', () => {
    expect(findDrifted([{ name: 'a', meta: { date: '2019-01-01' } }])).toEqual([])
    expect(findDrifted([{ name: 'b', meta: { source_path: srcPath } }])).toEqual([])
    expect(
      findDrifted([
        { name: 'c', meta: { source_path: srcPath, date: '2019-01-01', status: 'stale' } },
      ]),
    ).toEqual([])
  })
})
