/** Work items (desktop DESIGN v3 §8): board mapping + the one task writer. */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { handoffBoardStatus, listWorkItems, updateWorkItem } from '../src/core/work-items'

const task = (title: string, status: string) =>
  `---\nkind: task\nstatus: ${status}\ntitle: ${title}\ntype: note\ndate: 2026-07-17\nloredex_schema: 2\n---\n\n# ${title}\n`

function demoVault(): string {
  const root = mkdtempSync(join(tmpdir(), 'loredex-work-'))
  mkdirSync(join(root, 'projects/alpha/auth'), { recursive: true })
  writeFileSync(join(root, 'projects/alpha/auth/rotate-tokens.md'), task('Rotate tokens', 'todo'))
  writeFileSync(join(root, 'projects/alpha/auth/old-chore.md'), task('Old chore', 'done'))
  return root
}

describe('handoffBoardStatus (8.1 machine → board plane, read-only)', () => {
  it('maps every state once', () => {
    expect(handoffBoardStatus('open', false)).toBe('todo')
    expect(handoffBoardStatus('snoozed', true)).toBe('todo') // expired sorts with open
    expect(handoffBoardStatus('snoozed', false)).toBe('backlog')
    expect(handoffBoardStatus('accepted', false)).toBe('doing')
    expect(handoffBoardStatus('consumed', false)).toBe('consumed')
    expect(handoffBoardStatus('declined', false)).toBe('done')
  })
})

describe('listWorkItems + updateWorkItem', () => {
  it('lists task notes actionable-first and patches only the asked fields', () => {
    const root = demoVault()
    const items = listWorkItems(root)
    expect(items.map((i) => `${i.id}:${i.status}`)).toEqual([
      'rotate-tokens:todo',
      'old-chore:done',
    ])
    expect(items[0]?.project).toBe('alpha')

    const receipt = updateWorkItem(
      root,
      { vaultPath: root, projects: {}, sync: 'none' } as never,
      'rotate-tokens',
      { status: 'doing', sprint: 'S12' },
      { name: 'kai', email: 'kai@x' },
    )
    expect(receipt.after.status).toBe('doing')
    expect(receipt.after.sprint).toBe('S12')
    const raw = readFileSync(join(root, 'projects/alpha/auth/rotate-tokens.md'), 'utf8')
    expect(raw).toContain('status: doing')
    expect(raw).toContain('sprint: S12')
    expect(raw).toContain('updated_by: kai <kai@x>')
    expect(raw).toContain('# Rotate tokens') // body untouched
  })

  it('refuses unknown task ids and bad statuses', () => {
    const root = demoVault()
    const cfg = { vaultPath: root, projects: {}, sync: 'none' } as never
    expect(() =>
      updateWorkItem(root, cfg, 'nope', { status: 'done' }, { name: 'k', email: 'k@x' }),
    ).toThrow(/no task/)
    expect(() =>
      updateWorkItem(
        root,
        cfg,
        'rotate-tokens',
        { status: 'sideways' as never },
        { name: 'k', email: 'k@x' },
      ),
    ).toThrow(/unknown work status/)
  })
})
