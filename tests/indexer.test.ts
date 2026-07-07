import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rebuildIndexes } from '../src/core/indexer'

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
