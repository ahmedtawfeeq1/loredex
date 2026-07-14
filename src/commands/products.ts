import pc from 'picocolors'
import { loadResolvedConfig } from '../core/config'
import { rebuildIndexes } from '../core/indexer'
import { listProjects } from '../core/product'
import { groupProjects, inferProducts, loadProducts, productOf, setProduct } from '../core/products'
import { gitAutoCommit } from '../core/router'
import { slugify } from '../core/vault'

export interface ProductsOptions {
  yes?: boolean
}

/** `loredex products` — list the Product → Project grouping (Ungrouped last). */
export function runProducts(
  action: string | undefined,
  args: string[],
  opts: ProductsOptions,
): void {
  const config = loadResolvedConfig()
  if (!config) {
    console.error(pc.red('no loredex config — run `npx -y loredex@latest init` first'))
    process.exitCode = 1
    return
  }
  const vaultPath = config.vaultPath
  const projects = listProjects(vaultPath)

  if (!action || action === 'list') {
    const groups = groupProjects(loadProducts(vaultPath), projects)
    if (groups.length === 0) {
      console.log('no projects in the vault yet')
      return
    }
    for (const group of groups) {
      console.log(pc.bold(group.product ?? pc.dim('Ungrouped')))
      for (const project of group.projects) console.log(`  ${project}`)
    }
    return
  }

  if (action === 'set') {
    const [project, product] = args
    if (!project || !product) {
      console.error(pc.red('usage: loredex products set <project> <product>'))
      process.exitCode = 1
      return
    }
    const slug = slugify(project)
    if (!projects.includes(slug)) {
      console.error(
        pc.yellow('!'),
        `no vault project "${slug}" — known: ${projects.join(', ') || '(none)'}`,
      )
      process.exitCode = 1
      return
    }
    setProduct(vaultPath, slug, product)
    rebuildIndexes(vaultPath)
    gitAutoCommit(vaultPath, config, `loredex: ${slug} → product ${product}`)
    console.log(pc.green('✓'), `${slug} filed under product "${product}"`)
    return
  }

  if (action === 'infer') {
    const guess = inferProducts(projects)
    const existing = loadProducts(vaultPath)
    // only propose assignments for currently-unassigned projects
    const proposals: Array<[string, string]> = []
    for (const [product, projs] of Object.entries(guess)) {
      for (const project of projs) {
        if (productOf(existing, project) === null) proposals.push([project, product])
      }
    }
    if (proposals.length === 0) {
      console.log('nothing to infer — every project with a shared name prefix is already assigned')
      return
    }
    console.log(pc.bold('Inferred from name prefixes:'))
    for (const [project, product] of proposals) console.log(`  ${project} → ${product}`)
    if (!opts.yes) {
      console.log(pc.dim('\nre-run with -y to apply'))
      return
    }
    for (const [project, product] of proposals) setProduct(vaultPath, project, product)
    rebuildIndexes(vaultPath)
    gitAutoCommit(vaultPath, config, `loredex: infer products (${proposals.length} project(s))`)
    console.log(pc.green('✓'), `assigned ${proposals.length} project(s)`)
    return
  }

  console.error(pc.red(`unknown: loredex products ${action}`), '— use list | set | infer')
  process.exitCode = 1
}
