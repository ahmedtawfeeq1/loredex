# Dex spec: types & the `agent-ops` layout

A **dex** is loredex's knowledge store (an Obsidian-compatible folder; earlier docs
say "vault" — same thing, the store is now called a dex). This spec covers **dex
types**: what a dex is *for*, and the on-disk contract each type guarantees.

## Dex types

The type lives in the dex, so every engine and teammate sees the same behavior:

```
_index/dex.json        → {"type": "agent-ops"}
```

- **No file → `research`** — today's default: AI research notes routed by topic
  (`projects/<project>/<topic>/note.md`, see VAULT-SPEC.md). Every pre-existing dex
  keeps working unchanged.
- **`agent-ops`** — an agency operating a fleet of client AI-agent deployments.
  Fixed, validated layout below.

Type-specific behavior always branches *inside* the shared entry points
(`rebuildIndexes`, `searchVault`, `doctor`, …) — signatures never change per type,
so hosts that pass only a dex path (desktop, Obsidian plugin) ride along free.

## `agent-ops` hierarchy

```
Manager ─▸ Client ─▸ Pipeline | Agent ─▸ Stage (pipelines only)
sara    ─▸ brightsmile_dental ─▸ lead_reactivation ─▸ 02_qualify
```

- **Manager** — reuses the products manifest (`_index/products.json`); views relabel
  the level "Manager". Assign via `loredex new client <name> --manager <m>` or
  `loredex products set`.
- **Client** — a project (`projects/<client>/` on disk; views say "Clients").
- **Category** — *tags on the client*, never a folder level. `_index/clients.json`:

```json
{ "clients": { "brightsmile_dental": { "tags": ["dental", "new-platform"] } } }
```

- **Pipeline** — a staged conversation flow. **Agent** — same definition files, no
  stages. A client holds any number of each.

## Client layout

```
projects/<client>/
  pipelines/<pipeline>/
    _persona.md                  # who the AI is
    _general_instructions.md     # cross-stage behavior
    _actions.curls.yaml          # pipeline-global actions (curl definitions)
    _settings.export.yaml        # AI model settings (platform export, raw)
    stages/
      01_<stage>/
        01_enter_condition.md
        01_stage_instructions.md
        01_followup.md           # frontmatter = followup settings, body = instructions
        01_actions.curls.yaml    # stage-scoped actions
  agents/<agent>/                # the four _ files, NO stages/
  knowledge_tables/*.csv         # grounding data, shared per client
  automation_workflows/*.json    # workflow exports (n8n etc.) — raw, never rewritten
  _inbox/                        # client intake pending consumption (doctor: attention)
  _randoms/                      # keep-anyway; searchable, exempt from every lint
  workspace.yml                  # committed, secret-free agent-tooling spec
  .mcp.json                      # GENERATED from workspace.yml — gitignored
  .claude/settings.json          # GENERATED — gitignored
  AGENTS.md                      # GENERATED — gitignored
```

### Rules

- **Definition files** carry a bare `_` prefix and sort above `stages/`.
- **Stage numbering is strict**: folders `01_`, `02_`, … contiguous from 01; every
  file inside repeats the folder's `NN_`. `loredex new stage <client> <pipeline>
  <name> [--before NN | --after NN]` inserts and renumbers (git mv in git dexes).
  `loredex doctor` errors on gaps, duplicates, and prefix mismatches.
- **Mixed settings + instructions → `.md` with YAML frontmatter** (settings in
  frontmatter, instructions in the body). **Pure platform exports stay raw**
  (`.yaml`/`.json`) — machine truth, git-diffable, loredex never rewrites them.
- `.curls.yaml` suffix marks action files; no invented extension.
- `_inbox/` = intake queue: consume by moving the file to its proper home (or act +
  delete). Pending items are attention-level, never errors. Empty inbox = healthy.
- `_randoms/` = the escape hatch that keeps the rest strict: indexed for search,
  ignored by every lint (including the secret scan).

## `workspace.yml` → generated agent tooling

Committed and secret-free; secrets stay in the environment as `${VAR}` references,
expanded when `loredex workspace <client>` generates the local files:

```yaml
mcp:
  crm-bridge:
    command: npx
    args: [-y, some-mcp-client]
    env: { CRM_TOKEN: "${CRM_TOKEN_BRIGHTSMILE}" }
plugins:
  claude: [some-plugin@some-marketplace]
skills: []
```

Generation is idempotent and merge-preserving (foreign `.mcp.json` servers are never
touched). `loredex workspace <client> --check` reports drift without writing (CI
contract: non-zero exit on drift or missing env vars). Generated files are
gitignored by the client scaffold; `doctor` errors if one is git-tracked and scans
committed files for secret-looking strings (JWTs, API keys — rotate anything it finds;
`${VAR}` placeholders are the sanctioned pattern).

Codex per-client config generation: open item — verify Codex's current MCP config
format before emitting anything beyond `AGENTS.md`.

## Committed vs generated

| File | State |
|---|---|
| `workspace.yml`, all `_*.md`/`.curls.yaml`, stages, tables, workflows | committed |
| `_index/dex.json`, `_index/clients.json`, `_index/products.json` | committed |
| `.mcp.json`, `.claude/settings.json`, `AGENTS.md` (client-level) | generated, gitignored |
| `_index/Home.md`, `_index/<client>.md`, `_index/Dashboard.base` | generated, committed (merge driver keeps local) |
