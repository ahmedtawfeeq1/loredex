import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { type ClientInfo, scanFleet, stageNumberingGaps, type UnitInfo } from './agent-ops'

/**
 * Agent-ops lint engine — pure (no console) so the CLI doctor, tests, and desktop
 * all consume the same findings. Levels: `error` = schema broken, `warn` = probably
 * unfinished, `attention` = pending human work (never a failure). `_randoms/` is
 * exempt from everything except being counted.
 */

export type LintLevel = 'error' | 'warn' | 'attention'

export interface LintFinding {
  level: LintLevel
  client: string
  /** where inside the client, e.g. "pipelines/lead_reactivation/stages/02_qualify" */
  scope: string
  message: string
}

const DAY_MS = 86_400_000

function lintUnit(client: string, unit: UnitInfo): LintFinding[] {
  const findings: LintFinding[] = []
  const scope = unit.dir.replace(`projects/${client}/`, '')
  if (unit.persona !== 'ok') {
    findings.push({
      level: 'error',
      client,
      scope,
      message: `_persona.md ${unit.persona} — every ${unit.kind} needs a persona`,
    })
  }
  if (unit.generalInstructions !== 'ok') {
    findings.push({
      level: 'error',
      client,
      scope,
      message: `_general_instructions.md ${unit.generalInstructions}`,
    })
  }
  if (unit.kind === 'pipeline') {
    if (unit.stages.length === 0) {
      findings.push({ level: 'error', client, scope, message: 'pipeline has no stages' })
    }
    const gaps = stageNumberingGaps(unit.stages)
    if (gaps.length > 0) {
      findings.push({
        level: 'error',
        client,
        scope,
        message: `stage numbering has gaps — missing ${gaps.join(', ')}`,
      })
    }
    const seen = new Set<string>()
    for (const stage of unit.stages) {
      const stageScope = `${scope}/stages/${stage.dir}`
      if (stage.nn && seen.has(stage.nn)) {
        findings.push({
          level: 'error',
          client,
          scope: stageScope,
          message: `duplicate stage number ${stage.nn}`,
        })
      }
      if (stage.nn) seen.add(stage.nn)
      const missing = (
        [
          ['enterCondition', 'enter_condition.md'],
          ['stageInstructions', 'stage_instructions.md'],
          ['followup', 'followup.md'],
          ['actions', 'actions.curls.yaml'],
        ] as const
      )
        .filter(([key]) => !stage.files[key])
        .map(([, name]) => `${stage.nn}_${name}`)
      if (missing.length > 0) {
        findings.push({
          level: 'error',
          client,
          scope: stageScope,
          message: `missing ${missing.join(', ')}`,
        })
      }
      for (const name of stage.prefixMismatches) {
        findings.push({
          level: 'error',
          client,
          scope: stageScope,
          message: `${name} — NN prefix doesn't match the ${stage.nn}_ folder`,
        })
      }
    }
  } else if (unit.hasStagesDir) {
    findings.push({
      level: 'error',
      client,
      scope,
      message: 'agent has a stages/ dir — agents are stage-less (make it a pipeline?)',
    })
  }
  return findings
}

function lintClient(info: ClientInfo, now: number): LintFinding[] {
  const findings: LintFinding[] = []
  if (info.pipelines.length === 0 && info.agents.length === 0) {
    findings.push({
      level: 'warn',
      client: info.slug,
      scope: '.',
      message: 'no pipelines and no agents — empty client',
    })
  }
  if (info.knowledgeTables.length === 0) {
    findings.push({
      level: 'warn',
      client: info.slug,
      scope: 'knowledge_tables',
      message: 'no knowledge tables — nothing for the AI to be grounded on',
    })
  }
  for (const unit of [...info.pipelines, ...info.agents]) {
    findings.push(...lintUnit(info.slug, unit))
  }
  if (info.inboxCount > 0) {
    const age = info.inboxOldestMs ? Math.floor((now - info.inboxOldestMs) / DAY_MS) : 0
    findings.push({
      level: 'attention',
      client: info.slug,
      scope: '_inbox',
      message: `${info.inboxCount} item(s) pending consumption${age > 0 ? ` — oldest ${age}d` : ''}`,
    })
  }
  return findings
}

/**
 * Committed-secret scan over text files under projects/. `${VAR}` placeholders are the
 * sanctioned pattern and never flagged; `_randoms/` and generated (gitignored) files
 * are skipped. Findings are error-level: a token in a shared dex lives in git forever.
 */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, 'JWT'],
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'API key (sk-)'],
  [/\bgh[pos]_[A-Za-z0-9]{20,}/, 'GitHub token'],
  [/\bxox[abp]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
]

const SCANNABLE = /\.(md|ya?ml|json|csv|txt)$/

export function scanForSecrets(vaultPath: string, files: string[]): LintFinding[] {
  const findings: LintFinding[] = []
  for (const rel of files) {
    if (!SCANNABLE.test(rel)) continue
    if (rel.includes('/_randoms/')) continue
    let raw: string
    try {
      raw = readFileSync(join(vaultPath, rel), 'utf8')
    } catch {
      continue
    }
    for (const [pattern, label] of SECRET_PATTERNS) {
      if (pattern.test(raw)) {
        const client = rel.startsWith('projects/') ? (rel.split('/')[1] ?? '') : ''
        findings.push({
          level: 'error',
          client,
          scope: rel,
          message: `${label}-looking string committed — rotate it and move it to \${ENV_VAR}`,
        })
        break
      }
    }
  }
  return findings
}

/** git-tracked files that `loredex workspace` generates — they belong in .gitignore. */
export function findTrackedGeneratedFiles(vaultPath: string): LintFinding[] {
  if (!existsSync(join(vaultPath, '.git'))) return []
  let tracked: string[]
  try {
    tracked = execFileSync('git', ['ls-files', 'projects'], { cwd: vaultPath, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
  const generated = /^projects\/[^/]+\/(\.mcp\.json|\.claude\/|AGENTS\.md$)/
  return tracked
    .filter((rel) => generated.test(rel))
    .map((rel) => ({
      level: 'error' as const,
      client: rel.split('/')[1] ?? '',
      scope: rel,
      message: 'generated workspace file is git-tracked — add it to the client .gitignore',
    }))
}

/** All git-tracked text files under projects/ (fallback: fs walk when not a git dex). */
export function committedProjectFiles(vaultPath: string): string[] {
  if (existsSync(join(vaultPath, '.git'))) {
    try {
      return execFileSync('git', ['ls-files', 'projects'], { cwd: vaultPath, encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
    } catch {
      // fall through to fs walk
    }
  }
  const out: string[] = []
  const walk = (rel: string): void => {
    const abs = join(vaultPath, rel)
    let entries: string[]
    try {
      entries = readdirSync(abs)
    } catch {
      return
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue
      const childRel = `${rel}/${name}`
      try {
        if (statSync(join(vaultPath, childRel)).isDirectory()) walk(childRel)
        else out.push(childRel)
      } catch {
        // skip unreadable entries
      }
    }
  }
  walk('projects')
  return out
}

export function lintAgentOps(
  vaultPath: string,
  now = Date.now(),
): { findings: LintFinding[]; fleet: ClientInfo[] } {
  const fleet = scanFleet(vaultPath)
  const findings: LintFinding[] = []
  for (const info of fleet) findings.push(...lintClient(info, now))
  findings.push(...scanForSecrets(vaultPath, committedProjectFiles(vaultPath)))
  findings.push(...findTrackedGeneratedFiles(vaultPath))
  const order: Record<LintLevel, number> = { error: 0, warn: 1, attention: 2 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.client.localeCompare(b.client))
  return { findings, fleet }
}
