# Design: dex types + the `agent-ops` type (Manager → Client → Pipeline|Agent → Stage)

**Status:** shipped with loredex 2.5.0 (implementation plan and decisions recorded here;
the on-disk contract lives in `docs/DEX-SPEC.md`). Obsidian-plugin support deliberately
deferred — see `loredex-obsidian/FUTURE-WORK.md`.

## Problem

loredex assumed one kind of dex: AI research notes, free-form topics, routed by
frontmatter. An **agency operations dex** is a different shape: a fleet of client
AI-agent deployments, each with a *fixed, validated* file layout — persona,
instructions, ordered pipeline stages, stage-less agents, knowledge tables,
automation workflow exports, and per-client agent tooling (MCP servers, plugins,
skills). Topic routing is wrong there; schema + scaffolding + validation is what's
needed.

```
Manager ─▸ Client ─▸ Pipeline | Agent ─▸ Stage (pipelines only)
sara    ─▸ brightsmile_dental ─▸ lead_reactivation ─▸ 02_booking
```

A client can run **several pipelines**, and also **agents** — same definition files
as a pipeline but no stages. **Category** (industry, platform generation, …) is
*not* a folder level — it's tags on the client, shown as chips and filterable.

## Decisions (settled with the user — don't relitigate)

- **Terminology**: the knowledge store is a **dex** ("vault" is Obsidian's word).
  User-facing only — UI labels, docs, CLI help, new filenames. Internal identifiers
  (`vaultPath`, `vault_search` MCP tool names, `vault.*` IPC channels,
  `docs/VAULT-SPEC.md`) unchanged: zero breakage.
- Keep `projects/` on disk; views relabel to "Clients".
- Manager = products manifest reused (relabeled); category = tags in
  `_index/clients.json`; never a folder level.
- Strict contiguous stage numbering `01,02,03`; `new stage --before/--after`
  renumbers via git mv; doctor errors on gaps.
- Secrets: `${ENV_VAR}` expansion only in `workspace.yml` → generated files.
- Mixed settings+instructions files = `.md` with YAML frontmatter; raw platform
  exports stay `.yaml`/`.json`; `.curls.yaml` = action-file convention.
- `_inbox/` = client intake pending consumption (attention, never error);
  `_randoms/` = keep-anyway catch-all (searchable, lint-exempt).
- All examples/fixtures fictional (brightsmile_dental, peak_fitness, sara) — never
  the maintainer's real company. Guarded by `tests/fictional-names.test.ts`.

## Mechanism

- `_index/dex.json` `{"type": "agent-ops"}`; absent → `research` (unchanged).
- **Signature-stability rule**: `rebuildIndexes(vaultPath)`, `searchVault`,
  `buildDigest` keep signatures; agent-ops branching happens inside keyed off
  `loadDexType`. Hosts that pass only a dex path (desktop, Obsidian) ride free.
- New core modules: `dex.ts`, `clients.ts`, `agent-ops.ts` (fleet scanner),
  `agent-ops-scaffold.ts`, `doctor-agent-ops.ts` (pure lint engine),
  `indexer-agent-ops.ts`, `workspace.ts`, `tables.ts` — all lib-exported.
- New CLI: `init --type agent-ops`, `new client|pipeline|agent|stage`, `clients
  list|tag|untag|set-tags`, `workspace <client> [--check]`.
- Doctor: agent-ops lint matrix + fleet summary table + committed-secret scan +
  tracked-generated-files check; exit 1 on error-level findings.
- Non-md indexing (agent-ops only): yaml/json top-level keys + csv headers into
  search and digests; `_randoms/` included; research dexes byte-identical.
- MCP: tool descriptions say "dex"; tool names/schemas unchanged; `vault_store`
  lands in `projects/<client>/_randoms/` on agent-ops dexes.

Full client layout, workspace.yml shape, and the committed-vs-generated table:
`docs/DEX-SPEC.md`. Rollout choreography and per-surface work packages: approved
implementation plan (deep-questing-floyd), summarized in the 2.5.0 changelog.

## Deferred

- Obsidian plugin bump/wording (thin delegator — rides on core; pickup notes in
  `loredex-obsidian/FUTURE-WORK.md`).
- Codex per-client config generation beyond `AGENTS.md` (verify format first).
- Knowledge-table row-level search; xlsx (convert to csv instead).
