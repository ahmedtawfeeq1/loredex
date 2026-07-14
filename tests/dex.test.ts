import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isAgentOps, loadDexType, saveDexType } from '../src/core/dex'
import { scaffoldVault } from '../src/core/vault'

function dex(): string {
  return mkdtempSync(join(tmpdir(), 'loredex-dex-'))
}

describe('dex type manifest', () => {
  it('absent manifest → research (every existing dex keeps working)', () => {
    expect(loadDexType(dex())).toBe('research')
  })

  it('garbage JSON → research, never throws', () => {
    const v = dex()
    mkdirSync(join(v, '_index'), { recursive: true })
    writeFileSync(join(v, '_index', 'dex.json'), 'not json {{{')
    expect(loadDexType(v)).toBe('research')
  })

  it('unknown type string → research', () => {
    const v = dex()
    mkdirSync(join(v, '_index'), { recursive: true })
    writeFileSync(join(v, '_index', 'dex.json'), JSON.stringify({ type: 'spaceship' }))
    expect(loadDexType(v)).toBe('research')
  })

  it('save/load round-trip', () => {
    const v = dex()
    saveDexType(v, 'agent-ops')
    expect(loadDexType(v)).toBe('agent-ops')
    expect(isAgentOps(v)).toBe(true)
    expect(JSON.parse(readFileSync(join(v, '_index', 'dex.json'), 'utf8'))).toEqual({
      type: 'agent-ops',
    })
  })

  it('scaffoldVault(agent-ops) writes dex.json + clients.json; default writes neither', () => {
    const ops = dex()
    scaffoldVault(ops, 'agent-ops')
    expect(loadDexType(ops)).toBe('agent-ops')
    expect(existsSync(join(ops, '_index', 'clients.json'))).toBe(true)

    const research = dex()
    scaffoldVault(research)
    expect(existsSync(join(research, '_index', 'dex.json'))).toBe(false)
    expect(existsSync(join(research, '_index', 'clients.json'))).toBe(false)
  })
})
