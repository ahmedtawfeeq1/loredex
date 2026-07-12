import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rebuildIndexes } from '../src/core/indexer'
import { setProduct } from '../src/core/products'

function note(vault: string, project: string, topic: string, name: string): void {
  const dir = join(vault, 'projects', project, topic)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${name}.md`),
    `---\nproject: ${project}\ntopic: ${topic}\ntype: note\ndate: '${name.slice(0, 10)}'\nsource: manual\ntags: []\n---\n\nbody\n`,
  )
}

describe('indexer', () => {
  it('orders MOC topics by latest note, newest first, with the date in the heading', () => {
    const vault = mkdtempSync(join(tmpdir(), 'loredex-idx-'))
    note(vault, 'app', 'alpha-old-topic', '2026-06-01-first')
    note(vault, 'app', 'zeta-mid-topic', '2026-06-20-second')
    note(vault, 'app', 'fresh-topic', '2026-07-07-third')
    note(vault, 'app', 'fresh-topic', '2026-06-05-earlier')
    rebuildIndexes(vault)

    const moc = readFileSync(join(vault, '_index', 'app.md'), 'utf8')
    const headings = moc.split('\n').filter((line) => line.startsWith('## '))
    expect(headings).toEqual([
      '## fresh-topic — 2026-07-07',
      '## zeta-mid-topic — 2026-06-20',
      '## alpha-old-topic — 2026-06-01',
    ])
    // notes inside a topic stay newest-first
    expect(moc.indexOf('2026-07-07-third')).toBeLessThan(moc.indexOf('2026-06-05-earlier'))
  })
})

describe('bases', () => {
  it('writes Dashboard.base with the core views', () => {
    const vault = mkdtempSync(join(tmpdir(), 'loredex-base-'))
    note(vault, 'app', 'topic-a', '2026-07-01-note')
    rebuildIndexes(vault)
    const base = readFileSync(join(vault, '_index', 'Dashboard.base'), 'utf8')
    for (const needle of ['Latest notes', 'Open handoffs', 'By project', 'Stale or superseded'])
      expect(base).toContain(needle)
    expect(readFileSync(join(vault, '_index', 'Home.md'), 'utf8')).toContain('Dashboard.base')
  })
})

describe('indexer product grouping', () => {
  it('groups Home under product headings when a manifest exists', () => {
    const vault = mkdtempSync(join(tmpdir(), 'loredex-idx-prod-'))
    note(vault, 'genudo-ai-engine', 'auth', '2026-07-01-a')
    note(vault, 'loredex-desktop', 'ui', '2026-07-02-b')
    setProduct(vault, 'genudo-ai-engine', 'genudo')
    setProduct(vault, 'loredex-desktop', 'loredex')
    rebuildIndexes(vault)

    const home = readFileSync(join(vault, '_index', 'Home.md'), 'utf8')
    expect(home).toContain('## genudo')
    expect(home).toContain('## loredex')
    // product heading precedes its project
    expect(home.indexOf('## genudo')).toBeLessThan(home.indexOf('[[genudo-ai-engine]]'))
  })

  it('stays flat (no headings) when no products are defined', () => {
    const vault = mkdtempSync(join(tmpdir(), 'loredex-idx-flat-'))
    note(vault, 'solo', 'x', '2026-07-01-a')
    rebuildIndexes(vault)
    const home = readFileSync(join(vault, '_index', 'Home.md'), 'utf8')
    expect(home).toContain('[[solo]]')
    expect(home).not.toContain('## Ungrouped')
  })
})
