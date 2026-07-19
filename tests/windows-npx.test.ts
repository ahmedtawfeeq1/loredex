import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scaffoldClient } from '../src/core/agent-ops-scaffold'
import { scaffoldVault } from '../src/core/vault'
import { materializeWorkspace, windowsSafeCommand } from '../src/core/workspace'

describe('windowsSafeCommand', () => {
  it('wraps npx-family shims in cmd /c on win32 only', () => {
    expect(windowsSafeCommand('npx', ['-y', 'x'], 'win32')).toEqual({
      command: 'cmd',
      args: ['/c', 'npx', '-y', 'x'],
    })
    expect(windowsSafeCommand('npm', ['run', 'x'], 'win32').command).toBe('cmd')
    // non-shim commands and non-Windows platforms are untouched
    expect(windowsSafeCommand('node', ['x.js'], 'win32')).toEqual({
      command: 'node',
      args: ['x.js'],
    })
    expect(windowsSafeCommand('npx', ['-y', 'x'], 'darwin')).toEqual({
      command: 'npx',
      args: ['-y', 'x'],
    })
  })

  it('generated .mcp.json carries the platform-correct command', () => {
    const v = mkdtempSync(join(tmpdir(), 'loredex-winmcp-'))
    scaffoldVault(v, 'agent-ops')
    const { slug } = scaffoldClient(v, 'brightsmile_dental', { manager: 'sara' })
    writeFileSync(
      join(v, 'projects', slug, 'workspace.yml'),
      'mcp:\n  crm:\n    command: npx\n    args: [-y, some-mcp]\n',
    )
    materializeWorkspace(v, slug, { env: {} })
    const mcp = JSON.parse(readFileSync(join(v, 'projects', slug, '.mcp.json'), 'utf8'))
    const server = mcp.mcpServers.crm
    if (process.platform === 'win32') {
      expect(server.command).toBe('cmd')
      expect(server.args).toEqual(['/c', 'npx', '-y', 'some-mcp'])
    } else {
      expect(server.command).toBe('npx')
      expect(server.args).toEqual(['-y', 'some-mcp'])
    }
  })
})
