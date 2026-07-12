# Loredex Desktop — install & use guide

**[Loredex Desktop](https://github.com/ahmedtawfeeq1/loredex-desktop)** is the native app for living in a loredex vault — macOS, Windows, and Linux. It embeds the same `loredex` package the CLI and agents use (one engine, in-process), and puts a UI on everything: a reader with working wikilinks, an inbox/outbox board for the full handoff lifecycle, a zoomable atlas of the whole vault, an API-contract change timeline, live sync against your team's git remote, and an in-app MCP server so agents read the exact vault state the app shows.

No Obsidian, no server, no account. The vault stays a plain markdown folder in git.

## Contents

- [Install](#install)
  - [macOS](#macos)
  - [Windows](#windows)
  - [Linux](#linux)
- [First run](#first-run)
- [What each view does](#what-each-view-does)
- [Connect your coding agents (MCP)](#connect-your-coding-agents-mcp)
- [Desktop vs Obsidian — which, and why](#desktop-vs-obsidian--which-and-why)
- [Updating](#updating)
- [Build from source](#build-from-source)

## Install

Grab the installer for your OS from the **[latest release](https://github.com/ahmedtawfeeq1/loredex-desktop/releases/latest)**. Builds are **unsigned** for now (code signing + notarization is on the roadmap), so each OS shows a first-launch warning you clear once — steps below.

### macOS

Apple Silicon (M1 or newer), macOS 14+.

1. Download `Loredex-<version>-arm64.dmg`, open it, drag **Loredex** to Applications.
2. Because it's unsigned, Gatekeeper may say the app "is damaged." It isn't — that's macOS quarantining an unsigned download. Clear it once in Terminal:
   ```sh
   xattr -dr com.apple.quarantine /Applications/Loredex.app
   ```
3. Launch normally from Applications.

### Windows

Windows 10/11 (x64).

1. Download `Loredex.Setup.<version>.exe` and run it.
2. SmartScreen will warn "Windows protected your PC" (unsigned). Click **More info → Run anyway**.
3. The installer lets you pick the install folder (per-user, no admin needed). Launch from the Start menu.

### Linux

x64. Two formats:

**AppImage** (works on any distro — no install):
```sh
chmod +x Loredex-<version>.AppImage
./Loredex-<version>.AppImage
```
If it won't launch, install FUSE (`sudo apt install libfuse2` on Debian/Ubuntu) or run with `--appimage-extract-and-run`.

**Debian / Ubuntu** (`.deb`):
```sh
sudo dpkg -i loredex-desktop_<version>_amd64.deb
sudo apt-get install -f   # pull any missing deps
```
Launch from your app menu or run `loredex`.

> **Git required.** The app shells out to `git` for vault sync and history (Activity, Contracts, commit links). It's preinstalled on macOS/most Linux; on Windows install [Git for Windows](https://git-scm.com/download/win). GitHub features use the `gh` CLI if present.

## First run

On launch you choose how to open a vault:

- **Create a vault** — a wizard scaffolds `~/Loredex` (or a folder you pick), optionally wires a private git remote.
- **Join your team's vault** — paste the vault's git URL; the app clones it and sets your identity. Teammates share one vault this way; handoffs flow between you. (`loredex://join?...` deep links open this too.)
- **Open an existing vault** — File → Open Vault… (⌘/Ctrl+O) points at any loredex folder.

Set your **identity** (name + email) in Settings on first run — every handoff transition is attributed and committed under it.

## What each view does

Nine views, sidebar order (⌘/Ctrl 1–9):

| View | What it does |
|---|---|
| **Home** | The vault's *Start Here* brief with a freshness badge — "what is this work, where do I begin" |
| **Reader** | Vault tree + rendered notes; wikilinks resolve (broken ones become diagnostics, never phantom files), commit SHAs link to the remote, drag a markdown file in to route it |
| **Handoffs** | Inbox/outbox lanes per project. Compose (⌘N), reply, comment; accept / decline-with-reason / snooze-until / consume — every transition attributed in frontmatter and committed. Thread rail shows reply + fulfill lineage |
| **Atlas** | The whole vault as a zoomable graph: Overview → Learn → Deep Dive, tours from reading orders, path tracing, a blocked-on list, changed-since overlay, SVG/PNG export |
| **Contracts** | Timeline of API-contract changes (OpenAPI / Postman / GraphQL in your repos) from git history, with pinned diffs and links to related handoffs |
| **Search** | Full-text search with facets: project, topic, type, status, from, to |
| **Activity** | The team's route/handoff/consume/sync history, day-grouped, from vault git log |
| **Sync** | Ahead/behind vs the remote, warnings, Sync now (⇧⌘S) + a background poller that fetches every 60 s and integrates only when your worktree is clean |
| **Settings** | Appearance, identity, contract repos + globs, GitHub integration, MCP server port |

A ⌘/Ctrl+K command palette lists every action; `?` shows the keyboard map.

## Connect your coding agents (MCP)

While a vault is open, the app hosts a localhost MCP server with the same six tools as `loredex mcp` (`vault_search`, `vault_note`, `handoffs_open`, `handoff_consume`, `product_state`, `vault_store`). A discovery file at `~/.loredex/desktop.json` carries the port and a per-install bearer token (owner-read-only, removed on quit). Agents on your machine read the exact vault state the app is showing. See the [desktop user guide](https://github.com/ahmedtawfeeq1/loredex-desktop/blob/main/docs/USER-GUIDE.md#mcp-connect-your-agents) for the one-command Claude Code wiring.

## Desktop vs Obsidian — which, and why

A loredex vault is plain markdown, so **both work at once on the same folder** — pick per task, or use them together.

| | **Loredex Desktop** | **Obsidian** (+ [loredex-obsidian](https://github.com/ahmedtawfeeq1/loredex-obsidian)) |
|---|---|---|
| Built for | *Operating* the loredex workflow | *Editing & browsing* markdown |
| Handoff lifecycle | Full inbox/outbox board: accept / decline-with-reason / snooze / consume, replies, threads — every step attributed + committed | Read-only badge + list (the plugin) |
| Engine | Embeds the `loredex` package in-process — writes go through the **same code** as the CLI and agents; they can never disagree | Generic markdown app; understands loredex only as far as the plugin/Bases add |
| Graph | Atlas: tours from reading orders, path tracing, blocked-on, changed-since, export | Obsidian graph (general-purpose) |
| API contracts | Contracts view — OpenAPI/Postman/GraphQL change timeline from git, linked to handoffs | — |
| Team sync | Built-in: ahead/behind, background poller, safe auto-integrate | Obsidian Sync (paid), or manual git |
| Agent access | In-app MCP with a discovery file agents auto-find | In-app MCP via the plugin (adds `active_note`) |
| Install | One native app, no plugins | Obsidian + enable community plugins + BRAT |
| Broken wikilinks | Become diagnostics — never phantom notes | Clicking one creates an empty phantom note |

**Use the Desktop app** when the vault is a shared team surface — you're running handoffs, tracing dependencies, watching contract drift, and want agents reading live state without extra setup. **Use Obsidian** for heavy note *editing*, mobile access, and its plugin ecosystem. They're complementary: the same git-synced folder, two lenses.

## Updating

No auto-update yet — download the newer installer from [Releases](https://github.com/ahmedtawfeeq1/loredex-desktop/releases/latest) and reinstall (macOS: replace the app in Applications; Windows: run the new setup; Linux: replace the AppImage or `dpkg -i` the new `.deb`). Your vault and settings are untouched — they live in the vault folder and a local app database, not in the app bundle.

## Build from source

```sh
git clone https://github.com/ahmedtawfeeq1/loredex-desktop && cd loredex-desktop
npm install          # pulls loredex from npm (^2.3.0)
npm run dev          # launch
npm test             # vitest unit + integration
npm run build        # typecheck + electron-vite build
npm run dist         # unsigned installer for the current OS (macOS arm64 locally)
```

Cross-platform installers are produced by the repo's release workflow — tag `vX.Y.Z` and CI builds macOS/Windows/Linux on their own runners.
