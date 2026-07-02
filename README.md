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
docs/GAP-ANALYSIS.md                        projects/genudo/gap-analysis/2026-07-03-gap-analysis.md
docs/current-system/00-OBJECTIVE.md    →    projects/genudo/current-system/2026-07-03-objective.md
research-dump-v2.md                         projects/genudo/engine/2026-07-01-research-dump-v2.md
notes/llm-pricing.md                        research/llm-tools/2026-06-28-llm-pricing.md
                                            _index/genudo.md        ← map of content, auto-built
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

No hook system in your agent? Run `loredex watch` (routes on file change) or `loredex route` from cron. The full protocol is one page: [docs/VAULT-SPEC.md](docs/VAULT-SPEC.md).

## 📋 Commands

| Command | What it does |
|---|---|
| `loredex init` | Create/register the vault, wire up the current project. `--sync git` enables auto-commit |
| `loredex adopt [path]` | Classify + file a project's existing markdown. `--dry-run`, `--move`, `-y`, `--no-llm` |
| `loredex route` | Process the vault inbox + new findings in the current project. `--strict` = frontmatter-only |
| `loredex watch` | Daemon: route automatically on file changes |
| `loredex status` | Vault statistics |
| `loredex doctor` | Check config, vault, and classifier availability |

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

**Do I need Obsidian?** No — the vault is plain markdown and works with any viewer (Logseq, VS Code, `cat`). Obsidian is just the best free graph/backlink experience.

**What if it files something wrong?** It's a plain folder — move the file, done. The `_index` MOCs regenerate on the next route.

## 🗺️ Roadmap

- [ ] MCP server (`vault_store`, `vault_search`) — agents read the vault as long-term memory
- [ ] Semantic search over the vault
- [ ] Cursor-native hook adapter
- [ ] Team vaults

## 🛠️ Contributing

PRs welcome — start with [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (the whole design fits on one page). Good first issues are labeled [`good first issue`](https://github.com/ahmedtawfeeq1/loredex/labels/good%20first%20issue).

```bash
git clone https://github.com/ahmedtawfeeq1/loredex && cd loredex
npm install && npm test
```

MIT © [Ahmed Tawfeeq](https://github.com/ahmedtawfeeq1)
