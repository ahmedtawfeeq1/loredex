import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runAdopt } from '../src/commands/adopt'
import { runRoute } from '../src/commands/route'
import { loadConfig } from '../src/core/config'
import { parseDoc } from '../src/core/frontmatter'
import { walkMarkdown } from '../src/core/scan'

describe('e2e: adopt then route', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'loredex-e2e-'))
  const project = join(sandbox, 'my-app')
  const vault = join(sandbox, 'vault')
  let savedEnv: Record<string, string | undefined>

  beforeAll(() => {
    savedEnv = {
      LOREDEX_CONFIG_DIR: process.env.LOREDEX_CONFIG_DIR,
      LOREDEX_CLASSIFIER: process.env.LOREDEX_CLASSIFIER,
    }
    process.env.LOREDEX_CONFIG_DIR = join(sandbox, 'config')
    process.env.LOREDEX_CLASSIFIER = 'none' // heuristics only — tests must not call LLMs

    mkdirSync(join(project, 'docs', 'current-system'), { recursive: true })
    writeFileSync(join(project, 'docs', 'current-system', '00-OBJECTIVE.md'), '# Objective\n')
    writeFileSync(join(project, 'docs', 'GAP-ANALYSIS.md'), '# Gaps\n')
    writeFileSync(
      join(project, 'docs', 'labeled.md'),
      '---\nproject: custom-project\ntopic: special\ntype: finding\ndate: 2026-01-15\n---\n# Labeled\n',
    )
    // pre-seed the config with the sandbox vault so adopt uses it instead of ~/Loredex
    mkdirSync(join(sandbox, 'config'), { recursive: true })
    writeFileSync(
      join(sandbox, 'config', 'config.json'),
      JSON.stringify({ vaultPath: vault, sync: 'none', projects: {} }),
    )
  })

  afterAll(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('adopts a messy project into the vault', async () => {
    await runAdopt(project, { yes: true, llm: false })

    const notes = walkMarkdown(join(vault, 'projects'))
    expect(notes.length).toBe(3)

    // frontmatter-labeled file honored exactly
    const labeled = notes.find((n) => n.includes('custom-project/special/'))
    expect(labeled).toBeDefined()
    const meta = parseDoc(readFileSync(labeled as string, 'utf8')).meta
    expect(meta.loredex).toBe('routed')
    expect(meta.type).toBe('finding')

    // heuristic file topic from directory
    expect(notes.some((n) => n.includes('my-app/current-system/'))).toBe(true)

    // originals stamped, still in place
    const original = readFileSync(join(project, 'docs', 'GAP-ANALYSIS.md'), 'utf8')
    expect(parseDoc(original).meta.loredex).toBe('routed')

    // indexes built
    expect(existsSync(join(vault, '_index', 'Home.md'))).toBe(true)
    expect(readFileSync(join(vault, '_index', 'Home.md'), 'utf8')).toContain('my-app')
  })

  it('is idempotent — second adopt finds nothing', async () => {
    await runAdopt(project, { yes: true, llm: false })
    expect(walkMarkdown(join(vault, 'projects')).length).toBe(3)
  })

  it('routes inbox files by frontmatter', () => {
    writeFileSync(
      join(vault, '_inbox', 'new-finding.md'),
      '---\nproject: inboxed\ntopic: alpha\n---\n# From inbox\n',
    )
    const config = loadConfig()
    expect(config).not.toBeNull()
    runRoute({ from: project, quiet: true, llm: false })

    expect(walkMarkdown(join(vault, '_inbox')).length).toBe(0) // moved out
    expect(walkMarkdown(join(vault, 'projects', 'inboxed'))).toHaveLength(1)
  })
})
