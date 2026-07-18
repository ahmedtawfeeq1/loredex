/**
 * Library surface for hosts that embed loredex (the Obsidian plugin, future shells).
 * The CLI stays the primary interface; this exposes the same core it is built on.
 */
export { ACTIVITY_LOG_ARGS, type ActivityEvent, parseActivity } from './core/activity'
export {
  type ClientInfo,
  type InboxItem,
  listClientInbox,
  STAGE_FILE_SUFFIXES,
  type StageInfo,
  scanClient,
  scanFleet,
  stageNumberingGaps,
  UNIT_FILES,
  type UnitInfo,
} from './core/agent-ops'
export {
  scaffoldAgent,
  scaffoldClient,
  scaffoldPipeline,
  scaffoldStage,
} from './core/agent-ops-scaffold'
export {
  addClientTag,
  type ClientMap,
  clientTags,
  loadClients,
  removeClientTag,
  saveClients,
  setClientTags,
} from './core/clients'
export {
  type Config,
  defaultVaultPath,
  findDexRoot,
  loadConfig,
  loadResolvedConfig,
  type ResolvedConfig,
  saveConfig,
  setVaultOverride,
  type VaultSource,
} from './core/config'
export {
  ambientGitIdentity,
  type ConsumeReceipt,
  consumeHandoff,
  type VaultSchemaStatus,
  vaultSchemaStatus,
} from './core/consume'
export { operationalDataDigest } from './core/curate'
export {
  type DexType,
  hasDexManifest,
  isAgentOps,
  loadDexSync,
  loadDexType,
  saveDexSync,
  saveDexType,
} from './core/dex'
export {
  type LintFinding,
  type LintLevel,
  lintAgentOps,
} from './core/doctor-agent-ops'
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
export {
  annotateHandoff,
  type CreateHandoffInput,
  createHandoff,
  type HandoffCreateResult,
  HandoffError,
  type HandoffErrorCode,
  type HandoffTransition,
  previewRoute,
  type RouteOptions,
  type RoutePlanPreview,
  replyToHandoff,
  resolveHandoffPath,
  routeFile,
  type StatusReceipt,
  setHandoffStatus,
} from './core/handoff'
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
export {
  groupProjects,
  inferProducts,
  loadProducts,
  type ProductMap,
  productOf,
  setProduct,
} from './core/products'
export {
  listReceipts,
  loadReceipt,
  type RouteReceipt,
  RouteUndoError,
} from './core/receipts'
export { ensureGeneratedMergeDriver, gitAutoCommit, gitPullPush, undoRoute } from './core/router'
export { DATA_EXTS, walkData } from './core/scan'
export { matchNeverRoute, RouteScopeError } from './core/scope'
export { type SearchHit, sanitizeForContext, searchVault } from './core/search'
export { type StoreInput, storeNote } from './core/store'
export { type SyncHealth, syncStatus } from './core/sync-status'
export {
  csvHead,
  type DataFileSummary,
  dataFileSummary,
  jsonTopLevelKeys,
  yamlTopLevelKeys,
} from './core/tables'
export { inboxPath, scaffoldVault, slugify, stampEngineSchema } from './core/vault'
// work items (desktop DESIGN v3 §8): tasks ∪ handoffs on one board plane
export {
  claimWorkItem,
  finishWorkItem,
  handoffBoardStatus,
  listWorkItems,
  updateWorkItem,
  WORK_STATUSES,
  type WorkItem,
  type WorkKind,
  type WorkPatch,
  type WorkReceipt,
  type WorkStatus,
} from './core/work-items'
export {
  type CopyWorkspaceResult,
  copyWorkspaceSpec,
  envSuffix,
  expandEnvRefs,
  loadWorkspaceSpec,
  materializeWorkspace,
  type WorkspaceResult,
  type WorkspaceSpec,
  workspaceEnvRefs,
  workspaceSchema,
} from './core/workspace'
export { createLoredexMcpServer, resolveNoteInsideVault } from './mcp/server'
