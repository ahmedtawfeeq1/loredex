export const MARKER_START = '<!-- loredex:start -->'
export const MARKER_END = '<!-- loredex:end -->'

export function agentsSnippet(projectName: string, inboxPath: string): string {
  return `${MARKER_START}
## Research filing (loredex)

When you produce research, analysis, findings, plans, or similar markdown in
this project, add YAML frontmatter so loredex can auto-file it into the vault:

\`\`\`yaml
---
project: ${projectName}
topic: <kebab-case-topic>
type: research | finding | analysis | snapshot | note
date: YYYY-MM-DD
source: claude-code | codex | cursor | manual
tags: []
---
\`\`\`

Write such files into the vault inbox at \`${inboxPath}\`, or into this
project's \`docs/\` — \`loredex route\` picks up both.
${MARKER_END}
`
}

export function claudePointer(): string {
  return `${MARKER_START}
See the "Research filing (loredex)" section in AGENTS.md: research/analysis
markdown needs loredex frontmatter so it can be auto-filed into the vault.
${MARKER_END}
`
}
