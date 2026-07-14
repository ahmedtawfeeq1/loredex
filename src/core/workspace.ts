import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { load as yamlLoad } from 'js-yaml'
import { z } from 'zod'
import { MARKER_END, MARKER_START } from '../templates'
import { scanClient } from './agent-ops'
import { loadProducts, productOf } from './products'

/**
 * Workspace materializer: `projects/<client>/workspace.yml` is the committed,
 * secret-free declaration of a client's agent tooling. `materializeWorkspace`
 * turns it into the local, gitignored files agents actually read — `.mcp.json`,
 * `.claude/settings.json`, `AGENTS.md` — expanding `${VAR}` from the environment
 * at generate time so secrets never touch git. Idempotent and merge-preserving:
 * foreign `.mcp.json` servers and `.claude` settings survive regeneration.
 */

const mcpServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
})

export const workspaceSchema = z.object({
  mcp: z.record(z.string(), mcpServerSchema).default({}),
  plugins: z.object({ claude: z.array(z.string()).default([]) }).default({ claude: [] }),
  skills: z.array(z.string()).default([]),
})

export type WorkspaceSpec = z.infer<typeof workspaceSchema>

export interface WorkspaceResult {
  /** files written this run (paths relative to the client dir) */
  wrote: string[]
  /** check mode: files whose regenerated content differs from disk */
  wouldChange: string[]
  /** ${VAR} names referenced but absent from the environment */
  missingEnv: string[]
  ok: boolean
}

/** Parse + validate workspace.yml. Throws with an actionable message. */
export function loadWorkspaceSpec(clientDir: string): WorkspaceSpec {
  const path = join(clientDir, 'workspace.yml')
  if (!existsSync(path)) {
    throw new Error(`no workspace.yml in ${clientDir} — scaffold one with \`loredex new client\``)
  }
  let raw: unknown
  try {
    raw = yamlLoad(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(
      `workspace.yml is not valid YAML: ${error instanceof Error ? error.message : error}`,
    )
  }
  const parsed = workspaceSchema.safeParse(raw ?? {})
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new Error(
      `workspace.yml invalid at ${issue?.path.join('.') || '(root)'}: ${issue?.message}`,
    )
  }
  return parsed.data
}

const ENV_REF = /\$\{([A-Z0-9_]+)\}/g

/**
 * Expand `${VAR}` references in mcp env values ONLY (the sanctioned secret slot).
 * Missing vars are collected, and their values left unexpanded — never partial.
 */
export function expandEnvRefs(
  spec: WorkspaceSpec,
  env: NodeJS.ProcessEnv,
): { spec: WorkspaceSpec; missing: string[] } {
  const missing = new Set<string>()
  const mcp: WorkspaceSpec['mcp'] = {}
  for (const [name, server] of Object.entries(spec.mcp)) {
    const expanded: Record<string, string> = {}
    for (const [key, value] of Object.entries(server.env ?? {})) {
      const refs = [...value.matchAll(ENV_REF)].map((m) => m[1] as string)
      const absent = refs.filter((r) => env[r] === undefined)
      if (absent.length > 0) {
        for (const r of absent) missing.add(r)
        expanded[key] = value
      } else {
        expanded[key] = value.replace(ENV_REF, (_, r: string) => env[r] ?? '')
      }
    }
    mcp[name] = { ...server, ...(server.env ? { env: expanded } : {}) }
  }
  return { spec: { ...spec, mcp }, missing: [...missing].sort() }
}

/** Deterministic stringify: sorted keys at every level so --check diffs are byte-stable. */
function stableJson(value: unknown): string {
  const sortValue = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortValue)
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        out[key] = sortValue((v as Record<string, unknown>)[key])
      }
      return out
    }
    return v
  }
  return `${JSON.stringify(sortValue(value), null, 2)}\n`
}

function renderMcpJson(clientDir: string, spec: WorkspaceSpec): string {
  const path = join(clientDir, '.mcp.json')
  let json: { mcpServers?: Record<string, unknown> } = {}
  if (existsSync(path)) {
    try {
      json = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      json = {} // unreadable local generated file — regenerate cleanly
    }
  }
  json.mcpServers ??= {}
  for (const [name, server] of Object.entries(spec.mcp)) {
    json.mcpServers[name] = {
      command: server.command,
      ...(server.args ? { args: server.args } : {}),
      ...(server.env && Object.keys(server.env).length > 0 ? { env: server.env } : {}),
    }
  }
  return stableJson(json)
}

function renderClaudeSettings(clientDir: string, spec: WorkspaceSpec): string {
  const path = join(clientDir, '.claude', 'settings.json')
  let json: { enabledPlugins?: Record<string, boolean> } = {}
  if (existsSync(path)) {
    try {
      json = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      json = {}
    }
  }
  json.enabledPlugins ??= {}
  for (const plugin of spec.plugins.claude) {
    json.enabledPlugins[plugin] = true
  }
  return stableJson(json)
}

function renderAgentsMd(
  clientDir: string,
  client: string,
  manager: string | null,
  spec: WorkspaceSpec,
  roster: string,
): string {
  const block = `${MARKER_START}
## Client workspace (loredex agent-ops dex)

You are working inside the **${client}** client${manager ? ` (manager: ${manager})` : ''}.
Definition files are the source of truth — read them before acting:

${roster}
${spec.skills.length > 0 ? `\nSkills expected here: ${spec.skills.join(', ')}\n` : ''}
This file is GENERATED from workspace.yml by \`loredex workspace ${client}\` — edit
workspace.yml, not this block.
${MARKER_END}
`
  const path = join(clientDir, 'AGENTS.md')
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8')
    const start = existing.indexOf(MARKER_START)
    const end = existing.indexOf(MARKER_END)
    if (start !== -1 && end !== -1) {
      return existing.slice(0, start) + block.trimEnd() + existing.slice(end + MARKER_END.length)
    }
    return `${existing.replace(/\n?$/, '\n')}\n${block}`
  }
  return `# Agent instructions\n\n${block}`
}

export function materializeWorkspace(
  vaultPath: string,
  client: string,
  opts?: { check?: boolean; env?: NodeJS.ProcessEnv },
): WorkspaceResult {
  const info = scanClient(vaultPath, client)
  if (!info) throw new Error(`no client "${client}" in this dex`)
  const clientDir = join(vaultPath, 'projects', client)
  const raw = loadWorkspaceSpec(clientDir)
  const { spec, missing } = expandEnvRefs(raw, opts?.env ?? process.env)

  const roster = [
    ...info.pipelines.map(
      (p) => `- pipeline \`${p.name}\` — ${p.stages.length} stage(s): pipelines/${p.name}/`,
    ),
    ...info.agents.map((a) => `- agent \`${a.name}\`: agents/${a.name}/`),
  ].join('\n')

  const outputs: Array<[string, string]> = [
    ['.mcp.json', renderMcpJson(clientDir, spec)],
    [join('.claude', 'settings.json'), renderClaudeSettings(clientDir, spec)],
    ['AGENTS.md', renderAgentsMd(clientDir, client, info.manager, spec, roster)],
  ]

  const wrote: string[] = []
  const wouldChange: string[] = []
  for (const [rel, content] of outputs) {
    const path = join(clientDir, rel)
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null
    if (current === content) continue
    if (opts?.check) {
      wouldChange.push(rel)
    } else {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content)
      wrote.push(rel)
    }
  }
  return {
    wrote,
    wouldChange,
    missingEnv: missing,
    ok: wouldChange.length === 0 && missing.length === 0,
  }
}
