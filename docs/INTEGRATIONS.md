# Using loredex with development frameworks

Loredex operates on markdown files, so any framework that manages development through
markdown (BMAD, Spec Kit, or your own conventions) already produces loredex-compatible
material. What the framework does NOT do by itself is consult the vault at the right
moments — these snippets wire that in.

## The two moments that matter

1. **Before planning** — the agent should read open handoffs and prior decisions, so plans
   build on what other teams/sessions already established instead of a bare interface
   artifact (the "Postman collection without context" failure).
2. **After producing research/spec/planning markdown** — files should carry loredex
   frontmatter so routing files them automatically.

Claude Code with the loredex plugin gets both automatically (SessionStart + Stop hooks).
Everything below is for agents/frameworks without those hooks.

## BMAD

Add to your BMAD technical preferences (or the custom instructions your BMAD agents load —
e.g. `.bmad-core/data/technical-preferences.md`):

```markdown
## Knowledge vault (loredex)

- Before drafting any PRD, architecture doc, or story: run
  `npx -y loredex@latest handoffs` and read any open handoff addressed to this project —
  it contains the upstream team's interfaces, payload semantics, decisions, and gotchas.
  Mark it consumed after acting: `npx -y loredex@latest handoffs --consume <name>`.
- For the cross-project state of the whole product, read the vault's
  `Start Here - Product.md` (regenerate with `npx -y loredex@latest curate --product` if
  stale).
- Every research/analysis/planning markdown file you produce gets loredex frontmatter
  (project, topic, type, date, source, tags) — see AGENTS.md's "Research filing" section.
  Files without it still get filed by `loredex route`, but frontmattered files route
  deterministically.
```

BMAD's own artifacts (`_bmad-output/`, PRDs, stories, specs) are research-shaped markdown —
`loredex adopt` files them like anything else, and `loredex handoff` is how a finished
BMAD phase in one repo becomes the starting context for the next team's BMAD session.

## Spec Kit

Add to your project constitution (`memory/constitution.md` or wherever your Spec Kit setup
keeps standing rules):

```markdown
## Knowledge vault (loredex)

Before /specify or /plan: check `npx -y loredex@latest handoffs` for open handoffs to this
project and read the vault's Start Here brief for prior decisions. Specs and plans you
produce should carry loredex frontmatter (see AGENTS.md) so they file into the shared
vault automatically.
```

## Any other agent or framework

`loredex init` already injects the filing conventions into `AGENTS.md` (read by Codex,
Cursor, Copilot, Windsurf, and most agent CLIs), `CLAUDE.md`, and a Cursor rules file. The
missing piece for hook-less agents is the *pull* side — teach the agent (via its own
instruction file) to run `npx -y loredex@latest handoffs` at the start of work, or run
`npx -y loredex@latest watch` in a terminal for automatic routing of what it writes.

## The multi-repo product loop, end to end

```
AI engine team finishes a feature (BMAD/Spec Kit session in engine repo)
  └─ npx loredex handoff --to backend --objective "implement the CRUD"
        → brief with interfaces/semantics/decisions lands in the vault, pushed

Backend dev starts a session (backend repo)
  └─ Claude Code: open handoffs auto-injected at session start (plugin hook)
  └─ other agents: `npx loredex handoffs` per the framework snippet above
  └─ BMAD/Spec Kit plans WITH the upstream context — not just an endpoint list
  └─ finished work → handoff --to frontend → same loop

Anyone, anytime: npx loredex curate --product
  └─ the cross-project dashboard: who shipped what, who's blocked, contradictions
```
