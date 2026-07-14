import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addClientTag,
  clientTags,
  loadClients,
  removeClientTag,
  setClientTags,
} from '../src/core/clients'

function dex(): string {
  const v = mkdtempSync(join(tmpdir(), 'loredex-clients-'))
  mkdirSync(join(v, '_index'), { recursive: true })
  return v
}

describe('clients manifest', () => {
  it('round-trips tags with deterministic sorted output', () => {
    const v = dex()
    expect(loadClients(v)).toEqual({})
    setClientTags(v, 'brightsmile_dental', ['new-platform', 'dental', 'dental'])
    const map = loadClients(v)
    expect(clientTags(map, 'brightsmile_dental')).toEqual(['dental', 'new-platform']) // deduped + sorted
    expect(clientTags(map, 'unknown')).toEqual([])
    expect(JSON.parse(readFileSync(join(v, '_index', 'clients.json'), 'utf8'))).toEqual({
      clients: { brightsmile_dental: { tags: ['dental', 'new-platform'] } },
    })
  })

  it('tagless clients are kept — no tags is a valid state', () => {
    const v = dex()
    setClientTags(v, 'peak_fitness', [])
    expect(loadClients(v)).toEqual({ peak_fitness: { tags: [] } })
  })

  it('add/remove single tags', () => {
    const v = dex()
    addClientTag(v, 'lakeside_realty', 'realestate')
    addClientTag(v, 'lakeside_realty', 'old-platform')
    removeClientTag(v, 'lakeside_realty', 'old-platform')
    expect(clientTags(loadClients(v), 'lakeside_realty')).toEqual(['realestate'])
  })

  it('tolerates a hand-written flat manifest and garbage entries', () => {
    const v = dex()
    writeFileSync(
      join(v, '_index', 'clients.json'),
      JSON.stringify({ a: { tags: ['x', 42] }, b: 'nope', c: { tags: 'not-array' } }),
    )
    expect(loadClients(v)).toEqual({ a: { tags: ['x'] }, c: { tags: [] } })
  })

  it('broken JSON → {} and never throws', () => {
    const v = dex()
    writeFileSync(join(v, '_index', 'clients.json'), '{{{')
    expect(loadClients(v)).toEqual({})
  })
})
