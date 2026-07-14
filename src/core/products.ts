import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Product scoping: a project belongs to at most one product, and the view layer
 * groups Product → Project → Topic → Note. Membership lives IN the vault (so a
 * shared team vault shows the same grouping everywhere), in `_index/products.json`.
 * Projects not listed are "Ungrouped" — every existing vault keeps working.
 */
export type ProductMap = Record<string, string[]>

const MANIFEST = 'products.json'

function manifestPath(vaultPath: string): string {
  return join(vaultPath, '_index', MANIFEST)
}

/** Read the product → projects map. Tolerates a `{products:{…}}` wrapper or a flat map; never throws. */
export function loadProducts(vaultPath: string): ProductMap {
  const path = manifestPath(vaultPath)
  if (!existsSync(path)) return {}
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    const map = raw && typeof raw === 'object' && raw.products ? raw.products : raw
    const out: ProductMap = {}
    for (const [product, projects] of Object.entries(map ?? {})) {
      if (Array.isArray(projects))
        out[product] = projects.filter((p): p is string => typeof p === 'string')
    }
    return out
  } catch {
    return {}
  }
}

function saveProducts(vaultPath: string, map: ProductMap): void {
  const clean: ProductMap = {}
  for (const product of Object.keys(map).sort()) {
    const projects = [...new Set(map[product])].sort()
    if (projects.length > 0) clean[product] = projects
  }
  mkdirSync(join(vaultPath, '_index'), { recursive: true })
  writeFileSync(manifestPath(vaultPath), `${JSON.stringify({ products: clean }, null, 2)}\n`)
}

/** The product a project belongs to, or null if unassigned. */
export function productOf(map: ProductMap, project: string): string | null {
  for (const [product, projects] of Object.entries(map)) {
    if (projects.includes(project)) return product
  }
  return null
}

/**
 * Assign `project` to `product`, removing it from any other product first.
 * A null/empty product unassigns it. Returns the reloaded map.
 */
export function setProduct(vaultPath: string, project: string, product: string | null): ProductMap {
  const map = loadProducts(vaultPath)
  for (const key of Object.keys(map)) map[key] = (map[key] ?? []).filter((p) => p !== project)
  if (product) map[product] = [...(map[product] ?? []), project]
  saveProducts(vaultPath, map)
  return loadProducts(vaultPath)
}

/**
 * Groups for rendering: each product (sorted) with the projects present in
 * `allProjects`, then an Ungrouped bucket (product: null) last. A group with no
 * present projects is dropped, so a stale manifest entry never shows an empty heading.
 */
export function groupProjects(
  map: ProductMap,
  allProjects: readonly string[],
): Array<{ product: string | null; projects: string[] }> {
  const assigned = new Set<string>()
  const groups: Array<{ product: string | null; projects: string[] }> = []
  for (const product of Object.keys(map).sort()) {
    const members = map[product] ?? []
    const projects = allProjects.filter((p) => members.includes(p)).sort()
    if (projects.length > 0) {
      groups.push({ product, projects })
      for (const p of projects) assigned.add(p)
    }
  }
  const ungrouped = allProjects.filter((p) => !assigned.has(p)).sort()
  if (ungrouped.length > 0) groups.push({ product: null, projects: ungrouped })
  return groups
}

/**
 * Guess products from a shared name prefix (`acme-crm`, `acme-website`
 * → `acme`). Report-only — the caller confirms before writing. A prefix shared
 * by a single project isn't a product, so those stay ungrouped.
 */
export function inferProducts(allProjects: readonly string[]): ProductMap {
  const byPrefix: ProductMap = {}
  for (const project of allProjects) {
    const match = project.match(/^([a-z0-9]+)[-_]/i)
    const key = (match?.[1] ?? project).toLowerCase()
    const bucket = byPrefix[key] ?? []
    bucket.push(project)
    byPrefix[key] = bucket
  }
  const out: ProductMap = {}
  for (const [product, projects] of Object.entries(byPrefix)) {
    if (projects.length >= 2) out[product] = projects.sort()
  }
  return out
}
