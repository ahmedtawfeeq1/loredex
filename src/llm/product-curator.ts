import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { ProductDashboard } from '../core/product'
import { runClaudeJsonAsync } from './claude-cli'
import { detectProvider } from './provider'

export interface ProductPlan {
  objective: string
  brief: string
  project_states: Array<{ project: string; state: string; next: string }>
  reading_order: string[]
  risks: Array<{ description: string; notes: string[] }>
  duplicates: Array<{ description: string; notes: string[] }>
  next_actions: string[]
}

const PRODUCT_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    objective: { type: 'string' },
    brief: { type: 'string' },
    project_states: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          state: { type: 'string' },
          next: { type: 'string' },
        },
        required: ['project', 'state', 'next'],
      },
    },
    reading_order: { type: 'array', items: { type: 'string' } },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          notes: { type: 'array', items: { type: 'string' } },
        },
        required: ['description', 'notes'],
      },
    },
    duplicates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          notes: { type: 'array', items: { type: 'string' } },
        },
        required: ['description', 'notes'],
      },
    },
    next_actions: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'objective',
    'brief',
    'project_states',
    'reading_order',
    'risks',
    'duplicates',
    'next_actions',
  ],
})

const TIMEOUT_MS = 300_000
const RECENT_NOTES_PER_PROJECT = 10
const BRIEF_CHAR_CAP = 2500

/**
 * The reduce-step digest: per-project Start Here briefs (pre-computed by per-project
 * curate) + the deterministic dashboard + the most recent note digests per project.
 * Hierarchical, so cost stays flat as projects grow — the map step already ran.
 */
export function buildProductDigest(dashboard: ProductDashboard): string {
  const sections: string[] = []
  for (const state of dashboard.states) {
    const lines: string[] = [`## Project: ${state.project}`]
    lines.push(
      `notes: ${state.noteCount} · last activity: ${state.lastDate || '-'} · stale: ${state.staleCount}`,
    )
    if (state.briefPath) {
      let briefBody = ''
      try {
        briefBody = readFileSync(state.briefPath, 'utf8')
          .replace(/^---[\s\S]*?---/, '')
          .trim()
      } catch {
        briefBody = ''
      }
      const freshness =
        state.notesNewerThanBrief > 0
          ? ` (WARNING: ${state.notesNewerThanBrief} notes are newer than this brief)`
          : ''
      lines.push(`### Start Here brief${freshness}`, briefBody.slice(0, BRIEF_CHAR_CAP))
    } else {
      lines.push('### No Start Here brief exists for this project yet.')
    }
    const recent = [...state.notes]
      .sort((a, b) => (b.meta.date ?? '').localeCompare(a.meta.date ?? ''))
      .slice(0, RECENT_NOTES_PER_PROJECT)
    if (recent.length > 0) {
      lines.push('### Most recent notes')
      for (const note of recent) {
        const excerpt = note.body.replace(/\s+/g, ' ').trim().slice(0, 300)
        lines.push(`- ${note.name} (${note.meta.date ?? '-'}, ${note.topic}): ${excerpt}`)
      }
    }
    sections.push(lines.join('\n'))
  }

  const open = dashboard.handoffs.filter((handoff) => handoff.status === 'open')
  const flow = [
    '## Handoffs between teams',
    ...(open.length === 0 ? ['No open handoffs.'] : []),
    ...open.map(
      (handoff) =>
        `- OPEN (${handoff.ageDays}d): ${handoff.from} → ${handoff.to}: ${handoff.objective}`,
    ),
    ...dashboard.handoffs
      .filter((handoff) => handoff.status === 'consumed')
      .slice(0, 5)
      .map((handoff) => `- consumed ${handoff.date}: ${handoff.from} → ${handoff.to}`),
  ].join('\n')

  const refs =
    dashboard.edges.length > 0
      ? `## Cross-project references\n${dashboard.edges.map((edge) => `- ${edge.from} → ${edge.to}: ${edge.count} link(s)`).join('\n')}`
      : ''

  return [sections.join('\n\n'), flow, refs].filter(Boolean).join('\n\n')
}

function buildPrompt(digest: string, objective?: string): string {
  return [
    'You are writing the product-level brief for a multi-project product. Each project below',
    'is a separate repo/team feeding one shared knowledge vault; handoffs are how finished',
    'work moves between teams.',
    objective
      ? `The user's objective: ${objective}\nEverything you produce must serve it.`
      : 'No objective was given — derive the most plausible product-level objective from the material.',
    'Produce:',
    '- objective: the objective this brief answers (given or derived)',
    '- brief: 2-4 markdown paragraphs — what the product is, where it stands across projects, what the flow state means',
    '- project_states: for each project, one sentence of current state and one concrete next step',
    '- reading_order: 5-10 entries "project/note-name" ordered for someone needing the whole product picture',
    '- risks: cross-project contradictions or coordination hazards you can see in the material (e.g. one project describing an interface differently than another). Cite the note names involved. Empty array if none are visible.',
    '- duplicates: knowledge covered redundantly in more than one project, with the note names. Empty array if none.',
    '- next_actions: 3-6 concrete product-level next steps',
    'Only reference project and note names that appear in the digest. Risks and duplicates are',
    'reports for a human to judge — be specific but do not overstate. Respond ONLY with the JSON object.',
    '--- PRODUCT DIGEST START ---',
    digest,
    '--- PRODUCT DIGEST END ---',
  ].join('\n')
}

function isPlan(value: unknown): value is ProductPlan {
  const plan = value as ProductPlan
  return (
    typeof plan === 'object' &&
    plan !== null &&
    typeof plan.brief === 'string' &&
    Array.isArray(plan.project_states)
  )
}

/** One reduce call over the whole product. Null when no LLM is available or the call fails. */
export async function curateProductWithLlm(
  dashboard: ProductDashboard,
  objective?: string,
): Promise<ProductPlan | null> {
  const provider = detectProvider()
  if (provider === 'none') return null
  const prompt = buildPrompt(buildProductDigest(dashboard), objective)

  let result: unknown = null
  if (provider === 'claude') {
    result = await runClaudeJsonAsync(prompt, PRODUCT_SCHEMA, TIMEOUT_MS)
  } else {
    result = await new Promise((resolve) => {
      const child = spawn('codex', ['exec', prompt], { timeout: TIMEOUT_MS })
      let stdout = ''
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.on('error', () => resolve(null))
      child.on('close', () => {
        const match = stdout.match(/\{[\s\S]*\}/)
        if (!match) return resolve(null)
        try {
          resolve(JSON.parse(match[0]))
        } catch {
          resolve(null)
        }
      })
    })
  }
  const normalized = result as Partial<ProductPlan> | null
  if (!isPlan(normalized)) return null
  return {
    objective: normalized.objective ?? objective ?? 'unspecified',
    brief: normalized.brief ?? '',
    project_states: normalized.project_states ?? [],
    reading_order: normalized.reading_order ?? [],
    risks: normalized.risks ?? [],
    duplicates: normalized.duplicates ?? [],
    next_actions: normalized.next_actions ?? [],
  }
}
