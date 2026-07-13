import { describe, expect, it } from 'vitest'
import { parseDoc, stampFrontmatterKey } from '../src/core/frontmatter'

describe('stampFrontmatterKey — no-reflow source stamping', () => {
  it('inserts the key and preserves every other byte (blank lines, long scalars)', () => {
    const raw = [
      '---',
      'layout: home',
      '',
      'details: Personal access tokens sent as Authorization Bearer. Works with every HTTP client, Postman, and MCP client out of the box.',
      '---',
      '',
      '# Body',
      '',
    ].join('\n')
    const out = stampFrontmatterKey(raw, 'loredex', 'routed')
    // the ONLY change is the added line — no reflow, no dropped blank line
    expect(out).toBe(raw.replace('---\n\n# Body', 'loredex: routed\n---\n\n# Body'))
    expect(out).toContain('\nloredex: routed\n---')
    expect(out).toContain('layout: home\n\ndetails: Personal') // blank line intact
    expect(parseDoc(out).meta.loredex).toBe('routed')
  })

  it('updates the value in place when the key already exists (re-route)', () => {
    const raw = '---\ntitle: X\nloredex: pending\n---\nbody\n'
    const out = stampFrontmatterKey(raw, 'loredex', 'routed')
    expect(out).toBe('---\ntitle: X\nloredex: routed\n---\nbody\n')
  })

  it('prepends a minimal block when the file has no frontmatter', () => {
    const out = stampFrontmatterKey('# just a heading\n', 'loredex', 'routed')
    expect(out).toBe('---\nloredex: routed\n---\n\n# just a heading\n')
    expect(parseDoc(out).meta.loredex).toBe('routed')
  })

  it('preserves CRLF line endings', () => {
    const raw = '---\r\ntitle: X\r\n---\r\nbody\r\n'
    const out = stampFrontmatterKey(raw, 'loredex', 'routed')
    expect(out).toBe('---\r\ntitle: X\r\nloredex: routed\r\n---\r\nbody\r\n')
  })
})
