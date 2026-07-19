import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanFleet } from '../src/core/agent-ops'
import { scaffoldClient, scaffoldPipeline, scaffoldStage } from '../src/core/agent-ops-scaffold'
import { lintAgentOps } from '../src/core/doctor-agent-ops'
import { listSnapshots, snapshotUnit } from '../src/core/snapshot'
import { scaffoldVault } from '../src/core/vault'

function dexWithPipeline(): { v: string; slug: string } {
  const v = mkdtempSync(join(tmpdir(), 'loredex-snap-'))
  scaffoldVault(v, 'agent-ops')
  const { slug } = scaffoldClient(v, 'brightsmile_dental', { manager: 'sara' })
  scaffoldPipeline(v, slug, 'lead_reactivation')
  scaffoldStage(v, slug, 'lead-reactivation', 'intake')
  scaffoldStage(v, slug, 'lead-reactivation', 'qualify')
  return { v, slug }
}

const STAMP = '2026-07-20_141530'

describe('snapshotUnit', () => {
  it('copies the pipeline unit files + every stage file with a manifest', () => {
    const { v, slug } = dexWithPipeline()
    const r = snapshotUnit(v, slug, 'lead-reactivation', STAMP)
    expect(r.kind).toBe('pipeline')
    expect(r.dir).toBe(`projects/${slug}/_versions/lead-reactivation/${STAMP}`)
    // 4 unit files + 2 stages × 4 files = 12
    expect(r.files).toHaveLength(12)
    expect(r.files).toContain('_persona.md')
    expect(r.files).toContain('stages/01_intake/01_enter_condition.md')
    expect(r.files).toContain('stages/02_qualify/02_followup.md')
    const base = join(v, r.dir)
    for (const f of r.files) expect(existsSync(join(base, f)), f).toBe(true)
    const manifest = JSON.parse(readFileSync(join(base, 'manifest.json'), 'utf8'))
    expect(manifest.unit).toBe('lead-reactivation')
    expect(manifest.kind).toBe('pipeline')
    expect(manifest.files).toHaveLength(12)
  })

  it('slugifies the unit arg (lead_reactivation → lead-reactivation)', () => {
    const { v, slug } = dexWithPipeline()
    const r = snapshotUnit(v, slug, 'lead_reactivation', STAMP)
    expect(r.unit).toBe('lead-reactivation')
    expect(r.files.length).toBeGreaterThan(0)
  })

  it('stores agent-fetched live platform state as platform.json (platform-only unit ok)', () => {
    const { v, slug } = dexWithPipeline()
    const live = {
      pipeline: { id: 60, name: 'Instagram DMs', persona: 'You are …' },
      stages: [],
    }
    const r = snapshotUnit(v, slug, 'pipeline-60', STAMP, { platformData: live, note: 'live' })
    expect(r.files).toContain('platform.json')
    const stored = JSON.parse(readFileSync(join(v, r.dir, 'platform.json'), 'utf8'))
    expect(stored.pipeline.id).toBe(60)
    const manifest = JSON.parse(readFileSync(join(v, r.dir, 'manifest.json'), 'utf8'))
    expect(manifest.note).toBe('live')
  })

  it('includeTables copies knowledge_tables/', () => {
    const { v, slug } = dexWithPipeline()
    writeFileSync(join(v, 'projects', slug, 'knowledge_tables', 'kb.csv'), 'a,b\n1,2\n')
    const r = snapshotUnit(v, slug, 'lead-reactivation', STAMP, { includeTables: true })
    expect(r.files).toContain('knowledge_tables/kb.csv')
  })

  it('refuses unknown client/unit, empty (no local + no platform), and duplicate stamp', () => {
    const { v, slug } = dexWithPipeline()
    expect(() => snapshotUnit(v, 'nope', 'x', STAMP)).toThrow(/no client/)
    expect(() => snapshotUnit(v, slug, 'no-such-unit', STAMP)).toThrow(/no pipeline or agent/)
    snapshotUnit(v, slug, 'lead-reactivation', STAMP)
    expect(() => snapshotUnit(v, slug, 'lead-reactivation', STAMP)).toThrow(/already exists/)
  })

  it('_versions is invisible to scanFleet and never flagged by doctor', () => {
    const { v, slug } = dexWithPipeline()
    snapshotUnit(v, slug, 'lead-reactivation', STAMP)
    const client = scanFleet(v).find((c) => c.slug === slug)
    // the snapshot copies must NOT show up as extra pipelines/agents/stages
    expect(client?.pipelines.map((p) => p.name)).toEqual(['lead-reactivation'])
    expect(client?.pipelines[0]?.stages).toHaveLength(2)
    // a secret-looking string in a snapshot copy is lint-exempt (already scanned live)
    writeFileSync(
      join(v, 'projects', slug, '_versions', 'lead-reactivation', STAMP, 'platform.json'),
      JSON.stringify({ token: 'ghp_1234567890abcdefghijklmnopqrstuvwx' }),
    )
    const secrets = lintAgentOps(v).findings.filter((f) => /secret|token/i.test(f.message))
    expect(secrets.every((f) => !f.scope?.includes('_versions'))).toBe(true)
  })

  it('listSnapshots returns newest first with file counts + notes', () => {
    const { v, slug } = dexWithPipeline()
    snapshotUnit(v, slug, 'lead-reactivation', '2026-07-20_100000', { note: 'first' })
    snapshotUnit(v, slug, 'lead-reactivation', '2026-07-20_120000', { note: 'second' })
    const rows = listSnapshots(v, slug, 'lead-reactivation')
    expect(rows.map((r) => r.stamp)).toEqual(['2026-07-20_120000', '2026-07-20_100000'])
    expect(rows[0]?.note).toBe('second')
    expect(rows[0]?.fileCount).toBe(12)
  })
})
