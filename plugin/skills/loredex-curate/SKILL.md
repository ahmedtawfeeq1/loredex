---
name: loredex-curate
description: Write a Start-Here brief for a project or a recent session's findings, and flag stale/duplicate/orphaned notes. Use when the user says "curate my vault/research", "where do I start", "make sense of this project", or just finished a session that produced several markdown files and wants a handoff.
---

# /loredex-curate

Ask two questions before running anything:

1. **Objective** — "What's the objective this brief should answer?" (e.g. "draft the spec
   for the P0 agent"). The brief, reading order, and next actions are all steered by it.
   No objective given → omit `--objective` and the LLM derives one from the notes.
2. **Scope** — the whole project, or a recent task batch? A session that just produced N
   files is task scope: `--since <date>` or its `--topic`(s). Scoped runs write a separate
   `Start Here - <project> - <slug>.md` (a durable session handoff); unscoped runs overwrite
   the main `Start Here - <project>.md`.

Then:

```bash
npx -y loredex@latest curate <project> --objective "<text>" [--since <date>] [--topic <t>] --dry-run
```

Summarize the printed plan out loud — objective, reading order, stale flags, merge
candidates, orphan/drift counts — then re-run with `-y` once they confirm.

Every run also does this automatically, no extra command, with or without an LLM:
- **Ghost-link cleanup**: `[[x.py]]`-style links to code get rewritten so Obsidian's graph
  doesn't fill with phantom nodes.
- **Drift detection**: notes whose `source_path` file has git commits after the note's own
  `date` get auto-stamped `stale`.
- **Orphan detection**: notes nobody links to are reported (not auto-fixed) — worth
  mentioning to the user.

If the project has grown large and this feels slow, mention `--max-detailed <n>` (default
60) — only that many of the most recent notes get full content in the prompt; older ones
become a metadata-only index instead.
