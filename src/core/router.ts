import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { type ClassifyOptions, resolveMeta } from './classify'
import type { Config } from './config'
import { type Meta, parseDoc, serializeDoc } from './frontmatter'
import { rebuildIndexes } from './indexer'
import { addRelatedLinks } from './linker'
import { targetDir, targetName, uniquePath } from './vault'

export interface PlanItem {
  source: string
  raw: string
  meta: Meta
  /** move: delete source after writing (inbox files). copy: stamp source as routed, leave it in place. */
  mode: 'move' | 'copy'
  destDir: string
  destName: string
}

/** Existing project/topic folder names — fed to the classifier so it reuses them. */
export function knownStructure(vaultPath: string): { projects: string[]; topics: string[] } {
  const projects: string[] = []
  const topics = new Set<string>()
  const projectsDir = join(vaultPath, 'projects')
  if (existsSync(projectsDir)) {
    for (const project of readdirSync(projectsDir, { withFileTypes: true })) {
      if (!project.isDirectory()) continue
      projects.push(project.name)
      for (const topic of readdirSync(join(projectsDir, project.name), { withFileTypes: true })) {
        if (topic.isDirectory()) topics.add(topic.name)
      }
    }
  }
  return { projects, topics: [...topics] }
}

export function planFile(
  path: string,
  raw: string,
  mode: 'move' | 'copy',
  vaultPath: string,
  opts: ClassifyOptions,
): PlanItem {
  const meta = resolveMeta(path, raw, opts)
  return {
    source: path,
    raw,
    meta,
    mode,
    destDir: targetDir(vaultPath, meta),
    destName: targetName(meta, basename(path)),
  }
}

export interface ExecuteResult {
  written: string[]
}

export function executePlan(items: PlanItem[], vaultPath: string, config: Config): ExecuteResult {
  const written: string[] = []
  for (const item of items) {
    const { body } = parseDoc(item.raw)
    const meta: Meta = {
      ...item.meta,
      source: item.meta.source ?? 'manual',
      loredex: 'routed',
    }
    const dest = uniquePath(item.destDir, item.destName)
    writeFileSync(dest, serializeDoc({ meta, body }))
    if (item.mode === 'move') {
      unlinkSync(item.source)
    } else {
      // stamp the original so it is never re-adopted; content stays put
      const original = parseDoc(item.raw)
      writeFileSync(
        item.source,
        serializeDoc({ meta: { ...original.meta, loredex: 'routed' }, body: original.body }),
      )
    }
    addRelatedLinks(dest)
    written.push(dest)
  }
  if (written.length > 0) {
    rebuildIndexes(vaultPath)
    gitAutoCommit(vaultPath, config, `loredex: route ${written.length} note(s)`)
  }
  return { written }
}

export function gitAutoCommit(vaultPath: string, config: Config, message: string): void {
  if (config.sync !== 'git') return
  try {
    execFileSync('git', ['add', '-A'], { cwd: vaultPath, stdio: 'ignore' })
    execFileSync('git', ['commit', '-m', message], { cwd: vaultPath, stdio: 'ignore' })
  } catch {
    // git missing or nothing to commit — sync is best-effort
  }
}
