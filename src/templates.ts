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

Never add \`loredex: routed\` yourself — the router stamps it after filing.
A pre-stamped file is skipped as already-filed and will never reach the vault.
${MARKER_END}
`
}

/** Body only (no .mdc frontmatter) — callers own the file-level frontmatter so appends don't duplicate it. */
export function cursorRuleSnippet(projectName: string, inboxPath: string): string {
  return `${MARKER_START}
Do not create standalone summary/report markdown files (SUMMARY.md, REPORT.md,
NOTES.md, etc.) after finishing a task. If the work produced research, findings,
analysis, or a plan worth keeping, write it with loredex frontmatter instead:

\`\`\`yaml
---
project: ${projectName}
topic: <kebab-case-topic>
type: research | finding | analysis | snapshot | note
date: YYYY-MM-DD
source: cursor
tags: []
---
\`\`\`

Write it into this project's \`docs/\` directory or the vault inbox at
\`${inboxPath}\`. Run \`npx -y loredex@latest route\` to file it, or leave it for
the next \`loredex adopt\`.

Never add \`loredex: routed\` yourself — the router stamps it after filing.
A pre-stamped file is skipped as already-filed and will never reach the vault.
${MARKER_END}
`
}

export function cursorRuleFrontmatter(): string {
  return `---
description: Route research and findings through loredex instead of ad-hoc summary files
alwaysApply: true
---
`
}

export function claudePointer(): string {
  return `${MARKER_START}
See the "Research filing (loredex)" section in AGENTS.md: research/analysis
markdown needs loredex frontmatter so it can be auto-filed into the vault.
${MARKER_END}
`
}
