/**
 * Library surface for hosts that embed loredex (the Obsidian plugin, future shells).
 * The CLI stays the primary interface; this exposes the same core it is built on.
 */
export { ACTIVITY_LOG_ARGS, type ActivityEvent, parseActivity } from './core/activity'
export { type Config, defaultVaultPath, loadConfig, saveConfig } from './core/config'
export {
  ambientGitIdentity,
  type ConsumeReceipt,
  consumeHandoff,
  type VaultSchemaStatus,
  vaultSchemaStatus,
} from './core/consume'
export {
  type Identity,
  type LoredexEmitter,
  type LoredexEventKind,
  type LoredexEventMap,
  noopEmitter,
  setLoredexEmitter,
} from './core/events'
export {
  type Doc,
  LOREDEX_SCHEMA,
  type Meta,
  parseDoc,
  serializeDoc,
  stampSchema,
} from './core/frontmatter'
export { rebuildIndexes } from './core/indexer'
export {
  buildDashboard,
  collectProductHandoffs,
  type HandoffCard,
  type HandoffScope,
  listHandoffs,
  listProjects,
  PRODUCT_BRIEF_NAME,
  type ProductDashboard,
  type ProductHandoff,
  type ProjectState,
  projectState,
  renderDashboardMarkdown,
} from './core/product'
export { ensureGeneratedMergeDriver, gitAutoCommit, gitPullPush } from './core/router'
export { type SearchHit, sanitizeForContext, searchVault } from './core/search'
export { type StoreInput, storeNote } from './core/store'
export { type SyncHealth, syncStatus } from './core/sync-status'
export { inboxPath, scaffoldVault, slugify } from './core/vault'
export { createLoredexMcpServer, resolveNoteInsideVault } from './mcp/server'
