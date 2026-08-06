import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFiltersStore, type Filters } from '../../../test/support/filters-store.js'
import { memoryStorage } from '../../../test/support/memory-storage.js'
import { recordingAdapter } from '../../../test/support/recording-adapter.js'
import { c } from '../../codecs/c.js'
import { storageKey } from '../../storage/index.js'
import type { PersistOptions } from '../types.js'

const KEY = storageKey('filters')

type Persist = PersistOptions<Filters>

const persisted = { keys: ['sort'], extra: { pageSize: c.integer().default(25) } } satisfies Persist

const setup = (
  url = '/products',
  o: { persist?: Persist | false; stored?: Record<string, unknown>; version?: number } = {},
) => {
  const storage = memoryStorage()
  const persist = o.persist === undefined ? persisted : o.persist
  if (o.stored) {
    storage.entries.set(KEY, JSON.stringify({ v: o.version ?? 0, s: o.stored }))
  }
  const adapter = recordingAdapter(url)
  const store = createFiltersStore({
    adapter,
    persist: persist === false ? false : { ...persist, storage },
  })
  adapter.clearWrites()
  return { adapter, storage, store }
}

const stored = (storage: ReturnType<typeof memoryStorage>) =>
  JSON.parse(storage.entries.get(KEY) ?? 'null')?.s

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('precedence', () => {
  it('takes the URL over storage: a shared link renders what the sender saw', () => {
    const { store } = setup('/products?sort=name', { stored: { sort: 'created_at' } })

    expect(store.getState().sort).toBe('name')
  })

  it('takes storage over the default when the URL is silent', () => {
    const { store } = setup('/products', { stored: { sort: 'name' } })

    expect(store.getState().sort).toBe('name')
  })

  it('falls back to the default when neither holds the key', () => {
    const { store } = setup()

    expect(store.getState().sort).toBe('created_at')
  })

  it('falls through an invalid URL param to storage rather than to the default', () => {
    const { store } = setup('/products?sort=sideways', { stored: { sort: 'name' } })

    expect(store.getState().sort).toBe('name')
  })

  it('falls through an invalid stored value to the default', () => {
    const { store } = setup('/products', { stored: { sort: 'sideways' } })

    expect(store.getState().sort).toBe('created_at')
  })

  it('reports an invalid stored value through onInvalid', () => {
    const onInvalid = vi.fn()
    const storage = memoryStorage()
    storage.entries.set(KEY, JSON.stringify({ v: 0, s: { sort: 'sideways' } }))
    createFiltersStore({
      adapter: recordingAdapter('/products'),
      persist: { ...persisted, storage },
      onInvalid,
    })

    expect(onInvalid).toHaveBeenCalledWith('sort', 'sideways')
  })

  it('resolves each key on its own, so one tier can win a key the other lost', () => {
    const { store } = setup('/products?sort=name', {
      stored: { sort: 'created_at', pageSize: '50' },
    })

    expect(store.getState().sort).toBe('name')
    expect(store.getState().pageSize).toBe(50)
  })
})

describe('the write-back pass', () => {
  it('persists what the URL decided, so the link is remembered next time', () => {
    const { storage } = setup('/products?sort=name')

    expect(stored(storage)).toEqual({ sort: 'name' })
  })

  it('writes no entry at all when every key is at its default', () => {
    const { storage } = setup('/products?sort=created_at')

    expect(storage.entries.size).toBe(0)
  })

  it('does not persist a param that was never declared to it', async () => {
    const { storage, store } = setup()
    store.getState().setQ('hello')
    await store.urlSync.flush()

    expect(storage.entries.size).toBe(0)
  })
})

describe('storage-only keys', () => {
  it('persists an `extra` key that never appears in the URL', async () => {
    const { adapter, storage, store } = setup()
    store.setState({ pageSize: 50 })
    await store.urlSync.flush()

    expect(stored(storage)).toEqual({ pageSize: '50' })
    expect(adapter.url()).toBe('/products')
  })

  it('restores an `extra` key on the next store', () => {
    const { store } = setup('/products', { stored: { pageSize: '50' } })

    expect(store.getState().pageSize).toBe(50)
  })

  it('does not claim a URL param key, so another store may own that name', () => {
    const adapter = recordingAdapter('/products')
    const first = createFiltersStore({
      adapter,
      params: {},
      persist: { extra: { pageSize: c.integer().default(25) }, storage: memoryStorage() },
    })

    expect(() =>
      createFiltersStore({
        adapter,
        name: 'other',
        params: { pageSize: c.integer().default(25) },
      }),
    ).not.toThrow()
    first.urlSync.dispose()
  })

  it('survives a back navigation that has nothing to say about it', () => {
    const { adapter, store } = setup('/products', { stored: { pageSize: '50' } })
    adapter.navigate('/products?sort=name')

    expect(store.getState().sort).toBe('name')
    expect(store.getState().pageSize).toBe(50)
  })
})

describe('back and forward', () => {
  it('reverts a param the new URL omits to its default, not to the stored value', () => {
    const { adapter, store } = setup('/products?sort=name', { stored: { sort: 'name' } })
    adapter.navigate('/products')

    expect(store.getState().sort).toBe('created_at')
  })
})

describe('writes', () => {
  it('writes the whole batch once, not once per key', async () => {
    const { storage, store } = setup()
    storage.writes = 0
    store.setState({ sort: 'name', pageSize: 50 })
    await store.urlSync.flush()

    expect(storage.writes).toBe(1)
    expect(stored(storage)).toEqual({ sort: 'name', pageSize: '50' })
  })

  it('leaves storage untouched when only an unpersisted param moved', async () => {
    const { storage, store } = setup()
    storage.writes = 0
    store.getState().setQ('hello')
    await store.urlSync.flush()

    expect(storage.writes).toBe(0)
  })
})

describe('reset', () => {
  it('clears the URL and the storage entry together', async () => {
    const { adapter, storage, store } = setup('/products?sort=name&q=hi', {
      stored: { pageSize: '50' },
    })

    store.urlSync.reset()
    await store.urlSync.flush()

    expect(adapter.url()).toBe('/products')
    expect(stored(storage)).toEqual({})
    expect(store.getState().pageSize).toBe(25)
  })
})

describe('degradation', () => {
  it('runs URL-only when the backend refuses to store anything', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const adapter = recordingAdapter('/products')
    const store = createFiltersStore({
      adapter,
      persist: { ...persisted, storage: memoryStorage({ failWrites: true, failReads: true }) },
    })

    store.setState({ sort: 'name', pageSize: 50 })
    await store.urlSync.flush()

    expect(adapter.url()).toBe('/products?sort=name')
    expect(store.getState().pageSize).toBe(50)
  })

  it('is off entirely when `persist` is false', () => {
    const store = createFiltersStore({
      adapter: recordingAdapter('/products?sort=name'),
      persist: false,
    })

    expect(store.getState().sort).toBe('name')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('is off entirely when `persist.storage` is false', () => {
    const store = createFiltersStore({
      adapter: recordingAdapter('/products?sort=name'),
      persist: { ...persisted, storage: false },
    })

    expect(store.getState().sort).toBe('name')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('warns when `persist` declares nothing to persist', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    createFiltersStore({
      adapter: recordingAdapter('/products'),
      persist: { storage: memoryStorage() },
    })

    expect(warn.mock.calls[0]?.[0]).toContain('neither `keys` nor `extra`')
  })
})

describe('setup errors', () => {
  it('throws when `keys` names something `params` never declared', () => {
    expect(() =>
      createFiltersStore({
        adapter: recordingAdapter('/products'),
        persist: { keys: ['pageSize'], storage: memoryStorage() },
      }),
    ).toThrow(/not in `params`/)
  })

  it('throws when `extra` re-declares a param', () => {
    expect(() =>
      createFiltersStore({
        adapter: recordingAdapter('/products'),
        persist: { extra: { sort: c.enum(['created_at', 'name']).default('created_at') } },
      }),
    ).toThrow(/both `params` and `persist.extra`/)
  })
})

describe('prefix', () => {
  it('stores under the prefixed key, so a moved key needs no migration', async () => {
    const storage = memoryStorage()
    const store = createFiltersStore({
      adapter: recordingAdapter('/products'),
      prefix: true,
      persist: { ...persisted, storage },
    })

    store.setState({ sort: 'name', pageSize: 50 })
    await store.urlSync.flush()

    expect(stored(storage)).toEqual({ filters_sort: 'name', filters_pageSize: '50' })
  })
})
