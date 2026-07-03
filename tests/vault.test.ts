import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { slugify, targetDir, targetName, uniquePath } from '../src/core/vault'

describe('vault', () => {
  it('slugifies text', () => {
    expect(slugify('Gap Analysis (v2)!')).toBe('gap-analysis-v2')
    expect(slugify('---')).toBe('untitled')
  })

  it('computes target dir for project and research notes', () => {
    expect(targetDir('/v', { project: 'My App', topic: 'Gap Analysis' })).toBe(
      join('/v', 'projects', 'my-app', 'gap-analysis'),
    )
    expect(targetDir('/v', { topic: 'llm-tools' })).toBe(join('/v', 'research', 'llm-tools'))
  })

  it('does not double date prefixes in filenames', () => {
    expect(targetName({ date: '2026-07-03' }, '2026-07-03-findings.md')).toBe(
      '2026-07-03-findings.md',
    )
    expect(targetName({ date: '2026-07-03' }, 'GAP-ANALYSIS.md')).toBe('2026-07-03-gap-analysis.md')
  })

  it('suffixes colliding paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loredex-'))
    writeFileSync(join(dir, 'note.md'), 'x')
    expect(basename(uniquePath(dir, 'note.md'))).toBe('note-2.md')
  })
})
