---
name: loredex-product
description: Curate the whole product — a cross-project dashboard and brief spanning every project in the vault, with per-project state, the handoff flow between teams, and report-only cross-project risks/duplicates. Use when the user asks for the product view, "where does the whole product stand", "what's the state across projects/teams", or wants cross-project contradictions checked.
---

# /loredex-product

```bash
npx -y loredex@latest curate --product [--objective "<text>"] [--refresh-stale] [--dry-run] [-y]
```

Ask the objective first if the user has one (steers the narrative); without it the LLM
derives the product's objective from the material.

What one run does:

1. **Pulls the vault remote** so teammates' latest notes and handoffs are included.
2. **Deterministic dashboard** (works with `--no-llm` too): per-project state table (notes,
   last activity, active topics, stale counts, Start-Here-brief freshness), the flow table
   of open/consumed handoffs between teams with age, and cross-project reference edges.
3. **LLM reduce** over the per-project Start Here briefs + recent notes: product narrative,
   one-line state + next step per project, a cross-project reading order, and
   **report-only** risks/contradictions and duplicate-coverage findings (e.g. two projects
   describing the same API field differently). Nothing is auto-stamped across project
   boundaries — surface the findings to the user and let them judge.
4. Writes `Start Here - Product.md` at the vault root (linked from the Home index),
   commits, and pushes.

`--refresh-stale` re-curates any project whose own brief is missing or older than its
newest note before the reduce — use it when the per-project briefs haven't been kept up.
Cost note: unchanged projects reuse their existing briefs, so runs are incremental.

Show the dashboard + any risks/duplicates to the user with `--dry-run` first, then apply
with `-y` after they confirm — same choreography as every other loredex write.
