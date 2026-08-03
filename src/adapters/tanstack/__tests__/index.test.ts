import { beforeEach, describe, expect, it, vi } from 'vitest'
import { describeAdapterConformance } from '../../../../test/support/adapter-conformance.js'
import type { AdapterWriteOptions } from '../../../core/types.js'
import { type TanStackRouter, tanstackRouterAdapter } from '../index.js'

const shallowReplace: AdapterWriteOptions = {
  history: 'replace',
  shallow: true,
  scroll: false,
}
const deepReplace: AdapterWriteOptions = {
  history: 'replace',
  shallow: false,
  scroll: false,
}
const deepPush: AdapterWriteOptions = {
  history: 'push',
  shallow: false,
  scroll: true,
}

type FakeRouter = TanStackRouter & { listeners: Set<() => void> }

const tanstackRouter = (): FakeRouter => {
  const listeners = new Set<() => void>()
  return {
    load: vi.fn(() => Promise.resolve()),
    subscribe(_event: 'onResolved', listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    listeners,
  }
}

describeAdapterConformance('tanstackRouterAdapter', {
  create: () => tanstackRouterAdapter(tanstackRouter()),
})

describe('tanstackRouterAdapter', () => {
  beforeEach(() => {
    globalThis.history.replaceState(null, '', '/products')
  })

  it('writes the URL itself rather than through the router', async () => {
    const router = tanstackRouter()
    await tanstackRouterAdapter(router).write(
      new URLSearchParams({ q: 'hello', page: '3' }),
      deepReplace,
    )

    // The whole point: TanStack's own serialiser would have emitted ?page="3".
    expect(globalThis.location.search).toBe('?q=hello&page=3')
  })

  it('keeps the wire format for values that look like JSON', async () => {
    const router = tanstackRouter()
    const params = new URLSearchParams({
      page: '2',
      open: 'true',
      empty: 'null',
    })
    await tanstackRouterAdapter(router).write(params, deepReplace)

    expect(globalThis.location.search).toBe('?page=2&open=true&empty=null')
  })

  it('passes through keys it does not own, so validateSearch keeps working', async () => {
    globalThis.history.replaceState(null, '', '/products?theirs=keep')
    const router = tanstackRouter()
    await tanstackRouterAdapter(router).write(
      new URLSearchParams({ theirs: 'keep', q: 'hello' }),
      deepReplace,
    )

    expect(globalThis.location.search).toBe('?theirs=keep&q=hello')
  })

  it('leaves a shallow write to the history API alone', () => {
    const router = tanstackRouter()
    tanstackRouterAdapter(router).write(new URLSearchParams({ q: 'a' }), shallowReplace)

    expect(router.load).not.toHaveBeenCalled()
    expect(globalThis.location.search).toBe('?q=a')
  })

  it('adds a history entry for a non-shallow push', async () => {
    const before = globalThis.history.length
    await tanstackRouterAdapter(tanstackRouter()).write(new URLSearchParams({ q: 'a' }), deepPush)

    expect(globalThis.history.length).toBe(before + 1)
  })

  it('resolves the write only once the router has resolved the location', async () => {
    let settle: (() => void) | undefined
    const router = tanstackRouter()
    router.load = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve
        }),
    )

    const pending = tanstackRouterAdapter(router).write(
      new URLSearchParams({ q: 'a' }),
      deepReplace,
    )
    let done = false
    void Promise.resolve(pending).then(() => {
      done = true
    })

    await Promise.resolve()
    expect(done).toBe(false)

    settle?.()
    await pending
    expect(done).toBe(true)
  })

  it('hears the router resolving a navigation, and detaches on unsubscribe', () => {
    const router = tanstackRouter()
    const adapter = tanstackRouterAdapter(router)
    const listener = vi.fn()
    const unsubscribe = adapter.subscribe(listener)

    expect(router.listeners.size).toBe(1)
    for (const notify of router.listeners) notify()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    expect(router.listeners.size).toBe(0)
  })

  it('ignores a rejected load instead of failing the flush', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const router = tanstackRouter()
    router.load = vi.fn(() => Promise.reject(new Error('blocked')))

    await expect(
      tanstackRouterAdapter(router).write(new URLSearchParams({ q: 'a' }), deepReplace),
    ).resolves.toBe(undefined)
    expect(warn.mock.calls[0]?.[0]).toMatch(/tanstackRouterAdapter failed/)
    warn.mockRestore()
  })
})
