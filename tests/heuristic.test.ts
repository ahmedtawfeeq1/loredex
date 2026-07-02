import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifyHeuristic } from '../src/llm/heuristic'

function makeFile(root: string, rel: string): string {
  const path = join(root, rel)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, '# x\n')
  return path
}

describe('heuristic classifier', () => {
  const root = mkdtempSync(join(tmpdir(), 'loredex-'))

  it('takes topic from the deepest non-generic directory', () => {
    const path = makeFile(root, 'docs/current-system/01-engine.md')
    const meta = classifyHeuristic(path, root, 'genudo')
    expect(meta.project).toBe('genudo')
    expect(meta.topic).toBe('current-system')
  })

  it('falls back to general for generic-only directories', () => {
    const path = makeFile(root, 'docs/random-notes.md')
    expect(classifyHeuristic(path, root, 'p').topic).toBe('general')
  })

  it('infers type from filename keywords', () => {
    expect(classifyHeuristic(makeFile(root, 'a/GAP-ANALYSIS.md'), root, 'p').type).toBe('analysis')
    expect(classifyHeuristic(makeFile(root, 'a/deep-research.md'), root, 'p').type).toBe('research')
    expect(classifyHeuristic(makeFile(root, 'a/todo.md'), root, 'p').type).toBe('note')
  })

  it('stamps a YYYY-MM-DD date', () => {
    const meta = classifyHeuristic(makeFile(root, 'a/x-notes.md'), root, 'p')
    expect(meta.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
