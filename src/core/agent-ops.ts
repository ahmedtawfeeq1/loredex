import { type Dirent, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { clientTags, loadClients } from './clients'
import { parseDoc } from './frontmatter'
import { listProjects } from './product'
import { loadProducts, productOf } from './products'

/**
 * Structural read model for agent-ops dexes: Manager ▸ Client ▸ Pipeline|Agent ▸ Stage.
 * One scanner shared by doctor, the indexer, digests, and desktop (via lib) so every
 * surface agrees on what the fleet looks like. Pure reads; unreadable pieces are
 * skipped, never thrown. `_randoms/` is counted but its contents never produce findings.
 */

export const UNIT_FILES = [
  '_persona.md',
  '_general_instructions.md',
  '_actions.curls.yaml',
  '_settings.export.yaml',
] as const

export const STAGE_FILE_SUFFIXES = [
  'enter_condition.md',
  'stage_instructions.md',
  'followup.md',
  'actions.curls.yaml',
] as const

export type StageFileKey = 'enterCondition' | 'stageInstructions' | 'followup' | 'actions'

const STAGE_FILE_KEYS: Record<(typeof STAGE_FILE_SUFFIXES)[number], StageFileKey> = {
  'enter_condition.md': 'enterCondition',
  'stage_instructions.md': 'stageInstructions',
  'followup.md': 'followup',
  'actions.curls.yaml': 'actions',
}

export interface StageInfo {
  /** two-digit prefix of the stage folder, e.g. "01" */
  nn: string
  /** stage name without the NN_ prefix */
  slug: string
  /** folder name, NN_<slug> */
  dir: string
  files: Record<StageFileKey, boolean>
  /** file names inside the stage whose NN prefix ≠ the folder's NN */
  prefixMismatches: string[]
}

export type UnitFileState = 'ok' | 'empty' | 'missing'

export interface UnitInfo {
  name: string
  kind: 'pipeline' | 'agent'
  /** vault-relative dir, e.g. projects/<client>/pipelines/<name> */
  dir: string
  persona: UnitFileState
  generalInstructions: UnitFileState
  hasActions: boolean
  hasSettings: boolean
  stages: StageInfo[]
  hasStagesDir: boolean
}

export interface ClientInfo {
  slug: string
  /** vault-relative dir, projects/<slug> */
  dir: string
  tags: string[]
  manager: string | null
  pipelines: UnitInfo[]
  agents: UnitInfo[]
  /** file names under knowledge_tables/ */
  knowledgeTables: string[]
  /** file names under automation_workflows/ */
  workflows: string[]
  inboxCount: number
  /** epoch ms of the oldest pending inbox item, null when empty */
  inboxOldestMs: number | null
  randomsCount: number
  hasWorkspaceYml: boolean
}

const STAGE_DIR = /^(\d{2})_(.+)$/

function safeReaddir(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function listFiles(dir: string): string[] {
  return safeReaddir(dir)
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()
}

/** 'ok' when present with non-whitespace body (frontmatter alone counts as empty). */
function unitFileState(path: string): UnitFileState {
  if (!existsSync(path)) return 'missing'
  try {
    const raw = readFileSync(path, 'utf8')
    const body = path.endsWith('.md') ? parseDoc(raw).body : raw
    return body.trim().length > 0 ? 'ok' : 'empty'
  } catch {
    return 'missing'
  }
}

function scanStage(stagesAbs: string, dirName: string): StageInfo {
  const match = dirName.match(STAGE_DIR)
  const nn = match?.[1] ?? ''
  const slug = match?.[2] ?? dirName
  const files: Record<StageFileKey, boolean> = {
    enterCondition: false,
    stageInstructions: false,
    followup: false,
    actions: false,
  }
  const prefixMismatches: string[] = []
  for (const name of listFiles(join(stagesAbs, dirName))) {
    const fileMatch = name.match(/^(\d{2})_(.+)$/)
    if (!fileMatch) continue
    const suffix = fileMatch[2] as (typeof STAGE_FILE_SUFFIXES)[number]
    const key = STAGE_FILE_KEYS[suffix]
    if (!key) continue
    files[key] = true
    if (nn && fileMatch[1] !== nn) prefixMismatches.push(name)
  }
  return { nn, slug, dir: dirName, files, prefixMismatches }
}

function scanUnit(
  clientAbs: string,
  clientRel: string,
  kind: 'pipeline' | 'agent',
  name: string,
): UnitInfo {
  const group = kind === 'pipeline' ? 'pipelines' : 'agents'
  const unitAbs = join(clientAbs, group, name)
  const stagesAbs = join(unitAbs, 'stages')
  const hasStagesDir = existsSync(stagesAbs)
  const stages = hasStagesDir
    ? safeReaddir(stagesAbs)
        .filter((e) => e.isDirectory())
        .map((e) => scanStage(stagesAbs, e.name))
        .sort((a, b) => a.dir.localeCompare(b.dir))
    : []
  return {
    name,
    kind,
    dir: `${clientRel}/${group}/${name}`,
    persona: unitFileState(join(unitAbs, '_persona.md')),
    generalInstructions: unitFileState(join(unitAbs, '_general_instructions.md')),
    hasActions: existsSync(join(unitAbs, '_actions.curls.yaml')),
    hasSettings: existsSync(join(unitAbs, '_settings.export.yaml')),
    stages,
    hasStagesDir,
  }
}

function scanUnits(clientAbs: string, clientRel: string, kind: 'pipeline' | 'agent'): UnitInfo[] {
  const group = kind === 'pipeline' ? 'pipelines' : 'agents'
  return safeReaddir(join(clientAbs, group))
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => scanUnit(clientAbs, clientRel, kind, e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function inboxStats(dir: string): { count: number; oldestMs: number | null } {
  const files = listFiles(dir)
  let oldest: number | null = null
  for (const name of files) {
    try {
      const ms = statSync(join(dir, name)).mtimeMs
      if (oldest === null || ms < oldest) oldest = ms
    } catch {
      // unreadable entry still counts as pending
    }
  }
  return { count: files.length, oldestMs: oldest }
}

export function scanClient(vaultPath: string, slug: string): ClientInfo | null {
  const clientAbs = join(vaultPath, 'projects', slug)
  if (!existsSync(clientAbs)) return null
  const clientRel = `projects/${slug}`
  const inbox = inboxStats(join(clientAbs, '_inbox'))
  return {
    slug,
    dir: clientRel,
    tags: clientTags(loadClients(vaultPath), slug),
    manager: productOf(loadProducts(vaultPath), slug),
    pipelines: scanUnits(clientAbs, clientRel, 'pipeline'),
    agents: scanUnits(clientAbs, clientRel, 'agent'),
    knowledgeTables: listFiles(join(clientAbs, 'knowledge_tables')),
    workflows: listFiles(join(clientAbs, 'automation_workflows')),
    inboxCount: inbox.count,
    inboxOldestMs: inbox.oldestMs,
    randomsCount: listFiles(join(clientAbs, '_randoms')).length,
    hasWorkspaceYml: existsSync(join(clientAbs, 'workspace.yml')),
  }
}

export function scanFleet(vaultPath: string): ClientInfo[] {
  return listProjects(vaultPath)
    .map((slug) => scanClient(vaultPath, slug))
    .filter((c): c is ClientInfo => c !== null)
}

/** Missing NNs for a strict contiguous 01..N numbering; duplicates reported once. */
export function stageNumberingGaps(stages: StageInfo[]): string[] {
  const present = stages.map((s) => s.nn).filter(Boolean)
  if (present.length === 0) return []
  const have = new Set(present)
  const max = Math.max(...present.map((nn) => Number.parseInt(nn, 10)))
  const gaps: string[] = []
  for (let i = 1; i <= max; i++) {
    const nn = String(i).padStart(2, '0')
    if (!have.has(nn)) gaps.push(nn)
  }
  return gaps
}
