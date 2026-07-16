import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildVaultLinkIndex, editorUri, repairVaultLinks, rewriteLinks } from '../src/core/relink'

describe('relink', () => {
  const root = mkdtempSync(join(tmpdir(), 'loredex-relink-'))
  const docs = join(root, 'docs')
  const mapping = new Map<string, string>()

  beforeAll(() => {
    mkdirSync(join(root, 'src'), { recursive: true })
    mkdirSync(docs, { recursive: true })
    writeFileSync(join(docs, 'OBJECTIVE.md'), '# obj\n')
    writeFileSync(join(root, 'src', 'agent.py'), 'code\n')
    writeFileSync(join(root, 'diagram.pdf'), 'pdf\n')
    writeFileSync(join(root, 'has space.ts'), 'x\n')
    mapping.set(join(docs, 'OBJECTIVE.md'), '2026-07-02-objective')
  })

  const ctx = (editor = 'cursor') => ({ sourceDir: docs, mapping, editor })

  it('rewrites adopted-sibling links to wikilinks, keeping display text', () => {
    const { body, changed } = rewriteLinks('see [the objective](OBJECTIVE.md)', ctx())
    expect(body).toBe('see [[2026-07-02-objective|the objective]]')
    expect(changed).toBe(1)
  })

  it('rewrites existing code files to editor deep links with line numbers', () => {
    expect(rewriteLinks('[agent](../src/agent.py#L1408)', ctx()).body).toBe(
      `[agent](cursor://file${join(root, 'src', 'agent.py')}:1408)`,
    )
    expect(rewriteLinks('[agent](../src/agent.py:42)', ctx()).body).toBe(
      `[agent](cursor://file${join(root, 'src', 'agent.py')}:42)`,
    )
  })

  it('system editor uses file:// for code files too', () => {
    expect(rewriteLinks('[a](../src/agent.py)', ctx('system')).body).toBe(
      `[a](file://${join(root, 'src', 'agent.py')})`,
    )
  })

  it('binary files get file:// regardless of editor', () => {
    expect(rewriteLinks('[d](../diagram.pdf)', ctx()).body).toBe(
      `[d](file://${join(root, 'diagram.pdf')})`,
    )
  })

  it('encodes spaces in file URIs and supports angle-bracket targets', () => {
    const { body } = rewriteLinks('[s](<../has space.ts>)', ctx())
    expect(body).toBe(`[s](cursor://file${encodeURI(join(root, 'has space.ts'))})`)
  })

  it('leaves missing targets, urls, anchors, images, and code untouched', () => {
    const input = [
      '[gone](nope.md)',
      '[web](https://example.com)',
      '[mail](mailto:x@y.z)',
      '[anchor](#section)',
      '![img](../diagram.pdf)',
      '`[code](OBJECTIVE.md)`',
      '```',
      '[fenced](OBJECTIVE.md)',
      '```',
    ].join('\n')
    const { body, changed } = rewriteLinks(input, ctx())
    expect(body).toBe(input)
    expect(changed).toBe(0)
  })

  it('rewrites wikilinks that resolve into the adopted batch', () => {
    expect(rewriteLinks('see [[OBJECTIVE]]', ctx()).body).toBe('see [[2026-07-02-objective]]')
    expect(rewriteLinks('see [[OBJECTIVE.md|obj]]', ctx()).body).toBe(
      'see [[2026-07-02-objective|obj]]',
    )
  })

  it('is idempotent — already-rewritten links are scheme-prefixed and skipped', () => {
    const once = rewriteLinks('[a](../src/agent.py:42) [b](OBJECTIVE.md)', ctx()).body
    const twice = rewriteLinks(once, ctx())
    expect(twice.body).toBe(once)
    expect(twice.changed).toBe(0)
  })

  it('strips md heading anchors before resolving', () => {
    expect(rewriteLinks('[o](OBJECTIVE.md#goals)', ctx()).body).toBe('[[2026-07-02-objective|o]]')
  })

  it('editorUri shapes', () => {
    expect(editorUri('vscode', '/a/b.ts', 7)).toBe('vscode://file/a/b.ts:7')
    expect(editorUri('system', '/a/b.ts')).toBe('file:///a/b.ts')
  })

  describe('vault-index fallback (cross-batch wikilinks)', () => {
    const vaultIndex = new Map([
      ['distribution-research', ['2026-07-16-distribution-research']],
      ['dupe', ['2026-07-01-dupe', '2026-07-02-dupe']],
      ['objective', ['2026-07-02-objective']],
    ])
    const vctx = () => ({ sourceDir: docs, mapping, editor: 'cursor', vaultIndex })

    it('rewrites wikilinks to notes routed in earlier batches', () => {
      expect(rewriteLinks('see [[distribution-research]]', vctx()).body).toBe(
        'see [[2026-07-16-distribution-research]]',
      )
    })

    it('preserves alias and heading anchor', () => {
      expect(rewriteLinks('[[distribution-research#goals|the research]]', vctx()).body).toBe(
        '[[2026-07-16-distribution-research#goals|the research]]',
      )
    })

    it('leaves ambiguous slugs and unknown targets untouched', () => {
      expect(rewriteLinks('[[dupe]] and [[nope]]', vctx()).body).toBe('[[dupe]] and [[nope]]')
    })

    it('same-batch mapping wins over the vault index', () => {
      // OBJECTIVE resolves via the batch mapping; the vault index must not double-fire
      expect(rewriteLinks('[[OBJECTIVE]]', vctx()).body).toBe('[[2026-07-02-objective]]')
    })
  })
})

describe('repairVaultLinks', () => {
  const vault = mkdtempSync(join(tmpdir(), 'loredex-repair-'))
  const topic = join(vault, 'projects', 'proj', 'topic')

  beforeAll(() => {
    mkdirSync(topic, { recursive: true })
    mkdirSync(join(vault, '_inbox'), { recursive: true })
    writeFileSync(join(topic, '2026-07-16-research.md'), '# research\n')
    writeFileSync(
      join(topic, '2026-07-16-follow-up.md'),
      '---\ndate: 2026-07-16\n---\n\nSee [[research]] and [[missing]].\n\n`[[research]]` stays.\n',
    )
    writeFileSync(join(vault, '_inbox', 'pending.md'), 'inbox [[research]] untouched\n')
  })

  it('indexes vault notes by date-stripped slug, skipping _inbox', () => {
    const index = buildVaultLinkIndex(vault)
    expect(index.get('research')).toEqual(['2026-07-16-research'])
    expect(index.get('pending')).toBeUndefined()
  })

  it('dry run reports without writing', () => {
    const results = repairVaultLinks(vault, { dryRun: true })
    expect(results).toEqual([{ path: join(topic, '2026-07-16-follow-up.md'), changed: 1 }])
    expect(readFileSync(join(topic, '2026-07-16-follow-up.md'), 'utf8')).toContain('[[research]]')
  })

  it('rewrites broken wikilinks that match a date-prefixed note, preserving frontmatter and code', () => {
    repairVaultLinks(vault)
    const body = readFileSync(join(topic, '2026-07-16-follow-up.md'), 'utf8')
    expect(body).toContain('---\ndate: 2026-07-16\n---')
    expect(body).toContain('See [[2026-07-16-research]] and [[missing]].')
    expect(body).toContain('`[[research]]` stays.')
    expect(readFileSync(join(vault, '_inbox', 'pending.md'), 'utf8')).toContain('[[research]]')
    // second run: nothing left to fix
    expect(repairVaultLinks(vault)).toEqual([])
  })
})
