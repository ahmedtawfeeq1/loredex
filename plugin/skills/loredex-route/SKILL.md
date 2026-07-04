---
name: loredex-route
description: Process the vault's _inbox/ plus any new frontmattered files in the current project right now. Use when the user says "route my findings", "file what's pending", or wants a routing pass forced immediately instead of waiting for the automatic Stop hook.
---

# /loredex-route

```bash
npx -y loredex@latest route [--from <dir>] [--strict] [--no-llm]
```

This is what the Claude Code Stop hook already runs automatically (with `--strict`) after
every session — you rarely need to call it by hand. Reach for it explicitly when:

- The user is on an agent without a hook (Cursor, Codex, etc.) and wants a pass right now.
- Files are sitting in the vault `_inbox/` or a project's `docs/` unrouted.
- They want to force classification of unlabeled files (omit `--strict` so the LLM/heuristic
  classifier runs, not just frontmatter-complete files).

Run `--dry-run` first if the user hasn't already reviewed what's pending — `route` writes
immediately otherwise.
