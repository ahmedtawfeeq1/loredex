---
name: loredex-agent-ops
description: Manage an agent-ops dex — an agency's client fleet (Manager ▸ Client ▸ Pipeline/Agent ▸ Stage). Use when the user wants to add a client, pipeline, agent, or stage; tag clients; generate a client's MCP/plugin tooling from workspace.yml; or check fleet health. Requires a dex created with `loredex init --type agent-ops`.
---

# /loredex-agent-ops

An **agent-ops dex** holds a fleet of client AI-agent deployments with a fixed,
validated layout (spec: `docs/DEX-SPEC.md` in the loredex repo):

```
projects/<client>/
  pipelines/<pipeline>/          # staged conversation flow
    _persona.md  _general_instructions.md  _actions.curls.yaml  _settings.export.yaml
    stages/NN_<stage>/           # strict 01..N; every file repeats the NN_ prefix
      NN_enter_condition.md  NN_stage_instructions.md  NN_followup.md  NN_actions.curls.yaml
  agents/<agent>/                # same four _ files, NO stages/
  knowledge_tables/*.csv         # grounding data
  automation_workflows/*.json    # raw workflow exports — never rewrite these
  _inbox/                        # client intake pending consumption
  _randoms/                      # keep-anyway; where routed markdown lands
  workspace.yml                  # committed, secret-free agent tooling
```

## Commands (all `npx -y loredex@latest …`)

| Task | Command |
|---|---|
| New client | `new client <name> --manager <m> --tags <a,b>` |
| New pipeline / agent | `new pipeline <client> <name>` · `new agent <client> <name>` |
| New stage (appends NN) | `new stage <client> <pipeline> <name>` |
| Insert a stage | `new stage <client> <pipeline> <name> --before NN` (renumbers later stages via git mv) |
| Client roster + tags | `clients` · `clients tag <client> <tag...>` · `untag` · `set-tags` |
| Generate agent tooling | `workspace <client>` — writes gitignored `.mcp.json` / `.claude/settings.json` / `AGENTS.md` from workspace.yml |
| Verify tooling (CI) | `workspace <client> --check` (non-zero exit on drift/missing env) |
| Fleet health | `doctor` — schema lints, secret scan, fleet summary table |

## Rules to follow

- **Never create folders inside `projects/<client>/` by hand** — the schema is owned
  by `loredex new`, and `doctor` errors on violations (missing stage files, numbering
  gaps, NN prefix mismatches, agents with stages/).
- Secrets never go in `workspace.yml` — reference them as `${ENV_VAR}`; `workspace`
  expands from the environment at generate time. If `doctor` flags a committed
  secret-looking string, tell the user to **rotate it** (git history keeps it forever).
- Definition files (`_persona.md`, stage `.md` files) are frontmatter + body: settings
  in frontmatter, instructions in the body. Raw exports (`.yaml`/`.json` under
  `automation_workflows/`, `_settings.export.yaml`) are machine truth — never rewrite.
- New material from the client that has no home yet goes in `_inbox/`; consuming it
  means moving it to its proper place (a knowledge table, a stage file) and telling
  the user what changed.
- Research/analysis markdown you produce still follows the base `/loredex` frontmatter
  convention — on agent-ops dexes the router files it into the client's `_randoms/`.

## Typical flows

New client end-to-end:
```bash
npx -y loredex@latest new client "BrightSmile Dental" --manager sara --tags dental,new-platform
npx -y loredex@latest new pipeline brightsmile-dental lead_reactivation
npx -y loredex@latest new stage brightsmile-dental lead-reactivation intake
npx -y loredex@latest new stage brightsmile-dental lead-reactivation qualify
npx -y loredex@latest new agent brightsmile-dental reception_agent
# fill workspace.yml, then:
npx -y loredex@latest workspace brightsmile-dental
npx -y loredex@latest doctor
```

Every mutation rebuilds the dex indexes and auto-commits (git-synced dexes), so
`_index/Home.md` always shows Manager ▸ Client with pipeline/agent counts and tags.
