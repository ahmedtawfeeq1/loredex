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

/** Classify via headless Claude Code. --bare skips hooks/skills/CLAUDE.md (also prevents hook recursion). */
export function classifyWithClaude(prompt: string): Meta | null {
  const result = spawnSync(
    'claude',
    [
      '-p',
      prompt,
      '--bare',
      '--output-format',
      'json',
      '--json-schema',
      SCHEMA,
      '--model',
      'haiku',
    ],
    { encoding: 'utf8', timeout: 90_000 },
  )
  if (result.status !== 0 || !result.stdout) return null
  try {
    const envelope = JSON.parse(result.stdout)
    const parsed =
      typeof envelope.result === 'string' ? JSON.parse(envelope.result) : envelope.result
    return parsed as Meta
  } catch {
    return null
  }
}
