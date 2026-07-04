---
name: loredex-init
description: Set up loredex for the current project — creates/registers the vault and writes AGENTS.md/CLAUDE.md/.cursor rule conventions. Use when the user says "set up loredex", "init loredex", or wants to start tracking this project's research in a vault.
---

# /loredex-init

1. If the user hasn't said which editor code links should open in, run
   `npx -y loredex@latest doctor` first — if it shows exactly one installed editor, use it
   without asking. Otherwise ask: vscode, cursor, windsurf, or system default.
2. Run:
   ```bash
   npx -y loredex@latest init [--vault <path>] [--sync git] --editor <choice>
   ```
   Omit `--vault` to use the default (`~/Loredex`) or an already-registered vault.
   `--sync git` git-inits the vault and auto-commits after every route/curate.
3. Report what got created: vault path, project registration, and the conventions written
   to `AGENTS.md`, `CLAUDE.md`, and `.cursor/rules/loredex.mdc`.
4. If the project already has research markdown sitting in it, suggest `/loredex-adopt`
   next.
