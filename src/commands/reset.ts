import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline/promises'
import pc from 'picocolors'
import { loadResolvedConfig } from '../core/config'
import { isRouted, parseDoc, serializeDoc } from '../core/frontmatter'
import { rebuildIndexes } from '../core/indexer'
import { gitAutoCommit } from '../core/router'
import { walkMarkdown } from '../core/scan'
import { slugify } from '../core/vault'

export interface ResetOptions {
  dryRun?: boolean
  yes?: boolean
}

/**
 * Remove a project's loredex-owned vault copies and unstamp the originals so the
 * project can be re-adopted cleanly. Originals are NEVER deleted — only their
 * `loredex: routed` marker is removed.
 */
export async function runReset(projectArg: string, opts: ResetOptions): Promise<void> {
  const config = loadResolvedConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `npx -y loredex@latest init` first'))
    process.exitCode = 1
    return
  }
  const slug = slugify(projectArg)
  const vault = resolve(config.vaultPath)
  const vaultProjectDir = join(vault, 'projects', slug)
  const mocPath = join(vault, '_index', `${slug}.md`)

  // hard guard: only ever delete inside the vault
  if (!vaultProjectDir.startsWith(vault + sep)) {
    console.error(pc.red('refusing: computed path escapes the vault'))
    process.exitCode = 1
    return
  }

  // originals to unstamp: stamped files inside registered project dirs belonging to this project
  const toUnstamp: string[] = []
  for (const projectPath of Object.keys(config.projects)) {
    for (const file of walkMarkdown(projectPath)) {
      let doc: ReturnType<typeof parseDoc>
      let raw: string
      try {
        raw = readFileSync(file, 'utf8')
        doc = parseDoc(raw)
      } catch {
        continue
      }
      if (!isRouted(doc.meta)) continue
      const fileProject = slugify(doc.meta.project ?? config.projects[projectPath]?.name ?? '')
      if (fileProject === slug) toUnstamp.push(file)
    }
  }

  const vaultNotes = existsSync(vaultProjectDir) ? walkMarkdown(vaultProjectDir).length : 0
  console.log(pc.bold(`reset ${slug}`))
  console.log(`  vault copies to remove: ${vaultNotes} note(s) in ${vaultProjectDir}`)
  console.log(`  index to remove: ${existsSync(mocPath) ? mocPath : '(none)'}`)
  console.log(`  originals to unstamp (never deleted): ${toUnstamp.length}`)

  if (opts.dryRun) {
    for (const file of toUnstamp) console.log(pc.dim(`  unstamp ${file}`))
    console.log(pc.dim('dry run — nothing changed'))
    return
  }

  if (!opts.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question('Remove vault copies + unstamp originals? [y/N] ')
    rl.close()
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log(pc.dim('aborted'))
      return
    }
  }

  for (const file of toUnstamp) {
    const doc = parseDoc(readFileSync(file, 'utf8'))
    const meta = { ...doc.meta }
    delete meta.loredex
    writeFileSync(file, serializeDoc({ meta, body: doc.body }))
  }
  rmSync(vaultProjectDir, { recursive: true, force: true })
  rmSync(mocPath, { force: true })
  rebuildIndexes(config.vaultPath)
  gitAutoCommit(config.vaultPath, config, `loredex: reset ${slug}`)

  console.log(
    pc.green('✓'),
    `removed ${vaultNotes} vault note(s), unstamped ${toUnstamp.length} original(s)`,
  )
  console.log('Re-adopt with:', pc.bold('npx -y loredex@latest adopt'))
}
