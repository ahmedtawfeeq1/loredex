import { spawn } from 'node:child_process'
import type { CurationPlan } from '../core/curate'
import { runClaudeJsonAsync } from './claude-cli'
import { detectProvider } from './provider'

const CURATE_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    objective: { type: 'string' },
    brief: { type: 'string' },
    reading_order: { type: 'array', items: { type: 'string' } },
    next_actions: { type: 'array', items: { type: 'string' } },
    stale: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          note: { type: 'string' },
          superseded_by: { type: ['string', 'null'] },
          reason: { type: 'string' },
        },
        required: ['note', 'reason'],
      },
    },
    duplicates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          canonical: { type: 'string' },
          redundant: { type: 'array', items: { type: 'string' } },
          reason: { type: 'string' },
        },
        required: ['canonical', 'redundant', 'reason'],
      },
    },
    clusters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          theme: { type: 'string' },
          notes: { type: 'array', items: { type: 'string' } },
        },
        required: ['theme', 'notes'],
      },
    },
  },
  required: [
    'objective',
    'brief',
    'reading_order',
    'next_actions',
    'stale',
    'duplicates',
    'clusters',
  ],
})

const TIMEOUT_MS = 300_000

export interface CurateInput {
  projectName: string
  objective?: string
  digest: string
}

function buildPrompt(input: CurateInput): string {
  return [
    `You are curating the research vault of the project "${input.projectName}".`,
    'Below is a digest of every note in scope (name, metadata, headings, excerpt).',
    input.objective
      ? `The user's objective: ${input.objective}\nEverything you produce must serve this objective.`
      : 'No objective was given — derive the most plausible current objective from the notes.',
    'Produce:',
    '- objective: the objective this brief answers (the given one, or the derived one)',
    '- brief: 2-4 markdown paragraphs — what this body of work is, its current state, how it serves the objective',
    '- reading_order: 5-10 note names (exactly as given, no .md) ordered for someone starting on the objective',
    '- next_actions: 3-6 concrete suggested next steps toward the objective',
    '- stale: notes that are outdated or superseded (with the superseding note name when one exists)',
    '- duplicates: sets covering the same ground — pick one canonical, list redundant ones',
    '- clusters: 3-8 semantic groups of related notes (theme + note names); notes may appear in one cluster only',
    'Only reference note names that appear in the digest. Respond ONLY with the JSON object.',
    '--- DIGEST START ---',
    input.digest,
    '--- DIGEST END ---',
  ].join('\n')
}

function isPlan(value: unknown): value is CurationPlan {
  const plan = value as CurationPlan
  return (
    typeof plan === 'object' &&
    plan !== null &&
    typeof plan.brief === 'string' &&
    Array.isArray(plan.reading_order)
  )
}

// ponytail: codex has no structured-output flag; greedy-parse the largest JSON object
function codexExec(prompt: string): Promise<unknown | null> {
  return new Promise((resolve) => {
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

/**
 * One-call vault curation via the installed agent CLI. Null when unavailable or failed.
 * Async so callers can keep a live progress ticker running.
 */
export async function curateWithLlm(input: CurateInput): Promise<CurationPlan | null> {
  const provider = detectProvider()
  if (provider === 'none') return null
  const prompt = buildPrompt(input)

  const result =
    provider === 'claude'
      ? await runClaudeJsonAsync(prompt, CURATE_SCHEMA, TIMEOUT_MS)
      : await codexExec(prompt)
  const normalized = result as Partial<CurationPlan> | null
  if (!isPlan(normalized)) return null
  return {
    objective: normalized.objective ?? input.objective ?? 'unspecified',
    brief: normalized.brief ?? '',
    reading_order: normalized.reading_order ?? [],
    next_actions: normalized.next_actions ?? [],
    stale: normalized.stale ?? [],
    duplicates: normalized.duplicates ?? [],
    clusters: normalized.clusters ?? [],
  }
}
