---
name: loredex
description: File research/analysis markdown into the loredex vault. Use when the user asks to set up loredex, organize research findings, adopt a project's markdown into the vault, or check vault status — and whenever you write research, findings, analysis, or planning markdown in a loredex-registered project (add loredex frontmatter so it auto-files).
---

# Loredex — auto-file research markdown

Loredex routes AI-generated markdown into one Obsidian-compatible vault. The CLI does the
work; this skill teaches you the conventions and the commands.

## Writing conventions (always follow in registered projects)

When you produce research, findings, analysis, snapshots, or planning markdown, add this
frontmatter so the Stop hook can file it deterministically:

```yaml
---
project: <project-name>          # from AGENTS.md loredex section, or the repo name
topic: <kebab-case-topic>        # reuse existing topics when they fit
type: research | finding | analysis | snapshot | note
date: YYYY-MM-DD
source: claude-code
tags: []
---
```

Write such files into the project's `docs/` directory (or the vault `_inbox/` if the user
prefers). Never file into the vault's `projects/` tree yourself — the router owns that.

## Commands (run via Bash)

| Intent | Command |
|---|---|
| Set up loredex for this project | `npx -y loredex init` (options: `--vault <path>`, `--sync git`) |
| Organize existing markdown in a repo | `npx -y loredex adopt --dry-run` first, show the user the plan, then `npx -y loredex adopt -y` after they confirm |
| Route pending files now | `npx -y loredex route` |
| Vault statistics | `npx -y loredex status` |
| Troubleshoot | `npx -y loredex doctor` |

## Notes

- `adopt` copies by default (originals stay, stamped with `loredex: routed`); `--move` relocates.
- Every command supports `--dry-run` — prefer showing the user a dry run before writes.
- The Stop hook auto-routes frontmattered files after each session; unlabeled files need
  `loredex route` (with LLM classification) or `adopt`.
