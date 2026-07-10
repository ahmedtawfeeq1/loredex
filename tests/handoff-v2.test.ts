import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../src/core/config'
import { consumeHandoff } from '../src/core/consume'
import { type LoredexEventMap, setLoredexEmitter } from '../src/core/events'
import { LOREDEX_SCHEMA, parseDoc, serializeDoc, stampSchema } from '../src/core/frontmatter'
import {
  annotateHandoff,
  createHandoff,
  HandoffError,
  previewRoute,
  replyToHandoff,
  resolveHandoffPath,
  routeFile,
  setHandoffStatus,
} from '../src/core/handoff'
import { listHandoffs } from '../src/core/product'
import { scaffoldVault } from '../src/core/vault'

const IDENTITY = { name: 'Rana', email: 'rana@nimbus.dev' }
const TODAY = new Date().toISOString().slice(0, 10)

function writeNote(vault: string, project: string, topic: string, name: string): void {
  const dir = join(vault, 'projects', project, topic)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${name}.md`),
    `---\nproject: ${project}\ntopic: ${topic}\ntype: finding\ndate: "2026-07-01"\n---\n# ${name}\n`,
  )
}

function writeOpenHandoff(vault: string, from: string, to: string, name: string): string {
  const dir = join(vault, 'projects', to, 'handoffs')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${name}.md`)
  writeFileSync(
    path,
    [
      '---',
      `project: ${to}`,
      'topic: handoffs',
      'type: handoff',
      'date: "2026-07-01"',
      `from_project: ${from}`,
      `to_project: ${to}`,
      'objective: build it',
      'status: open',
      '---',
      '# Handoff',
      '',
    ].join('\n'),
  )
  return path
}

describe('handoff write APIs (schema v2)', () => {
  let sandbox: string
  let vault: string
  let config: Config

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'loredex-handoff-v2-'))
    vault = join(sandbox, 'vault')
    config = { vaultPath: vault, sync: 'none', projects: {} }
    mkdirSync(join(vault, 'projects'), { recursive: true })
    writeNote(vault, 'ai-engine', 'api', '2026-07-01-endpoints')
    writeNote(vault, 'ai-engine', 'api', '2026-07-02-auth')
  })

  afterEach(() => setLoredexEmitter(null))

  describe('createHandoff', () => {
    it('writes a v2-stamped open handoff at the canonical dest with a verbatim brief', () => {
      const events: Array<{ kind: string; payload: unknown }> = []
      setLoredexEmitter({ emit: (kind, payload) => events.push({ kind, payload }) })

      const result = createHandoff(
        vault,
        config,
        {
          fromProject: 'ai-engine',
          toProject: 'backend',
          objective: 'consume the new endpoints',
          kind: 'delivery',
          notes: ['2026-07-01-endpoints', '2026-07-02-auth'],
          nextActions: ['wire the CRUD'],
          body: 'Prose stays verbatim.',
        },
        IDENTITY,
      )

      expect(result.id).toBe(`${TODAY}-handoff-ai-engine`)
      expect(result.path).toBe(
        join(vault, 'projects', 'backend', 'handoffs', `${TODAY}-handoff-ai-engine.md`),
      )
      expect(result.pushed).toBe(false)

      const doc = parseDoc(readFileSync(result.path, 'utf8'))
      expect(doc.meta).toMatchObject({
        from_project: 'ai-engine',
        to_project: 'backend',
        objective: 'consume the new endpoints',
        status: 'open',
        kind: 'delivery',
        type: 'handoff',
        loredex_schema: 2,
      })
      expect(doc.meta.replies_to).toBeUndefined()
      expect(doc.body).toContain('Prose stays verbatim.')
      expect(doc.body).toContain('1. [[2026-07-01-endpoints]]')
      expect(doc.body).toContain('2. [[2026-07-02-auth]]')
      expect(doc.body).toContain('- wire the CRUD')

      // event + engine declaration + board visibility
      expect(events).toContainEqual({
        kind: 'handoff.created',
        payload: {
          id: result.id,
          path: result.path,
          from: 'ai-engine',
          to: 'backend',
          kind: 'delivery',
        },
      })
      const engine = JSON.parse(readFileSync(join(vault, '.loredex', 'engine.json'), 'utf8'))
      expect(engine.schema).toBe(2)
      const [card] = listHandoffs(vault, { direction: 'inbox', project: 'backend' })
      expect(card).toMatchObject({ id: result.id, kind: 'delivery', status: 'open' })
    })

    it('throws on an unknown note name — never silently drops it', () => {
      expect(() =>
        createHandoff(
          vault,
          config,
          {
            fromProject: 'ai-engine',
            toProject: 'backend',
            objective: 'x',
            kind: 'request',
            notes: ['no-such-note'],
          },
          IDENTITY,
        ),
      ).toThrow(/unknown note "no-such-note"/)
      expect(existsSync(join(vault, 'projects', 'backend'))).toBe(false)
    })

    it('suffixes same-day collisions instead of overwriting', () => {
      const input = {
        fromProject: 'ai-engine',
        toProject: 'backend',
        objective: 'x',
        kind: 'delivery' as const,
        notes: [],
      }
      const first = createHandoff(vault, config, input, IDENTITY)
      const second = createHandoff(vault, config, input, IDENTITY)
      expect(second.id).toBe(`${first.id}-2`)
    })

    it('records fulfills lineage on a delivery that answers a request', () => {
      const request = createHandoff(
        vault,
        config,
        {
          fromProject: 'backend',
          toProject: 'ai-engine',
          objective: 'need embeddings API',
          kind: 'request',
          notes: [],
        },
        IDENTITY,
      )
      const delivery = createHandoff(
        vault,
        config,
        {
          fromProject: 'ai-engine',
          toProject: 'backend',
          objective: 'embeddings API shipped',
          kind: 'delivery',
          notes: [],
          fulfills: request.id,
        },
        IDENTITY,
      )
      const meta = parseDoc(readFileSync(delivery.path, 'utf8')).meta
      expect(meta.fulfills).toBe(request.id)
      expect(meta.kind).toBe('delivery')
    })
  })

  describe('replyToHandoff', () => {
    it('inverts the route, sets replies_to, and defaults kind to delivery', () => {
      const parent = createHandoff(
        vault,
        config,
        {
          fromProject: 'backend',
          toProject: 'ai-engine',
          objective: 'need the model contract',
          kind: 'request',
          notes: [],
        },
        IDENTITY,
      )
      const reply = replyToHandoff(
        vault,
        config,
        parent.id,
        {
          objective: 'model contract attached',
          kind: undefined as unknown as 'delivery', // runtime default: reply to request → delivery
          notes: ['2026-07-01-endpoints'],
        },
        IDENTITY,
      )
      const meta = parseDoc(readFileSync(reply.path, 'utf8')).meta
      expect(meta.from_project).toBe('ai-engine')
      expect(meta.to_project).toBe('backend')
      expect(meta.replies_to).toBe(parent.id)
      expect(meta.kind).toBe('delivery')
      expect(meta.loredex_schema).toBe(2)
      expect(reply.path).toContain(join('projects', 'backend', 'handoffs'))
    })

    it('throws UNKNOWN_HANDOFF when the parent is missing', () => {
      expect(() =>
        replyToHandoff(
          vault,
          config,
          'ghost',
          { objective: 'x', kind: 'delivery', notes: [] },
          IDENTITY,
        ),
      ).toThrow(HandoffError)
      try {
        replyToHandoff(
          vault,
          config,
          'ghost',
          { objective: 'x', kind: 'delivery', notes: [] },
          IDENTITY,
        )
      } catch (error) {
        expect((error as HandoffError).code).toBe('UNKNOWN_HANDOFF')
      }
    })
  })

  describe('resolveHandoffPath (shared finder, qualified ids)', () => {
    beforeEach(() => {
      writeOpenHandoff(vault, 'ai-engine', 'backend', 'handoff-shared')
      writeOpenHandoff(vault, 'ai-engine', 'frontend', 'handoff-shared')
      writeOpenHandoff(vault, 'backend', 'frontend', 'handoff-solo')
    })

    it('bare unique name resolves', () => {
      expect(basename(resolveHandoffPath(vault, 'handoff-solo'))).toBe('handoff-solo.md')
    })

    it('bare ambiguous name throws AMBIGUOUS_HANDOFF naming the qualified candidates', () => {
      try {
        resolveHandoffPath(vault, 'handoff-shared')
        expect.unreachable('should have thrown')
      } catch (error) {
        expect((error as HandoffError).code).toBe('AMBIGUOUS_HANDOFF')
        expect((error as Error).message).toContain('backend/handoff-shared')
        expect((error as Error).message).toContain('frontend/handoff-shared')
      }
    })

    it('qualified "<project>/<name>" disambiguates', () => {
      const path = resolveHandoffPath(vault, 'frontend/handoff-shared')
      expect(path).toBe(join(vault, 'projects', 'frontend', 'handoffs', 'handoff-shared.md'))
    })

    it('unknown name throws UNKNOWN_HANDOFF with the v1-compatible message', () => {
      try {
        resolveHandoffPath(vault, 'ghost')
        expect.unreachable('should have thrown')
      } catch (error) {
        expect((error as HandoffError).code).toBe('UNKNOWN_HANDOFF')
        expect((error as Error).message).toMatch(/no handoff named "ghost"/)
      }
    })

    it('consumeHandoff is rewired: ambiguous bare id throws instead of silently picking one', () => {
      expect(() => consumeHandoff(vault, config, 'handoff-shared', IDENTITY)).toThrow(
        /matches 2 handoffs/,
      )
      const receipt = consumeHandoff(vault, config, 'backend/handoff-shared', IDENTITY)
      expect(receipt.handoffId).toBe('handoff-shared')
      const meta = parseDoc(
        readFileSync(join(vault, 'projects', 'backend', 'handoffs', 'handoff-shared.md'), 'utf8'),
      ).meta
      expect(meta.status).toBe('consumed')
      // the other project's same-named handoff is untouched
      const other = parseDoc(
        readFileSync(join(vault, 'projects', 'frontend', 'handoffs', 'handoff-shared.md'), 'utf8'),
      ).meta
      expect(other.status).toBe('open')
    })
  })

  describe('setHandoffStatus (state machine)', () => {
    let path: string

    beforeEach(() => {
      path = writeOpenHandoff(vault, 'ai-engine', 'backend', 'lifecycle')
    })

    it('accept writes exactly status + accepted_by/at, stamped v2, and emits handoff.status', () => {
      const events: Array<{ kind: string; payload: LoredexEventMap['handoff.status'] }> = []
      setLoredexEmitter({
        emit: (kind, payload) =>
          events.push({ kind, payload: payload as LoredexEventMap['handoff.status'] }),
      })
      const receipt = setHandoffStatus(vault, config, 'lifecycle', { to: 'accepted' }, IDENTITY)
      const meta = parseDoc(readFileSync(path, 'utf8')).meta
      expect(meta.status).toBe('accepted')
      expect(meta.accepted_by).toBe('Rana <rana@nimbus.dev>')
      expect(meta.accepted_at).toBe(receipt.at)
      expect(meta.loredex_schema).toBe(LOREDEX_SCHEMA)
      expect(meta.declined_by).toBeUndefined()
      expect(meta.snoozed_by).toBeUndefined()
      expect(receipt.before.status).toBe('open')
      expect(receipt.after).toEqual(meta)
      expect(events).toContainEqual({
        kind: 'handoff.status',
        payload: {
          id: 'lifecycle',
          path,
          from: 'open',
          to: 'accepted',
          by: IDENTITY,
          at: receipt.at,
        },
      })
    })

    it('decline requires a reason and records attribution', () => {
      expect(() =>
        setHandoffStatus(vault, config, 'lifecycle', { to: 'declined', reason: '  ' }, IDENTITY),
      ).toThrow(/decline requires a reason/)
      setHandoffStatus(
        vault,
        config,
        'lifecycle',
        { to: 'declined', reason: 'wrong team' },
        IDENTITY,
      )
      const meta = parseDoc(readFileSync(path, 'utf8')).meta
      expect(meta.status).toBe('declined')
      expect(meta.declined_reason).toBe('wrong team')
      expect(meta.declined_by).toContain('Rana')
      expect(meta.declined_at).toBeTruthy()
    })

    it('snooze requires a YYYY-MM-DD date', () => {
      expect(() =>
        setHandoffStatus(vault, config, 'lifecycle', { to: 'snoozed', until: 'soon' }, IDENTITY),
      ).toThrow(/YYYY-MM-DD/)
      setHandoffStatus(vault, config, 'lifecycle', { to: 'snoozed', until: '2099-01-01' }, IDENTITY)
      const meta = parseDoc(readFileSync(path, 'utf8')).meta
      expect(meta).toMatchObject({ status: 'snoozed', snoozed_until: '2099-01-01' })
      expect(meta.snoozed_by).toContain('Rana')
    })

    it('reopen removes snooze fields but keeps decline attribution (history)', () => {
      setHandoffStatus(vault, config, 'lifecycle', { to: 'declined', reason: 'later' }, IDENTITY)
      setHandoffStatus(vault, config, 'lifecycle', { to: 'open' }, IDENTITY)
      setHandoffStatus(vault, config, 'lifecycle', { to: 'snoozed', until: '2099-01-01' }, IDENTITY)
      const reopened = setHandoffStatus(vault, config, 'lifecycle', { to: 'open' }, IDENTITY)
      expect(reopened.after.status).toBe('open')
      expect(reopened.after.snoozed_until).toBeUndefined()
      expect(reopened.after.snoozed_by).toBeUndefined()
      expect(reopened.after.snoozed_at).toBeUndefined()
      expect(reopened.after.declined_by).toContain('Rana') // history kept
      expect(reopened.after.declined_reason).toBe('later')
    })

    it('snoozed handoffs can be accepted (behaves as open)', () => {
      setHandoffStatus(vault, config, 'lifecycle', { to: 'snoozed', until: '2099-01-01' }, IDENTITY)
      const receipt = setHandoffStatus(vault, config, 'lifecycle', { to: 'accepted' }, IDENTITY)
      expect(receipt.after.status).toBe('accepted')
    })

    it('illegal transitions throw ILLEGAL_TRANSITION: consumed is terminal, reopen from accepted', () => {
      const illegal = (from: string, move: Parameters<typeof setHandoffStatus>[3]) => {
        writeFileSync(
          path,
          serializeDoc({
            meta: { ...parseDoc(readFileSync(path, 'utf8')).meta, status: from },
            body: '# h\n',
          }),
        )
        try {
          setHandoffStatus(vault, config, 'lifecycle', move, IDENTITY)
          expect.unreachable(`${from} → ${move.to} should be illegal`)
        } catch (error) {
          expect((error as HandoffError).code).toBe('ILLEGAL_TRANSITION')
        }
      }
      illegal('consumed', { to: 'accepted' })
      illegal('consumed', { to: 'open' })
      illegal('consumed', { to: 'declined', reason: 'x' })
      illegal('consumed', { to: 'snoozed', until: '2099-01-01' })
      illegal('accepted', { to: 'open' }) // reopen from accepted
      illegal('accepted', { to: 'declined', reason: 'x' })
      illegal('open', { to: 'open' }) // reopen only from declined|snoozed
    })

    it('accepted → consumed stays legal through consumeHandoff (skip-accept CLI path too)', () => {
      setHandoffStatus(vault, config, 'lifecycle', { to: 'accepted' }, IDENTITY)
      const receipt = consumeHandoff(vault, config, 'lifecycle', IDENTITY)
      expect(receipt.after.status).toBe('consumed')
      expect(receipt.after.accepted_by).toContain('Rana') // attribution preserved
    })
  })

  describe('annotateHandoff', () => {
    it('writes a NEW comment note in the handoff dir and never mutates the handoff', () => {
      const path = writeOpenHandoff(vault, 'ai-engine', 'backend', 'to-comment')
      const original = readFileSync(path, 'utf8')
      const result = annotateHandoff(
        vault,
        config,
        'to-comment',
        { title: 'Heads up', body: 'The auth note is the important one.' },
        IDENTITY,
      )
      expect(readFileSync(path, 'utf8')).toBe(original)
      expect(result.path).toBe(
        join(vault, 'projects', 'backend', 'handoffs', `${TODAY}-comment-heads-up.md`),
      )
      const doc = parseDoc(readFileSync(result.path, 'utf8'))
      expect(doc.meta).toMatchObject({
        type: 'comment',
        replies_to: 'to-comment',
        loredex_schema: 2,
      })
      expect(doc.meta.status).toBeUndefined()
      expect(doc.body).toContain('The auth note is the important one.')
      // comments never show up as board cards
      const cards = listHandoffs(vault, { direction: 'inbox', project: 'backend' })
      expect(cards.map((card) => card.id)).toEqual(['to-comment'])
    })
  })

  describe('routeFile', () => {
    it('plans + executes in one call, parity with the router (frontmatter wins, no LLM)', () => {
      const src = join(sandbox, 'finding.md')
      writeFileSync(
        src,
        '---\nproject: backend\ntopic: api\ntype: finding\ndate: "2026-07-03"\n---\n# finding\n',
      )
      const { written } = routeFile(vault, config, src, { mode: 'move' })
      expect(written).toHaveLength(1)
      expect(written[0]).toContain(join('projects', 'backend', 'api'))
      expect(existsSync(src)).toBe(false) // move deletes the source
      const meta = parseDoc(readFileSync(written[0] as string, 'utf8')).meta
      expect(meta.loredex).toBe('routed')
      expect(meta.loredex_schema).toBe(LOREDEX_SCHEMA)
    })

    it('previewRoute shows the executor-exact destination + frontmatter without writing', () => {
      const src = join(sandbox, 'preview-finding.md')
      writeFileSync(
        src,
        '---\nproject: backend\ntopic: api\ntype: finding\ndate: "2026-07-03"\n---\n# finding\n',
      )
      const preview = previewRoute(vault, src, { mode: 'move' })
      expect(preview.destination).toContain(join('projects', 'backend', 'api'))
      expect(preview.meta.loredex).toBe('routed')
      expect(preview.meta.loredex_schema).toBe(LOREDEX_SCHEMA)
      // read-only: nothing written, no directory invented, source untouched
      expect(existsSync(preview.destination)).toBe(false)
      expect(existsSync(join(vault, 'projects', 'backend', 'api'))).toBe(false)
      expect(parseDoc(readFileSync(src, 'utf8')).meta.loredex).toBeUndefined()

      // executing the same options lands exactly where the preview said
      const { written } = routeFile(vault, config, src, { mode: 'move' })
      expect(written).toEqual([preview.destination])
    })

    it('previewRoute suffixes collisions exactly like the executor', () => {
      // fixture note 2026-07-01-endpoints.md exists in ai-engine/api; collide with it
      const clash = join(sandbox, 'endpoints.md')
      writeFileSync(
        clash,
        '---\nproject: ai-engine\ntopic: api\ntype: finding\ndate: "2026-07-01"\n---\n# clash\n',
      )
      const preview = previewRoute(vault, clash, { mode: 'copy', projectRoot: sandbox })
      expect(preview.destination.endsWith('2026-07-01-endpoints-2.md')).toBe(true)
    })

    it('previewRoute without a project falls back to research/ — the ambiguity signal', () => {
      const src = join(sandbox, 'orphan.md')
      writeFileSync(src, '# no frontmatter at all\n')
      const preview = previewRoute(vault, src, { mode: 'move' })
      expect(preview.meta.project).toBeFalsy()
      expect(preview.destination).toContain(join(vault, 'research'))
    })

    it('copy mode stamps the original as routed and keeps it in place', () => {
      const src = join(sandbox, 'analysis.md')
      writeFileSync(
        src,
        '---\nproject: backend\ntopic: api\ntype: analysis\ndate: "2026-07-03"\n---\n# analysis\n',
      )
      const { written } = routeFile(vault, config, src, {
        mode: 'copy',
        projectName: 'backend',
        projectRoot: sandbox,
      })
      expect(written).toHaveLength(1)
      expect(existsSync(src)).toBe(true)
      expect(parseDoc(readFileSync(src, 'utf8')).meta.loredex).toBe('routed')
    })
  })

  describe('schema v2 degradation (v1 engine on a v2 vault)', () => {
    it('a v1-style writer (spread meta) round-trips every v2 field losslessly', () => {
      const path = writeOpenHandoff(vault, 'ai-engine', 'backend', 'roundtrip')
      setHandoffStatus(vault, config, 'roundtrip', { to: 'accepted' }, IDENTITY)

      // simulate the v1 consumeHandoff writer: parse, spread, add consume fields, serialize
      const doc = parseDoc(readFileSync(path, 'utf8'))
      const v1After = {
        ...doc.meta,
        status: 'consumed',
        consumed_by: 'Old CLI <old@nimbus.dev>',
        consumed_at: '2026-07-10T00:00:00.000Z',
        loredex_schema: 1, // the old engine stamps what it knows
      }
      writeFileSync(path, serializeDoc({ meta: v1After, body: doc.body }))

      const reread = parseDoc(readFileSync(path, 'utf8')).meta
      expect(reread.status).toBe('consumed') // legally lands on consumed
      expect(reread.accepted_by).toBe('Rana <rana@nimbus.dev>') // v2 fields preserved
      expect(reread.accepted_at).toBeTruthy()
      expect(reread.kind).toBeUndefined() // absent = documented default (delivery) in readers
      const [card] = listHandoffs(vault, { direction: 'inbox', project: 'backend' })
      expect(card?.kind).toBe('delivery')
    })

    it('scaffoldVault declares the engine schema in .loredex/engine.json', () => {
      const fresh = join(sandbox, 'fresh-vault')
      scaffoldVault(fresh)
      const engine = JSON.parse(readFileSync(join(fresh, '.loredex', 'engine.json'), 'utf8'))
      expect(engine).toEqual({ schema: LOREDEX_SCHEMA })
    })

    it('expired snoozes derive an expired flag and sort with open cards — never auto-written', () => {
      writeOpenHandoff(vault, 'ai-engine', 'backend', 'snoozed-past')
      writeOpenHandoff(vault, 'ai-engine', 'backend', 'still-open')
      setHandoffStatus(
        vault,
        config,
        'snoozed-past',
        { to: 'snoozed', until: '2020-01-01' },
        IDENTITY,
      )
      const cards = listHandoffs(vault, { direction: 'inbox', project: 'backend' })
      const snoozed = cards.find((card) => card.id === 'snoozed-past')
      expect(snoozed?.expired).toBe(true)
      expect(snoozed?.status).toBe('snoozed') // frontmatter untouched — no auto-write
      // sorts in the open group (after the true open card of the same date)
      expect(cards.map((card) => card.id)).toEqual(['still-open', 'snoozed-past'])
    })

    it('stampSchema now writes v2 everywhere', () => {
      expect(LOREDEX_SCHEMA).toBe(2)
      expect(stampSchema({}).loredex_schema).toBe(2)
    })
  })
})
