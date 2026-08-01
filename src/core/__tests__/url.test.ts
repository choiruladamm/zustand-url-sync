import { describe, expect, it } from 'vitest'
import { pathnameOf, searchOf } from '../url.js'

describe('searchOf', () => {
  it('reads the query out of a path', () => {
    expect(searchOf('/products?q=hello&page=2').get('q')).toBe('hello')
  })

  it('reads it out of an absolute URL', () => {
    expect(searchOf('https://example.com/products?q=hello').get('q')).toBe('hello')
  })

  it('accepts a bare query string', () => {
    expect(searchOf('?q=hello').get('q')).toBe('hello')
  })

  it('treats a string with no `?` as carrying no params', () => {
    // Guessing the other way would turn `applyUrl('/products')` into a param named `/products`.
    expect([...searchOf('/products')]).toEqual([])
    expect([...searchOf('')]).toEqual([])
  })

  it('stops at the fragment', () => {
    expect(searchOf('/products?q=hello#section').get('q')).toBe('hello')
    expect(searchOf('/products?q=hello#a=b').has('a')).toBe(false)
  })

  it('keeps an empty query empty', () => {
    expect([...searchOf('/products?')]).toEqual([])
  })
})

describe('pathnameOf', () => {
  it('drops the query', () => {
    expect(pathnameOf('/products?q=hello')).toBe('/products')
  })

  it('drops the fragment', () => {
    expect(pathnameOf('/products#top')).toBe('/products')
  })

  it('drops a fragment that comes before a literal question mark', () => {
    expect(pathnameOf('/products#top?not-a-query')).toBe('/products')
  })

  it('returns the whole string when there is neither', () => {
    expect(pathnameOf('/products')).toBe('/products')
  })
})
