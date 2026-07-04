# Architecture

One repo, three deliverables:

1. **npm CLI** (`src/`) — all logic. `npx loredex` works with zero install.
2. **Claude Code plugin** (`plugin/`) — thin wrapper: a Stop hook and a skill that call the
   CLI. The repo root is also a plugin marketplace (`.claude-plugin/marketplace.json`).
3. **Vault spec** (`docs/VAULT-SPEC.md`) — the plain-markdown protocol any agent can follow.

## Data flow

```
agent writes .md ──► docs/ or vault _inbox/
                          │
                          ▼
              loredex route / adopt / watch
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
  frontmatter ok?   LLM classify        heuristic
  (deterministic)   (claude/codex CLI)  (path+filename rules)
        └─────────────────┼──────────────────┘
                          ▼
       vault/projects/<project>/<topic>/YYYY-MM-DD-slug.md
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        Related links   _index MOCs  git auto-commit (optional)
```

## Modules

| Path | Responsibility |
|---|---|
| `src/cli.ts` | commander wiring only |
| `src/commands/*` | one file per command; orchestration + console output |
| `src/core/config.ts` | `~/.config/loredex/config.json` load/save, project lookup |
| `src/core/frontmatter.ts` | gray-matter wrapper, meta contract, routed/routable predicates |
| `src/core/scan.ts` | markdown walker + candidate heuristics (what looks research-shaped) |
| `src/core/classify.ts` | merge order: heuristic base ← LLM ← existing frontmatter |
| `src/core/vault.ts` | path math: slugs, target dir/name, collision handling |
| `src/core/router.ts` | plan/execute: write, stamp, links, indexes, git commit |
| `src/core/indexer.ts` | full-regenerate `_index/` MOCs (idempotent) |
| `src/core/linker.ts` | `## Related` wikilinks to topic siblings |
| `src/llm/*` | classifier providers: claude CLI, codex CLI, heuristic; env-forcible |

## Design rules

- **Files are the API.** No daemons required, no database, no lock-in. Everything works on
  a plain folder; Obsidian is the viewer, not a dependency.
- **Deterministic before LLM.** Frontmatter routes without any model call. LLM is only for
  unlabeled backlogs (`adopt`). Hooks run `--strict` (frontmatter-only) so sessions never
  block on classification.
- **Never destroy.** No deletes; copies stamp originals; collisions suffix; everything has
  `--dry-run`.
- **Idempotent.** `loredex: routed` marker + full-regenerate indexes: run anything twice,
  nothing changes.

## Testing

`npm test` — vitest. Unit tests per core module + one e2e (`tests/e2e.test.ts`) that runs
adopt/route against temp dirs with `LOREDEX_CLASSIFIER=none` (no network, no LLM).

## Curate flow (v0.3)

```
loredex curate <project> [--objective ...] [--since/--topic scope]
   │
   ├─ deterministic: sanitizeWikilinks over scoped notes (src/core/sanitize.ts)
   ├─ digest: name+meta+headings+excerpt per note (src/core/curate.ts)
   ├─ LLM (one call, src/llm/curator.ts): brief, reading order, next actions,
   │   stale flags, duplicate sets, semantic clusters — steered by the objective
   └─ apply (non-destructive): _START-HERE brief note, frontmatter stamps,
       Related sections rewritten from clusters, indexes rebuilt, git commit
```

## Link provenance (v0.5)

`src/core/relink.ts` rewires links in `executePlan`: batch-sibling links → wikilinks
(mapping built from all PlanItems before writing), existing files → editor deep links or
file://, unresolvable → untouched. `src/core/sanitize.ts` exports the shared
`mapOutsideCode` walker (fence + inline-code aware) both transforms use. Copied notes get
`source_path` frontmatter. `src/commands/reset.ts` = guarded rebuild path (vault copies
only, originals just unstamped).
