import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadResolvedConfig } from '../core/config'
import { createLoredexMcpServer } from '../mcp/server'

/**
 * Stdio MCP server — spawned by MCP clients (Claude Code, Cursor, Codex, …).
 * stdout belongs to the transport; all human-facing output goes to stderr.
 */
export async function runMcp(): Promise<void> {
  const config = loadResolvedConfig()
  if (!config) {
    console.error('no loredex config — run `npx -y loredex@latest init` first')
    process.exit(1)
  }
  const server = createLoredexMcpServer(config)
  await server.connect(new StdioServerTransport())
  console.error(`loredex mcp server running (stdio) — vault: ${config.vaultPath}`)
}
