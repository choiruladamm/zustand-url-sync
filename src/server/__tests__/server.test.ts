import { describe, expect, it, vi } from 'vitest'
import { c } from '../../codecs/c.js'
import { serializeParams } from '../../core/params.js'
import { buildSearchParams, parseSearchParams } from '../index.js'

const config = {
  name: 'filters',
  params: {
    q: c.string().default(''),
    page: c.integer().default(1),
    tags: c.array(c.string()).default([]),
    sort: c.enum(['created_at', 'name']).default('created_at'),
  },
} as const

describe('parseSearchParams', () => {
  it('parses a URL string', () => {
    const result = parseSearchParams('?q=hello&page=2&tags=react,zustand', config)
    expect(result).toEqual({
      q: 'hello',
      page: 2,
      tags: ['react', 'zustand'],
      sort: 'created_at',
    })
  })

  it('parses a URLSearchParams object', () => {
    const params = new URLSearchParams('?q=hello&page=2')
    const result = parseSearchParams(params, config)
    expect(result).toEqual({
      q: 'hello',
      page: 2,
      tags: [],
      sort: 'created_at',
    })
  })

  it('accepts Next.js searchParams shape (Record<string, string | string[]>)', () => {
    // In join mode (default), Next.js gives a single string for ?tags=react,zustand
    const result = parseSearchParams({ q: 'hello', page: '2', tags: 'react,zustand' }, config)
    expect(result).toEqual({
      q: 'hello',
      page: 2,
      tags: ['react', 'zustand'],
      sort: 'created_at',
    })
  })

  it('accepts undefined values, as Next.js gives for an absent optional query key', () => {
    // Next's real `searchParams` type is `{ [key: string]: string | string[] | undefined }` —
    // a key with no value in the URL is present with an `undefined` value, not just absent.
    const searchParams: Record<string, string | string[] | undefined> = {
      q: 'hello',
      page: undefined,
    }
    const result = parseSearchParams(searchParams, config)
    expect(result).toEqual({
      q: 'hello',
      page: 1,
      tags: [],
      sort: 'created_at',
    })
  })

  it('falls back to defaults for missing keys', () => {
    const result = parseSearchParams('?', config)
    expect(result).toEqual({
      q: '',
      page: 1,
      tags: [],
      sort: 'created_at',
    })
  })

  it('falls back to defaults for invalid values', () => {
    const result = parseSearchParams('?page=not-a-number', config)
    expect(result).toEqual({
      q: '',
      page: 1,
      tags: [],
      sort: 'created_at',
    })
  })

  it('reports an invalid value via onInvalid, falling back to the default', () => {
    const onInvalid = vi.fn()
    const result = parseSearchParams('?page=not-a-number', { ...config, onInvalid })
    expect(result.page).toBe(1)
    expect(onInvalid).toHaveBeenCalledWith('page', 'not-a-number')
  })

  it('handles string[] for repeated keys (repeat mode)', () => {
    const repeatConfig = {
      name: 'filters',
      params: {
        tags: c.array(c.string(), { mode: 'repeat' }).default([]),
      },
    } as const
    const result = parseSearchParams({ tags: ['react', 'zustand'] }, repeatConfig)
    expect(result.tags).toEqual(['react', 'zustand'])
  })

  it('respects prefix', () => {
    const result = parseSearchParams('?tbl_q=hello', {
      ...config,
      prefix: 'tbl_',
    })
    expect(result.q).toBe('hello')
  })

  it('derives prefix from name when prefix: true', () => {
    const result = parseSearchParams('?filters_q=hello', {
      ...config,
      prefix: true,
    })
    expect(result.q).toBe('hello')
  })

  it('returns a plain object with no methods', () => {
    const result = parseSearchParams('?q=hello', config)
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  })
})

describe('buildSearchParams', () => {
  it('builds params from state values', () => {
    const params = buildSearchParams({ q: 'hello', page: 2, tags: ['react', 'zustand'] }, config)
    expect(params.get('q')).toBe('hello')
    expect(params.get('page')).toBe('2')
    expect(params.get('tags')).toBe('react,zustand')
  })

  it('omits values equal to their default', () => {
    const params = buildSearchParams({ q: '', page: 1 }, config)
    expect(params.has('q')).toBe(false)
    expect(params.has('page')).toBe(false)
  })

  it('builds an empty params when all values are defaults', () => {
    const params = buildSearchParams({}, config)
    expect(params.toString()).toBe('')
  })

  it('matches what the client would write', () => {
    const client = buildSearchParams(
      { q: 'hello', page: 2, tags: ['react', 'zustand'], sort: 'created_at' as const },
      config,
    )
    expect(serializeParams(client)).toBe('q=hello&page=2&tags=react,zustand')
  })

  it('respects prefix', () => {
    const params = buildSearchParams({ q: 'hello' }, { ...config, prefix: 'tbl_' })
    expect(params.get('tbl_q')).toBe('hello')
  })
})

describe('round-trip', () => {
  it('parse(build(values)) === values for non-defaults', () => {
    const values = { q: 'hello', page: 2, tags: ['a', 'b'], sort: 'name' as const }
    const built = buildSearchParams(values, config)
    const parsed = parseSearchParams(built, config)
    expect(parsed).toEqual(values)
  })
})
