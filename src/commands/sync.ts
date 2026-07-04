import { existsSync } from 'node:fs'
import { join } from 'node:path'
import pc from 'picocolors'
import { loadConfig } from '../core/config'
import { gitAutoCommit, gitPullPush } from '../core/router'

/** Commit local vault changes, pull teammates' notes, push ours. */
export function runSync(): void {
  const config = loadConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `npx -y loredex@latest init` first'))
    process.exitCode = 1
    return
  }
  if (!existsSync(join(config.vaultPath, '.git'))) {
    console.error(
      pc.red('vault is not a git repo — run `npx -y loredex@latest init --sync git` first'),
    )
    process.exitCode = 1
    return
  }

  // force the git path even if config.sync is 'none' — an explicit sync command is consent
  gitAutoCommit(config.vaultPath, { ...config, sync: 'git' }, 'loredex: sync')
  const { pulled, pushed } = gitPullPush(config.vaultPath)

  console.log(pc.green('✓'), 'local changes committed')
  if (pulled || pushed) {
    if (pulled) console.log(pc.green('✓'), 'pulled latest from remote')
    if (pushed) console.log(pc.green('✓'), 'pushed to remote')
  } else {
    console.log(
      pc.yellow('!'),
      'no remote reachable — commit is local only (add one: git -C <vault> remote add origin <url>)',
    )
  }
}
