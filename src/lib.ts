/**
 * Library surface for hosts that embed loredex (the Obsidian plugin, future shells).
 * The CLI stays the primary interface; this exposes the same core it is built on.
 */
export { type Config, defaultVaultPath, loadConfig, saveConfig } from './core/config'
export {
  type Doc,
  type Meta,
  parseDoc,
  serializeDoc,
} from './core/frontmatter'
export { rebuildIndexes } from './core/indexer'
export {
  buildDashboard,
  collectProductHandoffs,
  listProjects,
  PRODUCT_BRIEF_NAME,
  type ProductDashboard,
  type ProductHandoff,
  type ProjectState,
  projectState,
  renderDashboardMarkdown,
} from './core/product'
export { ensureGeneratedMergeDriver, gitAutoCommit, gitPullPush } from './core/router'
export { sanitizeForContext, type SearchHit, searchVault } from './core/search'
export { type StoreInput, storeNote } from './core/store'
export { inboxPath, scaffoldVault, slugify } from './core/vault'
export { createLoredexMcpServer, resolveNoteInsideVault } from './mcp/server'
