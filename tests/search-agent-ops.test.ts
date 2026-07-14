import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scaffoldClient } from '../src/core/agent-ops-scaffold'
import { operationalDataDigest } from '../src/core/curate'
import { searchVault } from '../src/core/search'
import { scaffoldVault } from '../src/core/vault'

function opsDex(): { v: string; slug: string } {
  const v = mkdtempSync(join(tmpdir(), 'loredex-dsearch-'))
  scaffoldVault(v, 'agent-ops')
  const { slug } = scaffoldClient(v, 'brightsmile_dental')
  writeFileSync(
    join(v, 'projects', slug, 'knowledge_tables', 'patients.csv'),
    'patient_name,phone,last_visit\nlina,123,2026-01-02\n',
  )
  writeFileSync(
    join(v, 'projects', slug, 'automation_workflows', 'booking-flow.json'),
    '{"name": "booking", "webhook_url": "x"}',
  )
  writeFileSync(join(v, 'projects', slug, '_randoms', 'pasted.yaml'), 'special_offer: teeth\n')
  return { v, slug }
}

describe('agent-ops data search', () => {
  it('finds csv by header, json by filename/key, yaml in _randoms', () => {
    const { v, slug } = opsDex()
    const byHeader = searchVault(v, 'patient_name')
    expect(byHeader.some((h) => h.kind === 'data' && h.name === 'patients.csv')).toBe(true)
    const hit = byHeader.find((h) => h.name === 'patients.csv')
    expect(hit?.fileType).toBe('csv')
    expect(hit?.project).toBe(slug)
    expect(hit?.topic).toBe('knowledge_tables')
    expect(hit?.excerpt).toContain('1 rows')

    expect(searchVault(v, 'booking').some((h) => h.name === 'booking-flow.json')).toBe(true)
    expect(searchVault(v, 'webhook_url').some((h) => h.name === 'booking-flow.json')).toBe(true)
    expect(searchVault(v, 'special_offer').some((h) => h.name === 'pasted.yaml')).toBe(true)
  })

  it('filename match scores above single key match', () => {
    const { v } = opsDex()
    const hits = searchVault(v, 'booking')
    const flow = hits.find((h) => h.name === 'booking-flow.json')
    expect(flow).toBeDefined()
    expect(flow?.score).toBeGreaterThanOrEqual(3)
  })

  it('research dexes never get data hits (byte-identical path)', () => {
    const v = mkdtempSync(join(tmpdir(), 'loredex-rsearch-'))
    scaffoldVault(v)
    mkdirSync(join(v, 'projects', 'proj', 'topic'), { recursive: true })
    writeFileSync(join(v, 'projects', 'proj', 'data.csv'), 'patient_name\nx\n')
    writeFileSync(
      join(v, 'projects', 'proj', 'topic', '2026-01-01-note.md'),
      '---\nproject: proj\ntopic: topic\n---\n\npatient_name mentioned\n',
    )
    const hits = searchVault(v, 'patient_name')
    expect(hits.every((h) => h.kind !== 'data')).toBe(true)
    expect(hits.some((h) => h.name === '2026-01-01-note')).toBe(true)
  })

  it('operationalDataDigest inventories the client; empty on research dexes', () => {
    const { v, slug } = opsDex()
    const digest = operationalDataDigest(v, slug)
    expect(digest).toContain('## Operational data')
    expect(digest).toContain('table patients.csv (patient_name, phone, last_visit · 1 rows)')
    expect(digest).toContain('workflows: booking-flow.json')
    expect(digest).toContain('workspace.yml present')

    const research = mkdtempSync(join(tmpdir(), 'loredex-rdigest-'))
    scaffoldVault(research)
    expect(operationalDataDigest(research, 'anything')).toBe('')
  })
})
