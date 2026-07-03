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

/** Replace (or append) the Related section with the given note names. Used by curate's semantic links. */
export function replaceRelated(filePath: string, noteNames: string[]): void {
  if (noteNames.length === 0) return
  const raw = readFileSync(filePath, 'utf8')
  const section = `## Related\n\n${noteNames.map((name) => `- [[${name}]]`).join('\n')}`
  const headingIndex = raw.indexOf('## Related')
  let next: string
  if (headingIndex === -1) {
    next = `${raw.trimEnd()}\n\n${section}\n`
  } else {
    const afterHeading = raw.slice(headingIndex)
    const nextHeading = afterHeading.slice(2).search(/\n## /)
    const tail = nextHeading === -1 ? '' : afterHeading.slice(nextHeading + 3)
    next = `${raw.slice(0, headingIndex)}${section}\n${tail}`
  }
  writeFileSync(filePath, next)
}
