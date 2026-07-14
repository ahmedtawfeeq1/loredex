import pc from 'picocolors'
import {
  scaffoldAgent,
  scaffoldClient,
  scaffoldPipeline,
  scaffoldStage,
} from '../core/agent-ops-scaffold'
import { loadResolvedConfig } from '../core/config'
import { isAgentOps } from '../core/dex'
import { rebuildIndexes } from '../core/indexer'
import { gitAutoCommit } from '../core/router'

export interface NewOptions {
  manager?: string
  tags?: string
  before?: string
  after?: string
}

/** `loredex new client|pipeline|agent|stage …` — scaffold agent-ops dex structure. */
export function runNew(kind: string, args: string[], opts: NewOptions): void {
  const config = loadResolvedConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `npx -y loredex@latest init` first'))
    process.exitCode = 1
    return
  }
  const vaultPath = config.vaultPath
  if (!isAgentOps(vaultPath)) {
    console.error(
      pc.red('this is a research dex — `loredex new` applies to agent-ops dexes'),
      pc.dim('(create one with `loredex init --type agent-ops --vault <path>`)'),
    )
    process.exitCode = 1
    return
  }

  try {
    if (kind === 'client') {
      const [name] = args
      if (!name) {
        usage('new client <name> [--manager <m>] [--tags a,b]')
        return
      }
      const tags = opts.tags
        ?.split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const { slug, dir } = scaffoldClient(vaultPath, name, { manager: opts.manager, tags })
      finish(vaultPath, config, `loredex: new client ${slug}`)
      console.log(pc.green('✓'), `client scaffolded: ${dir}`)
      if (opts.manager) console.log(pc.green('✓'), `manager: ${opts.manager}`)
      if (tags?.length) console.log(pc.green('✓'), `tags: ${tags.join(', ')}`)
      console.log(pc.dim(`next: loredex new pipeline ${slug} <name>`))
      return
    }

    if (kind === 'pipeline' || kind === 'agent') {
      const [client, name] = args
      if (!client || !name) {
        usage(`new ${kind} <client> <name>`)
        return
      }
      const { dir } =
        kind === 'pipeline'
          ? scaffoldPipeline(vaultPath, client, name)
          : scaffoldAgent(vaultPath, client, name)
      finish(vaultPath, config, `loredex: new ${kind} ${client}/${name}`)
      console.log(pc.green('✓'), `${kind} scaffolded: ${dir}`)
      if (kind === 'pipeline')
        console.log(pc.dim(`next: loredex new stage ${client} ${name} <stage>`))
      return
    }

    if (kind === 'stage') {
      const [client, pipeline, name] = args
      if (!client || !pipeline || !name) {
        usage('new stage <client> <pipeline> <name> [--before NN | --after NN]')
        return
      }
      const { dir, renumbered } = scaffoldStage(vaultPath, client, pipeline, name, {
        before: opts.before,
        after: opts.after,
      })
      finish(vaultPath, config, `loredex: new stage ${client}/${pipeline}/${name}`)
      console.log(pc.green('✓'), `stage scaffolded: ${dir}`)
      for (const move of renumbered) console.log(pc.dim(`  renumbered ${move.from} → ${move.to}`))
      return
    }

    console.error(pc.red(`unknown: loredex new ${kind}`), '— use client | pipeline | agent | stage')
    process.exitCode = 1
  } catch (error) {
    console.error(pc.red(error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  }
}

function usage(text: string): void {
  console.error(pc.red(`usage: loredex ${text}`))
  process.exitCode = 1
}

function finish(
  vaultPath: string,
  config: NonNullable<ReturnType<typeof loadResolvedConfig>>,
  message: string,
): void {
  rebuildIndexes(vaultPath)
  gitAutoCommit(vaultPath, config, message)
}
