import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Obsidian Bases file (core plugin, Obsidian ≥1.9) — a native database UI over the
 * vault's frontmatter. Content is static: the views query live, so regenerating it
 * is idempotent and the file never goes stale.
 */
const DASHBOARD_BASE = `filters:
  and:
    - file.inFolder("projects")
    - file.hasProperty("project")
views:
  - type: table
    name: Latest notes
    limit: 200
    filters:
      and:
        - 'status != "stale"'
        - 'status != "superseded"'
    order:
      - file.name
      - project
      - topic
      - type
      - date
    sort:
      - property: date
        direction: DESC
  - type: table
    name: Open handoffs
    filters:
      and:
        - 'type == "handoff"'
        - 'status == "open"'
    order:
      - file.name
      - from_project
      - to_project
      - objective
      - date
    sort:
      - property: date
        direction: DESC
  - type: cards
    name: By product
    groupBy:
      property: note.product
      direction: ASC
    order:
      - file.name
      - project
      - topic
      - date
    sort:
      - property: date
        direction: DESC
  - type: cards
    name: By project
    groupBy:
      property: note.project
      direction: ASC
    order:
      - file.name
      - topic
      - date
    sort:
      - property: date
        direction: DESC
  - type: table
    name: Stale or superseded
    filters:
      or:
        - 'status == "stale"'
        - 'status == "superseded"'
    order:
      - file.name
      - project
      - topic
      - date
      - status
      - superseded_by
    sort:
      - property: date
        direction: DESC
`

export function writeDashboardBase(indexDir: string): void {
  writeFileSync(join(indexDir, 'Dashboard.base'), DASHBOARD_BASE)
}
