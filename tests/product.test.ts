import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { rebuildIndexes } from '../src/core/indexer'
import {
  buildDashboard,
  collectProductHandoffs,
  projectState,
  renderDashboardMarkdown,
} from '../src/core/product'

const TODAY = '2026-07-10'

describe('product dashboard', () => {
  const vault = mkdtempSync(join(tmpdir(), 'loredex-product-'))

  const note = (
    project: string,
    topic: string,
    name: string,
    date: string,
    body: string,
    extra = '',
  ) => {
    mkdirSync(join(vault, 'projects', project, topic), { recursive: true })
    writeFileSync(
      join(vault, 'projects', project, topic, `${name}.md`),
      `---\nproject: ${project}\ntopic: ${topic}\ndate: "${date}"\n${extra}loredex: routed\n---\n${body}\n`,
    )
  }

  beforeAll(() => {
    note('ai-engine', 'endpoints', '2026-07-01-correction-api', '2026-07-01', '# API\ncontract')
    note('ai-engine', 'endpoints', '2026-07-04-auth', '2026-07-04', '# Auth\nflow')
    note('ai-engine', 'archive', '2026-01-01-old', '2026-01-01', '# Old\nx', 'status: stale\n')
    // backend references an engine note → cross-project edge
    note(
      'backend',
      'api',
      '2026-07-05-crud',
      '2026-07-05',
      '# CRUD\nsee [[2026-07-01-correction-api]]',
    )
    // engine has a Start Here brief dated before its newest note → stale brief
    writeFileSync(
      join(vault, 'projects', 'ai-engine', 'Start Here - ai-engine.md'),
      '---\nproject: ai-engine\ntype: brief\ndate: "2026-07-02"\nloredex: brief\n---\n# Start here\n',
    )
    // one open handoff engine → backend, one consumed backend → frontend
    mkdirSync(join(vault, 'projects', 'backend', 'handoffs'), { recursive: true })
    writeFileSync(
      join(vault, 'projects', 'backend', 'handoffs', '2026-07-06-handoff-ai-engine.md'),
      '---\nproject: backend\ntopic: handoffs\ndate: "2026-07-06"\nfrom_project: ai-engine\nto_project: backend\nobjective: build CRUD\nstatus: open\nloredex: routed\n---\nbody\n',
    )
    mkdirSync(join(vault, 'projects', 'frontend', 'handoffs'), { recursive: true })
    writeFileSync(
      join(vault, 'projects', 'frontend', 'handoffs', '2026-07-03-handoff-backend.md'),
      '---\nproject: frontend\ntopic: handoffs\ndate: "2026-07-03"\nfrom_project: backend\nto_project: frontend\nobjective: build UI\nstatus: consumed\nloredex: routed\n---\nbody\n',
    )
  })

  it('projectState reports counts, staleness, and brief freshness', () => {
    const state = projectState(vault, 'ai-engine')
    expect(state.noteCount).toBe(3)
    expect(state.lastDate).toBe('2026-07-04')
    expect(state.staleCount).toBe(1)
    expect(state.briefDate).toBe('2026-07-02')
    expect(state.notesNewerThanBrief).toBe(1) // the 07-04 auth note
    expect(state.activeTopics).toContain('endpoints')
    expect(state.activeTopics).not.toContain('archive') // last activity window excludes January
  })

  it('a project without a brief counts every note as newer', () => {
    const state = projectState(vault, 'backend')
    expect(state.briefPath).toBeNull()
    expect(state.notesNewerThanBrief).toBe(state.noteCount)
  })

  it('collects handoffs across projects, open first with age', () => {
    const handoffs = collectProductHandoffs(vault, TODAY)
    expect(handoffs.length).toBe(2)
    expect(handoffs[0]?.status).toBe('open')
    expect(handoffs[0]?.from).toBe('ai-engine')
    expect(handoffs[0]?.ageDays).toBe(4) // 07-06 → 07-10
    expect(handoffs[1]?.status).toBe('consumed')
  })

  it('detects cross-project reference edges', () => {
    const dashboard = buildDashboard(vault, TODAY)
    expect(dashboard.edges).toContainEqual({ from: 'backend', to: 'ai-engine', count: 1 })
  })

  it('renders the deterministic dashboard with all sections', () => {
    const dashboard = buildDashboard(vault, TODAY)
    const markdown = renderDashboardMarkdown(dashboard, TODAY)
    expect(markdown).toContain('## Projects')
    expect(markdown).toContain('[[ai-engine]]')
    expect(markdown).toContain('(1 newer notes)')
    expect(markdown).toContain('## Flow — handoffs between teams')
    expect(markdown).toContain('ai-engine → backend | build CRUD | 4d')
    expect(markdown).toContain('Recently consumed:')
    expect(markdown).toContain('## Cross-project references')
    expect(markdown).toContain('backend → ai-engine: 1 link(s)')
  })

  it('Home.md links the product brief once it exists', () => {
    writeFileSync(
      join(vault, 'Start Here - Product.md'),
      '---\ntype: brief\nloredex: brief\n---\n# Product\n',
    )
    rebuildIndexes(vault)
    const home = readFileSync(join(vault, '_index', 'Home.md'), 'utf8')
    expect(home).toContain('[[Start Here - Product]]')
  })
})
