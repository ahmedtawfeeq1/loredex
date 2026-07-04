---
name: loredex-handoffs
description: Check for open handoffs addressed to this project before starting work, and mark them consumed after acting on them. Use at the START of any work session in a loredex-registered project that receives work from other teams (e.g. backend consuming AI-engine output), or when the user says "any handoffs for me", "what did the other team ship", "pull the latest work".
---

# /loredex-handoffs

At the start of a work session in a project that receives work from other teams:

```bash
npx -y loredex@latest handoffs
```

This pulls the vault remote first, so teammates' fresh handoffs appear. For each open
handoff listed:

1. **Read it** (the path is printed) — it contains the objective, a brief written for this
   team, and a reading order of the source team's notes. Follow the reading order before
   planning any work that builds on it; this is the full context the interface artifact
   (Postman collection, API spec) alone doesn't carry.
2. Plan/do the work with that context loaded.
3. **Mark it consumed** once acted on:
   ```bash
   npx -y loredex@latest handoffs --consume <handoff-note-name>
   ```
   Don't consume handoffs you only skimmed — open means "still owed attention."

Nothing listed? Say so and move on — don't invent pending work.
