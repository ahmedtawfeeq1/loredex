import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseDoc } from '../src/core/frontmatter'
import { walkMarkdown } from '../src/core/scan'
import { sanitizeForContext, searchVault } from '../src/core/search'
import { storeNote } from '../src/core/store'

describe('searchVault', () => {
  const vault = mkdtempSync(join(tmpdir(), 'loredex-search-'))

  const note = (project: string, topic: string, name: string, body: string, extra = '') => {
    mkdirSync(join(vault, 'projects', project, topic), { recursive: true })
    writeFileSync(
      join(vault, 'projects', project, topic, `${name}.md`),
      `---\nproject: ${project}\ntopic: ${topic}\ndate: "2026-07-01"\n${extra}loredex: routed\n---\n${body}\n`,
    )
  }

  beforeAll(() => {
    note('engine', 'endpoints', 'payload-contract', '# Contract\nsession tokens and payload rules')
    note(
      'engine',
      'endpoints',
      'old-payload-note',
      '# Old\npayload payload payload',
      'status: stale\n',
    )
    note('backend', 'api', 'crud-notes', '# CRUD\nimplementation of payload validation')
    // a handoff mentioning payload — should outrank raw notes
    mkdirSync(join(vault, 'projects', 'backend', 'handoffs'), { recursive: true })
    writeFileSync(
      join(vault, 'projects', 'backend', 'handoffs', 'handoff-engine.md'),
      '---\nproject: backend\ntopic: handoffs\ntype: handoff\ndate: "2026-07-02"\nfrom_project: engine\nto_project: backend\nstatus: open\nloredex: routed\n---\n# Handoff\npayload semantics for the corrections API\n',
    )
  })

  it('boosts handoffs over equal-relevance notes and sinks stale ones', () => {
    const hits = searchVault(vault, 'payload')
    expect(hits.length).toBeGreaterThanOrEqual(4)
    // name match is the strongest signal — the note literally named payload-* wins
    expect(hits[0]?.name).toBe('payload-contract')
    // handoff and crud-notes both mention 'payload' once in the body; the handoff's
    // kind boost puts it ahead
    const handoffHit = hits.find((hit) => hit.kind === 'handoff')
    const crudHit = hits.find((hit) => hit.name === 'crud-notes')
    expect((handoffHit?.score ?? 0) > (crudHit?.score ?? 0)).toBe(true)
    // stale sinks below the fresh note despite repeating the term three times
    const staleHit = hits.find((hit) => hit.name === 'old-payload-note')
    expect((hits[0]?.score ?? 0) > (staleHit?.score ?? 0)).toBe(true)
    expect(staleHit?.status).toBe('stale')
  })

  it('filters by project', () => {
    const hits = searchVault(vault, 'payload', { project: 'engine' })
    expect(hits.every((hit) => hit.project === 'engine')).toBe(true)
  })

  it('returns empty for no-signal queries', () => {
    expect(searchVault(vault, 'zzznothing')).toEqual([])
    expect(searchVault(vault, 'a')).toEqual([]) // single-char terms dropped
  })

  it('sanitizeForContext strips control chars and bounds length', () => {
    expect(sanitizeForContext(`a\nb\u001b[31mc${'x'.repeat(500)}`, 50).length).toBeLessThanOrEqual(
      50,
    )
    expect(sanitizeForContext('a\nb\u001b[31mc', 100)).toBe('a b[31mc')
  })
})

describe('storeNote', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'loredex-store-'))
  const vault = join(sandbox, 'vault')

  it('routes a complete note deterministically into projects/<p>/<topic>/', () => {
    mkdirSync(join(vault, '_inbox'), { recursive: true })
    const config = { vaultPath: vault, sync: 'none' as const, projects: {} }
    const dest = storeNote(config, {
      project: 'backend',
      topic: 'API Design',
      title: 'Rate limit decision',
      content: 'We chose sliding window.',
    })
    expect(dest).toContain(join('projects', 'backend', 'api-design'))
    const doc = parseDoc(readFileSync(dest, 'utf8'))
    expect(doc.meta.loredex).toBe('routed')
    expect(doc.meta.source).toBe('mcp')
    expect(doc.body).toContain('sliding window')
    // inbox is empty again — the draft moved, not copied
    expect(walkMarkdown(join(vault, '_inbox'))).toEqual([])
  })
})
