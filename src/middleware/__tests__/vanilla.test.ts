import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { memoryAdapter } from '../../adapters/memory/index.js'
import { c } from '../../codecs/c.js'
import { urlSync } from '../url-sync.js'

type Search = { q: string; setQ: (q: string) => void }

/**
 * The vanilla path is the one users of the zustand core hit, and the one that catches a stray
 * React import — `lint:arch` proves the import is absent, this proves the behaviour is not.
 */
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createStore from zustand/vanilla', () => {
  const build = (url = '/') => {
    const adapter = memoryAdapter(url)
    const store = createStore<Search>()(
      urlSync((set) => ({ q: '', setQ: (q) => set({ q }) }), {
        name: 'search',
        adapter,
        params: { q: c.string().default('') },
      }),
    )
    return { adapter, store }
  }

  it('hydrates from the URL', () => {
    const { store } = build('/?q=hello')
    expect(store.getState().q).toBe('hello')
  })

  it('writes to the URL', async () => {
    const { adapter, store } = build()
    store.getState().setQ('hello')

    await store.urlSync.flush()
    expect(adapter.url()).toBe('/?q=hello')
  })

  it('notifies subscribers on an external navigation', () => {
    const { adapter, store } = build()
    const listener = vi.fn()
    store.subscribe(listener)

    adapter.navigate('/?q=goodbye')

    expect(listener).toHaveBeenCalledOnce()
    expect(store.getState().q).toBe('goodbye')
  })

  it('exposes the handle on the store object', () => {
    const { store } = build('/?q=hello')
    expect(store.urlSync.toSearchParams().get('q')).toBe('hello')
  })

  it('works with no window present', async () => {
    vi.stubGlobal('window', undefined)
    try {
      const { adapter, store } = build('/?q=hello')
      expect(store.getState().q).toBe('hello')

      store.getState().setQ('goodbye')
      await store.urlSync.flush()
      expect(adapter.url()).toBe('/?q=goodbye')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
