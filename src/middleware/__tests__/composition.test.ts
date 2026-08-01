import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJSONStorage, devtools, persist, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createStore } from 'zustand/vanilla'
import { recordingAdapter } from '../../../test/support/recording-adapter.js'
import { c } from '../../codecs/c.js'
import { urlSync } from '../url-sync.js'

type Filters = {
  q: string
  tags: string[]
  pageSize: number
  setQ: (q: string) => void
  touchTags: () => void
}

const params = {
  q: c.string().default(''),
  tags: c.array(c.string()).default([]),
}

const fakeStorage = () => {
  const entries = new Map<string, string>()
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
    removeItem: (key: string) => {
      entries.delete(key)
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('immer', () => {
  const build = (url = '/products') => {
    const adapter = recordingAdapter(url)
    const store = createStore<Filters>()(
      urlSync(
        immer((set) => ({
          q: '',
          tags: [],
          pageSize: 25,
          setQ: (q) =>
            set((state) => {
              state.q = q
            }),
          touchTags: () =>
            set((state) => {
              // A new array with the same contents — exactly what a map/filter in a reducer
              // produces, and the case codec `eq` exists to absorb.
              state.tags = [...state.tags]
            }),
        })),
        { name: 'filters', adapter, params },
      ),
    )
    adapter.clearWrites()
    return { adapter, store }
  }

  it('syncs a producer write to the URL', async () => {
    const { adapter, store } = build()
    store.getState().setQ('hello')

    await store.urlSync.flush()
    expect(adapter.url()).toBe('/products?q=hello')
  })

  it('hydrates from the URL', () => {
    const { store } = build('/products?q=hello&tags=a,b')
    expect(store.getState()).toMatchObject({ q: 'hello', tags: ['a', 'b'] })
  })

  it('enqueues nothing when a producer rebuilds an array with the same contents', async () => {
    const { adapter, store } = build('/products?tags=a,b')

    store.getState().touchTags()
    await vi.advanceTimersByTimeAsync(500)

    expect(adapter.writes).toHaveLength(0)
  })

  it('works with immer on the outside too', async () => {
    const adapter = recordingAdapter('/products?q=hello')
    const store = createStore<Filters>()(
      immer(
        urlSync(
          (set) => ({
            q: '',
            tags: [],
            pageSize: 25,
            setQ: (q) => set({ q }),
            touchTags: () => set((state) => ({ tags: [...state.tags] })),
          }),
          { name: 'filters', adapter, params },
        ),
      ),
    )

    expect(store.getState().q).toBe('hello')
    store.getState().setQ('goodbye')
    await store.urlSync.flush()
    expect(adapter.url()).toBe('/products?q=goodbye')
  })
})

describe('devtools', () => {
  it('syncs with devtools on the outside', async () => {
    const adapter = recordingAdapter('/products?q=hello')
    const store = createStore<Filters>()(
      devtools(
        urlSync(
          (set) => ({
            q: '',
            tags: [],
            pageSize: 25,
            setQ: (q) => set({ q }),
            touchTags: () => set((state) => ({ tags: [...state.tags] })),
          }),
          { name: 'filters', adapter, params },
        ),
        { enabled: false },
      ),
    )

    expect(store.getState().q).toBe('hello')
    store.getState().setQ('goodbye')
    await store.urlSync.flush()
    expect(adapter.url()).toBe('/products?q=goodbye')
  })

  it('syncs with devtools on the inside', async () => {
    const adapter = recordingAdapter('/products?q=hello')
    const store = createStore<Filters>()(
      urlSync(
        devtools(
          (set) => ({
            q: '',
            tags: [],
            pageSize: 25,
            setQ: (q) => set({ q }),
            touchTags: () => set((state) => ({ tags: [...state.tags] })),
          }),
          { enabled: false },
        ),
        { name: 'filters', adapter, params },
      ),
    )

    expect(store.getState().q).toBe('hello')
    store.getState().setQ('goodbye')
    await store.urlSync.flush()
    expect(adapter.url()).toBe('/products?q=goodbye')
  })
})

describe('subscribeWithSelector', () => {
  it('fires a selector subscription on an external navigation', () => {
    const adapter = recordingAdapter('/products')
    const store = createStore<Filters>()(
      subscribeWithSelector(
        urlSync(
          (set) => ({
            q: '',
            tags: [],
            pageSize: 25,
            setQ: (q) => set({ q }),
            touchTags: () => set((state) => ({ tags: [...state.tags] })),
          }),
          { name: 'filters', adapter, params },
        ),
      ),
    )

    const seen: string[] = []
    store.subscribe(
      (state) => state.q,
      (q) => seen.push(q),
    )

    adapter.navigate('/products?q=external')
    store.getState().setQ('local')

    expect(seen).toEqual(['external', 'local'])
  })

  it('works with subscribeWithSelector on the inside', async () => {
    const adapter = recordingAdapter('/products?q=hello')
    const store = createStore<Filters>()(
      urlSync(
        subscribeWithSelector((set) => ({
          q: '',
          tags: [],
          pageSize: 25,
          setQ: (q) => set({ q }),
          touchTags: () => set((state) => ({ tags: [...state.tags] })),
        })),
        { name: 'filters', adapter, params },
      ),
    )

    expect(store.getState().q).toBe('hello')
    store.getState().setQ('goodbye')
    await store.urlSync.flush()
    expect(adapter.url()).toBe('/products?q=goodbye')
  })
})

describe('official persist', () => {
  /**
   * `urlSync` goes **outside** `persist`. Composed that way `persist` rehydrates while the store
   * is being created and `urlSync` resolves the URL on top of the result, so a shared link still
   * wins over whatever the recipient had stored. The other order inverts that, which is the whole
   * reason for the built-in storage tier.
   */
  const build = (url: string, storage: ReturnType<typeof fakeStorage>) => {
    const adapter = recordingAdapter(url)
    const store = createStore<Filters>()(
      urlSync(
        persist(
          (set) => ({
            q: '',
            tags: [],
            pageSize: 25,
            setQ: (q) => set({ q }),
            touchTags: () => set((state) => ({ tags: [...state.tags] })),
          }),
          {
            name: 'filters-store',
            storage: createJSONStorage(() => storage),
            partialize: (state) => ({ pageSize: state.pageSize }),
          },
        ),
        { name: 'filters', adapter, params },
      ),
    )
    return { adapter, store }
  }

  it('lets the URL win over a stored value for a declared key', () => {
    const storage = fakeStorage()
    storage.setItem('filters-store', JSON.stringify({ state: { q: 'stored' }, version: 0 }))

    const { store } = build('/products?q=from-url', storage)
    expect(store.getState().q).toBe('from-url')
  })

  it('leaves the persisted keys it does not own alone', () => {
    const storage = fakeStorage()
    storage.setItem('filters-store', JSON.stringify({ state: { pageSize: 99 }, version: 0 }))

    const { store } = build('/products', storage)
    expect(store.getState().pageSize).toBe(99)
  })

  it('still writes the URL after a persisted rehydrate', async () => {
    const storage = fakeStorage()
    const { adapter, store } = build('/products', storage)
    adapter.clearWrites()

    store.getState().setQ('hello')
    await store.urlSync.flush()

    expect(adapter.url()).toBe('/products?q=hello')
    expect(JSON.parse(storage.getItem('filters-store') ?? '{}')).toMatchObject({
      state: { pageSize: 25 },
    })
  })
})
