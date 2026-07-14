#!/usr/bin/env node
import { Command } from 'commander'
import pkg from '../package.json'
import { runAdopt } from './commands/adopt'
import { runClients } from './commands/clients'
import { runCurate } from './commands/curate'
import { runDoctor } from './commands/doctor'
import { runHandoff, runHandoffs } from './commands/handoff'
import { runInit } from './commands/init'
import { runMcp } from './commands/mcp'
import { runNew } from './commands/new'
import { runCurateProduct } from './commands/product'
import { runProducts } from './commands/products'
import { runReset } from './commands/reset'
import { runRoute } from './commands/route'
import { runStatus } from './commands/status'
import { runSync } from './commands/sync'
import { runWatch } from './commands/watch'

const program = new Command()

program
  .name('loredex')
  .description('Auto-organize AI-generated markdown into an Obsidian-compatible vault')
  .version(pkg.version)

program
  .command('init')
  .description('create/register the dex and wire this project into it')
  .option('--vault <path>', 'dex location (default: ~/Loredex)')
  .option('--type <type>', 'dex type: research | agent-ops', 'research')
  .option('--project <name>', 'project name (default: directory name)')
  .option('--sync <mode>', 'sync mode: git | none', 'none')
  .option(
    '--editor <name>',
    'open code links in: vscode | cursor | windsurf | antigravity-ide | system (default: auto-detect installed editor)',
  )
  .option(
    '--product <name>',
    'group this project under a product (Product → Project → Topic → Note)',
  )
  .action((opts) => runInit(opts))

program
  .command('adopt [path]')
  .description('scan an existing project and file its research markdown into the vault')
  .option('--move', 'move files instead of copying them')
  .option('--dry-run', 'show the plan without writing anything')
  .option('-y, --yes', 'skip the confirmation prompt')
  .option('--no-llm', 'classify with heuristics only (no LLM calls)')
  .action((path, opts) => runAdopt(path, opts))

program
  .command('route')
  .description('process the vault inbox and any new findings in the current project')
  .option('--from <dir>', 'project directory (default: cwd)')
  .option('--dry-run', 'show the plan without writing anything')
  .option('--quiet', 'suppress output (for hooks)')
  .option('--strict', 'only route files with complete frontmatter (no guessing)')
  .option('--no-llm', 'classify with heuristics only (no LLM calls)')
  .action((opts) => runRoute(opts))

program
  .command('curate [project]')
  .description('agent-driven vault optimization: Start-Here brief, stale flags, semantic links')
  .option('--objective <text>', 'the objective the brief should answer')
  .option('--topic <topic...>', 'limit curation to these topics (task scope)')
  .option('--since <date>', 'limit curation to notes dated on/after YYYY-MM-DD')
  .option('--dry-run', 'show the plan without writing anything')
  .option('-y, --yes', 'skip the confirmation prompt')
  .option('--no-llm', 'deterministic pass only (ghost-link cleanup, no brief)')
  .option(
    '--max-detailed <n>',
    'notes that get full excerpt detail before older ones become a metadata-only index (default 60)',
    (value) => Number.parseInt(value, 10),
  )
  .option(
    '--product',
    'curate the whole product: cross-project dashboard + brief at the vault root',
  )
  .option(
    '--refresh-stale',
    'with --product: re-curate projects whose Start Here brief is out of date first',
  )
  .action((project, opts) => (opts.product ? runCurateProduct(opts) : runCurate(project, opts)))

program
  .command('watch')
  .description('watch registered projects + inbox and route new markdown automatically')
  .option('--no-llm', 'classify with heuristics only (no LLM calls)')
  .action((opts) => runWatch(opts))

program
  .command('handoff')
  .description(
    'hand finished work to another project team — writes a consumable brief into their vault space',
  )
  .requiredOption('--to <project>', 'receiving project')
  .option('--from <project>', 'source project (default: registered project of cwd)')
  .option('--objective <text>', 'what the receiving team is about to do with this work')
  .option('--since <date>', 'only hand off notes dated on/after YYYY-MM-DD')
  .option('--topic <topic...>', 'only hand off these topics')
  .option('--dry-run', 'show the handoff without writing anything')
  .option('-y, --yes', 'skip the confirmation prompt')
  .option('--no-llm', 'deterministic handoff (dated reading list, no brief)')
  .action((opts) => runHandoff(opts))

program
  .command('handoffs')
  .description('list open handoffs addressed to a project (pulls the vault remote first)')
  .option('--project <name>', 'project to check (default: registered project of cwd)')
  .option('--consume <name>', 'mark a handoff consumed after acting on it')
  .option('--accept <name>', 'accept a handoff (you own the follow-through)')
  .option('--decline <name>', 'decline a handoff — requires --reason')
  .option('--reason <text>', 'why the handoff is declined')
  .option('--snooze <name>', 'snooze a handoff — requires --until')
  .option('--until <date>', 'YYYY-MM-DD the snooze expires')
  .option('--reopen <name>', 'reopen a declined or snoozed handoff')
  .option('--annotate <name>', 'attach a comment note to a handoff — requires --message')
  .option('--title <text>', 'comment title (with --annotate)')
  .option('--message <text>', 'comment body (with --annotate)')
  .option('--quiet', 'hook mode: silent when none are open, agent-directed output otherwise')
  .action((opts) => runHandoffs(opts))

program
  .command('sync')
  .description("commit local vault changes, pull teammates' notes, push yours")
  .action(runSync)

program
  .command('mcp')
  .description(
    'run the loredex MCP server over stdio (vault_search, handoffs, product_state, vault_store)',
  )
  .action(runMcp)

program
  .command('reset <project>')
  .description("remove a project's vault copies and unstamp originals (for a clean re-adopt)")
  .option('--dry-run', 'list what would change without touching anything')
  .option('-y, --yes', 'skip the confirmation prompt')
  .action((project, opts) => runReset(project, opts))

program.command('status').description('vault statistics').action(runStatus)

program
  .command('products [action] [args...]')
  .description('group projects into products: list (default) | set <project> <product> | infer')
  .option('-y, --yes', 'apply inferred assignments (with `infer`)')
  .action((action, args, opts) => runProducts(action, args ?? [], opts))

program
  .command('new <kind> [args...]')
  .description(
    'scaffold agent-ops structure: client <name> | pipeline <client> <name> | agent <client> <name> | stage <client> <pipeline> <name>',
  )
  .option('--manager <name>', 'file the new client under a manager (with `client`)')
  .option('--tags <a,b>', 'category tags for the new client (with `client`)')
  .option('--before <NN>', 'insert the new stage before stage NN (renumbers later stages)')
  .option('--after <NN>', 'insert the new stage after stage NN (renumbers later stages)')
  .action((kind, args, opts) => runNew(kind, args ?? [], opts))

program
  .command('clients [action] [args...]')
  .description('agent-ops client roster: list (default) | tag <client> <tag...> | untag | set-tags')
  .action((action, args) => runClients(action, args ?? []))

program
  .command('doctor')
  .description('check config, dex, and classifier availability')
  .action(runDoctor)

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
