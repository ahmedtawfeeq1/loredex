import { writeFileSync } from 'node:fs'
import type { Config } from './config'
import { serializeDoc } from './frontmatter'
import { executePlan, knownStructure, planFile } from './router'
import { inboxPath, slugify, uniquePath } from './vault'

export interface StoreInput {
  project: string
  topic: string
  title: string
  content: string
  type?: string
  source?: string
  tags?: string[]
}

/**
 * The safe write path for agents: a complete frontmattered note lands in the inbox and is
 * immediately routed deterministically (frontmatter is complete, so no LLM is involved and
 * the router owns the final location). Never touches projects/ directly, never deletes.
 */
export function storeNote(config: Config, input: StoreInput): string {
  const today = new Date().toISOString().slice(0, 10)
  const raw = serializeDoc({
    meta: {
      project: input.project,
      topic: slugify(input.topic),
      type: input.type ?? 'note',
      date: today,
      source: input.source ?? 'mcp',
      tags: input.tags ?? [],
    },
    body: `# ${input.title}\n\n${input.content}\n`,
  })

  const inbox = inboxPath(config.vaultPath)
  const draft = uniquePath(inbox, `${today}-${slugify(input.title)}.md`)
  writeFileSync(draft, raw)

  const known = knownStructure(config.vaultPath)
  const plan = planFile(draft, raw, 'move', config.vaultPath, {
    projectRoot: inbox,
    projectName: input.project,
    useLlm: false,
    knownProjects: known.projects,
    knownTopics: known.topics,
  })
  const { written } = executePlan([plan], config.vaultPath, config)
  return written[0] ?? draft
}
