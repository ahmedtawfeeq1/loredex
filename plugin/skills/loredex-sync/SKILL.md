---
name: loredex-sync
description: Commit local vault changes, pull teammates' notes, push yours — the team-sharing loop for a git-backed vault. Use when the user says "sync the vault", "push my notes", "pull the latest vault", or after finishing work another team should see.
---

# /loredex-sync

```bash
npx -y loredex@latest sync
```

Commits any local vault changes, pulls the remote with rebase, pushes. Safe to run any
time; offline it degrades to a local commit and says so. If it reports the vault isn't a
git repo, run `npx -y loredex@latest init --sync git` first and (for team sharing) add a
private remote: `git -C <vault> remote add origin <url>`.

`handoff` and `handoffs` already sync automatically — this command is for everything else
(e.g. after a big `adopt` or `curate` the team should see).
