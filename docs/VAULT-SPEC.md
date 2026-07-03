# Vault specification

The loredex vault is a plain-markdown folder. Any tool that can write markdown files with
YAML frontmatter can participate — the spec is the integration surface, not any particular
agent.

## Layout

```
<vault>/                      # default ~/Loredex, configurable
  _inbox/                     # agents drop files here; route moves them out
  _index/                     # auto-generated MOCs — never edit by hand
    Home.md                   # vault-wide index
    <project>.md              # per-project map of content
  projects/
    <project>/<topic>/        # kebab-case slugs
      YYYY-MM-DD-<slug>.md
  research/
    <topic>/                  # notes with no project
```

## Frontmatter contract

```yaml
---
project: my-app               # required for deterministic filing
topic: gap-analysis           # required for deterministic filing
type: research | finding | analysis | snapshot | note   # default: note
date: 2026-07-03              # default: file mtime
source: claude-code | codex | cursor | manual            # default: manual
session: <optional session id>
tags: []
loredex: routed               # set by the router; files with it are never reprocessed
---
```

Rules:

- `project` + `topic` present → the file routes deterministically, no LLM involved.
- Missing metadata → the router asks an installed agent CLI (claude, codex) to classify,
  falling back to filename/path heuristics.
- The router never deletes content. Inbox files move within the vault; project files are
  copied and the original is stamped with `loredex: routed`.
- Filenames are normalized to `YYYY-MM-DD-<slug>.md`; collisions get `-2`, `-3`, … suffixes.

## Config

`~/.config/loredex/config.json` (override dir with `LOREDEX_CONFIG_DIR`):

```json
{
  "vaultPath": "/Users/you/Loredex",
  "sync": "git",
  "projects": {
    "/abs/path/to/project": { "name": "project-name" }
  }
}
```

`LOREDEX_CLASSIFIER=claude|codex|heuristic|none` forces a classifier (tests use `none`).

## Curation fields (v0.3)

Added by `loredex curate`, all frontmatter-only:

```yaml
status: stale | superseded      # flagged by curation; note body untouched
superseded_by: <note-name>      # the newer note that replaces this one
```

Brief notes (`_START-HERE-<project>.md`, scoped: `_START-HERE-<project>--<slug>.md`) live at
the project root with `type: brief`, `objective: <text>`, `loredex: brief`. The main brief
is overwritten per full-project run; scoped briefs accumulate as session handoffs.

Ghost-link rule: wikilinks whose target has a non-`.md` extension (`[[chat.py]]`) are
rewritten to inline code at routing time and by curate — they can never resolve to a note
and only pollute the graph.
