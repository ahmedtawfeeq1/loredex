# loredex

> Your coding agents write hundreds of markdown files. Loredex gives them a brain to put them in.

**lore** (everything your agents learn) + **dex** (an index that records it automatically).

Claude Code, Codex, and Cursor generate research, findings, gap analyses, and plans as
markdown — scattered across repos and sessions, never organized, never findable again.
Loredex automatically classifies and files all of it into one
[Obsidian](https://obsidian.md)-compatible vault: consistent structure, frontmatter,
wikilinks, and auto-generated indexes. You never decide which folder anything goes in.

```
docs/GAP-ANALYSIS.md                    projects/genudo/gap-analysis/2026-07-03-gap-analysis.md
docs/current-system/00-OBJECTIVE.md  →  projects/genudo/current-system/2026-07-03-objective.md
research-dump-v2.md                     projects/genudo/engine/2026-07-01-research-dump-v2.md
                                        _index/genudo.md   ← map of content, auto-built
```

## Quickstart — organize an existing project in 60 seconds

```bash
cd your-project
npx loredex adopt --dry-run   # see the filing plan, writes nothing
npx loredex adopt             # do it
```

Then open `~/Loredex` in Obsidian. Your scattered agent output is now a connected knowledge
graph. Originals stay in place (stamped so they're never re-adopted); pass `--move` to
relocate instead.

## Install for Claude Code (auto-filing after every session)

```
/plugin marketplace add OWNER/loredex
/plugin install loredex@loredex
```

The plugin adds:
- a **Stop hook** — after each session, new frontmattered findings are routed into the vault
- a **skill** — Claude learns the frontmatter conventions and the CLI commands

Then in any project: `npx loredex init` (once) and forget about filing forever.

## Works with any agent

Loredex operates on files, not agent APIs. `loredex init` writes the conventions into
`AGENTS.md` (read by Codex, Cursor, Copilot, and friends) and `CLAUDE.md`. Any agent that
writes markdown with the frontmatter below participates:

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

No hooks in your agent? Run `loredex watch` (routes on file change) or `loredex route`
manually / from cron. Full protocol: [docs/VAULT-SPEC.md](docs/VAULT-SPEC.md).

## Commands

| Command | What it does |
|---|---|
| `loredex init` | Create/register the vault, wire up the current project. `--sync git` enables auto-commit |
| `loredex adopt [path]` | Classify + file a project's existing markdown. `--dry-run`, `--move`, `-y` |
| `loredex route` | Process the vault inbox + new findings in the current project |
| `loredex watch` | Daemon: route automatically on file changes |
| `loredex status` | Vault statistics |
| `loredex doctor` | Check config, vault, and classifier availability |

Classification order: frontmatter (deterministic, no LLM) → installed agent CLI
(`claude`/`codex`, for unlabeled files) → filename/path heuristics. `--no-llm` skips the
middle step.

## Sync across devices

The vault is a plain markdown folder — every sync tool already works:

- **git** (recommended for developers): `loredex init --sync git`, add a private GitHub remote, done. Versioned forever.
- **Obsidian Sync**: paid, E2E-encrypted, best mobile experience.
- **iCloud / Dropbox / Syncthing**: put the vault in a synced folder.

No loredex server, no account, no lock-in: your files, any agent, forever.

## Roadmap

- [ ] MCP server (`vault_store`, `vault_search`) — agents read the vault as memory
- [ ] Semantic search over the vault
- [ ] Cursor-native hook adapter
- [ ] Team vaults

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Good first issues are labeled
[`good first issue`](https://github.com/OWNER/loredex/labels/good%20first%20issue).

MIT © Ahmed Tawfeeq
