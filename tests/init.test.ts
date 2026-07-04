import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runInit } from '../src/commands/init'

describe('init: cursor rule injection', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'loredex-init-'))
  const project = join(sandbox, 'my-app')
  const vault = join(sandbox, 'vault')
  const rulePath = join(project, '.cursor', 'rules', 'loredex.mdc')
  let cwd: string

  beforeAll(() => {
    cwd = process.cwd()
    process.env.LOREDEX_CONFIG_DIR = join(sandbox, 'config')
    mkdirSync(project, { recursive: true })
    process.chdir(project)
  })

  afterAll(() => {
    process.chdir(cwd)
    delete process.env.LOREDEX_CONFIG_DIR
  })

  it('writes a Cursor rule with frontmatter and loredex conventions', () => {
    runInit({ vault, project: 'my-app' })
    expect(existsSync(rulePath)).toBe(true)
    const content = readFileSync(rulePath, 'utf8')
    expect(content).toContain('alwaysApply: true')
    expect(content).toContain('project: my-app')
    expect(content).toContain('SUMMARY.md')
  })

  it('is idempotent — re-running init does not duplicate the rule', () => {
    runInit({ vault, project: 'my-app' })
    const content = readFileSync(rulePath, 'utf8')
    expect(content.match(/alwaysApply: true/g)?.length).toBe(1)
  })

  it('appends without duplicating frontmatter if the file already exists with other content', () => {
    writeFileSync(
      rulePath,
      '---\ndescription: pre-existing\nalwaysApply: true\n---\nsome other rule\n',
    )
    runInit({ vault, project: 'my-app' })
    const content = readFileSync(rulePath, 'utf8')
    expect(content).toContain('some other rule')
    expect(content).toContain('SUMMARY.md')
  })
})
