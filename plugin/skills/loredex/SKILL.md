---
name: loredex
description: Overview and writing conventions for loredex. Use this as the fallback when the user's intent doesn't map to one specific loredex action, and always follow its frontmatter convention when writing research/findings/analysis markdown in a loredex-registered project. For a specific action, prefer the dedicated skill — /loredex-init, /loredex-adopt, /loredex-route, /loredex-curate, /loredex-reset, /loredex-status.
---

# Loredex — auto-file research markdown

Loredex routes AI-generated markdown into one Obsidian-compatible vault. Each action has
its own dedicated skill/slash command:

| Command | Does |
|---|---|
| `/loredex-init` | Set up loredex for this project |
| `/loredex-adopt` | File a project's existing scattered research into the vault |
| `/loredex-route` | Force-process the inbox + pending files right now |
| `/loredex-curate` | Write a Start-Here brief; flag stale/duplicate/orphaned notes |
| `/loredex-product` | Cross-project product view: dashboard, flow state, risks/contradictions |
| `/loredex-handoff` | Hand finished work to another team's project (writes + syncs a consumable brief) |
| `/loredex-handoffs` | Check open handoffs addressed to this project; consume after acting |
| `/loredex-sync` | Commit + pull + push the shared vault repo |
| `/loredex-mcp` | Live vault access for any MCP agent (search/read/handoffs/store) |
| `/loredex-reset` | Rebuild a project's vault copies from scratch |
| `/loredex-status` | Vault stats + health check (config/editor/classifier) |

Use this base skill when the user's request doesn't clearly match one of those, or ask
which they mean rather than guessing between `adopt` and `curate`.

## Writing conventions (always follow in registered projects)

When you produce research, findings, analysis, snapshots, or a plan worth keeping, add this
frontmatter so the Stop hook can file it deterministically — no command needed:

```yaml
---
project: <project-name>          # from AGENTS.md's loredex section, or the repo name
topic: <kebab-case-topic>        # reuse an existing topic when one fits
type: research | finding | analysis | snapshot | note
date: YYYY-MM-DD
source: claude-code | codex | cursor | manual
tags: []
---
```

Write it into the project's `docs/` directory (or the vault `_inbox/` if the user prefers).
Never write into the vault's `projects/` tree yourself — the router owns that, and it will
rewrite the file's links when it moves.

Never add `loredex: routed` to a file yourself — the router stamps it after filing. A
pre-stamped file is skipped as already-filed and will never reach the vault. Project files
route **directly** to `projects/<project>/<topic>/` (copied, original stamped); `_inbox/`
is only the lane for files that don't start inside a registered project.

## Notes

- `adopt` copies by default (originals stay, stamped `loredex: routed`); `--move` relocates.
- Every command that writes supports `--dry-run` — show the user a dry run before applying.
- No LLM installed? Everything still works — classification/curation fall back to
  filename/path heuristics (`/loredex-status` reports which classifier is active).
