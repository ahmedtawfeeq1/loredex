import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveMeta } from '../src/core/classify'

// The LLM classifier shells out to an agent CLI; stub it so tests are hermetic.
const mockClassify = vi.fn()
vi.mock('../src/llm/provider', () => ({
  classifyWithLlm: (ctx: unknown) => mockClassify(ctx),
}))

function makeFile(rel: string): { root: string; path: string } {
  const root = mkdtempSync(join(tmpdir(), 'loredex-classify-'))
  const path = join(root, rel)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, '# doc\n\nbody\n')
  return { root, path }
}

const opts = (root: string, projectName: string) => ({
  projectRoot: root,
  projectName,
  useLlm: true,
  knownProjects: [],
  knownTopics: [],
})

describe('resolveMeta project pinning', () => {
  afterEach(() => mockClassify.mockReset())

  it('pins to the registered project even when the LLM invents another', () => {
    // LLM guesses a different project from content — the classic scatter bug.
    mockClassify.mockReturnValue({ project: 'acme-mcp', topic: 'mcp', type: 'note', tags: [] })
    const { root, path } = makeFile('src/mcp/tools.md')
    const meta = resolveMeta(path, '# doc\n', opts(root, 'acme_backend'))
    expect(meta.project).toBe('acme_backend') // registered wins, no scatter
    expect(meta.topic).toBe('mcp') // LLM still owns topic
  })

  it('lets the LLM pick the project for inbox files (no registered root)', () => {
    mockClassify.mockReturnValue({ project: 'acme-mcp', topic: 'mcp', type: 'note', tags: [] })
    const { root, path } = makeFile('note.md')
    const meta = resolveMeta(path, '# doc\n', opts(root, '')) // projectName '' = inbox
    expect(meta.project).toBe('acme-mcp')
  })

  it('explicit file frontmatter still overrides the registered project', () => {
    mockClassify.mockReturnValue({ project: 'acme-mcp', topic: 'mcp', type: 'note', tags: [] })
    const { root, path } = makeFile('src/mcp/tools.md')
    const raw = '---\nproject: chosen-by-hand\ntopic: t\ntype: note\n---\n# doc\n'
    const meta = resolveMeta(path, raw, opts(root, 'acme_backend'))
    expect(meta.project).toBe('chosen-by-hand')
  })
})
