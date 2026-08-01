/**
 * The contract every browser-backed adapter owes the engine, as one suite run against each of them.
 *
 * Every assertion goes through `UrlAdapter` and nothing else — no peeking at `location.search`. That
 * is deliberate: an adapter is free to keep params somewhere other than the query string, and the
 * engine cannot tell the difference. It also makes this suite the honest answer to "is the
 * interface small enough for somebody else to implement?" — a hash adapter written from the docs
 * has to pass exactly this.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdapterWriteOptions, UrlAdapter } from '../../src/core/types.js'

const replace: AdapterWriteOptions = {
  history: 'replace',
  shallow: true,
  scroll: false,
}
const push: AdapterWriteOptions = {
  history: 'push',
  shallow: true,
  scroll: false,
}

export type AdapterUnderTest = {
  /** A fresh instance. Called per assertion, because an adapter is a scope root. */
  create(): UrlAdapter
  /** Where the suite starts each assertion from. */
  startUrl?: string
}

const settle = async (result: void | Promise<void>): Promise<void> => {
  await result
}

export function describeAdapterConformance(name: string, subject: AdapterUnderTest): void {
  const startUrl = subject.startUrl ?? '/products'

  describe(`${name} — adapter contract`, () => {
    beforeEach(() => {
      globalThis.history.replaceState(null, '', startUrl)
    })

    it('reads back what it wrote', async () => {
      const adapter = subject.create()
      await settle(adapter.write(new URLSearchParams({ q: 'hello', page: '3' }), replace))
      expect(adapter.read().get('q')).toBe('hello')
      expect(adapter.read().get('page')).toBe('3')
    })

    it('returns a fresh URLSearchParams each read, so a caller cannot mutate its state', () => {
      const adapter = subject.create()
      adapter.read().set('q', 'injected')
      expect(adapter.read().get('q')).toBeNull()
    })

    it('drops a key the next write omits', async () => {
      const adapter = subject.create()
      await settle(adapter.write(new URLSearchParams({ q: 'hello', page: '3' }), replace))
      await settle(adapter.write(new URLSearchParams({ page: '3' }), replace))
      expect(adapter.read().get('q')).toBeNull()
      expect(adapter.read().get('page')).toBe('3')
    })

    it('empties completely', async () => {
      const adapter = subject.create()
      await settle(adapter.write(new URLSearchParams({ q: 'hello' }), replace))
      await settle(adapter.write(new URLSearchParams(), replace))
      expect([...adapter.read().keys()]).toEqual([])
    })

    it('round-trips values that need escaping', async () => {
      const adapter = subject.create()
      const awkward = {
        q: 'a b&c=d#e',
        tags: 'x,y',
        pct: '100%',
        unicode: 'ümlaut 日本',
      }
      await settle(adapter.write(new URLSearchParams(awkward), replace))
      expect(Object.fromEntries(adapter.read())).toEqual(awkward)
    })

    it('keeps repeated keys distinct', async () => {
      const adapter = subject.create()
      const params = new URLSearchParams()
      params.append('tag', 'a')
      params.append('tag', 'b')
      await settle(adapter.write(params, replace))
      expect(adapter.read().getAll('tag')).toEqual(['a', 'b'])
    })

    it('notifies subscribers when the user navigates, and stops once unsubscribed', () => {
      const adapter = subject.create()
      const listener = vi.fn()
      const unsubscribe = adapter.subscribe(listener)

      globalThis.dispatchEvent(new Event('popstate'))
      expect(listener).toHaveBeenCalled()

      const seen = listener.mock.calls.length
      unsubscribe()
      globalThis.dispatchEvent(new Event('popstate'))
      expect(listener).toHaveBeenCalledTimes(seen)
    })

    it('supports more than one subscriber', () => {
      const adapter = subject.create()
      const first = vi.fn()
      const second = vi.fn()
      const off = adapter.subscribe(first)
      adapter.subscribe(second)

      globalThis.dispatchEvent(new Event('popstate'))
      expect(first).toHaveBeenCalled()
      expect(second).toHaveBeenCalled()

      off()
      const secondSeen = second.mock.calls.length
      globalThis.dispatchEvent(new Event('popstate'))
      expect(second.mock.calls.length).toBeGreaterThan(secondSeen)
    })

    it('reports the live pathname', () => {
      expect(subject.create().pathname?.()).toBe(startUrl)
    })

    it('adds a history entry for a push and none for a replace', async () => {
      const adapter = subject.create()
      const before = globalThis.history.length

      await settle(adapter.write(new URLSearchParams({ q: 'a' }), replace))
      expect(globalThis.history.length).toBe(before)

      await settle(adapter.write(new URLSearchParams({ q: 'b' }), push))
      expect(globalThis.history.length).toBe(before + 1)
    })

    it('degrades rather than throwing when the platform rejects the write', () => {
      const adapter = subject.create()
      const spies = [
        vi.spyOn(globalThis.history, 'replaceState').mockImplementation(() => {
          throw new Error('SecurityError')
        }),
        vi.spyOn(globalThis.history, 'pushState').mockImplementation(() => {
          throw new Error('SecurityError')
        }),
      ]

      expect(() => adapter.write(new URLSearchParams({ q: 'a' }), replace)).not.toThrow()
      for (const spy of spies) spy.mockRestore()
    })

    it('declares a rate limit factor of at least 1', () => {
      const factor = subject.create().rateLimitFactor
      expect(factor === undefined || factor >= 1).toBe(true)
    })
  })
}
