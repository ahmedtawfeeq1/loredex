import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { runAdopt } from '../src/commands/adopt'
import { runReset } from '../src/commands/reset'
import { parseDoc } from '../src/core/frontmatter'
import { walkMarkdown } from '../src/core/scan'

describe('reset', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'loredex-reset-'))
  const project = join(sandbox, 'my-app')
  const vault = join(sandbox, 'vault')
  const original = join(project, 'docs', 'GAP-ANALYSIS.md')
  let savedEnv: Record<string, string | undefined>

  beforeAll(async () => {
    savedEnv = {
      LOREDEX_CONFIG_DIR: process.env.LOREDEX_CONFIG_DIR,
      LOREDEX_CLASSIFIER: process.env.LOREDEX_CLASSIFIER,
    }
    process.env.LOREDEX_CONFIG_DIR = join(sandbox, 'config')
    process.env.LOREDEX_CLASSIFIER = 'none'
    mkdirSync(join(project, 'docs'), { recursive: true })
    mkdirSync(join(sandbox, 'config'), { recursive: true })
    writeFileSync(
      join(sandbox, 'config', 'config.json'),
      JSON.stringify({ vaultPath: vault, sync: 'none', projects: {} }),
    )
    writeFileSync(original, '# Gaps\n')
    await runAdopt(project, { yes: true, llm: false })
    return () => {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })

  it('adopt stamped the original and created vault copies', () => {
    expect(parseDoc(readFileSync(original, 'utf8')).meta.loredex).toBe('routed')
    expect(walkMarkdown(join(vault, 'projects', 'my-app')).length).toBe(1)
  })

  it('dry-run changes nothing', async () => {
    await runReset('my-app', { dryRun: true })
    expect(parseDoc(readFileSync(original, 'utf8')).meta.loredex).toBe('routed')
    expect(existsSync(join(vault, 'projects', 'my-app'))).toBe(true)
  })

  it('reset removes vault copies, unstamps originals, keeps original files', async () => {
    await runReset('my-app', { yes: true })
    expect(existsSync(join(vault, 'projects', 'my-app'))).toBe(false)
    expect(existsSync(join(vault, '_index', 'my-app.md'))).toBe(false)
    expect(existsSync(original)).toBe(true) // never deletes originals
    expect(parseDoc(readFileSync(original, 'utf8')).meta.loredex).toBeUndefined()
  })

  it('re-adopt works after reset (round trip)', async () => {
    await runAdopt(project, { yes: true, llm: false })
    expect(walkMarkdown(join(vault, 'projects', 'my-app')).length).toBe(1)
    const copy = walkMarkdown(join(vault, 'projects', 'my-app'))[0] as string
    expect(parseDoc(readFileSync(copy, 'utf8')).meta.source_path).toBe(original)
  })
})
