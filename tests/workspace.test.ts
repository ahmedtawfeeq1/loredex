import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scaffoldClient, scaffoldPipeline, scaffoldStage } from '../src/core/agent-ops-scaffold'
import { lintAgentOps } from '../src/core/doctor-agent-ops'
import { scaffoldVault } from '../src/core/vault'
import {
  copyWorkspaceSpec,
  envSuffix,
  expandEnvRefs,
  loadWorkspaceSpec,
  materializeWorkspace,
} from '../src/core/workspace'

const WS = `mcp:
  crm-bridge:
    command: npx
    args: [-y, some-mcp-client]
    env: { CRM_TOKEN: "\${CRM_TOKEN_X}" }
plugins:
  claude: [some-plugin@some-marketplace]
skills: [followups]
`

function dexWithClient(): { v: string; slug: string; dir: string } {
  const v = mkdtempSync(join(tmpdir(), 'loredex-ws-'))
  scaffoldVault(v, 'agent-ops')
  const { slug } = scaffoldClient(v, 'brightsmile_dental', { manager: 'sara' })
  scaffoldPipeline(v, slug, 'booking')
  scaffoldStage(v, slug, 'booking', 'intake')
  const dir = join(v, 'projects', slug)
  writeFileSync(join(dir, 'workspace.yml'), WS)
  return { v, slug, dir }
}

describe('workspace materializer', () => {
  it('generates .mcp.json / .claude settings / AGENTS.md with env expansion', () => {
    const { v, slug, dir } = dexWithClient()
    const result = materializeWorkspace(v, slug, { env: { CRM_TOKEN_X: 'secret123' } })
    expect(result.ok).toBe(true)
    expect(result.wrote.sort()).toEqual(['.claude/settings.json', '.mcp.json', 'AGENTS.md'])

    const mcp = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'))
    expect(mcp.mcpServers['crm-bridge']).toEqual({
      command: 'npx',
      args: ['-y', 'some-mcp-client'],
      env: { CRM_TOKEN: 'secret123' },
    })
    const settings = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'))
    expect(settings.enabledPlugins['some-plugin@some-marketplace']).toBe(true)
    const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf8')
    expect(agents).toContain('brightsmile-dental')
    expect(agents).toContain('manager: sara')
    expect(agents).toContain('pipeline `booking`')
    expect(agents).toContain('Skills expected here: followups')
    expect(agents).not.toContain('secret123') // secrets never land in markdown
  })

  it('is idempotent: second run writes nothing, --check is green', () => {
    const { v, slug } = dexWithClient()
    const env = { CRM_TOKEN_X: 'secret123' }
    materializeWorkspace(v, slug, { env })
    const second = materializeWorkspace(v, slug, { env })
    expect(second.wrote).toEqual([])
    const check = materializeWorkspace(v, slug, { check: true, env })
    expect(check.ok).toBe(true)
    expect(check.wouldChange).toEqual([])
  })

  it('--check reports drift without writing', () => {
    const { v, slug, dir } = dexWithClient()
    const env = { CRM_TOKEN_X: 'secret123' }
    materializeWorkspace(v, slug, { env })
    writeFileSync(
      join(dir, 'workspace.yml'),
      WS.replace('secret-free', 'x').replace('followups', 'other-skill'),
    )
    const check = materializeWorkspace(v, slug, { check: true, env })
    expect(check.ok).toBe(false)
    expect(check.wouldChange).toContain('AGENTS.md')
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toContain('followups') // untouched
  })

  it('merge-preserving: foreign mcp servers and settings keys survive', () => {
    const { v, slug, dir } = dexWithClient()
    writeFileSync(
      join(dir, '.mcp.json'),
      JSON.stringify({ mcpServers: { figma: { command: 'figma-mcp' } } }),
    )
    materializeWorkspace(v, slug, { env: { CRM_TOKEN_X: 's' } })
    const mcp = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'))
    expect(mcp.mcpServers.figma).toEqual({ command: 'figma-mcp' })
    expect(mcp.mcpServers['crm-bridge']).toBeDefined()
  })

  it('missing env vars are reported and values left unexpanded — never partial', () => {
    const { v, slug, dir } = dexWithClient()
    const result = materializeWorkspace(v, slug, { env: {} })
    expect(result.missingEnv).toEqual(['CRM_TOKEN_X'])
    expect(result.ok).toBe(false)
    const mcp = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'))
    expect(mcp.mcpServers['crm-bridge'].env.CRM_TOKEN).toBe('${CRM_TOKEN_X}')
  })

  it('expandEnvRefs only touches mcp env values, not args', () => {
    const { spec, missing } = expandEnvRefs(
      {
        mcp: { s: { command: 'x', args: ['${NOT_A_SECRET_SLOT}'], env: { K: '${SET_VAR}' } } },
        plugins: { claude: [] },
        skills: [],
      },
      { SET_VAR: 'v' },
    )
    expect(missing).toEqual([])
    expect(spec.mcp.s?.env?.K).toBe('v')
    expect(spec.mcp.s?.args).toEqual(['${NOT_A_SECRET_SLOT}']) // args untouched
  })

  it('malformed workspace.yml throws an actionable error', () => {
    const { v, slug, dir } = dexWithClient()
    writeFileSync(join(dir, 'workspace.yml'), 'mcp: [not, a, map]')
    expect(() => loadWorkspaceSpec(dir)).toThrow(/workspace\.yml invalid at mcp/)
    writeFileSync(join(dir, 'workspace.yml'), 'mcp: [unclosed\n  bad: {')
    expect(() => materializeWorkspace(v, slug)).toThrow(/not valid YAML/)
  })

  it('commented-out scaffold template parses as an empty spec', () => {
    const v = mkdtempSync(join(tmpdir(), 'loredex-ws-'))
    scaffoldVault(v, 'agent-ops')
    const { slug } = scaffoldClient(v, 'peak_fitness')
    const spec = loadWorkspaceSpec(join(v, 'projects', slug))
    expect(spec).toEqual({ mcp: {}, plugins: { claude: [] }, skills: [] })
  })

  it('doctor lints workspace drift and missing env', () => {
    const { v, slug } = dexWithClient()
    // never materialized → all three files "out of date" + missing env attention
    const { findings } = lintAgentOps(v)
    expect(
      findings.some(
        (f) => f.level === 'warn' && f.scope === 'workspace.yml' && /out of date/.test(f.message),
      ),
    ).toBe(true)
    expect(findings.some((f) => f.level === 'attention' && /CRM_TOKEN_X/.test(f.message))).toBe(
      true,
    )
    expect(findings.some((f) => f.client === slug)).toBe(true)
  })

  it('generated files stay out of git (scaffold gitignore covers them)', () => {
    const { v, slug, dir } = dexWithClient()
    materializeWorkspace(v, slug, { env: { CRM_TOKEN_X: 's' } })
    const gitignore = readFileSync(join(dir, '.gitignore'), 'utf8')
    for (const rel of ['.mcp.json', '.claude/', 'AGENTS.md']) {
      expect(gitignore).toContain(rel)
    }
    expect(existsSync(join(dir, '.mcp.json'))).toBe(true)
  })
})

describe('copyWorkspaceSpec (workspace --from)', () => {
  const GOLDEN = `# golden tooling
mcp:
  crm-bridge:
    command: npx
    args: [-y, some-mcp-client]
    env:
      CRM_TOKEN: "\${CRM_TOKEN_BRIGHTSMILE_DENTAL}"
      CRM_URL: "https://crm.example.com"
plugins:
  claude: [some-plugin@some-marketplace]
skills: []
`

  function dexWithTwoClients(): { v: string; from: string; to: string } {
    const v = mkdtempSync(join(tmpdir(), 'loredex-wsfrom-'))
    scaffoldVault(v, 'agent-ops')
    const { slug: from } = scaffoldClient(v, 'brightsmile_dental', { manager: 'sara' })
    const { slug: to } = scaffoldClient(v, 'peak_fitness', { manager: 'sara' })
    writeFileSync(join(v, 'projects', from, 'workspace.yml'), GOLDEN)
    return { v, from, to }
  }

  it('copies tooling and rewrites the per-client env suffix', () => {
    const { v, from, to } = dexWithTwoClients()
    const { renamed } = copyWorkspaceSpec(v, from, to)
    expect(renamed).toEqual([
      { from: 'CRM_TOKEN_BRIGHTSMILE_DENTAL', to: 'CRM_TOKEN_PEAK_FITNESS' },
    ])
    const copied = readFileSync(join(v, 'projects', to, 'workspace.yml'), 'utf8')
    expect(copied).toContain('${CRM_TOKEN_PEAK_FITNESS}')
    expect(copied).toContain('# golden tooling') // raw copy — comments survive
    expect(copied).toContain('https://crm.example.com') // non-suffixed values untouched
    const spec = loadWorkspaceSpec(join(v, 'projects', to))
    expect(Object.keys(spec.mcp)).toEqual(['crm-bridge'])
  })

  it('refuses a target that already declares tooling unless forced', () => {
    const { v, from, to } = dexWithTwoClients()
    copyWorkspaceSpec(v, from, to)
    expect(() => copyWorkspaceSpec(v, from, to)).toThrow(/already declares tooling/)
    expect(copyWorkspaceSpec(v, from, to, { force: true }).renamed).toHaveLength(1)
  })

  it('refuses an empty (template-only) source and a missing target client', () => {
    const { v, to, from } = dexWithTwoClients()
    // scaffolded template declares nothing → copying it is a mistake
    expect(() => copyWorkspaceSpec(v, to, from)).toThrow(/declares no tooling/)
    expect(() => copyWorkspaceSpec(v, from, 'no-such-client')).toThrow(/no client/)
  })

  it('envSuffix upper-snakes slugs', () => {
    expect(envSuffix('2me')).toBe('2ME')
    expect(envSuffix('p-s')).toBe('P_S')
    expect(envSuffix('brightsmile-dental')).toBe('BRIGHTSMILE_DENTAL')
  })
})
