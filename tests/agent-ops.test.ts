import { mkdtempSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanClient, scanFleet, stageNumberingGaps } from '../src/core/agent-ops'
import {
  scaffoldAgent,
  scaffoldClient,
  scaffoldPipeline,
  scaffoldStage,
} from '../src/core/agent-ops-scaffold'
import { scaffoldVault } from '../src/core/vault'

function dex(): string {
  const v = mkdtempSync(join(tmpdir(), 'loredex-fleet-'))
  scaffoldVault(v, 'agent-ops')
  return v
}

function seedClient(v: string): string {
  const { slug } = scaffoldClient(v, 'brightsmile_dental', {
    manager: 'sara',
    tags: ['dental'],
  })
  scaffoldPipeline(v, slug, 'lead_reactivation')
  scaffoldStage(v, slug, 'lead_reactivation', 'intake')
  scaffoldStage(v, slug, 'lead_reactivation', 'qualify')
  scaffoldAgent(v, slug, 'reception_agent')
  return slug
}

describe('agent-ops fleet scanner', () => {
  it('scans a full client: units, stages, manifests, counts', () => {
    const v = dex()
    const slug = seedClient(v)
    writeFileSync(join(v, 'projects', slug, 'knowledge_tables', 'patients.csv'), 'name,phone\n')
    writeFileSync(join(v, 'projects', slug, 'automation_workflows', 'booking.json'), '{}')
    writeFileSync(join(v, 'projects', slug, '_inbox', 'new-prices.md'), 'update')

    const info = scanClient(v, slug)
    expect(info).not.toBeNull()
    if (!info) return
    expect(info.manager).toBe('sara')
    expect(info.tags).toEqual(['dental'])
    expect(info.pipelines).toHaveLength(1)
    expect(info.agents).toHaveLength(1)
    const pipe = info.pipelines[0]
    expect(pipe?.kind).toBe('pipeline')
    expect(pipe?.hasStagesDir).toBe(true)
    expect(pipe?.stages.map((s) => s.dir)).toEqual(['01_intake', '02_qualify'])
    expect(pipe?.stages[0]?.files).toEqual({
      enterCondition: true,
      stageInstructions: true,
      followup: true,
      actions: true,
    })
    // scaffolded templates have placeholder bodies → 'ok'
    expect(pipe?.persona).toBe('ok')
    expect(info.agents[0]?.hasStagesDir).toBe(false)
    expect(info.knowledgeTables).toEqual(['patients.csv'])
    expect(info.workflows).toEqual(['booking.json'])
    expect(info.inboxCount).toBe(1)
    expect(info.inboxOldestMs).not.toBeNull()
    expect(info.hasWorkspaceYml).toBe(true)
    expect(scanFleet(v).map((c) => c.slug)).toEqual([slug])
  })

  it('detects NN prefix mismatches and empty persona', () => {
    const v = dex()
    const slug = seedClient(v)
    const stage = join(v, 'projects', slug, 'pipelines', 'lead-reactivation', 'stages', '01_intake')
    renameSync(join(stage, '01_followup.md'), join(stage, '02_followup.md'))
    writeFileSync(
      join(v, 'projects', slug, 'pipelines', 'lead-reactivation', '_persona.md'),
      '---\ntype: persona\n---\n\n',
    )
    const info = scanClient(v, slug)
    const s1 = info?.pipelines[0]?.stages[0]
    expect(s1?.files.followup).toBe(true) // present, just misnumbered
    expect(s1?.prefixMismatches).toEqual(['02_followup.md'])
    expect(info?.pipelines[0]?.persona).toBe('empty')
  })

  it('stageNumberingGaps: strict contiguous 01..N', () => {
    const mk = (nn: string) => ({
      nn,
      slug: 's',
      dir: `${nn}_s`,
      files: { enterCondition: true, stageInstructions: true, followup: true, actions: true },
      prefixMismatches: [],
    })
    expect(stageNumberingGaps([mk('01'), mk('02'), mk('03')])).toEqual([])
    expect(stageNumberingGaps([mk('01'), mk('04')])).toEqual(['02', '03'])
    expect(stageNumberingGaps([])).toEqual([])
  })

  it('unknown client → null; empty dex → empty fleet', () => {
    const v = dex()
    expect(scanClient(v, 'nope')).toBeNull()
    expect(scanFleet(v)).toEqual([])
  })
})
