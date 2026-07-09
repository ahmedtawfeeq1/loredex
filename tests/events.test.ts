import { afterEach, describe, expect, it } from 'vitest'
import {
  emitLoredexEvent,
  type LoredexEventKind,
  noopEmitter,
  setLoredexEmitter,
} from '../src/core/events'

describe('injectable event emitter', () => {
  afterEach(() => setLoredexEmitter(null))

  it('default no-op emitter emits nothing and never throws', () => {
    expect(() => emitLoredexEvent('sync', { pulled: false, pushed: false })).not.toThrow()
    expect(() => noopEmitter.emit('store', { path: '/x.md' })).not.toThrow()
  })

  it('injected emitter receives events in order with typed payloads', () => {
    const seen: Array<{ kind: LoredexEventKind; payload: unknown }> = []
    setLoredexEmitter({ emit: (kind, payload) => seen.push({ kind, payload }) })
    emitLoredexEvent('store', { path: '/vault/a.md' })
    emitLoredexEvent('sync', { pulled: true, pushed: false })
    expect(seen).toEqual([
      { kind: 'store', payload: { path: '/vault/a.md' } },
      { kind: 'sync', payload: { pulled: true, pushed: false } },
    ])
  })

  it('a throwing observer never breaks the caller', () => {
    setLoredexEmitter({
      emit: () => {
        throw new Error('observer bug')
      },
    })
    expect(() => emitLoredexEvent('route', { paths: [] })).not.toThrow()
  })

  it('setLoredexEmitter(null) restores the no-op', () => {
    const seen: unknown[] = []
    setLoredexEmitter({ emit: (kind) => seen.push(kind) })
    setLoredexEmitter(null)
    emitLoredexEvent('sync', { pulled: false, pushed: false })
    expect(seen).toEqual([])
  })
})
