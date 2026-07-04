import { basename } from 'node:path'
import { watch } from 'chokidar'
import pc from 'picocolors'
import { loadConfig } from '../core/config'
import { inboxPath } from '../core/vault'
import { runRoute } from './route'

const QUIET_MS = 2000

export function runWatch(opts: { llm: boolean }): void {
  const config = loadConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `npx -y loredex@latest init` first'))
    process.exitCode = 1
    return
  }
  const paths = [inboxPath(config.vaultPath), ...Object.keys(config.projects)]
  console.log(pc.bold('loredex watch'), '— routing on file changes (ctrl-c to stop)')
  for (const path of paths) console.log(pc.dim(`  watching ${path}`))

  let timer: NodeJS.Timeout | null = null
  const schedule = (changed: string) => {
    if (!changed.endsWith('.md')) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      console.log(pc.dim(`change: ${basename(changed)} — routing`))
      runRoute({ quiet: false, llm: opts.llm })
    }, QUIET_MS)
  }

  watch(paths, {
    ignoreInitial: true,
    ignored: (path) => /node_modules|\.git\b/.test(path),
  })
    .on('add', schedule)
    .on('change', schedule)
}
