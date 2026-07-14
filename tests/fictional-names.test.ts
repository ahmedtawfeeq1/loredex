import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard: code and fixtures never reference the maintainer's real company —
 * examples stay fictional (acme, brightsmile_dental, peak_fitness, sara…).
 * The README bio line and historical docs/plan/ notes are out of scope.
 */
// assembled so this guard file never matches itself
const FORBIDDEN = new RegExp(['gen', 'udo'].join(''), 'i')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|tsx|md|json|ya?ml)$/.test(name)) out.push(path)
  }
  return out
}

describe('fictional names only', () => {
  it('src/ and tests/ contain no real-company references', () => {
    const offenders: string[] = []
    for (const root of ['src', 'tests']) {
      for (const file of walk(root)) {
        if (FORBIDDEN.test(readFileSync(file, 'utf8'))) offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})
