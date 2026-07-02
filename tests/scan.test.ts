import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findCandidates } from '../src/core/scan'

describe('scan', () => {
  it('finds research-shaped markdown, skips noise', () => {
    const root = mkdtempSync(join(tmpdir(), 'loredex-'))
    mkdirSync(join(root, 'docs'), { recursive: true })
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
    mkdirSync(join(root, 'src'), { recursive: true })

    writeFileSync(join(root, 'docs', 'overview.md'), '# overview\n') // signal dir
    writeFileSync(join(root, 'src', 'GAP-ANALYSIS.md'), '# gap\n') // signal name
    writeFileSync(join(root, 'src', 'labeled.md'), '---\nproject: x\n---\nbody\n') // frontmatter
    writeFileSync(join(root, 'README.md'), '# readme\n') // skip file
    writeFileSync(join(root, 'node_modules', 'pkg', 'NOTES.md'), 'dep\n') // skip dir
    writeFileSync(join(root, 'src', 'plain.md'), 'no signals\n') // no signal
    writeFileSync(join(root, 'src', 'done-notes.md'), '---\nloredex: routed\n---\nx\n') // routed

    const found = findCandidates(root).map((c) => c.path.slice(root.length + 1))
    expect(found).toContain('docs/overview.md')
    expect(found).toContain('src/GAP-ANALYSIS.md')
    expect(found).toContain('src/labeled.md')
    expect(found).not.toContain('README.md')
    expect(found).not.toContain('node_modules/pkg/NOTES.md')
    expect(found).not.toContain('src/plain.md')
    expect(found).not.toContain('src/done-notes.md')
  })
})
