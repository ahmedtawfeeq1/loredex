---
name: loredex-sync
description: Commit local dex changes, pull teammates' notes, push yours — the team-sharing loop for a git-backed dex. Use when the user says "sync the dex", "push my notes", "pull the latest dex", or after finishing work another team should see.
---

# /loredex-sync

```bash
npx -y loredex@latest sync
```

Commits any local dex changes, pulls the remote with rebase, pushes. Safe to run any
time; offline it degrades to a local commit and says so. If it reports the dex isn't a
git repo, run `npx -y loredex@latest init --sync git` first and (for team sharing) add a
private remote: `git -C <dex> remote add origin <url>`.

`handoff` and `handoffs` already sync automatically — this command is for everything else
(e.g. after a big `adopt` or `curate` the team should see).
