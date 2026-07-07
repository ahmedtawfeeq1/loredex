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
    <project>.md              # per-project map of content; topics ordered by latest
                              #   activity (newest first, date in heading), notes
                              #   newest-first within each topic
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

Brief notes (`Start Here - <project>.md`, scoped: `Start Here - <project> - <short-slug>.md`) live at
the project root with `type: brief`, `objective: <text>`, `loredex: brief`. The main brief
is overwritten per full-project run; scoped briefs accumulate as session handoffs.

Ghost-link rule: wikilinks whose target has a non-`.md` extension (`[[chat.py]]`) are
rewritten to inline code at routing time and by curate — they can never resolve to a note
and only pollute the graph.

## Link provenance (v0.5)

Copied notes record their origin:

```yaml
source_path: /abs/path/to/original.md   # copy-mode routes only
```

Link rewrite policy at routing time (prose only — fenced/inline code untouched):

| Original link target | Becomes |
|---|---|
| file adopted in the same batch | `[[new-note-name\|original text]]` — vault wikilink |
| existing text/code file | `<editor>://file/<abs>:<line>` deep link (line kept from `#L123`/`:123`) |
| existing binary/other file | `file://<abs>` — device default app |
| http(s)/mailto/anchors/images/missing files | untouched — links are never invented |

`editor` config value: `system` (default, `file://`) or a URI scheme: `vscode`, `cursor`,
`windsurf`, or any custom scheme. Set via `loredex init --editor <name>`.

`loredex reset <project>` removes a project's vault copies and unstamps originals for a
clean re-adopt (migration path for pre-v0.5 vaults). Originals are never deleted.

## Product level (v0.10)

`Start Here - Product.md` at the vault root is the cross-project brief written by
`loredex curate --product` — deterministic dashboard (projects, handoff flow,
cross-references) plus LLM narrative and report-only risk/duplicate findings. Linked from
`_index/Home.md`.

Portable provenance fields on routed copies:

```yaml
source_path: /authoring/machine/abs/path.md   # fast local resolution
source_project: my-app                        # project slug — portable
source_rel: docs/GAP-ANALYSIS.md              # relative to that project's root — portable
```

Teammates' machines resolve `source_project`/`source_rel` through their own registered
project roots; `source_path` wins when it exists locally.

Generated paths (`_index/**`, `Start Here - Product.md`) are covered by a keep-local git
merge driver written to `.git/info/attributes` — they never conflict between teammates and
are regenerated from real content after every sync.
