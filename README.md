<div align="center">

# 📖 loredex

**Your coding agents write hundreds of markdown files.<br>Loredex gives them a brain to put them in.**

[![CI](https://github.com/ahmedtawfeeq1/loredex/actions/workflows/ci.yml/badge.svg)](https://github.com/ahmedtawfeeq1/loredex/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/loredex?color=cb3837)](https://www.npmjs.com/package/loredex)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node ≥ 20](https://img.shields.io/badge/node-%E2%89%A5%2020-brightgreen)](package.json)

*lore* — everything your agents learn &nbsp;·&nbsp; *dex* — an index that records it automatically

</div>

---

Claude Code, Codex, and Cursor generate research, findings, gap analyses, and plans as markdown — scattered across repos and sessions, never organized, never findable again. **Loredex automatically classifies and files all of it into one [Obsidian](https://obsidian.md)-compatible vault**: consistent structure, frontmatter, wikilinks, and auto-generated indexes. You never decide which folder anything goes in.

```text
BEFORE — scattered across your repo          AFTER — one connected vault
─────────────────────────────────           ────────────────────────────────────────────────
docs/GAP-ANALYSIS.md                        projects/my-app/gap-analysis/2026-07-03-gap-analysis.md
docs/current-system/00-OBJECTIVE.md    →    projects/my-app/current-system/2026-07-03-objective.md
research-dump-v2.md                         projects/my-app/engine/2026-07-01-research-dump-v2.md
notes/llm-pricing.md                        research/llm-tools/2026-06-28-llm-pricing.md
                                            _index/my-app.md        ← map of content, auto-built
                                            _index/Home.md          ← vault-wide index
```

## ⚡ Quickstart — organize an existing project in 60 seconds

```bash
cd your-project
npx loredex adopt --dry-run   # see the filing plan — writes nothing
npx loredex adopt             # do it
```

Open `~/Loredex` in Obsidian. Your scattered agent output is now a connected knowledge graph.

Originals stay in place (stamped with `loredex: routed` so they're never re-adopted). Pass `--move` to relocate them instead. Every command supports `--dry-run`.

<!-- demo.gif: adopt on a messy repo → Obsidian graph view. Record with `vhs` or QuickTime. -->

## 🧠 How it works

```text
 agents write .md          loredex routes                 your vault
┌─────────────────┐   ┌──────────────────────┐   ┌─────────────────────────────┐
│ Claude Code     │   │ 1. frontmatter?      │   │ projects/<project>/<topic>/ │
│ Codex           │ → │    → deterministic   │ → │   YYYY-MM-DD-slug.md        │
│ Cursor          │   │ 2. else LLM classify │   │ _index/  ← auto MOCs        │
│ anything        │   │ 3. else heuristics   │   │ + wikilinks, git commit     │
└─────────────────┘   └──────────────────────┘   └─────────────────────────────┘
```

1. **Deterministic first** — files with `project` + `topic` frontmatter route instantly, no LLM involved.
2. **LLM fallback** — unlabeled files are classified by whichever agent CLI you already have (`claude` or `codex`). No API key to manage.
3. **Heuristics last** — no LLM installed? Filename and path rules still file everything sanely (`--no-llm` forces this).

**Design guarantees:** never deletes anything · idempotent (run twice, nothing changes) · plain markdown, zero lock-in.

## 🔌 Install for Claude Code — auto-filing after every session

```text
/plugin marketplace add ahmedtawfeeq1/loredex
/plugin install loredex@loredex
```

The plugin adds:

- **Stop hook** — after each session, new frontmattered findings route into the vault automatically
- **Skill** — Claude learns the frontmatter conventions and the CLI commands

Then once per project: `npx loredex init`. Forget about filing forever.

## 🤝 Works with any agent

Loredex operates on **files, not agent APIs**. `loredex init` writes the conventions into `AGENTS.md` (read by Codex, Cursor, Copilot, and friends) and `CLAUDE.md`. Any tool that writes markdown with this frontmatter participates:

```yaml
---
project: my-app
topic: auth-redesign
type: research | finding | analysis | snapshot | note
date: 2026-07-03
source: codex
tags: []
---
```

No hook system in your agent? Run `loredex watch` (routes on file change) or `loredex route` from cron. The full protocol is one page: [docs/VAULT-SPEC.md](docs/VAULT-SPEC.md). Using BMAD or Spec Kit to manage development? Paste-in snippets that make them consult the vault before planning: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

## 📋 Commands

| Command | What it does |
|---|---|
| `loredex init` | Create/register the vault, wire up the current project. `--sync git` enables auto-commit |
| `loredex adopt [path]` | Classify + file a project's existing markdown. `--dry-run`, `--move`, `-y`, `--no-llm` |
| `loredex route` | Process the vault inbox + new findings in the current project. `--strict` = frontmatter-only |
| `loredex curate [project]` | **Agent-driven optimization**: Start-Here brief for an objective, stale/duplicate/orphan/drift flags, semantic links. `--objective`, `--since`, `--topic`, `--max-detailed`, `--dry-run` |
| `loredex curate --product` | Cross-project product view: dashboard, team flow state, report-only risks/duplicates. `--objective`, `--refresh-stale` |
| `loredex handoff --to <project>` | Hand finished work to another team: consumable brief with reading order, auto-synced. `--objective`, `--since`, `--dry-run` |
| `loredex handoffs` | List open handoffs for this project (pulls remote first). `--consume <name>` marks done |
| `loredex mcp` | MCP server over stdio: `vault_search`, `vault_note`, `handoffs_open/consume`, `product_state`, `vault_store` — wired into `.mcp.json` by `init` |
| `loredex sync` | Commit local vault changes, pull teammates' notes, push yours |
| `loredex reset <project>` | Remove a project's vault copies and unstamp originals for a clean re-adopt. `--dry-run`, `-y` |
| `loredex watch` | Daemon: route automatically on file changes |
| `loredex status` | Vault statistics |
| `loredex doctor` | Check config, vault, editor, and classifier availability |

Full walkthrough of every command plus a guided test checklist: [docs/USER-GUIDE.md](docs/USER-GUIDE.md).

## 🧭 Curate — from "filed" to "understood"

Filing solves storage; `curate` solves *"where do I start?"*:

```bash
npx -y loredex@latest curate my-app --objective "draft the v2 spec" --since 2026-07-01 --dry-run
```

An agent reads a digest of the scoped notes and writes a **`_START-HERE` brief** into the
vault: what this work is, the 5–10 notes to read in order *for your objective*, and
suggested next actions. It also flags stale docs (`status: stale`, `superseded_by`),
spots duplicate coverage, and rewrites `## Related` sections with semantic (not
same-folder) links. Scope to a single session's output with `--since`/`--topic` — each
scoped brief is a durable session handoff. Deterministic bonus pass: wikilinks pointing at
code files (`[[chat.py]]`) become inline code, so your Obsidian graph has no ghost nodes.

Same safety rules: dry-run first, never deletes, merge suggestions are flags — you decide.

## ☁️ Sync across devices

The vault is a plain markdown folder — every sync tool already works:

| Option | Cost | Notes |
|---|---|---|
| **git** (recommended) | free | `loredex init --sync git`, add a private GitHub remote. Versioned forever |
| Obsidian Sync | paid | E2E-encrypted, best mobile experience |
| iCloud / Dropbox / Syncthing | free | put the vault in a synced folder |

No loredex server, no account, no lock-in: **your files, any agent, forever.**

## ❓ FAQ

**Does it delete or rewrite my files?** Never deletes. `adopt` copies by default and stamps originals; `--move` is opt-in. Name collisions get suffixes.

**Do I need an API key?** No. Classification shells out to the `claude` or `codex` CLI you already have. Neither installed → heuristics.

**Do I need Obsidian?** No — the vault is plain markdown and works with any viewer (Logseq, VS Code, `cat`). Obsidian is just the best free graph/backlink experience. If you do use it, the [loredex-obsidian](https://github.com/ahmedtawfeeq1/loredex-obsidian) plugin adds a live product dashboard, handoff alerts, and an in-app MCP server.

**What if it files something wrong?** It's a plain folder — move the file, done. The `_index` MOCs regenerate on the next route.

## 🗺️ Roadmap

- [x] `loredex curate` — objective-driven briefs, stale detection, semantic links (v0.3)
- [x] Team vaults — handoffs, shared git remote, session-start context pull (v0.7)
- [x] MCP server (`vault_search`, `vault_store`, `product_state`, …) — agents read the vault as long-term memory (v0.9)
- [x] Obsidian plugin — dashboard, handoff badge, in-app MCP server: [loredex-obsidian](https://github.com/ahmedtawfeeq1/loredex-obsidian)
- [ ] Semantic search over the vault
- [ ] Cursor-native hook adapter

## 🛠️ Contributing

PRs welcome — start with [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (the whole design fits on one page). Good first issues are labeled [`good first issue`](https://github.com/ahmedtawfeeq1/loredex/labels/good%20first%20issue).

```bash
git clone https://github.com/ahmedtawfeeq1/loredex && cd loredex
npm install && npm test
```

MIT © [Ahmed Tawfeeq](https://github.com/ahmedtawfeeq1) — Head of AI & Founder @ [genudo.ai](https://genudo.ai)
