import { describe, expect, it } from 'vitest'
import {
  isRoutable,
  isRouted,
  normalizeType,
  parseDoc,
  serializeDoc,
} from '../src/core/frontmatter'

describe('frontmatter', () => {
  it('round-trips meta and body', () => {
    const doc = { meta: { project: 'my-app', topic: 'gap-analysis' }, body: '# Hello\n' }
    const parsed = parseDoc(serializeDoc(doc))
    expect(parsed.meta.project).toBe('my-app')
    expect(parsed.meta.topic).toBe('gap-analysis')
    expect(parsed.body.trim()).toBe('# Hello')
  })

  it('normalizes YAML dates to YYYY-MM-DD strings', () => {
    const parsed = parseDoc('---\ndate: 2026-07-03\n---\nbody\n')
    expect(parsed.meta.date).toBe('2026-07-03')
  })

  it('isRoutable requires project and topic', () => {
    expect(isRoutable({ project: 'a', topic: 'b' })).toBe(true)
    expect(isRoutable({ project: 'a' })).toBe(false)
    expect(isRoutable({})).toBe(false)
  })

  it('isRouted detects the marker', () => {
    expect(isRouted({ loredex: 'routed' })).toBe(true)
    expect(isRouted({})).toBe(false)
  })

  it('normalizeType falls back to note', () => {
    expect(normalizeType('analysis')).toBe('analysis')
    expect(normalizeType('banana')).toBe('note')
    expect(normalizeType(undefined)).toBe('note')
  })
})
