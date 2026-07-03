import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  applyCuration,
  briefFileName,
  type CurationPlan,
  collectNotes,
  filterNotes,
  sanitizeNotes,
} from '../src/core/curate'
import { parseDoc } from '../src/core/frontmatter'
import { rebuildIndexes } from '../src/core/indexer'

const PLAN: CurationPlan = {
  objective: 'ship the flat agent',
  brief: 'This project is about the flat agent.\n\nCurrent state: research done.',
  reading_order: ['2026-07-02-handoff', '2026-07-01-core'],
  next_actions: ['draft the spec', 'review gaps'],
  stale: [{ note: '2026-04-01-old-plan', superseded_by: '2026-07-02-handoff', reason: 'outdated' }],
  duplicates: [
    { canonical: '2026-07-01-core', redundant: ['2026-04-01-old-plan'], reason: 'same ground' },
  ],
  clusters: [{ theme: 'core', notes: ['2026-07-01-core', '2026-07-02-handoff'] }],
}

describe('curate', () => {
  const vault = mkdtempSync(join(tmpdir(), 'loredex-curate-'))
  const proj = join(vault, 'projects', 'demo')

  const note = (topic: string, name: string, date: string, body: string) => {
    mkdirSync(join(proj, topic), { recursive: true })
    writeFileSync(
      join(proj, topic, `${name}.md`),
      `---\nproject: demo\ntopic: ${topic}\ndate: "${date}"\nloredex: routed\n---\n${body}\n`,
    )
  }

  beforeAll(() => {
    note('planning', '2026-04-01-old-plan', '2026-04-01', '# Old plan\nsee [[agent.py]]')
    note('core', '2026-07-01-core', '2026-07-01', '# Core\nreal content')
    note('core', '2026-07-02-handoff', '2026-07-02', '# Handoff\nnext steps')
  })

  it('collects and filters notes by topic and date', () => {
    const all = collectNotes(vault, 'demo')
    expect(all.length).toBe(3)
    expect(filterNotes(all, { topics: ['core'] }).length).toBe(2)
    expect(filterNotes(all, { since: '2026-07-02' }).map((n) => n.name)).toEqual([
      '2026-07-02-handoff',
    ])
  })

  it('sanitizes ghost links only when writing', () => {
    const all = collectNotes(vault, 'demo')
    expect(sanitizeNotes(all, false)).toBe(1) // dry-run counts
    expect(readFileSync(join(proj, 'planning', '2026-04-01-old-plan.md'), 'utf8')).toContain(
      '[[agent.py]]',
    )
    expect(sanitizeNotes(all, true)).toBe(1)
    expect(readFileSync(join(proj, 'planning', '2026-04-01-old-plan.md'), 'utf8')).toContain(
      '`agent.py`',
    )
  })

  it('names briefs by scope', () => {
    expect(briefFileName('demo', false)).toBe('_START-HERE-demo.md')
    expect(briefFileName('demo', true, 'Draft THE spec!')).toBe(
      '_START-HERE-demo--draft-the-spec.md',
    )
  })

  it('applies a curation plan non-destructively', () => {
    const notes = collectNotes(vault, 'demo')
    const result = applyCuration(vault, 'demo', PLAN, notes, { scoped: false })

    const brief = readFileSync(result.briefPath, 'utf8')
    expect(brief).toContain('**Objective:** ship the flat agent')
    expect(brief).toContain('1. [[2026-07-02-handoff]]')
    expect(brief).toContain('## Next actions')

    const stale = parseDoc(
      readFileSync(join(proj, 'planning', '2026-04-01-old-plan.md'), 'utf8'),
    ).meta
    // stale stamp first, duplicate stamp overrides to superseded — both point at successors
    expect(['stale', 'superseded']).toContain(stale.status)
    expect(stale.superseded_by).toBeDefined()

    const core = readFileSync(join(proj, 'core', '2026-07-01-core.md'), 'utf8')
    expect(core).toContain('## Related')
    expect(core).toContain('[[2026-07-02-handoff]]')
    expect(result.relinked).toBe(2)
  })

  it('ignores plan entries referencing unknown notes', () => {
    const notes = collectNotes(vault, 'demo')
    const bogus: CurationPlan = {
      ...PLAN,
      reading_order: ['nonexistent-note'],
      stale: [{ note: 'ghost', reason: 'x' }],
      clusters: [{ theme: 'x', notes: ['ghost', 'phantom'] }],
    }
    const result = applyCuration(vault, 'demo', bogus, notes, { scoped: true, objective: 'test' })
    expect(readFileSync(result.briefPath, 'utf8')).not.toContain('nonexistent-note')
    expect(result.staleStamped).toBe(0)
    expect(result.relinked).toBe(0)
  })

  it('indexer links briefs and marks stale notes', () => {
    rebuildIndexes(vault)
    const moc = readFileSync(join(vault, '_index', 'demo.md'), 'utf8')
    expect(moc).toContain('## Start here')
    expect(moc).toContain('[[_START-HERE-demo]]')
    expect(moc).toMatch(/\[\[2026-04-01-old-plan\]\] _\(stale\)_/)
    expect(moc).not.toMatch(/\[\[2026-07-01-core\]\] _\(stale\)_/)
  })
})
