import { spawnSync } from 'node:child_process'
import type { Meta } from '../core/frontmatter'

export function codexAvailable(): boolean {
  try {
    return spawnSync('codex', ['--version'], { stdio: 'ignore' }).status === 0
  } catch {
    return false
  }
}

// ponytail: codex exec output is unstructured; grab the first JSON object from stdout.
// Upgrade to a structured-output flag when codex ships one.
export function classifyWithCodex(prompt: string): Meta | null {
  const result = spawnSync('codex', ['exec', prompt], { encoding: 'utf8', timeout: 90_000 })
  if (result.status !== 0 || !result.stdout) return null
  const match = result.stdout.match(/\{[\s\S]*?\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as Meta
  } catch {
    return null
  }
}
