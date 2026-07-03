import { spawn, spawnSync } from 'node:child_process'
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
 * No --bare: it skips user settings including credentials ("Not logged in").
 * Recursion is safe anyway — the Stop hook only runs `route --strict`, which never calls an LLM.
 */
export function runClaudeJson(
  prompt: string,
  schema: string,
  timeoutMs: number,
  model?: string,
): unknown | null {
  const args = ['-p', prompt, '--output-format', 'json', '--json-schema', schema]
  if (model) args.push('--model', model)
  const result = spawnSync('claude', args, { encoding: 'utf8', timeout: timeoutMs })
  if (result.status !== 0 || !result.stdout) return null
  try {
    const envelope = JSON.parse(result.stdout)
    if (envelope.is_error) return null
    if (envelope.structured_output !== undefined) return envelope.structured_output
    return typeof envelope.result === 'string' ? JSON.parse(envelope.result) : envelope.result
  } catch {
    return null
  }
}

export function classifyWithClaude(prompt: string): Meta | null {
  // haiku: classification is cheap-and-fast territory
  return runClaudeJson(prompt, SCHEMA, 90_000, 'haiku') as Meta | null
}

/** Async variant — lets callers keep a live progress ticker running during the call. */
export function runClaudeJsonAsync(
  prompt: string,
  schema: string,
  timeoutMs: number,
  model?: string,
): Promise<unknown | null> {
  const args = ['-p', prompt, '--output-format', 'json', '--json-schema', schema]
  if (model) args.push('--model', model)
  return new Promise((resolve) => {
    const child = spawn('claude', args, { timeout: timeoutMs })
    let stdout = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.on('error', () => resolve(null))
    child.on('close', (code) => {
      if (code !== 0 || !stdout) return resolve(null)
      try {
        const envelope = JSON.parse(stdout)
        if (envelope.is_error) return resolve(null)
        if (envelope.structured_output !== undefined) return resolve(envelope.structured_output)
        resolve(typeof envelope.result === 'string' ? JSON.parse(envelope.result) : envelope.result)
      } catch {
        resolve(null)
      }
    })
  })
}
