---
name: loredex-status
description: Check loredex's health and vault statistics — config, vault reachability, git sync, detected editors, LLM classifier availability, note counts. Use when the user asks "is loredex working", "how many notes are in my vault", or wants to troubleshoot loredex.
---

# /loredex-status

Run both and report plainly, not just raw output:

```bash
npx -y loredex@latest doctor   # health: config, vault, sync, editors detected, LLM classifier
npx -y loredex@latest status   # numbers: note count, projects/topics, inbox backlog, unrouted candidates
```

If `doctor` flags something (no editor configured, no LLM classifier, vault missing), lead
with that and suggest the fix it prints — `doctor`'s own output names the exact command to
run.
