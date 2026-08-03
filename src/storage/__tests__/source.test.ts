import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStorage } from '../../../test/support/memory-storage.js'
import type { RawValue } from '../../core/types.js'
import { guardStorage } from '../guarded.js'
import { createStorageSource, storageKey } from '../source.js'

const KEY = storageKey('filters')

const seed = (blob: unknown) => {
  const storage = memoryStorage()
  storage.entries.set(KEY, JSON.stringify(blob))
  storage.writes = 0
  return storage
}

const source = (storage: ReturnType<typeof memoryStorage>, keys = ['sort', 'pageSize']) =>
  createStorageSource({ name: 'filters', storage, keys, version: 1 })

const diff = (entries: Record<string, RawValue | undefined>) =>
  new Map<string, RawValue | undefined>(Object.entries(entries))

const stored = (storage: ReturnType<typeof memoryStorage>) =>
  JSON.parse(storage.entries.get(KEY) ?? 'null')

afterEach(() => {
  vi.restoreAllMocks()
})

describe('reading', () => {
  it('reads a declared key back out of the entry', () => {
    const s = source(seed({ v: 1, s: { sort: 'name' } }))

    expect(s.read('sort')).toBe('name')
  })

  it('reports an absent key as absent, so precedence falls through to the default', () => {
    const s = source(seed({ v: 1, s: { sort: 'name' } }))

    expect(s.read('pageSize')).toBeUndefined()
  })

  it('ignores a stored key this store never declared', () => {
    const s = source(seed({ v: 1, s: { sort: 'name', q: 'leftover' } }))

    expect(s.read('q')).toBeUndefined()
  })

  it('reads a repeated param back as an array', () => {
    const s = source(seed({ v: 1, s: { sort: ['a', 'b'] } }))

    expect(s.read('sort')).toEqual(['a', 'b'])
  })

  it('is empty when there is no entry at all', () => {
    expect(source(memoryStorage()).read('sort')).toBeUndefined()
  })
})

describe('corruption', () => {
  it('discards an unparseable entry and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = memoryStorage()
    storage.entries.set(KEY, '{not json')

    expect(source(storage).read('sort')).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('unreadable')
  })

  it.each([
    ['a bare array', []],
    ['a missing version', { s: { sort: 'name' } }],
    ['a non-numeric version', { v: '1', s: { sort: 'name' } }],
    ['a missing bag', { v: 1 }],
    ['a bag that is an array', { v: 1, s: ['name'] }],
  ])('discards %s wholesale rather than half-restoring it', (_label, blob) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(source(seed(blob)).read('sort')).toBeUndefined()
  })

  it('drops a key whose stored form is not a raw value, and keeps the rest', () => {
    const s = source(seed({ v: 1, s: { sort: 42, pageSize: '50' } }))

    expect(s.read('sort')).toBeUndefined()
    expect(s.read('pageSize')).toBe('50')
  })
})

describe('writing', () => {
  it('writes the whole batch with one setItem', () => {
    const storage = memoryStorage()
    const s = source(storage)

    s.write(diff({ sort: 'name', pageSize: '50' }))

    expect(storage.writes).toBe(1)
    expect(stored(storage)).toEqual({ v: 1, s: { sort: 'name', pageSize: '50' } })
  })

  it('persists the serialized string, identical to what the URL carries', () => {
    const storage = memoryStorage()

    source(storage).write(diff({ sort: 'name' }))

    expect(stored(storage).s.sort).toBe('name')
  })

  it('drops a key the state returned to its default', () => {
    const storage = seed({ v: 1, s: { sort: 'name', pageSize: '50' } })

    source(storage).write(diff({ sort: undefined }))

    expect(stored(storage)).toEqual({ v: 1, s: { pageSize: '50' } })
  })

  it('ignores keys it does not own, so one store cannot persist another store’s params', () => {
    const storage = memoryStorage()

    source(storage).write(diff({ q: 'hello' }))

    expect(storage.writes).toBe(0)
  })

  it('does not rewrite the entry when nothing it owns moved', () => {
    const storage = seed({ v: 1, s: { sort: 'name' } })
    const s = source(storage)

    s.write(diff({ sort: 'name', q: 'hello' }))

    expect(storage.writes).toBe(0)
  })

  it('reads back what it just wrote', () => {
    const s = source(memoryStorage())

    s.write(diff({ sort: 'name' }))

    expect(s.read('sort')).toBe('name')
  })

  it('degrades when the quota is exceeded, and keeps serving the value in this session', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const inner = memoryStorage({ failWrites: true })
    const storage = guardStorage(() => inner)
    if (!storage) throw new Error('unreachable: the backend resolves')
    const s = createStorageSource({ name: 'filters', storage, keys: ['sort'], version: 1 })

    expect(() => s.write(diff({ sort: 'name' }))).not.toThrow()
    expect(inner.entries.size).toBe(0)
    expect(s.read('sort')).toBe('name')
  })

  it('has no subscribe: cross-tab sync is not in this version', () => {
    expect(source(memoryStorage()).subscribe).toBeUndefined()
  })
})
