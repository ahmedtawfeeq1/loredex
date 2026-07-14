# Design: multi-dex vault resolution (kill the one-`vaultPath`-per-machine limit)

**Status:** implemented (feat/multi-dex-resolution). Resolution order shipped as
specced; one addition during implementation: `scaffoldVault` never re-types an
already-declared dex, so `adopt` (which passes the default type) can't flip an
agent-ops dex back to research.

## Problem

`Config` holds exactly one `vaultPath`, and every command does
`loadConfig().vaultPath`. One machine = one dex. The first real agent-ops user
(day one of 2.6.0) already runs two: a research dex (`~/Loredex`, 16 registered
projects) and an agent-ops fleet dex (the clients repo). Today that requires a
second config via `LOREDEX_CONFIG_DIR` and an env prefix on every fleet command
— workable, undiscoverable, and easy to forget (bare `loredex` silently hits the
wrong dex).

Two `init` footguns made this worse in practice (real incident, 2026-07-14):

1. `init` with no `--vault` falls back to the existing global `vaultPath` and
   ran `saveDexType` on it — stamping `agent-ops` onto a live research dex.
2. `init --vault X` unconditionally does `config.vaultPath = vaultPath`
   (init.ts:40) — repointing *every* registered project's dex as a side effect
   of setting up one project.

## Decisions

- **No breaking config change.** `vaultPath` stays the global default. New
  behavior layers on top; a config from 2.6.0 behaves identically until the
  user opts in via `init --vault` or runs commands inside a dex.
- **Resolution is per-invocation, not per-machine.** A single helper decides
  which dex a command operates on, from where it was run.
- **`_index/dex.json` becomes the universal dex marker.** `init` now always
  writes it (`{"type": "research"}` included). Absent still means `research`
  (back-compat, teammate clones of old dexes unaffected).
- **`init` never silently mutates global state.** Global `vaultPath` is written
  only when bootstrapping a config that doesn't exist yet.
- **Type changes are refused, not absorbed.** `init --type X` against an
  existing dex of type Y errors out and tells the user to edit
  `_index/dex.json` by hand if they truly mean it. This is the direct fix for
  footgun 1.
- `LOREDEX_CONFIG_DIR` keeps working unchanged (tests, exotic setups).

## Mechanism

### `resolveVault` (new, `src/core/config.ts`)

```ts
export interface ResolvedVault {
  vaultPath: string
  source: 'flag' | 'dex-marker' | 'project' | 'global'
}
export function resolveVault(config: Config, cwd: string, explicit?: string): ResolvedVault
```

Order, first hit wins:

1. **`explicit`** — a new program-level `--vault <path>` option every command
   accepts (commander global option; desktop's core host already passes an
   explicit path at lib level, so this only formalizes the CLI side).
2. **dex-marker walk** — nearest ancestor of `cwd` containing
   `_index/dex.json`. Covers: running inside an agent-ops dex (the fleet repo
   *is* the dex), running inside the research dex itself, and a teammate who
   cloned a dex repo and has no config at all (skip the `no loredex config`
   error when the walk hits — synthesize a minimal in-memory config).
3. **project entry** — `findProject(config, cwd)` already walks up to the
   registered project; its entry gains an optional field:

   ```ts
   projects: Record<string, { name: string; vaultPath?: string }>
   ```

4. **global** — `config.vaultPath`, exactly today's behavior.

All 17 `loadConfig()` call sites in `src/commands/` swap
`config.vaultPath` → `resolveVault(config, process.cwd(), program.opts().vault).vaultPath`.
Mechanical; no signature changes anywhere in core (the signature-stability rule
from the agent-ops design holds — `rebuildIndexes(vaultPath)` etc. untouched).

### `init` changes

- `--vault X` writes `vaultPath: X` into **this project's entry** when X differs
  from the global `vaultPath`; global is only set when `loadConfig()` returned
  null (first init on the machine).
- Always `saveDexType(vaultPath, type)` — research dexes get an explicit
  manifest from now on, which is what makes the dex-marker walk universal.
- Guard: if `_index/dex.json` exists with a different type than `--type`,
  error (`dex at <path> is type "research" — refusing to re-type; edit
  _index/dex.json if you mean it`) and exit 1 before any other write.

### Visibility

- `status` and `doctor` print the resolved dex and *why*:
  `dex: /path/to/clients_work (agent-ops, via dex-marker)`. Kills the
  "which dex am I talking to?" class of confusion outright.

### Per-dex sync mode

`gitAutoCommit` reads global `config.sync` — wrong once two dexes disagree.
`_index/dex.json` gains optional `"sync": "git" | "none"`, falling back to the
global value. It's committed and shared, which fits: whether a dex auto-commits
is team policy, not machine preference.

## Non-goals

- Operating on several dexes in one invocation, a dex registry/picker UI, or
  desktop changes (windows are already bound to an explicit dex path).
- Renaming `vaultPath` internals (settled: user-facing "dex" only).
- Migrating existing `LOREDEX_CONFIG_DIR` setups automatically. Manual merge is
  two steps: add the project entry with its `vaultPath` to the default config,
  delete the extra config dir.

## Tests

- `resolveVault` unit matrix: flag beats marker beats project beats global;
  nested dexes take the nearest marker; no-config + marker works (teammate
  clone); no-config + no-marker still errors like today.
- `init`: second-init-with-different-vault leaves global untouched; re-type
  guard errors; research dexes now get `dex.json`.
- Back-compat: a 2.6.0 config with no per-project `vaultPath`, commands run
  from a research project dir → byte-identical behavior (existing suites stay
  green as-is).
- Fixture names stay fictional per `tests/fictional-names.test.ts`.

## Effort

Small. One new helper + one optional config field + mechanical swap at 17 call
sites + init guards + tests. No core signature changes, no on-disk format
changes beyond `dex.json` gaining an optional key and existing-but-optional
presence in research dexes.
