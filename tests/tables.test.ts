import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { walkData, walkMarkdown } from '../src/core/scan'
import { csvHead, dataFileSummary, jsonTopLevelKeys, yamlTopLevelKeys } from '../src/core/tables'

describe('tables (structural data summaries)', () => {
  it('csvHead: headers + row count, quoted commas honored, BOM stripped', () => {
    expect(csvHead('name,phone\nlina,123\nomar,456\n')).toEqual({
      headers: ['name', 'phone'],
      rowCount: 2,
    })
    expect(csvHead('"last, first",city\n"x, y",cairo\n')).toEqual({
      headers: ['last, first', 'city'],
      rowCount: 1,
    })
    expect(csvHead('﻿a,b\n1,2\n')).toEqual({ headers: ['a', 'b'], rowCount: 1 })
    expect(csvHead('')).toEqual({ headers: [], rowCount: 0 })
    expect(csvHead('only_headers\n')).toEqual({ headers: ['only_headers'], rowCount: 0 })
  })

  it('yaml/json top-level keys: maps only, sorted, [] on scalars/arrays/errors', () => {
    expect(yamlTopLevelKeys('b: 1\na:\n  nested: 2\n')).toEqual(['a', 'b'])
    expect(yamlTopLevelKeys('- a\n- b\n')).toEqual([])
    expect(yamlTopLevelKeys('just a string')).toEqual([])
    expect(yamlTopLevelKeys('bad: [unclosed\n  x: {')).toEqual([])
    expect(jsonTopLevelKeys('{"z": 1, "a": 2}')).toEqual(['a', 'z'])
    expect(jsonTopLevelKeys('[1,2]')).toEqual([])
    expect(jsonTopLevelKeys('not json')).toEqual([])
  })

  it('dataFileSummary dispatches by extension', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loredex-tables-'))
    writeFileSync(join(dir, 'faq.csv'), 'q,a\nhours?,9-5\n')
    writeFileSync(join(dir, 'flow.json'), '{"nodes": [], "name": "booking"}')
    writeFileSync(join(dir, 'ws.yaml'), 'mcp: {}\nskills: []\n')
    expect(dataFileSummary(join(dir, 'faq.csv'))).toEqual({
      kind: 'csv',
      keys: ['q', 'a'],
      rowCount: 1,
    })
    expect(dataFileSummary(join(dir, 'flow.json'))).toEqual({
      kind: 'json',
      keys: ['name', 'nodes'],
    })
    expect(dataFileSummary(join(dir, 'ws.yaml'))).toEqual({ kind: 'yaml', keys: ['mcp', 'skills'] })
    expect(dataFileSummary(join(dir, 'missing.csv'))).toBeNull()
    expect(dataFileSummary(join(dir, 'other.txt'))).toBeNull()
  })

  it('walkData prunes like walkMarkdown and picks only data extensions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loredex-walk-'))
    writeFileSync(join(dir, 'a.csv'), 'x\n')
    writeFileSync(join(dir, 'b.yaml'), 'x: 1\n')
    writeFileSync(join(dir, 'c.yml'), 'x: 1\n')
    writeFileSync(join(dir, 'd.json'), '{}')
    writeFileSync(join(dir, 'note.md'), '# hi\n')
    mkdirSync(join(dir, 'node_modules'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'skip.json'), '{}')
    mkdirSync(join(dir, '.hidden'), { recursive: true })
    writeFileSync(join(dir, '.hidden', 'skip.csv'), 'x\n')

    const data = walkData(dir).map((p) => p.slice(dir.length + 1))
    expect(data).toEqual(['a.csv', 'b.yaml', 'c.yml', 'd.json'])
    const md = walkMarkdown(dir).map((p) => p.slice(dir.length + 1))
    expect(md).toEqual(['note.md'])
  })
})
