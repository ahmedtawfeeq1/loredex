import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { STAGE_FILE_SUFFIXES, type StageInfo, scanClient, stageNumberingGaps } from './agent-ops'
import { setClientTags } from './clients'
import { setProduct } from './products'
import { slugify } from './vault'

/**
 * Scaffolding for agent-ops dexes. Writers are idempotent (existing files are never
 * overwritten) and every stage mutation keeps the strict contiguous 01..N numbering
 * invariant — inserts renumber later stages via `git mv` when the dex is a git repo.
 */

const GITIGNORE_GUARD = '# loredex: generated workspace files'

const GITIGNORE_BLOCK = `${GITIGNORE_GUARD} (regenerate with \`loredex workspace <client>\`)
.mcp.json
.claude/
AGENTS.md
`

const WORKSPACE_TEMPLATE = `# Agent tooling for this client — committed, secret-free.
# \`loredex workspace <client>\` generates .mcp.json / .claude/settings.json / AGENTS.md
# from this file. Secrets stay in your environment: \${VAR} is expanded at generate time.
#
# mcp:
#   crm-bridge:
#     command: npx
#     args: [-y, some-mcp-client]
#     env: { CRM_TOKEN: "\${CRM_TOKEN_BRIGHTSMILE}" }
# plugins:
#   claude: [some-plugin@some-marketplace]
# skills: []
`

function personaTemplate(client: string, kind: 'pipeline' | 'agent', name: string): string {
  return `---
client: ${client}
${kind}: ${name}
type: persona
---

# Persona

<!-- Who this AI is: name, role, tone, language(s), boundaries. -->
`
}

function instructionsTemplate(client: string, kind: 'pipeline' | 'agent', name: string): string {
  return `---
client: ${client}
${kind}: ${name}
type: instructions
---

# Instructions

<!-- Behavior that applies across every conversation, before any stage logic. -->
`
}

/**
 * Stage templates.
 *
 * `_actions.yaml` / `_variables.yaml` / `pipeline.yaml` / `stage.yaml` mirror
 * PLATFORM state. A local scaffold cannot know a stage's platform id or order,
 * so it writes a commented placeholder rather than inventing values that would
 * read as real config and get pushed.
 */
function stageFileTemplate(
  client: string,
  pipeline: string,
  stage: string,
  nn: string,
  suffix: (typeof STAGE_FILE_SUFFIXES)[number],
): string {
  if (suffix === 'stage.yaml') {
    return `# Stage config for "${stage}" of "${pipeline}".
# Mirrors the platform — \`id\` is filled in by the first pull after this stage
# exists there. Until then this stage is local-only.
name: ${stage}
order: ${Number.parseInt(nn, 10)}
enter_condition: |-
  # When a conversation enters this stage.
`
  }
  return `---
client: ${client}
pipeline: ${pipeline}
stage: ${stage}
type: instructions
---

# Stage instructions

<!-- How the AI behaves inside this stage. -->
`
}

function writeIfMissing(path: string, content: string): void {
  if (!existsSync(path)) writeFileSync(path, content)
}

function ensureGitignoreBlock(clientAbs: string): void {
  const path = join(clientAbs, '.gitignore')
  if (!existsSync(path)) {
    writeFileSync(path, GITIGNORE_BLOCK)
  } else if (!readFileSync(path, 'utf8').includes(GITIGNORE_GUARD)) {
    writeFileSync(path, `${readFileSync(path, 'utf8').replace(/\n?$/, '\n')}${GITIGNORE_BLOCK}`)
  }
}

export function scaffoldClient(
  vaultPath: string,
  name: string,
  opts?: { manager?: string; tags?: string[] },
): { slug: string; dir: string } {
  const slug = slugify(name)
  const clientAbs = join(vaultPath, 'projects', slug)
  for (const dir of [
    'pipelines',
    'agents',
    'knowledge_tables',
    'automation_workflows',
    '_inbox',
    '_randoms',
  ]) {
    mkdirSync(join(clientAbs, dir), { recursive: true })
  }
  writeIfMissing(join(clientAbs, 'workspace.yml'), WORKSPACE_TEMPLATE)
  ensureGitignoreBlock(clientAbs)
  if (opts?.manager) setProduct(vaultPath, slug, opts.manager)
  if (opts?.tags && opts.tags.length > 0) setClientTags(vaultPath, slug, opts.tags)
  return { slug, dir: `projects/${slug}` }
}

function scaffoldUnit(
  vaultPath: string,
  clientName: string,
  kind: 'pipeline' | 'agent',
  name: string,
): { slug: string; dir: string } {
  const client = slugify(clientName)
  const clientAbs = join(vaultPath, 'projects', client)
  if (!existsSync(clientAbs))
    throw new Error(`no client "${client}" — run \`loredex new client\` first`)
  const slug = slugify(name)
  const group = kind === 'pipeline' ? 'pipelines' : 'agents'
  const unitAbs = join(clientAbs, group, slug)
  mkdirSync(unitAbs, { recursive: true })
  writeIfMissing(join(unitAbs, '_persona.md'), personaTemplate(client, kind, slug))
  writeIfMissing(join(unitAbs, '_instructions.md'), instructionsTemplate(client, kind, slug))
  // _actions.yaml / _variables.yaml / pipeline.yaml are written by the pull, from
  // the platform. Scaffolding empty ones would make an unpulled unit look pulled.
  if (kind === 'pipeline') mkdirSync(join(unitAbs, 'stages'), { recursive: true })
  return { slug, dir: `projects/${client}/${group}/${slug}` }
}

export function scaffoldPipeline(vaultPath: string, client: string, name: string): { dir: string } {
  return scaffoldUnit(vaultPath, client, 'pipeline', name)
}

export function scaffoldAgent(vaultPath: string, client: string, name: string): { dir: string } {
  return scaffoldUnit(vaultPath, client, 'agent', name)
}

function isGitDex(vaultPath: string): boolean {
  return existsSync(join(vaultPath, '.git'))
}

function gitMv(vaultPath: string, fromAbs: string, toAbs: string): void {
  if (isGitDex(vaultPath)) {
    try {
      execFileSync('git', ['mv', fromAbs, toAbs], { cwd: vaultPath, stdio: 'ignore' })
      return
    } catch {
      // untracked paths (or no git binary) fall back to a plain rename
    }
  }
  renameSync(fromAbs, toAbs)
}

/** Renumber a stage folder. Stage FILES carry no NN prefix, so only the dir moves. */
function renameStage(vaultPath: string, stagesAbs: string, stage: StageInfo, newNn: string): void {
  gitMv(vaultPath, join(stagesAbs, stage.dir), join(stagesAbs, `${newNn}_${stage.slug}`))
}

/**
 * Create the next stage (append), or insert with `--before`/`--after NN` — later
 * stages renumber (descending, so renames never collide). Refuses when the current
 * numbering already has gaps: fix those first so renumbering stays predictable.
 */
export function scaffoldStage(
  vaultPath: string,
  clientName: string,
  pipelineName: string,
  name: string,
  opts?: { before?: string; after?: string },
): { dir: string; renumbered: Array<{ from: string; to: string }> } {
  const client = slugify(clientName)
  const pipeline = slugify(pipelineName)
  const info = scanClient(vaultPath, client)
  if (!info) throw new Error(`no client "${client}" — run \`loredex new client\` first`)
  const unit = info.pipelines.find((p) => p.name === pipeline)
  if (!unit) throw new Error(`no pipeline "${pipeline}" under client "${client}"`)
  const gaps = stageNumberingGaps(unit.stages)
  if (gaps.length > 0) {
    throw new Error(
      `stage numbering has gaps (missing ${gaps.join(', ')}) — run \`loredex doctor\` and fix before inserting`,
    )
  }

  const stages = [...unit.stages].sort((a, b) => a.nn.localeCompare(b.nn))
  let insertAt = stages.length + 1
  if (opts?.before || opts?.after) {
    const anchor = (opts.before ?? opts.after ?? '').padStart(2, '0')
    if (!stages.some((s) => s.nn === anchor)) {
      throw new Error(`no stage ${anchor} in pipeline "${pipeline}"`)
    }
    insertAt = opts.before ? Number.parseInt(anchor, 10) : Number.parseInt(anchor, 10) + 1
  }

  const stagesAbs = join(vaultPath, 'projects', client, 'pipelines', pipeline, 'stages')
  const renumbered: Array<{ from: string; to: string }> = []
  const toShift = stages.filter((s) => Number.parseInt(s.nn, 10) >= insertAt)
  for (const stage of [...toShift].sort((a, b) => b.nn.localeCompare(a.nn))) {
    const newNn = String(Number.parseInt(stage.nn, 10) + 1).padStart(2, '0')
    renameStage(vaultPath, stagesAbs, stage, newNn)
    renumbered.push({ from: stage.dir, to: `${newNn}_${stage.slug}` })
  }

  const nn = String(insertAt).padStart(2, '0')
  const slug = slugify(name)
  const dirName = `${nn}_${slug}`
  const stageAbs = join(stagesAbs, dirName)
  mkdirSync(stageAbs, { recursive: true })
  for (const suffix of STAGE_FILE_SUFFIXES) {
    writeIfMissing(join(stageAbs, suffix), stageFileTemplate(client, pipeline, slug, nn, suffix))
  }
  return { dir: `projects/${client}/pipelines/${pipeline}/stages/${dirName}`, renumbered }
}

/** Container dirs that are valid-but-empty — a .gitkeep makes the structure
 *  git-tracked and identical across clients (git ignores empty dirs). */
const KEEP_DIRS = ['knowledge_tables', 'automation_workflows', '_inbox', '_randoms'] as const

const GITKEEP = `# Keeps this folder in git so every client has the same structure.
# Delete once this folder holds real files.
`

export interface NormalizeOptions {
  /** default unit names created only when the client has none (idempotent) */
  pipeline?: string
  stage?: string
  agent?: string
}

export interface NormalizeResult {
  slug: string
  /** vault-relative paths created this run (dirs get a trailing /) */
  created: string[]
  /** true when nothing had to be added — the client was already canonical */
  alreadyCanonical: boolean
}

/**
 * Bring a client up to the canonical agent-ops structure without ever
 * clobbering real content (writeIfMissing throughout). Ensures the six
 * top-level dirs, a .gitkeep in each empty container so the layout is
 * git-tracked and uniform, and — when the client has NO pipeline / NO agent —
 * a starter pipeline (persona + instructions + stages/NN_<stage>/…) and a
 * starter agent so the nested template exists everywhere. Re-running is a
 * no-op once canonical.
 */
export function normalizeClient(
  vaultPath: string,
  clientName: string,
  opts?: NormalizeOptions,
): NormalizeResult {
  const slug = slugify(clientName)
  const clientAbs = join(vaultPath, 'projects', slug)
  if (!existsSync(clientAbs)) {
    throw new Error(`no client "${slug}" — run \`loredex new client\` first`)
  }
  const created: string[] = []
  const track = (abs: string, rel: string): void => {
    if (!existsSync(abs)) created.push(rel)
  }

  // 1. the six top-level dirs (mkdir is silent if present) + workspace/.gitignore
  for (const dir of ['pipelines', 'agents', ...KEEP_DIRS]) {
    track(join(clientAbs, dir), `projects/${slug}/${dir}/`)
    mkdirSync(join(clientAbs, dir), { recursive: true })
  }
  track(join(clientAbs, 'workspace.yml'), `projects/${slug}/workspace.yml`)
  writeIfMissing(join(clientAbs, 'workspace.yml'), WORKSPACE_TEMPLATE)
  ensureGitignoreBlock(clientAbs)

  // 2. .gitkeep in empty containers so the structure survives a commit
  for (const dir of KEEP_DIRS) {
    const dirAbs = join(clientAbs, dir)
    const nonKeep = listFilesLite(dirAbs).filter((n) => n !== '.gitkeep')
    if (nonKeep.length === 0) {
      const keep = join(dirAbs, '.gitkeep')
      track(keep, `projects/${slug}/${dir}/.gitkeep`)
      writeIfMissing(keep, GITKEEP)
    }
  }

  // 3. a starter pipeline + agent, ONLY when explicitly asked for.
  //
  // This used to happen unconditionally, which put a `pipelines/main/` and an
  // `agents/assistant/` in every client that had none. Both were empty
  // templates that no platform pipeline corresponds to, so they never became
  // anything — they just sat there failing the schema lint and making a clean
  // client look broken. Normalising a client's FOLDERS should not invent
  // CONTENT for it. Pass `pipeline`/`agent` to opt in.
  const info = scanClient(vaultPath, slug)
  if (info && opts?.pipeline && info.pipelines.length === 0) {
    const pipeline = slugify(opts.pipeline)
    const unit = scaffoldUnit(vaultPath, slug, 'pipeline', pipeline)
    created.push(`${unit.dir}/`)
    scaffoldStage(vaultPath, slug, pipeline, opts.stage ?? 'intake')
    created.push(`${unit.dir}/stages/01_${slugify(opts.stage ?? 'intake')}/`)
  }
  if (info && opts?.agent && info.agents.length === 0) {
    const agent = scaffoldUnit(vaultPath, slug, 'agent', slugify(opts.agent))
    created.push(`${agent.dir}/`)
  }

  return { slug, created, alreadyCanonical: created.length === 0 }
}

function listFilesLite(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}
