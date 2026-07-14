import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  groupProjects,
  inferProducts,
  loadProducts,
  productOf,
  setProduct,
} from '../src/core/products'

function vault(): string {
  const v = mkdtempSync(join(tmpdir(), 'loredex-prod-'))
  mkdirSync(join(v, '_index'), { recursive: true })
  return v
}

describe('products', () => {
  it('round-trips the manifest and reports a project’s product', () => {
    const v = vault()
    expect(loadProducts(v)).toEqual({}) // no manifest yet
    setProduct(v, 'acme-crm', 'acme')
    setProduct(v, 'acme-website', 'acme')
    setProduct(v, 'loredex-desktop', 'loredex')
    const map = loadProducts(v)
    expect(map).toEqual({
      acme: ['acme-crm', 'acme-website'],
      loredex: ['loredex-desktop'],
    })
    expect(productOf(map, 'acme-website')).toBe('acme')
    expect(productOf(map, 'unknown')).toBeNull()
  })

  it('moving a project to a new product removes it from the old one', () => {
    const v = vault()
    setProduct(v, 'p', 'a')
    setProduct(v, 'p', 'b')
    expect(loadProducts(v)).toEqual({ b: ['p'] }) // 'a' emptied → dropped
  })

  it('groups Product → Project with Ungrouped last, dropping absent members', () => {
    const map = { acme: ['acme-crm', 'gone'], loredex: ['loredex-desktop'] }
    const groups = groupProjects(map, ['acme-crm', 'loredex-desktop', 'orphan'])
    expect(groups).toEqual([
      { product: 'acme', projects: ['acme-crm'] }, // 'gone' isn't present → dropped
      { product: 'loredex', projects: ['loredex-desktop'] },
      { product: null, projects: ['orphan'] }, // Ungrouped, last
    ])
  })

  it('no manifest → one Ungrouped group (drives the flat, pre-product layout)', () => {
    const groups = groupProjects({}, ['a', 'b'])
    expect(groups).toEqual([{ product: null, projects: ['a', 'b'] }])
  })

  it('infers products only from prefixes shared by 2+ projects', () => {
    expect(inferProducts(['acme-crm', 'acme-website', 'loredex-desktop', 'standalone'])).toEqual({
      acme: ['acme-crm', 'acme-website'],
      // loredex-desktop is the only loredex-* → not a product; standalone has no prefix
    })
  })

  it('tolerates a hand-written flat manifest (no products wrapper)', () => {
    const v = vault()
    writeFileSync(join(v, '_index', 'products.json'), JSON.stringify({ acme: ['x'] }))
    expect(loadProducts(v)).toEqual({ acme: ['x'] })
  })

  it('the manifest is committable JSON under _index/', () => {
    const v = vault()
    setProduct(v, 'x', 'y')
    const raw = readFileSync(join(v, '_index', 'products.json'), 'utf8')
    expect(JSON.parse(raw)).toEqual({ products: { y: ['x'] } })
  })
})
