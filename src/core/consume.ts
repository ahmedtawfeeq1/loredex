import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Config } from './config'
import { emitLoredexEvent, type Identity } from './events'
import { LOREDEX_SCHEMA, type Meta, parseDoc, serializeDoc, stampSchema } from './frontmatter'
import { resolveHandoffPath } from './handoff'
import { gitAutoCommit, gitPullPush } from './router'
import { walkMarkdown } from './scan'
import { stampEngineSchema } from './vault'

export type { Identity }

/** Exactly what a consume changed — enough to render a receipt without re-reading the note. */
export interface ConsumeReceipt {
  handoffId: string
  path: string
  by: Identity
  /** ISO timestamp of the transition (also written to frontmatter as consumed_at) */
  at: string
  before: Meta
  after: Meta
  pushed: boolean
}

/** The CLI's identity source: ambient git config of the vault repo. Hosts pass their own. */
export function ambientGitIdentity(cwd: string): Identity {
  const read = (key: string): string => {
    try {
      return execFileSync('git', ['config', key], { cwd, encoding: 'utf8' }).trim()
    } catch {
      return ''
    }
  }
  return { name: read('user.name') || 'unknown', email: read('user.email') || 'unknown' }
}

/**
 * Mark a handoff consumed: stamps who/when (+ `loredex_schema`) into the note's
 * frontmatter, commits, and best-effort syncs. The one consume writer shared by
 * CLI, MCP, and embedding hosts. Resolves `id` via the shared finder — qualified
 * `"<project>/<name>"` ids disambiguate collisions; unknown/ambiguous ids throw.
 */
export function consumeHandoff(
  vaultPath: string,
  config: Config,
  id: string,
  identity: Identity,
  opts: { project?: string } = {},
): ConsumeReceipt {
  const target = resolveHandoffPath(vaultPath, id, opts)
  const doc = parseDoc(readFileSync(target, 'utf8'))
  const before = { ...doc.meta }
  const at = new Date().toISOString()
  const after = stampSchema({
    ...doc.meta,
    status: 'consumed',
    consumed_by: `${identity.name} <${identity.email}>`,
    consumed_at: at,
  })
  writeFileSync(target, serializeDoc({ meta: after, body: doc.body }))
  stampEngineSchema(vaultPath)
  const name = basename(target, '.md')
  gitAutoCommit(vaultPath, config, `loredex: consume handoff ${name}`)
  const { pushed } = gitPullPush(vaultPath)
  emitLoredexEvent('consume', { handoffId: name, path: target, by: identity, at })
  return { handoffId: name, path: target, by: identity, at, before, after, pushed }
}

export interface VaultSchemaStatus {
  /** highest schema any vault note declares — null when the vault predates versioning */
  declared: number | null
  supported: number
  /** false when the vault declares a newer schema than this engine understands */
  ok: boolean
}

/** Compare the schema the vault's notes declare against what this engine supports. */
export function vaultSchemaStatus(vaultPath: string): VaultSchemaStatus {
  let declared: number | null = null
  for (const file of walkMarkdown(join(vaultPath, 'projects'))) {
    try {
      const schema = parseDoc(readFileSync(file, 'utf8')).meta.loredex_schema
      if (typeof schema === 'number' && (declared === null || schema > declared)) {
        declared = schema
      }
    } catch {
      // unreadable — skip
    }
  }
  return {
    declared,
    supported: LOREDEX_SCHEMA,
    ok: declared === null || declared <= LOREDEX_SCHEMA,
  }
}
