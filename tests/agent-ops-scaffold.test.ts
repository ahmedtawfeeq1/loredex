import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  scaffoldAgent,
  scaffoldClient,
  scaffoldPipeline,
  scaffoldStage,
} from '../src/core/agent-ops-scaffold'
import { clientTags, loadClients } from '../src/core/clients'
import { loadProducts, productOf } from '../src/core/products'
import { scaffoldVault } from '../src/core/vault'

function dex(): string {
  const v = mkdtempSync(join(tmpdir(), 'loredex-scaffold-'))
  scaffoldVault(v, 'agent-ops')
  return v
}

describe('agent-ops scaffolds', () => {
  it('client skeleton: dirs, workspace.yml, gitignore, manager + tags manifests', () => {
    const v = dex()
    const { slug, dir } = scaffoldClient(v, 'BrightSmile Dental', {
      manager: 'sara',
      tags: ['dental', 'new-platform'],
    })
    expect(slug).toBe('brightsmile-dental')
    expect(dir).toBe('projects/brightsmile-dental')
    const abs = join(v, dir)
    for (const d of [
      'pipelines',
      'agents',
      'knowledge_tables',
      'automation_workflows',
      '_inbox',
      '_randoms',
    ]) {
      expect(existsSync(join(abs, d)), d).toBe(true)
    }
    expect(readFileSync(join(abs, 'workspace.yml'), 'utf8')).toContain('loredex workspace')
    const gitignore = readFileSync(join(abs, '.gitignore'), 'utf8')
    expect(gitignore).toContain('.mcp.json')
    expect(gitignore).toContain('.claude/')
    expect(gitignore).toContain('AGENTS.md')
    expect(productOf(loadProducts(v), slug)).toBe('sara')
    expect(clientTags(loadClients(v), slug)).toEqual(['dental', 'new-platform'])
  })

  it('scaffolding twice never overwrites existing files', () => {
    const v = dex()
    const { slug } = scaffoldClient(v, 'peak_fitness')
    const ws = join(v, 'projects', slug, 'workspace.yml')
    const marker = '# my customized workspace\n'
    writeFileSync(ws, marker)
    scaffoldClient(v, 'peak_fitness')
    expect(readFileSync(ws, 'utf8')).toBe(marker)
  })

  it('pipeline gets the four _ files + stages/; agent gets no stages/', () => {
    const v = dex()
    const { slug } = scaffoldClient(v, 'peak_fitness')
    scaffoldPipeline(v, slug, 'lead_reactivation')
    scaffoldAgent(v, slug, 'reception_agent')
    const pipe = join(v, 'projects', slug, 'pipelines', 'lead-reactivation')
    const agent = join(v, 'projects', slug, 'agents', 'reception-agent')
    for (const f of [
      '_persona.md',
      '_general_instructions.md',
      '_actions.curls.yaml',
      '_settings.export.yaml',
    ]) {
      expect(existsSync(join(pipe, f)), `pipeline ${f}`).toBe(true)
      expect(existsSync(join(agent, f)), `agent ${f}`).toBe(true)
    }
    expect(existsSync(join(pipe, 'stages'))).toBe(true)
    expect(existsSync(join(agent, 'stages'))).toBe(false)
    expect(readFileSync(join(pipe, '_persona.md'), 'utf8')).toContain('pipeline: lead-reactivation')
    expect(readFileSync(join(agent, '_persona.md'), 'utf8')).toContain('agent: reception-agent')
  })

  it('stages append 01,02,03 with NN_ prefixed files', () => {
    const v = dex()
    const { slug } = scaffoldClient(v, 'lakeside_realty')
    scaffoldPipeline(v, slug, 'sales')
    scaffoldStage(v, slug, 'sales', 'intake')
    scaffoldStage(v, slug, 'sales', 'qualify')
    scaffoldStage(v, slug, 'sales', 'book')
    const stages = join(v, 'projects', slug, 'pipelines', 'sales', 'stages')
    expect(readdirSync(stages).sort()).toEqual(['01_intake', '02_qualify', '03_book'])
    expect(readdirSync(join(stages, '02_qualify')).sort()).toEqual([
      '02_actions.curls.yaml',
      '02_enter_condition.md',
      '02_followup.md',
      '02_stage_instructions.md',
    ])
    expect(readFileSync(join(stages, '02_qualify', '02_followup.md'), 'utf8')).toContain(
      'stage: qualify',
    )
  })

  it('--before inserts and renumbers later stages (files included), fs fallback', () => {
    const v = dex()
    const { slug } = scaffoldClient(v, 'lakeside_realty')
    scaffoldPipeline(v, slug, 'sales')
    scaffoldStage(v, slug, 'sales', 'intake')
    scaffoldStage(v, slug, 'sales', 'qualify')
    scaffoldStage(v, slug, 'sales', 'book')
    const { dir, renumbered } = scaffoldStage(v, slug, 'sales', 'triage', { before: '02' })
    expect(dir).toContain('02_triage')
    expect(renumbered).toEqual([
      { from: '03_book', to: '04_book' },
      { from: '02_qualify', to: '03_qualify' },
    ])
    const stages = join(v, 'projects', slug, 'pipelines', 'sales', 'stages')
    expect(readdirSync(stages).sort()).toEqual(['01_intake', '02_triage', '03_qualify', '04_book'])
    expect(readdirSync(join(stages, '03_qualify')).sort()).toEqual([
      '03_actions.curls.yaml',
      '03_enter_condition.md',
      '03_followup.md',
      '03_stage_instructions.md',
    ])
  })

  it('--after inserts right after the anchor', () => {
    const v = dex()
    const { slug } = scaffoldClient(v, 'peak_fitness')
    scaffoldPipeline(v, slug, 'onboarding')
    scaffoldStage(v, slug, 'onboarding', 'welcome')
    scaffoldStage(v, slug, 'onboarding', 'plan')
    scaffoldStage(v, slug, 'onboarding', 'checkin', { after: '01' })
    const stages = join(v, 'projects', slug, 'pipelines', 'onboarding', 'stages')
    expect(readdirSync(stages).sort()).toEqual(['01_welcome', '02_checkin', '03_plan'])
  })

  it('renumbering uses git mv in a git dex (renames tracked)', () => {
    const v = dex()
    execFileSync('git', ['init'], { cwd: v, stdio: 'ignore' })
    const { slug } = scaffoldClient(v, 'brightsmile_dental')
    scaffoldPipeline(v, slug, 'booking')
    scaffoldStage(v, slug, 'booking', 'intake')
    scaffoldStage(v, slug, 'booking', 'confirm')
    execFileSync('git', ['add', '-A'], { cwd: v, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'seed'], {
      cwd: v,
      stdio: 'ignore',
    })
    scaffoldStage(v, slug, 'booking', 'triage', { before: '02' })
    const stages = join(v, 'projects', slug, 'pipelines', 'booking', 'stages')
    expect(readdirSync(stages).sort()).toEqual(['01_intake', '02_triage', '03_confirm'])
    // the shifted stage is staged as a rename, not delete+untracked
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: v, encoding: 'utf8' })
    expect(status).toContain('03_confirm')
  })

  it('refuses inserts when numbering already has gaps; refuses unknown anchors/clients', () => {
    const v = dex()
    const { slug } = scaffoldClient(v, 'peak_fitness')
    scaffoldPipeline(v, slug, 'sales')
    scaffoldStage(v, slug, 'sales', 'intake')
    scaffoldStage(v, slug, 'sales', 'close')
    // manufacture a gap: 01,02 → rename 02 to 04 by hand
    const stages = join(v, 'projects', slug, 'pipelines', 'sales', 'stages')
    renameSync(join(stages, '02_close'), join(stages, '04_close'))
    expect(() => scaffoldStage(v, slug, 'sales', 'x', { before: '01' })).toThrow(/gaps/)
    expect(() => scaffoldStage(v, slug, 'missing', 'x')).toThrow(/no pipeline|no client/)
    expect(() => scaffoldPipeline(v, 'ghost_client', 'x')).toThrow(/no client/)
  })
})
