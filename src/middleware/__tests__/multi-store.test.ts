import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { recordingAdapter } from '../../../test/support/recording-adapter.js'
import { c } from '../../codecs/c.js'
import { urlSync } from '../url-sync.js'

type Table = { page: number; setPage: (page: number) => void }
type Search = { q: string; setQ: (q: string) => void }

const createTableStore = (adapter: ReturnType<typeof recordingAdapter>, prefix?: string | true) =>
  createStore<Table>()(
    urlSync(
      (set) => ({ page: 1, setPage: (page) => set({ page }) }),
      prefix === undefined
        ? { name: 'table', adapter, params: { page: c.integer().default(1) } }
        : { name: 'table', adapter, prefix, params: { page: c.integer().default(1) } },
    ),
  )

const createSearchStore = (adapter: ReturnType<typeof recordingAdapter>) =>
  createStore<Search>()(
    urlSync((set) => ({ q: '', setQ: (q) => set({ q }) }), {
      name: 'search',
      adapter,
      params: { q: c.string().default('') },
    }),
  )

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('two stores on one adapter', () => {
  it('loses no params when both write in the same tick', async () => {
    const adapter = recordingAdapter('/products')
    const table = createTableStore(adapter)
    const search = createSearchStore(adapter)
    adapter.clearWrites()

    table.getState().setPage(3)
    search.getState().setQ('hello')

    await table.urlSync.flush()
    expect(adapter.url()).toBe('/products?page=3&q=hello')
    expect(adapter.writes).toHaveLength(1)
  })

  it('merges onto the live URL rather than a stale snapshot', async () => {
    const adapter = recordingAdapter('/products')
    const table = createTableStore(adapter)
    const search = createSearchStore(adapter)
    adapter.clearWrites()

    table.getState().setPage(3)
    await table.urlSync.flush()

    search.getState().setQ('hello')
    await search.urlSync.flush()

    expect(adapter.url()).toBe('/products?page=3&q=hello')
  })

  it('applies one external navigation to both stores', () => {
    const adapter = recordingAdapter('/products')
    const table = createTableStore(adapter)
    const search = createSearchStore(adapter)

    adapter.navigate('/products?page=5&q=goodbye')

    expect(table.getState().page).toBe(5)
    expect(search.getState().q).toBe('goodbye')
  })

  it('throws in dev when both claim the same param key, naming both stores', () => {
    const adapter = recordingAdapter('/products')
    createTableStore(adapter)

    expect(() => createTableStore(adapter)).not.toThrow()
    expect(() =>
      createStore<Table>()(
        urlSync((set) => ({ page: 1, setPage: (page) => set({ page }) }), {
          name: 'other-table',
          adapter,
          params: { page: c.integer().default(1) },
        }),
      ),
    ).toThrow(/two stores claim the param "page".*"table".*"other-table"/s)
  })

  it('lets a prefix resolve the collision', async () => {
    const adapter = recordingAdapter('/products')
    const table = createTableStore(adapter)
    const other = createTableStore(adapter, 'other_')
    adapter.clearWrites()

    table.getState().setPage(2)
    other.getState().setPage(9)

    await table.urlSync.flush()
    expect(adapter.url()).toBe('/products?page=2&other_page=9')
  })

  it('gives stores on different adapters independent scopes', async () => {
    const first = recordingAdapter('/products')
    const second = recordingAdapter('/products')
    const a = createTableStore(first)
    const b = createTableStore(second)

    a.getState().setPage(2)
    b.getState().setPage(7)
    await a.urlSync.flush()
    await b.urlSync.flush()

    expect(first.url()).toBe('/products?page=2')
    expect(second.url()).toBe('/products?page=7')
  })
})
