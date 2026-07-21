import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
const V1 = `projects/brightsmile-dental/pipelines/lead-reactivation/versions/v01_2026-07-20`

describe('snapshotUnit', () => {
  it('lands in the unit as versions/vNN_<date>/, numbering up from what is there', () => {
    const { v, slug } = dexWithPipeline()
    const first = snapshotUnit(v, slug, 'lead-reactivation', STAMP)
    expect(first.stamp).toBe('v01_2026-07-20')
    expect(first.dir).toBe(V1)
    // same day, second capture — a distinct folder, and the order still reads
    const second = snapshotUnit(v, slug, 'lead-reactivation', STAMP)
    expect(second.stamp).toBe('v02_2026-07-20')
  })

  /**
   * The bug this file exists to prevent: the old snapshot copied a hardcoded
   * list of filenames, so when the schema moved it captured `_persona.md` and
   * nothing else while still reporting success. Asserting on the COUNT is what
   * would have caught it.
   */
  it('captures the WHOLE unit — every file, at any depth', () => {
    const { v, slug } = dexWithPipeline()
    const unit = join(v, 'projects', slug, 'pipelines', 'lead-reactivation')
    // a file the schema does not know about, and one nested deeper than a stage
    writeFileSync(join(unit, 'pipeline.yaml'), 'id: 7\n')
    mkdirSync(join(unit, 'stages', '01_intake', 'assets'), { recursive: true })
    writeFileSync(join(unit, 'stages', '01_intake', 'assets', 'brochure.md'), 'x')

    const r = snapshotUnit(v, slug, 'lead-reactivation', STAMP)
    expect(r.kind).toBe('pipeline')
    // 2 unit files + pipeline.yaml + 2 stages × 2 files + the nested asset
    expect(r.files).toHaveLength(8)
    expect(r.files).toContain('_persona.md')
    expect(r.files).toContain('_instructions.md')
    expect(r.files).toContain('pipeline.yaml')
    expect(r.files).toContain('stages/01_intake/stage.yaml')
    expect(r.files).toContain('stages/02_qualify/_instructions.md')
    expect(r.files).toContain('stages/01_intake/assets/brochure.md')
    const base = join(v, r.dir)
    for (const f of r.files) expect(existsSync(join(base, f)), f).toBe(true)
    const manifest = JSON.parse(readFileSync(join(base, 'manifest.json'), 'utf8'))
    expect(manifest.unit).toBe('lead-reactivation')
    expect(manifest.version).toBe('v01_2026-07-20')
    expect(manifest.files).toHaveLength(8)
  })

  it('never captures its own versions/ — a snapshot of snapshots is not a snapshot', () => {
    const { v, slug } = dexWithPipeline()
    const first = snapshotUnit(v, slug, 'lead-reactivation', STAMP)
    const second = snapshotUnit(v, slug, 'lead-reactivation', STAMP)
    expect(second.files).toEqual(first.files)
    expect(second.files.some((f) => f.startsWith('versions/'))).toBe(false)
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

  it('refuses an unknown client and an unknown unit', () => {
    const { v, slug } = dexWithPipeline()
    expect(() => snapshotUnit(v, 'nope', 'x', STAMP)).toThrow(/no client/)
    expect(() => snapshotUnit(v, slug, 'no-such-unit', STAMP)).toThrow(/no pipeline or agent/)
  })

  it('versions/ is invisible to scanFleet and never flagged by doctor', () => {
    const { v, slug } = dexWithPipeline()
    const r = snapshotUnit(v, slug, 'lead-reactivation', STAMP)
    const client = scanFleet(v).find((c) => c.slug === slug)
    // the snapshot copies must NOT show up as extra pipelines/agents/stages
    expect(client?.pipelines.map((p) => p.name)).toEqual(['lead-reactivation'])
    expect(client?.pipelines[0]?.stages).toHaveLength(2)
    // a secret-looking string in a snapshot copy is lint-exempt (already scanned live)
    writeFileSync(
      join(v, r.dir, 'platform.json'),
      JSON.stringify({ token: 'ghp_1234567890abcdefghijklmnopqrstuvwx' }),
    )
    const secrets = lintAgentOps(v).findings.filter((f) => /secret|token/i.test(f.message))
    expect(secrets.every((f) => !f.scope?.includes('/versions/'))).toBe(true)
  })

  it('listSnapshots returns newest first with file counts + notes', () => {
    const { v, slug } = dexWithPipeline()
    snapshotUnit(v, slug, 'lead-reactivation', '2026-07-20_100000', { note: 'first' })
    snapshotUnit(v, slug, 'lead-reactivation', '2026-07-21_120000', { note: 'second' })
    const rows = listSnapshots(v, slug, 'lead-reactivation')
    expect(rows.map((r) => r.stamp)).toEqual(['v02_2026-07-21', 'v01_2026-07-20'])
    expect(rows[0]?.note).toBe('second')
    expect(rows[0]?.fileCount).toBe(6)
    expect(rows[0]?.dir).toBe(
      `projects/${slug}/pipelines/lead-reactivation/versions/v02_2026-07-21`,
    )
  })

  it('v10 sorts after v09, not between v01 and v02', () => {
    const { v, slug } = dexWithPipeline()
    for (let i = 0; i < 10; i++) snapshotUnit(v, slug, 'lead-reactivation', '2026-07-20')
    expect(listSnapshots(v, slug, 'lead-reactivation')[0]?.stamp).toBe('v10_2026-07-20')
  })

  it('still lists snapshots left in the retired _versions/ layout', () => {
    const { v, slug } = dexWithPipeline()
    const old = join(v, 'projects', slug, '_versions', 'lead-reactivation', '2026-07-19_090000')
    mkdirSync(old, { recursive: true })
    writeFileSync(join(old, 'manifest.json'), JSON.stringify({ files: ['_persona.md'] }))
    snapshotUnit(v, slug, 'lead-reactivation', '2026-07-20')
    const rows = listSnapshots(v, slug, 'lead-reactivation')
    expect(rows.map((r) => r.stamp)).toEqual(['v01_2026-07-20', '2026-07-19_090000'])
  })
})
