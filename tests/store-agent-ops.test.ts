import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scaffoldClient } from '../src/core/agent-ops-scaffold'
import type { Config } from '../src/core/config'
import { storeNote } from '../src/core/store'
import { scaffoldVault } from '../src/core/vault'

function config(vaultPath: string): Config {
  return { vaultPath, sync: 'none', projects: {} }
}

describe('vault_store on agent-ops dexes', () => {
  it('agent-stored notes land in the client _randoms/ (searchable, lint-exempt)', () => {
    const v = mkdtempSync(join(tmpdir(), 'loredex-store-'))
    scaffoldVault(v, 'agent-ops')
    const { slug } = scaffoldClient(v, 'brightsmile_dental')
    const dest = storeNote(config(v), {
      project: slug,
      topic: 'pricing',
      title: 'New price list summary',
      content: 'The client sent updated prices.',
    })
    expect(dest).toContain(join('projects', slug, '_randoms'))
    expect(existsSync(dest)).toBe(true)
    const raw = readFileSync(dest, 'utf8')
    expect(raw).toContain('project: brightsmile-dental')
    expect(raw).toContain('# New price list summary')
  })

  it('unknown client on an agent-ops dex falls back to the normal routed path', () => {
    const v = mkdtempSync(join(tmpdir(), 'loredex-store-'))
    scaffoldVault(v, 'agent-ops')
    const dest = storeNote(config(v), {
      project: 'ghost-client',
      topic: 'misc',
      title: 'Stray note',
      content: 'x',
    })
    expect(dest).not.toContain('_randoms')
    expect(existsSync(dest)).toBe(true)
  })

  it('research dex behavior unchanged: routed into projects/<project>/<topic>/', () => {
    const v = mkdtempSync(join(tmpdir(), 'loredex-store-'))
    scaffoldVault(v)
    const dest = storeNote(config(v), {
      project: 'acme-crm',
      topic: 'auth',
      title: 'Token refresh finding',
      content: 'x',
    })
    expect(dest).toContain(join('projects', 'acme-crm', 'auth'))
  })

  it('back-compat tripwire: vault_store type enum keeps its original five values', () => {
    // agents hold cached tool schemas — these values are append-only, never removed
    const source = readFileSync(new URL('../src/mcp/server.ts', import.meta.url), 'utf8')
    for (const value of ['research', 'finding', 'analysis', 'snapshot', 'note']) {
      expect(source).toContain(`'${value}'`)
    }
    expect(source).toMatch(/z\.enum\(\['research', 'finding', 'analysis', 'snapshot', 'note'\]\)/)
  })
})
