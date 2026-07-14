---
name: loredex-handoff
description: Hand finished work from this project to another team's project — writes a consumable brief (interfaces, payload semantics, decisions, gotchas) into the receiving project's dex space and syncs it. Use when the user says "hand this off to backend/frontend/<team>", "the engine work is done, tell the backend team", or finishes a feature another project will build on.
---

# /loredex-handoff

Ask two things before running:

1. **Receiver** — which project/team consumes this work (`--to backend`).
2. **Objective** — what will they DO with it (`--objective "implement CRUD for the
   correction endpoints"`). This steers the whole brief toward what the receiving team
   needs: interfaces, payload/field semantics, decisions, gotchas — not just a summary.

Scope defaults to the whole source project; if the handoff covers one feature's recent
work, narrow it: `--since <date-work-started>` or `--topic <t>`.

```bash
npx -y loredex@latest handoff --to <project> --objective "<text>" [--since <date>] --dry-run
```

Show the user the printed brief (objective, summary, reading order), get their confirmation
— a handoff is authored by the finishing team, never fire-and-forget — then re-run with
`-y`. The handoff lands in `projects/<receiver>/handoffs/` with `status: open` frontmatter
and is pushed to the dex remote automatically, so the receiving team's next
`/loredex-handoffs` check surfaces it.

If no LLM is available the handoff still ships: a deterministic dated reading list instead
of a narrative brief.
