import { basename } from 'node:path'
import { classifyHeuristic } from '../llm/heuristic'
import { classifyWithLlm } from '../llm/provider'
import type { Meta } from './frontmatter'
import { isRoutable, normalizeType, parseDoc } from './frontmatter'

export interface ClassifyOptions {
  projectRoot: string
  projectName: string
  useLlm: boolean
  knownProjects: string[]
  knownTopics: string[]
}

/** Resolve complete filing metadata: frontmatter wins, then LLM, then heuristic fills the rest. */
export function resolveMeta(path: string, raw: string, opts: ClassifyOptions): Meta {
  const { meta } = parseDoc(raw)
  const base = classifyHeuristic(path, opts.projectRoot, opts.projectName)
  if (isRoutable(meta)) {
    return { ...base, ...meta, type: normalizeType(meta.type) }
  }
  let llm: Meta | null = null
  if (opts.useLlm) {
    llm = classifyWithLlm({
      fileName: basename(path),
      excerpt: raw.slice(0, 4000),
      projectName: opts.projectName,
      knownProjects: opts.knownProjects,
      knownTopics: opts.knownTopics,
    })
    // A registered project root is ground truth: the LLM picks topic/type/tags, never
    // the project — letting it guess scatters one repo across invented project names
    // (acme-mcp, acme-platform-front...). Only inbox routing (no root, projectName
    // '') lets its guess stand. Explicit file frontmatter still wins via ...meta below.
    if (llm && opts.projectName) delete llm.project
  }
  const merged: Meta = { ...base, ...llm, ...meta }
  merged.type = normalizeType(meta.type ?? llm?.type ?? base.type)
  return merged
}
