import { mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Config } from '../src/core/config'
import { parseDoc } from '../src/core/frontmatter'
import { executePlan, type PlanItem, refreshRoutedCopies } from '../src/core/router'

function sandboxWith(body: string): { source: string; vault: string; item: PlanItem } {
  const sandbox = mkdtempSync(join(tmpdir(), 'loredex-router-'))
  const vault = join(sandbox, 'vault')
  const destDir = join(vault, 'projects', 'p', 't')
  mkdirSync(destDir, { recursive: true })
  const source = join(sandbox, 'note.md')
  writeFileSync(source, body)
  const item: PlanItem = {
    source,
    raw: body,
    meta: { project: 'p', topic: 't', type: 'finding', date: '2026-07-10' },
    mode: 'copy',
    destDir,
    destName: 'note.md',
  }
  return { source, vault, item }
}

const config: Config = { vaultPath: '', sync: 'none', projects: {} }

describe('executePlan source stamping', () => {
  // regression: routing used to rewrite the source from the planning snapshot (item.raw),
  // silently destroying any edits made between planning and execution
  it('never overwrites source changes made after planning', () => {
    const versionA = '---\nproject: p\ntopic: t\n---\n# Version A\n'
    const { source, vault, item } = sandboxWith(versionA)

    const versionB = '---\nproject: p\ntopic: t\n---\n# Version B\n\nNewer content.\n'
    writeFileSync(source, versionB)

    executePlan([item], vault, config)

    const stamped = parseDoc(readFileSync(source, 'utf8'))
    expect(stamped.meta.loredex).toBe('routed')
    expect(stamped.body).toContain('Version B')
    expect(stamped.body).not.toContain('Version A')
  })

  it('adds the routed stamp to an unchanged source without losing its body', () => {
    const body = '---\nproject: p\ntopic: t\n---\n# Stable\n'
    const { source, vault, item } = sandboxWith(body)

    executePlan([item], vault, config)

    const stamped = parseDoc(readFileSync(source, 'utf8'))
    expect(stamped.meta.loredex).toBe('routed')
    expect(stamped.body).toContain('# Stable')
  })

  it('refreshes the stale vault copy when a routed source is edited later', () => {
    const versionA = '---\nproject: p\ntopic: t\n---\n# Version A\n'
    const { source, vault, item } = sandboxWith(versionA)
    const [dest] = executePlan([item], vault, config).written as [string]

    // agent edits the already-routed source under the same name
    const stamped = parseDoc(readFileSync(source, 'utf8'))
    writeFileSync(source, `---\nproject: p\ntopic: t\nloredex: routed\n---\n# Version B\n`)
    expect(stamped.meta.loredex).toBe('routed')

    const sandbox = join(source, '..')
    const refreshed = refreshRoutedCopies(sandbox, vault, config)

    expect(refreshed).toEqual([dest])
    const note = parseDoc(readFileSync(dest, 'utf8'))
    expect(note.body).toContain('Version B')
    expect(note.body).not.toContain('Version A')
    expect(note.meta.source_hash).toBeDefined()

    // second pass: nothing left to refresh
    expect(refreshRoutedCopies(sandbox, vault, config)).toEqual([])
  })

  it('leaves the vault copy alone when the routed source is unchanged', () => {
    const body = '---\nproject: p\ntopic: t\n---\n# Same\n'
    const { source, vault, item } = sandboxWith(body)
    executePlan([item], vault, config)

    expect(refreshRoutedCopies(join(source, '..'), vault, config)).toEqual([])
  })

  it('skips stamping when the source was deleted after planning', () => {
    const body = '---\nproject: p\ntopic: t\n---\n# Gone\n'
    const { source, vault, item } = sandboxWith(body)
    unlinkSync(source)

    const result = executePlan([item], vault, config)

    expect(result.written).toHaveLength(1) // vault copy still written
    expect(() => readFileSync(source, 'utf8')).toThrow() // source not resurrected
  })
})
