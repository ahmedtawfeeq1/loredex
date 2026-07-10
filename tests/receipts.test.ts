import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Config } from '../src/core/config'
import { parseDoc } from '../src/core/frontmatter'
import { listReceipts, loadReceipt, RouteUndoError } from '../src/core/receipts'
import { executePlan, hashBody, type PlanItem, undoRoute } from '../src/core/router'
import { matchNeverRoute, RouteScopeError } from '../src/core/scope'

function gitVault(): { sandbox: string; vault: string } {
  const sandbox = mkdtempSync(join(tmpdir(), 'loredex-receipts-'))
  const vault = join(sandbox, 'vault')
  mkdirSync(join(vault, 'projects', 'p', 't'), { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: vault })
  execFileSync('git', ['config', 'user.email', 'a@b.c'], { cwd: vault })
  execFileSync('git', ['config', 'user.name', 'Tester'], { cwd: vault })
  writeFileSync(join(vault, '.gitkeep'), '')
  execFileSync('git', ['add', '-A'], { cwd: vault })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: vault })
  return { sandbox, vault }
}

function copyItem(source: string, vault: string): PlanItem {
  return {
    source,
    raw: readFileSync(source, 'utf8'),
    meta: { project: 'p', topic: 't', type: 'finding', date: '2026-07-10' },
    mode: 'copy',
    destDir: join(vault, 'projects', 'p', 't'),
    destName: 'note.md',
  }
}

const gitConfig = (vault: string): Config => ({ vaultPath: vault, sync: 'git', projects: {} })

function gitStatusClean(vault: string): boolean {
  return (
    execFileSync('git', ['status', '--porcelain'], { cwd: vault, encoding: 'utf8' }).trim() === ''
  )
}

describe('route receipts + undo (PR-3)', () => {
  it('persists a receipt on route and undo restores byte-identical vault (copy)', () => {
    const { sandbox, vault } = gitVault()
    const source = join(sandbox, 'note.md')
    writeFileSync(source, '---\nproject: p\ntopic: t\n---\n# Finding\n\nBody.\n')
    const before = readFileSync(source, 'utf8')

    const { written, receiptId } = executePlan([copyItem(source, vault)], vault, gitConfig(vault))
    expect(receiptId).toBeDefined()
    expect(written).toHaveLength(1)
    expect(existsSync(written[0] as string)).toBe(true)
    // the routed copy landed AND the route committed cleanly (receipt rode the commit)
    expect(gitStatusClean(vault)).toBe(true)

    const receipt = loadReceipt(vault, receiptId as string)
    expect(receipt?.written).toEqual(written)
    expect(receipt?.mode).toBe('copy')

    const undo = undoRoute(vault, gitConfig(vault), receiptId as string)
    expect(undo.removed).toEqual(written)
    // vault copy gone, source restored to its exact pre-route bytes, tree clean
    expect(existsSync(written[0] as string)).toBe(false)
    expect(readFileSync(source, 'utf8')).toBe(before)
    expect(gitStatusClean(vault)).toBe(true)
  })

  it('undo of a move recreates the deleted source', () => {
    const { sandbox, vault } = gitVault()
    const source = join(sandbox, 'inbox.md')
    writeFileSync(source, '---\nproject: p\ntopic: t\n---\n# Moved\n')
    const before = readFileSync(source, 'utf8')
    const item = { ...copyItem(source, vault), mode: 'move' as const }

    const { receiptId } = executePlan([item], vault, gitConfig(vault))
    expect(existsSync(source)).toBe(false) // move deletes the source

    undoRoute(vault, gitConfig(vault), receiptId as string)
    expect(existsSync(source)).toBe(true)
    expect(readFileSync(source, 'utf8')).toBe(before)
  })

  it('double-undo throws ALREADY_UNDONE', () => {
    const { sandbox, vault } = gitVault()
    const source = join(sandbox, 'note.md')
    writeFileSync(source, '---\nproject: p\ntopic: t\n---\n# X\n')
    const { receiptId } = executePlan([copyItem(source, vault)], vault, gitConfig(vault))
    undoRoute(vault, gitConfig(vault), receiptId as string)
    expect(() => undoRoute(vault, gitConfig(vault), receiptId as string)).toThrowError(
      RouteUndoError,
    )
    try {
      undoRoute(vault, gitConfig(vault), receiptId as string)
    } catch (e) {
      expect((e as RouteUndoError).code).toBe('ALREADY_UNDONE')
    }
  })

  it('undo of an unknown receipt throws RECEIPT_NOT_FOUND', () => {
    const { vault } = gitVault()
    try {
      undoRoute(vault, gitConfig(vault), 'nope')
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as RouteUndoError).code).toBe('RECEIPT_NOT_FOUND')
    }
  })

  it('receipt contentHash equals the note source_hash (dedup key)', () => {
    const { sandbox, vault } = gitVault()
    const source = join(sandbox, 'note.md')
    const body = '---\nproject: p\ntopic: t\n---\n# Dup\n\nSame body.\n'
    writeFileSync(source, body)
    const { written, receiptId } = executePlan([copyItem(source, vault)], vault, gitConfig(vault))
    const note = parseDoc(readFileSync(written[0] as string, 'utf8'))
    const receipt = loadReceipt(vault, receiptId as string)
    expect(receipt?.contentHash).toBe(note.meta.source_hash)
    expect(receipt?.contentHash).toBe(hashBody(parseDoc(body).body))
    expect(listReceipts(vault)).toHaveLength(1)
  })
})

describe('filing-scope never-route globs (PR-3)', () => {
  it('executePlan refuses a source matching a never-route glob', () => {
    const { sandbox, vault } = gitVault()
    const source = join(sandbox, 'FINDINGS.md')
    writeFileSync(source, '---\nproject: p\ntopic: t\n---\n# Internal\n')
    const config: Config = { ...gitConfig(vault), neverRoute: ['FINDINGS.md'] }
    expect(() => executePlan([copyItem(source, vault)], vault, config)).toThrowError(
      RouteScopeError,
    )
    // nothing was written, no receipt persisted
    expect(listReceipts(vault)).toHaveLength(0)
  })

  it('matchNeverRoute matches basename, deep globs, and extensions', () => {
    expect(matchNeverRoute(['FINDINGS.md'], '/a/b/FINDINGS.md')).toBe('FINDINGS.md')
    expect(matchNeverRoute(['**/scratch/**'], '/a/scratch/x.md')).toBe('**/scratch/**')
    expect(matchNeverRoute(['*.internal.md'], '/a/b/notes.internal.md')).toBe('*.internal.md')
    expect(matchNeverRoute(['**/drafts/*'], '/repo/drafts/x.md')).toBe('**/drafts/*')
    expect(matchNeverRoute(['FINDINGS.md'], '/a/b/report.md')).toBeNull()
    expect(matchNeverRoute([], '/a/b/x.md')).toBeNull()
  })
})
