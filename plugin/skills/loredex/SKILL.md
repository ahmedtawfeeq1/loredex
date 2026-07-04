---
name: loredex
description: File research/analysis markdown into the loredex vault and curate it. Use when the user asks to set up loredex, organize research findings, adopt a project's markdown into the vault, check vault status, curate the vault, or asks "where do I start" with a pile of research/session output — and whenever you write research, findings, analysis, or planning markdown in a loredex-registered project (add loredex frontmatter so it auto-files).
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
| Set up loredex for this project | `npx -y loredex@latest init` (options: `--vault <path>`, `--sync git`, `--editor <name>`) — ASK the user which editor code links should open in: vscode, cursor, windsurf, or system default |
| Organize existing markdown in a repo | `npx -y loredex@latest adopt --dry-run` first, show the user the plan, then `npx -y loredex@latest adopt -y` after they confirm |
| Route pending files now | `npx -y loredex@latest route` |
| Curate: Start-Here brief, stale flags, semantic links | `npx -y loredex@latest curate <project> --objective "<text>" [--since <date>] [--topic <t>] --dry-run`, then `-y` after the user confirms |
| Rebuild a project's vault copies from scratch | `npx -y loredex@latest reset <project> --dry-run` first, confirm with the user, then `-y`, then re-adopt. Removes ONLY loredex-owned vault copies and unstamps originals — original files are never deleted |
| Vault statistics | `npx -y loredex@latest status` |
| Troubleshoot | `npx -y loredex@latest doctor` |

## Curate flow (IMPORTANT — ask before running)

When the user asks to curate, "make sense of the vault", or "where do I start":

1. **Ask for the objective first** — one question: "What's the objective this brief should
   answer?" (e.g. "draft the BMAD spec for the P0 agent"). The brief, reading order, and
   next actions are all steered by it. If the user has no objective, run without
   `--objective` and the LLM derives one.
2. **Ask the scope** — the whole project, or just a recent task batch? A session that just
   produced N files = task scope: `--since <today/yesterday>` or its `--topic`s. Scoped runs
   write a separate `Start Here - <project> - <slug>.md` brief (a session handoff);
   full-project runs overwrite the main `Start Here - <project>.md`.
3. Run with `--dry-run`, summarize the plan (brief, reading order, stale flags, merge
   candidates), then apply with `-y` after the user confirms.

Proactively suggest a scoped curate after a session that generated many markdown files —
it replaces hand-written HANDOFF.md files.

## Link provenance (v0.5+)

Routed notes keep working references: links to files adopted in the same batch become
vault wikilinks (graph edges); links to other files that exist on disk become editor deep
links (`cursor://file/<abs>:<line>` — opens the real file at the line) or `file://` for
binaries, per the `editor` config. Unresolvable links are left untouched. Every copied
note records its origin as `source_path` frontmatter.

Vaults adopted before v0.5 have broken relative links (clicking them creates empty notes
in Obsidian): offer `reset <project>` → `adopt` to rebuild cleanly — originals are the
source of truth, the vault is a derivative.

## Notes

- `adopt` copies by default (originals stay, stamped with `loredex: routed`); `--move` relocates.
- Every command supports `--dry-run` — prefer showing the user a dry run before writes.
- The Stop hook auto-routes frontmattered files after each session; unlabeled files need
  `loredex route` (with LLM classification) or `adopt`.
