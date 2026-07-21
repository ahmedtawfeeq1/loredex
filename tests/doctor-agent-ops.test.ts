import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  scaffoldAgent,
  scaffoldClient,
  scaffoldPipeline,
  scaffoldStage,
} from '../src/core/agent-ops-scaffold'
import {
  findTrackedGeneratedFiles,
  lintAgentOps,
  scanForSecrets,
} from '../src/core/doctor-agent-ops'
import { scaffoldVault } from '../src/core/vault'

function dex(): string {
  const v = mkdtempSync(join(tmpdir(), 'loredex-lint-'))
  scaffoldVault(v, 'agent-ops')
  return v
}

function cleanClient(v: string, name = 'brightsmile_dental'): string {
  const { slug } = scaffoldClient(v, name, { manager: 'sara' })
  scaffoldPipeline(v, slug, 'booking')
  scaffoldStage(v, slug, 'booking', 'intake')
  scaffoldStage(v, slug, 'booking', 'confirm')
  writeFileSync(join(v, 'projects', slug, 'knowledge_tables', 'faq.csv'), 'q,a\n')
  return slug
}

const levels = (v: string) => {
  const { findings } = lintAgentOps(v)
  return findings
}

describe('agent-ops doctor lints', () => {
  it('a fully scaffolded client with a knowledge table is clean', () => {
    const v = dex()
    cleanClient(v)
    expect(levels(v)).toEqual([])
  })

  it('empty client → warn; missing knowledge tables → warn', () => {
    const v = dex()
    scaffoldClient(v, 'peak_fitness')
    const findings = levels(v)
    expect(findings.some((f) => f.level === 'warn' && /empty client/.test(f.message))).toBe(true)
    expect(findings.some((f) => f.level === 'warn' && /knowledge tables/.test(f.message))).toBe(
      true,
    )
    expect(findings.every((f) => f.level !== 'error')).toBe(true)
  })

  it('pipeline with no stages, a stage with no stage.yaml, numbering gaps → errors', () => {
    const v = dex()
    const slug = cleanClient(v)
    // no-stage pipeline
    scaffoldPipeline(v, slug, 'ghost')
    const stages = join(v, 'projects', slug, 'pipelines', 'booking', 'stages')
    rmSync(join(stages, '01_intake', 'stage.yaml'))
    renameSync(join(stages, '02_confirm'), join(stages, '04_confirm'))
    const findings = levels(v)
    const msgs = findings.filter((f) => f.level === 'error').map((f) => f.message)
    expect(msgs.some((m) => /no stages/.test(m))).toBe(true)
    expect(msgs.some((m) => /missing stage\.yaml/.test(m))).toBe(true)
    expect(msgs.some((m) => /gaps/.test(m))).toBe(true)
  })

  it('a stage without _instructions.md is a warn, not an error — it inherits', () => {
    const v = dex()
    const slug = cleanClient(v)
    const stages = join(v, 'projects', slug, 'pipelines', 'booking', 'stages')
    rmSync(join(stages, '01_intake', '_instructions.md'))
    const findings = levels(v)
    expect(
      findings.some((f) => f.level === 'warn' && /inherits the pipeline/.test(f.message)),
    ).toBe(true)
    expect(findings.every((f) => f.level !== 'error')).toBe(true)
  })

  it('agent with a stages/ dir → error', () => {
    const v = dex()
    const slug = cleanClient(v)
    scaffoldAgent(v, slug, 'reception_agent')
    mkdirSync(join(v, 'projects', slug, 'agents', 'reception-agent', 'stages'))
    expect(
      levels(v).some((f) => f.level === 'error' && /agents are stage-less/.test(f.message)),
    ).toBe(true)
  })

  it('_inbox pending → attention (never error); _randoms exempt', () => {
    const v = dex()
    const slug = cleanClient(v)
    writeFileSync(join(v, 'projects', slug, '_inbox', 'new-prices.md'), 'x')
    // a fake JWT in _randoms must NOT trigger the secret scan
    writeFileSync(
      join(v, 'projects', slug, '_randoms', 'pasted.txt'),
      `token: eyJ${'a'.repeat(30)}.${'b'.repeat(20)}`,
    )
    const findings = levels(v)
    const inbox = findings.filter((f) => f.scope === '_inbox')
    expect(inbox).toHaveLength(1)
    expect(inbox[0]?.level).toBe('attention')
    expect(findings.every((f) => f.level !== 'error')).toBe(true)
  })

  it('secret scan: committed JWT flagged, ${VAR} placeholder not', () => {
    const v = dex()
    const files = ['projects/c/x.yaml', 'projects/c/ok.yaml', 'projects/c/_randoms/r.yaml']
    mkdirSync(join(v, 'projects', 'c', '_randoms'), { recursive: true })
    writeFileSync(
      join(v, 'projects/c/x.yaml'),
      `env: { TOKEN: "eyJ${'a'.repeat(30)}.${'b'.repeat(20)}" }`,
    )
    writeFileSync(join(v, 'projects/c/ok.yaml'), 'env: { TOKEN: "${CRM_TOKEN_X}" }')
    writeFileSync(join(v, 'projects/c/_randoms/r.yaml'), `eyJ${'a'.repeat(30)}.${'b'.repeat(20)}`)
    const findings = scanForSecrets(v, files)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.scope).toBe('projects/c/x.yaml')
    expect(findings[0]?.message).toContain('rotate')
  })

  it('git-tracked generated files → error; gitignored ones fine', () => {
    const v = dex()
    execFileSync('git', ['init'], { cwd: v, stdio: 'ignore' })
    const slug = cleanClient(v)
    // simulate a pre-gitignore dex: force-add a generated file
    writeFileSync(join(v, 'projects', slug, '.mcp.json'), '{}')
    execFileSync('git', ['add', '-A', '-f'], { cwd: v, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'seed'], {
      cwd: v,
      stdio: 'ignore',
    })
    const findings = findTrackedGeneratedFiles(v)
    expect(findings.some((f) => f.scope === `projects/${slug}/.mcp.json`)).toBe(true)
  })
})
