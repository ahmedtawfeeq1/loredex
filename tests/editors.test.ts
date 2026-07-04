import { describe, expect, it } from 'vitest'
import { detectEditors, type EditorProbe } from '../src/core/editors'

function fakeProbe(overrides: Partial<EditorProbe>): EditorProbe {
  return {
    platform: 'darwin',
    appDirs: ['/Applications'],
    appExists: () => false,
    readScheme: () => null,
    hasBin: () => false,
    ...overrides,
  }
}

describe('detectEditors', () => {
  it('finds nothing when no apps or binaries are present', () => {
    expect(detectEditors(fakeProbe({}))).toEqual([])
  })

  it('prefers the app bundle over PATH, in candidate order', () => {
    const found = detectEditors(
      fakeProbe({
        appExists: (path) => path.endsWith('Cursor.app'),
        readScheme: () => 'cursor',
      }),
    )
    expect(found).toEqual([{ name: 'Cursor', scheme: 'cursor' }])
  })

  it("uses the app bundle's own registered scheme, not the hardcoded fallback", () => {
    const found = detectEditors(
      fakeProbe({
        appExists: (path) => path.endsWith('Antigravity IDE.app'),
        readScheme: () => 'antigravity-ide',
      }),
    )
    expect(found).toEqual([{ name: 'Antigravity', scheme: 'antigravity-ide' }])
  })

  it('falls back to the candidate default scheme when the plist has none', () => {
    const found = detectEditors(
      fakeProbe({
        appExists: (path) => path.endsWith('Cursor.app'),
        readScheme: () => null,
      }),
    )
    expect(found).toEqual([{ name: 'Cursor', scheme: 'cursor' }])
  })

  it('falls back to a PATH binary when no app bundle is found', () => {
    const found = detectEditors(fakeProbe({ hasBin: (bin) => bin === 'code' }))
    expect(found).toEqual([{ name: 'VS Code', scheme: 'vscode' }])
  })

  it('does not check app bundles on non-darwin platforms', () => {
    const found = detectEditors(
      fakeProbe({
        platform: 'linux',
        appExists: () => true, // would match if checked — must be ignored
        readScheme: () => 'should-not-be-used',
        hasBin: (bin) => bin === 'code',
      }),
    )
    expect(found).toEqual([{ name: 'VS Code', scheme: 'vscode' }])
  })

  it('returns multiple editors in candidate preference order', () => {
    const found = detectEditors(
      fakeProbe({
        appExists: (path) => path.endsWith('Cursor.app') || path.endsWith('Visual Studio Code.app'),
        readScheme: (path) => (path.includes('Cursor') ? 'cursor' : 'vscode'),
      }),
    )
    expect(found.map((editor) => editor.name)).toEqual(['Cursor', 'VS Code'])
  })
})
