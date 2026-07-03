import { spawnSync } from 'node:child_process'
import type { Meta } from '../core/frontmatter'

const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    project: { type: 'string' },
    topic: { type: 'string' },
    type: { type: 'string', enum: ['research', 'finding', 'analysis', 'snapshot', 'note'] },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['project', 'topic', 'type'],
})

export function claudeAvailable(): boolean {
  try {
    return spawnSync('claude', ['--version'], { stdio: 'ignore' }).status === 0
  } catch {
    return false
  }
}

/**
 * Headless Claude Code call with structured JSON output.
 * --bare skips hooks/skills/CLAUDE.md (also prevents hook recursion).
 */
export function runClaudeJson(
  prompt: string,
  schema: string,
  timeoutMs: number,
  model?: string,
): unknown | null {
  const args = ['-p', prompt, '--bare', '--output-format', 'json', '--json-schema', schema]
  if (model) args.push('--model', model)
  const result = spawnSync('claude', args, { encoding: 'utf8', timeout: timeoutMs })
  if (result.status !== 0 || !result.stdout) return null
  try {
    const envelope = JSON.parse(result.stdout)
    return typeof envelope.result === 'string' ? JSON.parse(envelope.result) : envelope.result
  } catch {
    return null
  }
}

export function classifyWithClaude(prompt: string): Meta | null {
  // haiku: classification is cheap-and-fast territory
  return runClaudeJson(prompt, SCHEMA, 90_000, 'haiku') as Meta | null
}
