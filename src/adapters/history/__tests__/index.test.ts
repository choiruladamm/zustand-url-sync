import { beforeEach, describe, expect, it, vi } from 'vitest'
import { describeAdapterConformance } from '../../../../test/support/adapter-conformance.js'
import { historyAdapter } from '../index.js'

const options = { history: 'replace' as const, shallow: true, scroll: false }

describeAdapterConformance('historyAdapter', { create: historyAdapter })

beforeEach(() => {
  globalThis.history.replaceState(null, '', '/products')
})

describe('historyAdapter', () => {
  it('reads the live query string', () => {
    globalThis.history.replaceState(null, '', '/products?q=hi')
    expect(historyAdapter().read().get('q')).toBe('hi')
  })

  it('replaces the URL without adding a history entry', () => {
    const before = globalThis.history.length
    historyAdapter().write(new URLSearchParams({ q: 'a' }), options)
    expect(globalThis.location.search).toBe('?q=a')
    expect(globalThis.history.length).toBe(before)
  })

  it('keeps the pathname and the hash', () => {
    globalThis.history.replaceState(null, '', '/products#reviews')
    historyAdapter().write(new URLSearchParams({ q: 'a' }), options)
    expect(globalThis.location.pathname).toBe('/products')
    expect(globalThis.location.hash).toBe('#reviews')
  })

  it('drops the question mark when the query empties', () => {
    globalThis.history.replaceState(null, '', '/products?q=a')
    historyAdapter().write(new URLSearchParams(), options)
    expect(globalThis.location.search).toBe('')
  })

  it('emits readable commas rather than %2C', () => {
    historyAdapter().write(new URLSearchParams({ tags: 'a,b' }), options)
    expect(globalThis.location.search).toBe('?tags=a,b')
  })

  it('notifies on popstate and hashchange, and unsubscribes cleanly', () => {
    const adapter = historyAdapter()
    const listener = vi.fn()
    const unsubscribe = adapter.subscribe(listener)

    globalThis.dispatchEvent(new Event('popstate'))
    globalThis.dispatchEvent(new Event('hashchange'))
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    globalThis.dispatchEvent(new Event('popstate'))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('exposes the pathname', () => {
    expect(historyAdapter().pathname?.()).toBe('/products')
  })

  it('degrades instead of throwing when history rejects the write', () => {
    const adapter = historyAdapter()
    const replaceState = vi.spyOn(globalThis.history, 'replaceState').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(() => adapter.write(new URLSearchParams({ q: 'a' }), options)).not.toThrow()
    replaceState.mockRestore()
  })

  it('reports no rate limit factor outside Safari', () => {
    expect(historyAdapter().rateLimitFactor).toBe(1)
  })

  it('applies the Safari factor when the user agent says Safari', () => {
    const ua = vi
      .spyOn(globalThis.navigator, 'userAgent', 'get')
      .mockReturnValue(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      )

    expect(historyAdapter().rateLimitFactor).toBe(2.4)
    ua.mockRestore()
  })
})
