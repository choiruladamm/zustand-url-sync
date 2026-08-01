import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFiltersStore } from '../../../test/support/filters-store.js'
import { memoryAdapter } from '../../adapters/memory/index.js'
import { clearDefaultAdapter, getDefaultAdapter, setDefaultAdapter } from '../default-adapter.js'

afterEach(() => {
  clearDefaultAdapter()
  vi.unstubAllGlobals()
})

describe('setDefaultAdapter', () => {
  it('supplies the adapter for a store that declares none', async () => {
    const adapter = memoryAdapter('/products?q=hello')
    setDefaultAdapter(adapter)

    const store = createFiltersStore()
    expect(store.getState().q).toBe('hello')

    store.getState().setQ('goodbye')
    await store.urlSync.flush()
    expect(adapter.url()).toBe('/products?q=goodbye')
  })

  it('throws off-browser, where one process serves concurrent requests', () => {
    vi.stubGlobal('window', undefined)
    expect(() => setDefaultAdapter(memoryAdapter())).toThrow(/concurrent requests/)
  })
})

describe('getDefaultAdapter', () => {
  it('falls back to the history adapter in a browser', () => {
    const adapter = getDefaultAdapter()
    expect(adapter?.read()).toBeInstanceOf(URLSearchParams)
  })

  it('returns the same instance every time, so stores share one scope', () => {
    expect(getDefaultAdapter()).toBe(getDefaultAdapter())
  })

  it('has nothing to fall back to off-browser', () => {
    vi.stubGlobal('window', undefined)
    expect(getDefaultAdapter()).toBeUndefined()
  })

  it('is what a store without an adapter or initialUrl complains about', () => {
    vi.stubGlobal('window', undefined)
    expect(() => createFiltersStore()).toThrow(/no URL adapter/)
  })
})
