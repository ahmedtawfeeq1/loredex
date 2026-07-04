---
name: loredex
description: File research/analysis markdown into the loredex vault, curate it, and troubleshoot it. Use whenever the user mentions loredex, a vault, organizing research/findings, "where do I start", curating, resetting, or checking vault health — and whenever you write research, findings, analysis, or a plan worth keeping in a loredex-registered project (add loredex frontmatter so it auto-files).
---

# Loredex — auto-file research markdown

Loredex routes AI-generated markdown into one Obsidian-compatible vault. The CLI does the
work; this skill is the decision guide for which command fits the situation in front of you.

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

## Situation → command

| Situation | Do this |
|---|---|
| Project has never used loredex | `npx -y loredex@latest init` — ask which editor code links should open in (vscode/cursor/windsurf/system); skip the question if `doctor` shows exactly one installed |
| Existing project, scattered research files sitting in `docs/` or the repo root | `npx -y loredex@latest adopt --dry-run` → show the plan → `adopt -y` after they confirm |
| A session (yours or another agent's) just produced several markdown files and the user wants to pick up where it left off | `curate <project> --since <date-of-that-session> --objective "<what they're about to do>"` — see the Curate flow below, always ask the objective first |
| User asks "where do I start" / "make sense of this project" with no specific recent session in mind | `curate <project>` (no `--since`/`--topic` = whole project), still ask for an objective first |
| Links in Obsidian create empty notes on click, or the vault predates `v0.5` | `npx -y loredex@latest reset <project> --dry-run` → confirm → `-y` → re-`adopt`. Removes only vault copies and unstamps originals; source files are never touched |
| "Is this working / is my setup healthy" | `npx -y loredex@latest doctor` — shows config, vault, installed editors, LLM classifier availability |
| Quick numbers (note count, pending inbox, unrouted candidates) | `npx -y loredex@latest status` |
| Agent has no Stop-hook equivalent (not Claude Code) and files are piling up ungoverned | `npx -y loredex@latest watch` — daemon, routes on file change. Cursor projects also get a `.cursor/rules/loredex.mdc` from `init` telling the agent not to dump ad-hoc summary files in the first place |
| Files sitting in the vault `_inbox/` or a project's `docs/` that haven't been filed yet | `npx -y loredex@latest route` |
| Vault has grown large and `curate` feels slow/expensive | `curate ... --max-detailed <n>` (default 60) — older notes beyond the cap become a metadata-only index instead of full excerpts, keeping prompt size flat |
| User wants to know what's gone stale | Don't run anything extra — `curate` already checks this automatically (see below) |

## Curate flow (ask before running — this is the important one)

`curate` is the deepest command: it writes a `Start Here` brief, flags stale/duplicate
notes, and adds semantic links. Three questions before running it:

1. **Objective** — "What's the objective this brief should answer?" (e.g. "draft the BMAD
   spec for the P0 agent"). Everything in the brief is steered by it. No objective → omit
   `--objective` and the LLM derives one from the notes.
2. **Scope** — the whole project, or a recent task batch? A session that just produced N
   files is task scope: `--since <date>` or its `--topic`(s). Scoped runs write a separate
   `Start Here - <project> - <slug>.md` (a session handoff); unscoped runs overwrite the
   main `Start Here - <project>.md`.
3. Run with `--dry-run` first, summarize the plan out loud (objective, reading order, stale
   flags, merge candidates, orphan/drift counts), then apply with `-y` once they confirm.

Every `curate` run — with or without an LLM available — also does this automatically, no
extra command needed:
- **Ghost-link cleanup**: `[[x.py]]`-style wikilinks pointing at code get rewritten so they
  stop creating phantom nodes in Obsidian's graph.
- **Drift detection**: notes with `source_path` frontmatter get checked against that file's
  git history; if the source changed after the note was filed, it's auto-stamped `stale`.
- **Orphan detection**: notes nobody links to are reported in the console (not auto-fixed —
  worth mentioning to the user so they know a note isn't surfacing anywhere).

Proactively suggest a scoped `curate` after any session that generated many markdown
files — it replaces hand-written HANDOFF.md files with something durable and searchable.

## Link provenance

Routed notes keep working references, not broken ones: a link to a file adopted in the
same batch becomes a vault wikilink (a real graph edge); a link to any other file that
exists on disk becomes an editor deep-link (`cursor://file/<abs>:<line>` — opens the real
file at the line) or a plain `file://` link for binaries, based on the `editor` config set
during `init`. Links to files that don't exist are left untouched — loredex never invents a
link. Every copied note also records where it came from as `source_path` frontmatter.

## Notes

- `adopt` copies by default (originals stay, stamped `loredex: routed`); `--move` relocates
  instead. `reset` is the only command that deletes anything, and only vault-owned copies —
  never the originals.
- Every command that writes supports `--dry-run` — always show the user a dry run before
  applying, except for the Stop hook's own automatic `route --strict` (frontmatter-only, no
  guessing, safe to run silently).
- No LLM installed? Everything still works — classification and curation fall back to
  filename/path heuristics (`doctor` reports which classifier is active).
