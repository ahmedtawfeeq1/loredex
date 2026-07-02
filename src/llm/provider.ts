import type { Meta } from '../core/frontmatter'
import { classifyWithClaude, claudeAvailable } from './claude-cli'
import { classifyWithCodex, codexAvailable } from './codex-cli'

export interface ClassifyContext {
  fileName: string
  excerpt: string
  projectName: string
  knownProjects: string[]
  knownTopics: string[]
}

function buildPrompt(ctx: ClassifyContext): string {
  return [
    'Classify this markdown research file for filing into a knowledge vault.',
    'Respond ONLY with a JSON object:',
    '{"project": string, "topic": string, "type": "research"|"finding"|"analysis"|"snapshot"|"note", "tags": string[]}',
    'Use kebab-case for project and topic. Reuse existing names when they fit.',
    `Existing projects: ${ctx.knownProjects.join(', ') || '(none yet)'}`,
    `Existing topics: ${ctx.knownTopics.join(', ') || '(none yet)'}`,
    `Default project: ${ctx.projectName || '(unknown)'}`,
    `File name: ${ctx.fileName}`,
    '--- FILE START ---',
    ctx.excerpt,
    '--- FILE END ---',
  ].join('\n')
}

export type Provider = 'claude' | 'codex' | 'none'

let cachedProvider: Provider | null = null

export function detectProvider(): Provider {
  const forced = process.env.LOREDEX_CLASSIFIER
  if (forced === 'claude' || forced === 'codex' || forced === 'none') return forced
  if (forced === 'heuristic') return 'none'
  if (cachedProvider === null) {
    cachedProvider = claudeAvailable() ? 'claude' : codexAvailable() ? 'codex' : 'none'
  }
  return cachedProvider
}

/** LLM classification via whichever agent CLI is installed. Null when none is available or the call fails. */
export function classifyWithLlm(ctx: ClassifyContext): Meta | null {
  const provider = detectProvider()
  if (provider === 'none') return null
  const prompt = buildPrompt(ctx)
  return provider === 'claude' ? classifyWithClaude(prompt) : classifyWithCodex(prompt)
}
