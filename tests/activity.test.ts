import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACTIVITY_LOG_ARGS, parseActivity } from '../src/core/activity'

const RS = '\x1e'
const US = '\x1f'

function record(opts: {
  sha?: string
  name?: string
  email?: string
  at?: string
  summary: string
  files?: string[]
}): string {
  const header = [
    opts.sha ?? 'a'.repeat(40),
    opts.name ?? 'Rana',
    opts.email ?? 'rana@nimbus.dev',
    opts.at ?? '2026-07-09T10:00:00+03:00',
    opts.summary,
  ].join(US)
  const files = (opts.files ?? []).map((file) => `A\t${file}`)
  return `${RS}${header}\n${files.join('\n')}\n`
}

describe('parseActivity', () => {
  it('types each engine commit kind with identity attribution', () => {
    const log = [
      record({
        sha: '1'.repeat(40),
        summary: 'loredex: route 2 note(s)',
        files: ['projects/backend/endpoints/2026-07-09-api.md', '_index/Dashboard.base'],
      }),
      record({
        sha: '2'.repeat(40),
        name: 'Omar',
        email: 'omar@nimbus.dev',
        summary: 'loredex: consume handoff 2026-07-01-handoff-ai-engine',
        files: ['projects/backend/handoffs/2026-07-01-handoff-ai-engine.md'],
      }),
      record({
        sha: '3'.repeat(40),
        summary: 'loredex: handoff ai-engine -> backend',
        files: ['projects/backend/handoffs/2026-07-09-handoff-ai-engine.md'],
      }),
      record({ sha: '4'.repeat(40), summary: 'loredex: sync' }),
    ].join('')

    const events = parseActivity(log)
    expect(events.map((event) => event.kind)).toEqual(['route', 'consume', 'handoff', 'sync'])

    const [route, consume, handoff, sync] = events
    expect(route?.subject).toEqual({
      path: 'projects/backend/endpoints/2026-07-09-api.md',
      project: 'backend',
    })
    expect(route?.actor).toEqual({ name: 'Rana', email: 'rana@nimbus.dev' })
    expect(route?.at).toBe('2026-07-09T10:00:00+03:00')
    expect(route?.sha).toBe('1'.repeat(40))

    expect(consume?.actor).toEqual({ name: 'Omar', email: 'omar@nimbus.dev' })
    expect(consume?.subject.handoffId).toBe('2026-07-01-handoff-ai-engine')
    expect(consume?.subject.project).toBe('backend')

    expect(handoff?.subject).toEqual({
      path: 'projects/backend/handoffs/2026-07-09-handoff-ai-engine.md',
      project: 'backend',
      handoffId: '2026-07-09-handoff-ai-engine',
    })

    expect(sync?.summary).toBe('loredex: sync')
    expect(sync?.subject).toEqual({})
  })

  it('unknown commits become generic sync events, never dropped silently', () => {
    const events = parseActivity(
      record({ summary: 'Merge branch main', files: ['projects/backend/notes/x.md'] }),
    )
    expect(events.length).toBe(1)
    expect(events[0]?.kind).toBe('sync')
    expect(events[0]?.summary).toBe('Merge branch main')
    expect(events[0]?.subject.project).toBe('backend')
  })

  it('is resilient to malformed records and preserves input (newest-first) order', () => {
    const log = [
      record({ sha: '5'.repeat(40), at: '2026-07-09T12:00:00Z', summary: 'loredex: sync' }),
      `${RS}garbage-without-separators\nA\tx.md\n`,
      record({
        sha: '6'.repeat(40),
        at: '2026-07-08T12:00:00Z',
        summary: 'loredex: route 1 note(s)',
      }),
      RS, // empty record
    ].join('')
    const events = parseActivity(log)
    expect(events.map((event) => event.sha)).toEqual(['5'.repeat(40), '6'.repeat(40)])
    expect(parseActivity('')).toEqual([])
  })

  it('parses real git output produced with ACTIVITY_LOG_ARGS', () => {
    const repo = mkdtempSync(join(tmpdir(), 'loredex-activity-'))
    execFileSync('git', ['init', '-q', '--initial-branch=main'], { cwd: repo })
    mkdirSync(join(repo, 'projects', 'backend', 'handoffs'), { recursive: true })
    writeFileSync(join(repo, 'projects', 'backend', 'handoffs', 'h1.md'), '# h\n')
    execFileSync('git', ['add', '-A'], { cwd: repo })
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Rana',
        '-c',
        'user.email=rana@nimbus.dev',
        'commit',
        '-q',
        '-m',
        'loredex: consume handoff h1',
      ],
      { cwd: repo },
    )
    const raw = execFileSync('git', [...ACTIVITY_LOG_ARGS], { cwd: repo, encoding: 'utf8' })
    const events = parseActivity(raw)
    expect(events.length).toBe(1)
    expect(events[0]).toMatchObject({
      kind: 'consume',
      actor: { name: 'Rana', email: 'rana@nimbus.dev' },
      subject: {
        path: 'projects/backend/handoffs/h1.md',
        project: 'backend',
        handoffId: 'h1',
      },
      summary: 'loredex: consume handoff h1',
    })
    expect(events[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(events[0]?.sha).toMatch(/^[0-9a-f]{40}$/)
  })
})
