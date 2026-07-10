/**
 * Injectable typed event emitter (PR-8 subset) — hosts that embed loredex (the desktop
 * app's core host) inject an emitter to observe engine activity; the default is a no-op
 * so CLI behavior is byte-identical when nothing is injected.
 */

/** Who performed a vault write — app identity profile or ambient git config. */
export interface Identity {
  name: string
  email: string
}

/** Engine event payloads, keyed by kind. */
export interface LoredexEventMap {
  route: { paths: string[] }
  store: { path: string }
  consume: { handoffId: string; path: string; by: Identity; at: string }
  sync: { pulled: boolean; pushed: boolean }
  'handoff.created': { id: string; path: string; from: string; to: string; kind: string }
  'handoff.status': {
    id: string
    path: string
    /** status before / after the transition */
    from: string
    to: string
    by: Identity
    at: string
  }
}

export type LoredexEventKind = keyof LoredexEventMap

export interface LoredexEmitter {
  emit<K extends LoredexEventKind>(kind: K, payload: LoredexEventMap[K]): void
}

/** Default emitter: emits nothing — existing CLI paths are unchanged. */
export const noopEmitter: LoredexEmitter = { emit: () => {} }

let emitter: LoredexEmitter = noopEmitter

/** Inject an emitter (pass null to restore the no-op default). */
export function setLoredexEmitter(next: LoredexEmitter | null): void {
  emitter = next ?? noopEmitter
}

/** Engine-internal: emit through whatever is injected; emitter failures never break a write. */
export function emitLoredexEvent<K extends LoredexEventKind>(
  kind: K,
  payload: LoredexEventMap[K],
): void {
  try {
    emitter.emit(kind, payload)
  } catch {
    // an observer must never break a vault operation
  }
}
