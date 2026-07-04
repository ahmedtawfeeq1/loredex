import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface EditorCandidate {
  name: string
  /** fallback URI scheme if the app bundle's own Info.plist can't be read */
  scheme: string
  appNames: string[]
  bin: string
}

// Order = preference when multiple are installed (fork-of relationships grouped: vscode-family first)
export const EDITOR_CANDIDATES: EditorCandidate[] = [
  { name: 'Cursor', scheme: 'cursor', appNames: ['Cursor.app'], bin: 'cursor' },
  { name: 'VS Code', scheme: 'vscode', appNames: ['Visual Studio Code.app'], bin: 'code' },
  { name: 'Windsurf', scheme: 'windsurf', appNames: ['Windsurf.app'], bin: 'windsurf' },
  {
    name: 'Antigravity',
    scheme: 'antigravity-ide',
    appNames: ['Antigravity IDE.app', 'Antigravity.app'],
    bin: 'antigravity',
  },
  { name: 'Zed', scheme: 'zed', appNames: ['Zed.app'], bin: 'zed' },
]

export interface EditorProbe {
  platform: NodeJS.Platform
  appDirs: string[]
  appExists: (path: string) => boolean
  /** Read the app bundle's own registered URL scheme; null if unreadable/absent */
  readScheme: (appPath: string) => string | null
  hasBin: (bin: string) => boolean
}

function readSchemeFromPlist(appPath: string): string | null {
  try {
    const out = execFileSync(
      'plutil',
      ['-extract', 'CFBundleURLTypes', 'json', '-o', '-', join(appPath, 'Contents', 'Info.plist')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const types = JSON.parse(out) as Array<{ CFBundleURLSchemes?: string[] }>
    for (const entry of types) {
      const scheme = entry.CFBundleURLSchemes?.[0]
      if (scheme) return scheme
    }
    return null
  } catch {
    return null
  }
}

function hasBinOnPath(bin: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function realProbe(): EditorProbe {
  return {
    platform: process.platform,
    appDirs: ['/Applications', join(homedir(), 'Applications')],
    appExists: existsSync,
    readScheme: readSchemeFromPlist,
    hasBin: hasBinOnPath,
  }
}

export interface DetectedEditor {
  name: string
  scheme: string
}

/** Editors installed on this machine, in preference order. Reads the app's own URL scheme when possible. */
export function detectEditors(probe: EditorProbe = realProbe()): DetectedEditor[] {
  const found: DetectedEditor[] = []
  for (const candidate of EDITOR_CANDIDATES) {
    let scheme: string | null = null
    if (probe.platform === 'darwin') {
      outer: for (const dir of probe.appDirs) {
        for (const appName of candidate.appNames) {
          const appPath = join(dir, appName)
          if (probe.appExists(appPath)) {
            scheme = probe.readScheme(appPath) ?? candidate.scheme
            break outer
          }
        }
      }
    }
    if (!scheme && probe.hasBin(candidate.bin)) scheme = candidate.scheme
    if (scheme) found.push({ name: candidate.name, scheme })
  }
  return found
}
