#!/usr/bin/env node
import { Command } from 'commander'
import pkg from '../package.json'
import { runAdopt } from './commands/adopt'
import { runCurate } from './commands/curate'
import { runDoctor } from './commands/doctor'
import { runInit } from './commands/init'
import { runRoute } from './commands/route'
import { runStatus } from './commands/status'
import { runWatch } from './commands/watch'

const program = new Command()

program
  .name('loredex')
  .description('Auto-organize AI-generated markdown into an Obsidian-compatible vault')
  .version(pkg.version)

program
  .command('init')
  .description('create/register the vault and wire this project into it')
  .option('--vault <path>', 'vault location (default: ~/Loredex)')
  .option('--project <name>', 'project name (default: directory name)')
  .option('--sync <mode>', 'sync mode: git | none', 'none')
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
  .action((project, opts) => runCurate(project, opts))

program
  .command('watch')
  .description('watch registered projects + inbox and route new markdown automatically')
  .option('--no-llm', 'classify with heuristics only (no LLM calls)')
  .action((opts) => runWatch(opts))

program.command('status').description('vault statistics').action(runStatus)

program
  .command('doctor')
  .description('check config, vault, and classifier availability')
  .action(runDoctor)

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
