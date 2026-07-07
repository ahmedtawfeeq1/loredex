# User guide

Everything loredex can do, organized by when you'd reach for it, plus a test-drive
checklist to exercise every feature end to end. If you've only ever run `adopt` once,
start with [Test-drive your vault](#test-drive-your-vault) — it walks the rest.

## Mental model

```
 your projects                    the vault (~/Loredex by default)
┌──────────────────┐             ┌─────────────────────────────────┐
│ my-app/docs/*.md  │  adopt/    │ _inbox/         ← unrouted drops │
│ my-app/AGENTS.md  │  route/    │ _index/         ← auto MOCs      │
│ (agent writes     │  curate    │ projects/<name>/<topic>/*.md     │
│  new findings)     │ ────────► │ projects/<name>/Start Here - *.md│
└──────────────────┘             │ research/       ← no-project     │
                                  └─────────────────────────────────┘
                                              │
                                        open in Obsidian
```

Four stages: **set up** a project once, **fill** the vault as agents write, **understand**
what's in there with `curate`, **maintain** it as things change. One command per stage
covers the common case; everything else is for specific situations.

## Command reference

### Setup — once per project

```bash
npx -y loredex@latest init [--vault <path>] [--sync git] [--editor <name>]
```
Registers the current directory, creates the vault if it doesn't exist, writes conventions
into `AGENTS.md`/`CLAUDE.md`/`.cursor/rules/loredex.mdc`. `--editor` controls what scheme
code links use (`cursor`, `vscode`, `windsurf`, `system`, or any custom URI scheme) — omit
it and loredex auto-picks when exactly one supported editor is installed.

### Fill the vault

```bash
npx -y loredex@latest adopt [path] [--dry-run] [--move] [-y] [--no-llm]
```
Scans a project for research-shaped markdown already sitting in it (`docs/`, filenames like
`GAP-ANALYSIS.md`, anything with loredex frontmatter) and files it into the vault. Always
run `--dry-run` first — it prints the exact plan (source → destination) before anything
writes. Default mode **copies**; originals stay in place, stamped `loredex: routed` so they
never get re-adopted. `--move` relocates instead.

```bash
npx -y loredex@latest route [--from <dir>] [--dry-run] [--strict] [--no-llm]
```
Processes the vault's `_inbox/` plus any new frontmattered files in a registered project.
This is what the Claude Code plugin's Stop hook runs automatically after every session —
you rarely need to call it by hand unless you're on an agent without a hook (see `watch`
below) or want to force a pass right now.

**Two lanes, one destination.** A frontmattered file inside a registered project routes
**directly** to `projects/<project>/<topic>/YYYY-MM-DD-slug.md` — copied, original stamped
`loredex: routed`, inbox never touched. `_inbox/` is only the lane for files that *don't*
start inside a registered project (dropped there by you, an agent, or the MCP `vault_store`
tool); those get classified and **moved** out on the next route. An empty inbox is a
healthy inbox. And note the stamp is the router's signature — an agent must never write
`loredex: routed` itself, or the file is skipped as already-filed.

**Where hooks work.** Claude Code's hooks fire wherever Claude Code runs — a plain
terminal, or the terminal panel inside VS Code, Cursor, Antigravity, any IDE. Filing is
fully automatic there. Only *native* IDE agents (Cursor Composer, Antigravity's side
panel, etc.) have no hook: the conventions file still makes them write correct
frontmatter, then `loredex watch`, an agent-run `route`, or the next manual pass files it.

### Understand the vault

```bash
npx -y loredex@latest curate <project> [--objective "<text>"] [--since <date>] \
  [--topic <t>] [--max-detailed <n>] [--dry-run] [-y] [--no-llm]
```
The deep command. Reads the project's notes and writes a **`Start Here` brief**: a
narrative of what the project is, a reading order, and next actions — all steered by
`--objective` if you give one (if you don't, the LLM infers one from the notes). Also:

- **`--since`/`--topic`** scope it to a recent batch instead of the whole project. Scoped
  runs write a separate, named brief (`Start Here - <project> - <slug>.md`) so each session
  gets its own durable handoff instead of overwriting the last one.
- **Stale/duplicate detection**: notes the LLM judges outdated get `status: stale`
  frontmatter (with a `superseded_by` pointer when a replacement exists); notes covering the
  same ground get flagged as merge candidates. Nothing is auto-merged — you decide.
- **Drift detection** (deterministic, no LLM needed): if a note's `source_path` file has git
  commits after the note's own `date`, it's auto-stamped stale. Runs every time, even
  with `--no-llm`.
- **Orphan detection** (deterministic): notes with zero inbound links are reported in the
  console — not auto-fixed, just surfaced so you know something isn't showing up anywhere.
- **`--max-detailed`** (default 60): only this many of the most recent notes get full
  content in the LLM prompt; older ones become a metadata-only index line. Keeps the prompt
  bounded as a project grows — you'll rarely need to touch this.

```bash
npx -y loredex@latest status
```
Quick numbers: note count, project/topic count, inbox backlog, unrouted candidates in the
current project.

### Maintain the vault

```bash
npx -y loredex@latest reset <project> [--dry-run] [-y]
```
Removes a project's vault copies and un-stamps the originals so you can `adopt` again from
scratch. **Only** command that deletes anything, and it only ever deletes loredex's own
copies inside the vault — source files are untouched, just have their `loredex: routed`
marker removed. Use this if you adopted before a version that changed how notes are filed
(e.g. before link rewriting existed) and want the vault rebuilt cleanly.

```bash
npx -y loredex@latest watch
```
Daemon: watches the inbox and registered projects, routes automatically on file change.
The universal fallback for any agent without a native hook.

```bash
npx -y loredex@latest doctor
```
Health check: config present, vault reachable, git sync status, which editors were
detected, whether an LLM classifier (`claude`/`codex`) is available.

## Test-drive your vault

If you've only run `adopt` once, this exercises everything else on real data. Safe order —
read-only checks first, then increasingly write-y ones:

1. **`npx -y loredex@latest doctor`** — confirm vault path, sync mode, detected editor, and
   LLM classifier are all what you expect. Fix anything it flags before continuing.
2. **`npx -y loredex@latest status`** — note the current count. You'll compare against this
   after later steps.
3. **Curate the whole project, dry-run first**:
   ```bash
   npx -y loredex@latest curate <your-project> --dry-run
   ```
   No objective given — read what the LLM infers as the project's objective. This alone
   tells you a lot: does its summary of "what this project is" match reality? If not, your
   frontmatter/topics may need tightening before trusting deeper features.
4. **Apply it**: drop `--dry-run`, add `-y`. Open the vault in Obsidian afterward:
   - Look for the new `Start Here - <project>.md` note — does the reading order make sense?
   - Check the console output for orphan and drift counts from this run.
   - Pick one flagged-stale note in Obsidian's Properties panel — does `status: stale` and
     `superseded_by` (if present) look right?
5. **Scoped curate, simulating a single session's output**:
   ```bash
   npx -y loredex@latest curate <your-project> --since <a-recent-date> \
     --objective "test the scoped brief feature"
   ```
   Confirm it writes a **separate** `Start Here - <project> - test-scoped-brief.md` rather
   than overwriting the one from step 4.
6. **Check link provenance**: open any adopted note in Obsidian, look at Properties for
   `source_path`. Click a code-file reference inside the note body — it should open your
   editor at the right line, not create an empty Obsidian note.
7. **Force a drift hit on purpose**: pick a note with `source_path` pointing at a real file,
   edit and commit that source file, then re-run `curate` on that project — the note should
   come back stamped `stale` this time, from drift alone, even with `--no-llm`.
8. **Try `--no-llm`** on the same project — confirm ghost-link cleanup, orphan detection,
   and drift detection all still run and report correctly with zero LLM calls.
9. **`reset --dry-run` then a real reset+re-adopt round trip** on a project you don't mind
   rebuilding — confirm vault copies disappear, originals keep their content but lose the
   `loredex: routed` marker, then `adopt` brings it back with fresh link rewriting.
10. **`watch`** in a terminal you leave open — edit a frontmattered file in a registered
    project and confirm it routes within a couple of seconds without any command from you.

By the end you'll have exercised init, adopt, route, curate (scoped and unscoped, LLM and
deterministic-only), drift, orphans, link provenance, reset, and watch — the whole surface.

## FAQ

**Do I need to run `route` manually?** Only if you're not on Claude Code (no Stop hook) or
want to force a pass immediately. Otherwise it's automatic.

**What if curate's stale/duplicate call is wrong?** Nothing is destructive — edit the
`status` frontmatter back, or just ignore the flag. The brief and stamps are proposals, not
deletions.

**Vault feels cluttered with `Start Here` briefs.** Scoped ones (with a slug after the
project name) are session handoffs — safe to delete once you've acted on them. The
unscoped `Start Here - <project>.md` is the one worth keeping current.

**How do I know if I need `reset`?** If clicking a link inside an old note creates an empty
Obsidian note instead of navigating somewhere, that note predates link provenance (v0.5).
`reset` that project, then `adopt` again.

## Multi-project products: handoffs between teams

One product, several repos (AI engine → backend → frontend), each feeding the same vault
(share it via a private git remote). When one team finishes work another team builds on:

```bash
# finishing team (run from their repo)
npx -y loredex@latest handoff --to backend \
  --objective "implement the corrections CRUD endpoints" --since 2026-07-01 --dry-run
```

Review the brief, re-run with `-y`. The handoff lands in `projects/backend/handoffs/` with
`status: open` and is pushed to the vault remote automatically. It carries what the
interface artifact alone doesn't: field semantics, decisions, gotchas, and a reading order
into the source team's actual notes.

```bash
# receiving team, at the start of their next session
npx -y loredex@latest handoffs                     # pulls the remote, lists open handoffs
npx -y loredex@latest handoffs --consume <name>    # after acting on one
```

`npx -y loredex@latest sync` is the general commit-pull-push loop for everything else the
team should see (big adopts, curates). Offline everything degrades to local-only and says so.

## The product view: `curate --product`

For a product spanning several projects (one shared vault, each team's repo registered
into it), this is the "full knowledge over the product" command:

```bash
npx -y loredex@latest curate --product --objective "ship the corrections feature" --dry-run
```

One run pulls the vault remote, then produces `Start Here - Product.md` at the vault root:

- **Projects table** — per-project note counts, last activity, active topics, stale
  counts, and whether each project's own Start Here brief is current.
- **Flow** — every open handoff between teams with its age (an old open handoff = a team
  that hasn't started), plus recently consumed ones.
- **Cross-project references** — which projects' notes link into which.
- **LLM sections** (skipped with `--no-llm`): the product narrative, one-line state and
  next step per project, a reading order across projects, and **report-only**
  risks/contradictions and duplicate-coverage findings — e.g. one project documenting an
  API field as optional while another validates it as required. Nothing is auto-stamped
  across project boundaries; you judge the findings.

`--refresh-stale` first re-curates any project whose brief is missing or out of date, so
the product view is built from fresh material. Runs are incremental — projects that
haven't changed reuse their existing briefs at zero LLM cost.

### Teams sharing one vault

Generated files (`_index/*`, the product brief) are regenerated wholesale, so loredex
registers a git merge driver that keeps them from ever conflicting between teammates —
`sync` regenerates them from real post-pull content instead of line-merging. And every
routed note now carries portable provenance (`source_project` + `source_rel` alongside the
machine-local `source_path`), so drift detection works on any teammate's machine, resolved
through their own registered project paths.

## Live vault access for agents: `loredex mcp`

`init` wires the loredex MCP server into your project's `.mcp.json`, so MCP-capable agents
(Claude Code, Cursor, Codex, Gemini CLI…) can use the vault mid-task instead of only at
session boundaries:

- `vault_search` / `vault_note` — "did anyone already research X?" answered in-task, with
  briefs and handoffs ranked above raw notes and stale notes sunk.
- `handoffs_open` / `handoff_consume` — the cross-team handoff loop for agents without
  loredex's Claude Code hooks.
- `product_state` — the cross-project dashboard on demand.
- `vault_store` — safe writes: complete frontmatter, routed by the loredex router, never
  directly into `projects/`, never deletes.

Every response is framed as data authored by vault writers (the same injection-hardening
principle as the SessionStart hook), and `vault_note` refuses paths outside the vault.
