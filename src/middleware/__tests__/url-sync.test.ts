import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFiltersStore } from '../../../test/support/filters-store.js'
import { recordingAdapter } from '../../../test/support/recording-adapter.js'

const setup = (url = '/products', options = {}) => {
  const adapter = recordingAdapter(url)
  const store = createFiltersStore({ adapter, ...options })
  adapter.clearWrites()
  return { adapter, store }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('store → URL', () => {
  it('writes the declared keys a set touched', async () => {
    const { adapter, store } = setup()
    store.getState().setQ('hello')

    await store.urlSync.flush()
    expect(adapter.url()).toBe('/products?q=hello')
  })

  it('omits a value equal to its default, so a clean state gives a clean URL', async () => {
    const { adapter, store } = setup('/products?q=hello')
    store.getState().setQ('')

    await store.urlSync.flush()
    expect(adapter.url()).toBe('/products')
  })

  it('renders an array with a bare separator', async () => {
    const { adapter, store } = setup()
    store.setState({ tags: ['react', 'zustand'] })

    await store.urlSync.flush()
    expect(adapter.url()).toBe('/products?tags=react,zustand')
  })

  it('coalesces the keys of one set into a single write', async () => {
    const { adapter, store } = setup()
    store.getState().setQ('hello')

    await store.urlSync.flush()
    expect(adapter.writes).toHaveLength(1)
    expect(adapter.url()).toBe('/products?q=hello')
  })

  it('reaches the engine through setState from outside the store too', async () => {
    const { adapter, store } = setup()
    store.setState({ page: 3 })

    await store.urlSync.flush()
    expect(adapter.url()).toBe('/products?page=3')
  })

  it('does not write when a set touches no declared key', async () => {
    const { adapter, store } = setup()
    store.setState({ pageSize: 50 })

    await store.urlSync.flush()
    expect(adapter.writes).toHaveLength(0)
  })

  it('passes replace semantics through untouched', async () => {
    const { adapter, store } = setup()
    const next = { ...store.getState(), q: 'hello' }
    store.setState(next, true)

    // A merge would hand back a fresh object; identity is what proves `replace` survived.
    expect(store.getState()).toBe(next)
    await store.urlSync.flush()
    expect(adapter.url()).toBe('/products?q=hello')
  })
})

describe('URL → store', () => {
  it('takes the initial state from the URL, over the declared default', () => {
    const { store } = setup('/products?q=hello&page=3&tags=a,b')
    expect(store.getState()).toMatchObject({
      q: 'hello',
      page: 3,
      tags: ['a', 'b'],
    })
  })

  it('leaves undeclared state alone', () => {
    const { store } = setup('/products?q=hello&pageSize=99')
    expect(store.getState().pageSize).toBe(25)
  })

  it('applies an external navigation', () => {
    const { adapter, store } = setup('/products?q=hello')
    adapter.navigate('/products?q=goodbye&page=4')

    expect(store.getState()).toMatchObject({ q: 'goodbye', page: 4 })
  })

  it('reverts a key missing from the new URL to its default', () => {
    const { adapter, store } = setup('/products?q=hello&page=4')
    adapter.navigate('/products?page=4')

    expect(store.getState().q).toBe('')
  })

  it('does not feed its own write back into the store', async () => {
    const { adapter, store } = setup()
    const seen: string[] = []
    store.subscribe((state) => seen.push(state.q))

    store.getState().setQ('hello')
    await store.urlSync.flush()

    // One state change, one URL write, and no third event: the write did not come back round.
    expect(seen).toEqual(['hello'])
    expect(adapter.writes).toHaveLength(1)
  })

  it('follows Back and then Forward onto a value it wrote itself', async () => {
    const { adapter, store } = setup('/products')

    await store.urlSync.commit(() => store.getState().setPage(2), {
      history: 'push',
      limit: 'immediate',
    })
    expect(adapter.url()).toBe('/products?page=2')

    adapter.back()
    expect(store.getState().page).toBe(1)

    // The feedback guard used to hold "?page=2" forever, so returning to it looked like our own
    // write echoing back and the store stayed on the previous value while the URL moved.
    adapter.forward()
    expect(adapter.url()).toBe('/products?page=2')
    expect(store.getState().page).toBe(2)
  })

  it('falls back to the default for a value that will not parse, and strips it', async () => {
    const onInvalid = vi.fn()
    const { adapter, store } = setup('/products?page=nonsense', { onInvalid })

    expect(store.getState().page).toBe(1)
    expect(onInvalid).toHaveBeenCalledWith('page', 'nonsense')

    await store.urlSync.flush()
    expect(adapter.url()).toBe('/products')
  })
})

describe('prefix', () => {
  it('prefixes every param with the given string', async () => {
    const { adapter, store } = setup('/products', { prefix: 'tbl_' })
    store.getState().setQ('hello')

    await store.urlSync.flush()
    expect(adapter.url()).toBe('/products?tbl_q=hello')
  })

  it('derives the prefix from `name` when set to true', async () => {
    const { adapter, store } = setup('/products', { prefix: true })
    store.getState().setQ('hello')

    await store.urlSync.flush()
    expect(adapter.url()).toBe('/products?filters_q=hello')
  })

  it('reads the prefixed key back', () => {
    const { store } = setup('/products?filters_q=hello&q=ignored', {
      prefix: true,
    })
    expect(store.getState().q).toBe('hello')
  })
})

describe('handle', () => {
  it('builds a URL from the current state without navigating', () => {
    const { adapter, store } = setup()
    store.setState({ q: 'hello', page: 3 })

    expect(store.urlSync.toSearchParams().toString()).toBe('q=hello&page=3')
    expect(adapter.writes).toHaveLength(0)
  })

  it('forces a URL → store pass through patchFromUrl', () => {
    const { store } = setup()
    store.urlSync.patchFromUrl('/anything?q=forced&page=7')

    expect(store.getState()).toMatchObject({ q: 'forced', page: 7 })
  })

  it('treats a URL with no query as carrying no params', () => {
    const { store } = setup('/products?q=hello')
    store.urlSync.patchFromUrl('/products')

    expect(store.getState().q).toBe('')
  })

  it('resets declared keys to their defaults and clears them from the URL', async () => {
    const { adapter, store } = setup('/products?q=hello&page=3')
    store.urlSync.reset()

    expect(store.getState()).toMatchObject({ q: '', page: 1 })
    await store.urlSync.flush()
    expect(adapter.url()).toBe('/products')
  })

  it('leaves undeclared keys alone on reset', () => {
    const { store } = setup('/products?q=hello')
    store.setState({ pageSize: 50 })
    store.urlSync.reset()

    expect(store.getState().pageSize).toBe(50)
  })

  it('holds writes while paused and releases them on resume', async () => {
    const { adapter, store } = setup()
    store.urlSync.pause()
    store.getState().setQ('hello')

    await vi.advanceTimersByTimeAsync(200)
    expect(adapter.writes).toHaveLength(0)

    store.urlSync.resume()
    await vi.advanceTimersByTimeAsync(200)
    expect(adapter.url()).toBe('/products?q=hello')
  })

  it('stops syncing once disposed', async () => {
    const { adapter, store } = setup()
    store.urlSync.dispose()
    store.getState().setQ('hello')

    await vi.advanceTimersByTimeAsync(200)
    expect(adapter.writes).toHaveLength(0)
  })
})

describe('hydration', () => {
  it('hydrates during creation by default', () => {
    const { store } = setup('/products?q=hello')
    expect(store.urlSync.hasHydrated()).toBe(true)
    expect(store.getState().q).toBe('hello')
  })

  it('runs onHydrated immediately when hydration already happened', () => {
    const { store } = setup()
    const cb = vi.fn()
    store.urlSync.onHydrated(cb)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('leaves the store on its declared defaults under skipHydration', () => {
    const { store } = setup('/products?q=hello', { skipHydration: true })
    expect(store.urlSync.hasHydrated()).toBe(false)
    expect(store.getState().q).toBe('')
  })

  it('applies the URL when hydrate() runs, and notifies', () => {
    const { store } = setup('/products?q=hello', { skipHydration: true })
    const cb = vi.fn()
    store.urlSync.onHydrated(cb)

    store.urlSync.hydrate()

    expect(store.getState().q).toBe('hello')
    expect(store.urlSync.hasHydrated()).toBe(true)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('ignores a second hydrate()', () => {
    const { store } = setup('/products?q=hello', { skipHydration: true })
    store.urlSync.hydrate()
    store.setState({ q: 'edited' })
    store.urlSync.hydrate()

    expect(store.getState().q).toBe('edited')
  })
})

describe('route change', () => {
  it('keeps the params across a route change by default', () => {
    const { adapter, store } = setup('/products?q=hello')
    adapter.navigate('/users?q=hello')

    expect(store.getState().q).toBe('hello')
  })

  it('clears them under onRouteChange: reset', async () => {
    const { adapter, store } = setup('/products?q=hello', {
      onRouteChange: 'reset',
    })
    adapter.navigate('/users?q=hello')

    expect(store.getState().q).toBe('')
    await store.urlSync.flush()
    expect(adapter.url()).toBe('/users')
  })
})

describe('initialUrl', () => {
  it('reads params from the given string when there is no adapter', () => {
    const store = createFiltersStore({
      initialUrl: '/products?q=hello&page=2',
    })
    expect(store.getState()).toMatchObject({ q: 'hello', page: 2 })
  })

  it('drops writes rather than touching a URL it does not own', async () => {
    const store = createFiltersStore({ initialUrl: '/products?q=hello' })
    store.getState().setQ('goodbye')

    expect(store.getState().q).toBe('goodbye')
    await expect(store.urlSync.flush()).resolves.toBeInstanceOf(URLSearchParams)
  })

  it('gives each store its own scope, so two requests cannot see each other', async () => {
    const a = createFiltersStore({ initialUrl: '/products?q=first' })
    const b = createFiltersStore({ initialUrl: '/products?q=second' })

    expect(a.getState().q).toBe('first')
    expect(b.getState().q).toBe('second')
  })
})
