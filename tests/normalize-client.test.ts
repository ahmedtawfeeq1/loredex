import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanClient } from '../src/core/agent-ops'
import { normalizeClient, scaffoldClient } from '../src/core/agent-ops-scaffold'
import { scaffoldVault } from '../src/core/vault'

function dexWithClient(): { v: string; slug: string; dir: string } {
  const v = mkdtempSync(join(tmpdir(), 'loredex-normalize-'))
  scaffoldVault(v, 'agent-ops')
  const { slug } = scaffoldClient(v, 'brightsmile_dental', { manager: 'sara' })
  return { v, slug, dir: join(v, 'projects', slug) }
}

describe('normalizeClient', () => {
  it('fills the canonical structure: gitkeep in empty containers, starter pipeline+stage+agent', () => {
    const { v, slug, dir } = dexWithClient()
    const result = normalizeClient(v, slug)
    expect(result.alreadyCanonical).toBe(false)

    // .gitkeep in each empty container
    for (const d of ['knowledge_tables', 'automation_workflows', '_inbox', '_randoms']) {
      expect(existsSync(join(dir, d, '.gitkeep')), `${d}/.gitkeep`).toBe(true)
    }
    // starter pipeline with persona + instructions + a numbered stage
    const info = scanClient(v, slug)
    expect(info?.pipelines.map((p) => p.name)).toEqual(['main'])
    const pipe = info?.pipelines[0]
    expect(pipe?.persona).not.toBe('missing')
    expect(pipe?.generalInstructions).not.toBe('missing')
    expect(pipe?.stages).toHaveLength(1)
    expect(pipe?.stages[0]?.nn).toBe('01')
    // every stage file present
    for (const k of ['enterCondition', 'stageInstructions', 'followup', 'actions'] as const) {
      expect(pipe?.stages[0]?.files[k], k).toBe(true)
    }
    // starter agent
    expect(info?.agents.map((a) => a.name)).toEqual(['assistant'])
  })

  it('is idempotent — a second run is a no-op and never clobbers real content', () => {
    const { v, slug, dir } = dexWithClient()
    normalizeClient(v, slug)
    // put real content in a stage instruction, then re-normalize
    const instr = join(dir, 'pipelines', 'main', 'stages', '01_intake', '01_stage_instructions.md')
    writeFileSync(instr, '# Real content\n\nDo the thing.\n')
    const again = normalizeClient(v, slug)
    expect(again.alreadyCanonical).toBe(true)
    expect(again.created).toEqual([])
    // real content survived
    const info = scanClient(v, slug)
    expect(info?.pipelines[0]?.stages[0]?.files.stageInstructions).toBe(true)
  })

  it('does not add a starter pipeline when the client already has one', () => {
    const { v, slug } = dexWithClient()
    // give it a real pipeline first
    normalizeClient(v, slug, { pipeline: 'lead_reactivation' })
    const first = scanClient(v, slug)
    expect(first?.pipelines.map((p) => p.name)).toEqual(['lead-reactivation'])
    // re-normalize with a different default — must NOT add 'main'
    const again = normalizeClient(v, slug)
    expect(again.alreadyCanonical).toBe(true)
    expect(scanClient(v, slug)?.pipelines).toHaveLength(1)
  })

  it('the empty containers hold ONLY .gitkeep, so the tree is uniform', () => {
    const { v, slug, dir } = dexWithClient()
    normalizeClient(v, slug)
    expect(readdirSync(join(dir, '_inbox'))).toEqual(['.gitkeep'])
    expect(readdirSync(join(dir, 'knowledge_tables'))).toEqual(['.gitkeep'])
  })
})
