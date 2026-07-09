import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { runHandoffs } from '../src/commands/handoff'
import type { Config } from '../src/core/config'
import { consumeHandoff, vaultSchemaStatus } from '../src/core/consume'
import { setLoredexEmitter } from '../src/core/events'
import { LOREDEX_SCHEMA, parseDoc } from '../src/core/frontmatter'
import { listHandoffs } from '../src/core/product'

const IDENTITY = { name: 'Rana', email: 'rana@nimbus.dev' }

function openHandoff(from: string, to: string, name: string): [string, string] {
  return [
    `${name}.md`,
    [
      '---',
      `project: ${to}`,
      'topic: handoffs',
      'type: handoff',
      'date: "2026-07-01"',
      `from_project: ${from}`,
      `to_project: ${to}`,
      'objective: build it',
      'status: open',
      '---',
      '# Handoff',
      '',
    ].join('\n'),
  ]
}

describe('consumeHandoff', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'loredex-consume-'))
  const vault = join(sandbox, 'vault')
  const config: Config = { vaultPath: vault, sync: 'none', projects: {} }
  const dir = join(vault, 'projects', 'backend', 'handoffs')

  beforeAll(() => {
    process.env.LOREDEX_CONFIG_DIR = join(sandbox, 'config')
    mkdirSync(join(sandbox, 'config'), { recursive: true })
    writeFileSync(join(sandbox, 'config', 'config.json'), JSON.stringify(config))
    mkdirSync(dir, { recursive: true })
    for (const handoff of ['handoff-a', 'handoff-b', 'handoff-cli']) {
      const [file, raw] = openHandoff('ai-engine', 'backend', handoff)
      writeFileSync(join(dir, file), raw)
    }
    return () => {
      delete process.env.LOREDEX_CONFIG_DIR
    }
  })

  afterEach(() => setLoredexEmitter(null))

  it('writes who/when + schema stamp into frontmatter and returns the receipt', () => {
    const receipt = consumeHandoff(vault, config, 'handoff-a', IDENTITY)
    const meta = parseDoc(readFileSync(join(dir, 'handoff-a.md'), 'utf8')).meta
    expect(meta.status).toBe('consumed')
    expect(meta.consumed_by).toBe('Rana <rana@nimbus.dev>')
    expect(meta.consumed_at).toBe(receipt.at)
    expect(meta.loredex_schema).toBe(LOREDEX_SCHEMA)

    // receipt carries exactly what changed and whether it pushed
    expect(receipt.handoffId).toBe('handoff-a')
    expect(receipt.path).toBe(join(dir, 'handoff-a.md'))
    expect(receipt.by).toEqual(IDENTITY)
    expect(receipt.before.status).toBe('open')
    expect(receipt.before.consumed_by).toBeUndefined()
    expect(receipt.after).toEqual(meta)
    expect(receipt.pushed).toBe(false) // no remote in the fixture
  })

  it('emits a consume event through the injected emitter', () => {
    const events: unknown[] = []
    setLoredexEmitter({ emit: (kind, payload) => events.push({ kind, payload }) })
    const receipt = consumeHandoff(vault, config, 'handoff-b', IDENTITY, { project: 'backend' })
    expect(events).toContainEqual({
      kind: 'consume',
      payload: {
        handoffId: 'handoff-b',
        path: receipt.path,
        by: IDENTITY,
        at: receipt.at,
      },
    })
  })

  it('throws on an unknown handoff id', () => {
    expect(() => consumeHandoff(vault, config, 'nope', IDENTITY)).toThrow(/no handoff named/)
  })

  it('CLI --consume is the same writer (behavior parity)', () => {
    const logs: string[] = []
    const original = console.log
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '))
    try {
      runHandoffs({ project: 'backend', consume: 'handoff-cli' })
    } finally {
      console.log = original
    }
    expect(logs.join('\n')).toContain('consumed: handoff-cli')
    const meta = parseDoc(readFileSync(join(dir, 'handoff-cli.md'), 'utf8')).meta
    expect(meta.status).toBe('consumed')
    expect(meta.consumed_at).toBeTruthy()
    expect(meta.consumed_by).toBeTruthy()
    expect(meta.loredex_schema).toBe(LOREDEX_SCHEMA)
  })

  it('read paths tolerate pre-versioning notes; schema status reflects the vault', () => {
    // unversioned note in another project — still listed, never rejected
    const legacyDir = join(vault, 'projects', 'frontend', 'handoffs')
    mkdirSync(legacyDir, { recursive: true })
    const [file, raw] = openHandoff('backend', 'frontend', 'legacy')
    writeFileSync(join(legacyDir, file), raw)
    expect(
      listHandoffs(vault, { direction: 'inbox', project: 'frontend' }).map((card) => card.id),
    ).toEqual(['legacy'])

    const status = vaultSchemaStatus(vault)
    expect(status).toEqual({ declared: LOREDEX_SCHEMA, supported: LOREDEX_SCHEMA, ok: true })

    // a vault written by a newer engine → mismatch warning territory
    writeFileSync(
      join(legacyDir, 'future.md'),
      '---\nstatus: open\nfrom_project: x\nloredex_schema: 99\n---\n# future\n',
    )
    const mismatch = vaultSchemaStatus(vault)
    expect(mismatch.declared).toBe(99)
    expect(mismatch.ok).toBe(false)
  })
})
