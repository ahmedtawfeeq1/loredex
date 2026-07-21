import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  scaffoldAgent,
  scaffoldClient,
  scaffoldPipeline,
  scaffoldStage,
} from '../src/core/agent-ops-scaffold'
import { rebuildIndexes } from '../src/core/indexer'
import { scaffoldVault } from '../src/core/vault'

function dex(): string {
  const v = mkdtempSync(join(tmpdir(), 'loredex-aidx-'))
  scaffoldVault(v, 'agent-ops')
  return v
}

describe('agent-ops indexer (via rebuildIndexes dex-type branch)', () => {
  it('Home groups Manager → Client with counts and tags; client MOC lists structure', () => {
    const v = dex()
    const { slug } = scaffoldClient(v, 'brightsmile_dental', {
      manager: 'sara',
      tags: ['dental'],
    })
    scaffoldPipeline(v, slug, 'booking')
    scaffoldStage(v, slug, 'booking', 'intake')
    scaffoldStage(v, slug, 'booking', 'confirm')
    scaffoldAgent(v, slug, 'reception_agent')
    scaffoldClient(v, 'peak_fitness') // unassigned manager
    writeFileSync(join(v, 'projects', slug, 'knowledge_tables', 'faq.csv'), 'q,a\n')
    writeFileSync(join(v, 'projects', slug, '_inbox', 'new.md'), 'x')

    rebuildIndexes(v)

    const home = readFileSync(join(v, '_index', 'Home.md'), 'utf8')
    expect(home).toContain('## sara')
    expect(home).toContain('## Unassigned')
    expect(home).toContain('[[brightsmile-dental]] — 1 pipeline · 1 agent · ⚠ 1 in inbox #dental')
    expect(home).toContain('[[peak-fitness]]')

    const moc = readFileSync(join(v, '_index', 'brightsmile-dental.md'), 'utf8')
    expect(moc).toContain('manager: **sara**')
    expect(moc).toContain('## Pipelines')
    expect(moc).toContain('### booking')
    expect(moc).toContain(
      '01 — [[projects/brightsmile-dental/pipelines/booking/stages/01_intake/_instructions|intake]]',
    )
    expect(moc).toContain('## Agents')
    expect(moc).toContain('### reception-agent')
    expect(moc).toContain('## Knowledge tables')
    expect(moc).toContain('faq.csv')
    expect(moc).toContain('inbox item(s) pending')

    // Dashboard.base still generated (shared bases file)
    expect(readFileSync(join(v, '_index', 'Dashboard.base'), 'utf8')).toContain('views:')
  })

  it('empty agent-ops dex renders a helpful Home', () => {
    const v = dex()
    rebuildIndexes(v)
    expect(readFileSync(join(v, '_index', 'Home.md'), 'utf8')).toContain('No clients yet')
  })
})
