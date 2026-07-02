import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'

/** Append a Related section linking sibling notes (same project/topic). Skips if one already exists. */
export function addRelatedLinks(filePath: string): void {
  const raw = readFileSync(filePath, 'utf8')
  if (raw.includes('## Related')) return
  const dir = dirname(filePath)
  const self = basename(filePath)
  const siblings = readdirSync(dir)
    .filter((name) => name.endsWith('.md') && name !== self)
    .sort()
    .reverse()
    .slice(0, 5)
  if (siblings.length === 0) return
  const links = siblings.map((name) => `- [[${name.replace(/\.md$/, '')}]]`).join('\n')
  writeFileSync(filePath, `${raw.trimEnd()}\n\n## Related\n\n${links}\n`)
}
