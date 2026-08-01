/**
 * The route-change policy, end to end. The engine implements it; what is proved here is the half
 * only a real adapter can supply — `pathname()` — plus the three behaviours a user picks between
 * when a single-page app leaves the route a store belongs to.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFiltersStore } from '../../../test/support/filters-store.js'
import { recordingAdapter } from '../../../test/support/recording-adapter.js'
import type { RouteChangePolicy, UrlAdapter } from '../../core/types.js'

const setup = (url: string, onRouteChange?: RouteChangePolicy) => {
  const adapter = recordingAdapter(url)
  const store = createFiltersStore(onRouteChange ? { adapter, onRouteChange } : { adapter })
  adapter.clearWrites()
  return { adapter, store }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("onRouteChange: 'keep' (the default)", () => {
  it('adopts the destination’s params rather than overruling them', async () => {
    const { adapter, store } = setup('/products?q=hello')

    adapter.navigate('/users?q=other')
    await vi.advanceTimersByTimeAsync(1000)

    expect(store.getState().q).toBe('other')
  })

  it('falls back to defaults for params the destination omits, and writes nothing back', async () => {
    const { adapter, store } = setup('/products?q=hello&page=3')

    adapter.navigate('/users')
    await vi.advanceTimersByTimeAsync(1000)

    expect(store.getState().q).toBe('')
    expect(store.getState().page).toBe(1)
    expect(adapter.writes).toHaveLength(0)
    expect(adapter.url()).toBe('/users')
  })
})

describe("onRouteChange: 'reset'", () => {
  it('returns every declared key to its default', async () => {
    const { adapter, store } = setup('/products?q=hello&page=3&tags=a,b&sort=name', 'reset')

    adapter.navigate('/users')
    await vi.advanceTimersByTimeAsync(1000)

    expect(store.getState()).toMatchObject({
      q: '',
      page: 1,
      tags: [],
      sort: 'created_at',
    })
  })

  it('overrules params the destination carries, unlike keep', async () => {
    const { adapter, store } = setup('/products?q=hello', 'reset')

    adapter.navigate('/users?q=other')
    await vi.advanceTimersByTimeAsync(1000)

    expect(store.getState().q).toBe('')
    expect(adapter.url()).toBe('/users')
  })

  it('leaves a query-only change alone — typing into a filter is not a route change', async () => {
    const { adapter, store } = setup('/products', 'reset')

    store.getState().setQ('hello')
    await store.urlSync.flush()
    expect(adapter.url()).toBe('/products?q=hello')

    adapter.navigate('/products?q=hello&page=2')
    await vi.advanceTimersByTimeAsync(1000)

    expect(store.getState().q).toBe('hello')
    expect(store.getState().page).toBe(2)
  })

  it('stays inert when the adapter cannot report a pathname', async () => {
    const inner = recordingAdapter('/products?q=hello')
    // Everything but `pathname`: an adapter is free to omit it, and the policy then has to degrade
    // to 'keep' rather than reset on the first external change it sees.
    const adapter: UrlAdapter = Object.freeze({
      read: inner.read,
      write: inner.write,
      subscribe: inner.subscribe,
    })
    const store = createFiltersStore({ adapter, onRouteChange: 'reset' })

    inner.navigate('/users?q=other')
    await vi.advanceTimersByTimeAsync(1000)

    expect(store.getState().q).toBe('other')
  })
})

describe("onRouteChange: 'unmount'", () => {
  it('resets, and hands the keys back so another store may claim them', async () => {
    const { adapter, store } = setup('/products?q=hello', 'unmount')

    adapter.navigate('/users')
    await vi.advanceTimersByTimeAsync(1000)
    expect(store.getState().q).toBe('')

    expect(() => createFiltersStore({ adapter, name: 'other' })).not.toThrow()
  })

  it('holds the claim while the store is still on its route', () => {
    const { adapter } = setup('/products?q=hello', 'unmount')

    expect(() => createFiltersStore({ adapter, name: 'other' })).toThrow(/two stores claim/)
  })
})
