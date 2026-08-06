import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStorage } from '../../../test/support/memory-storage.js'
import { createStorageSource, storageKey } from '../source.js'

const KEY = storageKey('filters')

const seed = (blob: unknown) => {
  const storage = memoryStorage()
  storage.entries.set(KEY, JSON.stringify(blob))
  storage.writes = 0
  return storage
}

type Migrate = (persisted: Record<string, unknown>, from: number) => Record<string, unknown>

const source = (storage: ReturnType<typeof memoryStorage>, version: number, migrate?: Migrate) =>
  createStorageSource({
    name: 'filters',
    storage,
    keys: ['sort', 'pageSize'],
    version,
    migrate,
  })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('version handling', () => {
  it('uses an entry whose version matches', () => {
    expect(source(seed({ v: 2, s: { sort: 'name' } }), 2).read('sort')).toBe('name')
  })

  it('migrates an older entry and rewrites it at the declared version', () => {
    const storage = seed({ v: 1, s: { order: 'name' } })
    const migrate: Migrate = (persisted) => ({ sort: persisted.order })

    const s = source(storage, 2, migrate)

    expect(s.read('sort')).toBe('name')
    expect(JSON.parse(storage.entries.get(KEY) ?? 'null')).toEqual({ v: 2, s: { sort: 'name' } })
    expect(storage.writes).toBe(1)
  })

  it('hands migrate the stored bag and the version it came from', () => {
    const migrate = vi.fn<Migrate>(() => ({}))

    source(seed({ v: 1, s: { sort: 'name' } }), 3, migrate)

    expect(migrate).toHaveBeenCalledWith({ sort: 'name' }, 1)
  })

  it('discards an older entry when there is no migrate, and says why', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(source(seed({ v: 1, s: { sort: 'name' } }), 2).read('sort')).toBeUndefined()
    expect(warn.mock.calls[0]?.[0]).toContain('persist.migrate')
  })

  it('discards an entry from a newer version, so a downgrade cannot crash on it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(source(seed({ v: 5, s: { sort: 'name' } }), 2).read('sort')).toBeUndefined()
    expect(warn.mock.calls[0]?.[0]).toContain('newer')
  })

  it('discards the entry when migrate throws instead of taking the store down with it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const migrate: Migrate = () => {
      throw new Error('bad upgrade')
    }

    let read: unknown
    expect(() => {
      read = source(seed({ v: 1, s: { sort: 'name' } }), 2, migrate).read('sort')
    }).not.toThrow()
    expect(read).toBeUndefined()
    expect(warn.mock.calls[0]?.[0]).toContain('bad upgrade')
  })

  it('drops a migrated value that is not a raw value, rather than injecting it', () => {
    const migrate: Migrate = () => ({ sort: { nested: true }, pageSize: '50' })

    const s = source(seed({ v: 1, s: {} }), 2, migrate)

    expect(s.read('sort')).toBeUndefined()
    expect(s.read('pageSize')).toBe('50')
  })

  it('discards when migrate returns something that is not an object', () => {
    const migrate = (() => null) as unknown as Migrate

    expect(source(seed({ v: 1, s: { sort: 'name' } }), 2, migrate).read('sort')).toBeUndefined()
  })

  it('defaults to version 0 when none is declared', () => {
    const storage = memoryStorage()
    createStorageSource({ name: 'filters', storage, keys: ['sort'], version: 0 }).write(
      new Map([['sort', 'name']]),
    )

    expect(JSON.parse(storage.entries.get(KEY) ?? 'null').v).toBe(0)
  })
})
