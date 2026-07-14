import { statSync } from 'node:fs'
import pc from 'picocolors'
import { loadResolvedConfig } from '../core/config'
import { walkMarkdown } from '../core/scan'
import { inboxPath } from '../core/vault'
import { runRoute } from './route'

const POLL_MS = 3000

/**
 * Polls with walkMarkdown instead of opening native directory watches. A real project can
 * easily have more subdirectories than the OS file-descriptor limit (chokidar's recursive
 * fs.watch mode opens one handle per directory and hits EMFILE on exactly that); polling
 * a plain directory walk has no such ceiling and the poll interval already acts as the
 * debounce, so no extra timer bookkeeping is needed.
 */
export function runWatch(opts: { llm: boolean }): void {
  const config = loadResolvedConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `npx -y loredex@latest init` first'))
    process.exitCode = 1
    return
  }
  const inbox = inboxPath(config.vaultPath)
  const roots = [inbox, ...Object.keys(config.projects)]
  console.log(
    pc.bold('loredex watch'),
    `— polling for markdown changes every ${POLL_MS / 1000}s (ctrl-c to stop)`,
  )
  for (const root of roots) console.log(pc.dim(`  watching ${root}`))

  const mtimes = new Map<string, number>()
  // returns which watched roots had a change this tick — route() needs to know which
  // project directory to scope --from to, since watch may cover several at once
  const scan = (): Set<string> => {
    const changedRoots = new Set<string>()
    const seen = new Set<string>()
    for (const root of roots) {
      for (const file of walkMarkdown(root)) {
        seen.add(file)
        let mtime: number
        try {
          mtime = statSync(file).mtimeMs
        } catch {
          continue // file vanished between the walk and the stat
        }
        if (mtimes.get(file) !== mtime) {
          mtimes.set(file, mtime)
          changedRoots.add(root)
        }
      }
    }
    for (const file of mtimes.keys()) {
      if (!seen.has(file)) mtimes.delete(file)
    }
    return changedRoots
  }

  scan() // seed known mtimes so startup doesn't trigger a route pass
  setInterval(() => {
    const changedRoots = scan()
    if (changedRoots.size === 0) return
    console.log(pc.dim('change detected — routing'))
    const projectRoots = [...changedRoots].filter((root) => root !== inbox)
    if (projectRoots.length === 0) {
      runRoute({ quiet: false, llm: opts.llm }) // inbox is processed regardless of --from
    } else {
      for (const root of projectRoots) runRoute({ from: root, quiet: false, llm: opts.llm })
    }
  }, POLL_MS)
}
