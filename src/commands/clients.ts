import pc from 'picocolors'
import { clientTags, loadClients, setClientTags } from '../core/clients'
import { loadResolvedConfig } from '../core/config'
import { isAgentOps } from '../core/dex'
import { rebuildIndexes } from '../core/indexer'
import { listProjects } from '../core/product'
import { loadProducts, productOf } from '../core/products'
import { gitAutoCommit } from '../core/router'
import { slugify } from '../core/vault'

/** `loredex clients` — list clients with manager + tags, or manage tags. */
export function runClients(action: string | undefined, args: string[]): void {
  const config = loadResolvedConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `npx -y loredex@latest init` first'))
    process.exitCode = 1
    return
  }
  const vaultPath = config.vaultPath
  if (!isAgentOps(vaultPath)) {
    console.error(pc.red('this is a research dex — `loredex clients` applies to agent-ops dexes'))
    process.exitCode = 1
    return
  }
  const clients = listProjects(vaultPath)

  if (!action || action === 'list') {
    if (clients.length === 0) {
      console.log('no clients in the dex yet — `loredex new client <name>`')
      return
    }
    const products = loadProducts(vaultPath)
    const tags = loadClients(vaultPath)
    for (const client of clients) {
      const manager = productOf(products, client) ?? pc.dim('unassigned')
      const chips = clientTags(tags, client)
        .map((t) => `#${t}`)
        .join(' ')
      console.log(`${pc.bold(client)}  ${manager}${chips ? `  ${chips}` : ''}`)
    }
    return
  }

  if (action === 'tag' || action === 'untag' || action === 'set-tags') {
    const [name, ...rest] = args
    if (!name || rest.length === 0) {
      console.error(pc.red(`usage: loredex clients ${action} <client> <tag...>`))
      process.exitCode = 1
      return
    }
    const slug = slugify(name)
    if (!clients.includes(slug)) {
      console.error(
        pc.yellow('!'),
        `no client "${slug}" — known: ${clients.join(', ') || '(none)'}`,
      )
      process.exitCode = 1
      return
    }
    const current = clientTags(loadClients(vaultPath), slug)
    const incoming = rest
      .flatMap((t) => t.split(','))
      .map((t) => t.trim())
      .filter(Boolean)
    const next =
      action === 'tag'
        ? [...current, ...incoming]
        : action === 'untag'
          ? current.filter((t) => !incoming.includes(t))
          : incoming
    setClientTags(vaultPath, slug, next)
    rebuildIndexes(vaultPath)
    gitAutoCommit(vaultPath, config, `loredex: ${slug} tags → ${next.join(', ') || '(none)'}`)
    console.log(pc.green('✓'), `${slug} tags: ${next.map((t) => `#${t}`).join(' ') || '(none)'}`)
    return
  }

  console.error(pc.red(`unknown: loredex clients ${action}`), '— use list | tag | untag | set-tags')
  process.exitCode = 1
}
