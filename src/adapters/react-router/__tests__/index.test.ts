import { beforeEach, describe, expect, it, vi } from 'vitest'
import { describeAdapterConformance } from '../../../../test/support/adapter-conformance.js'
import type { AdapterWriteOptions } from '../../../core/types.js'
import { type ReactRouterDataRouter, reactRouterAdapter } from '../index.js'

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

const dataRouter = (): ReactRouterDataRouter & {
  listeners: Set<() => void>
} => {
  const listeners = new Set<() => void>()
  return {
    navigate: vi.fn(() => Promise.resolve()),
    subscribe(listener: (state: unknown) => void) {
      const wrapped = () => listener(undefined)
      listeners.add(wrapped)
      return () => listeners.delete(wrapped)
    },
    listeners,
  }
}

describeAdapterConformance('reactRouterAdapter', {
  create: () => reactRouterAdapter(vi.fn(() => {})),
})

describeAdapterConformance('reactRouterAdapter (data router)', {
  create: () => reactRouterAdapter(dataRouter()),
})

describe('reactRouterAdapter', () => {
  beforeEach(() => {
    globalThis.history.replaceState(null, '', '/products')
  })

  it('keeps a shallow write away from the router, so no loader re-runs', () => {
    const navigate = vi.fn(() => {})
    reactRouterAdapter(navigate).write(new URLSearchParams({ q: 'a' }), shallowReplace)

    expect(navigate).not.toHaveBeenCalled()
    expect(globalThis.location.search).toBe('?q=a')
  })

  it('navigates on a non-shallow write, which re-runs the loaders', () => {
    const navigate = vi.fn(() => {})
    reactRouterAdapter(navigate).write(new URLSearchParams({ q: 'a' }), deepReplace)

    expect(navigate).toHaveBeenCalledWith('/products?q=a', {
      replace: true,
      preventScrollReset: true,
    })
  })

  it('translates scroll into preventScrollReset, which is the same flag inverted', () => {
    const navigate = vi.fn(() => {})
    reactRouterAdapter(navigate).write(new URLSearchParams({ q: 'a' }), deepPush)

    expect(navigate).toHaveBeenCalledWith('/products?q=a', {
      replace: false,
      preventScrollReset: false,
    })
  })

  it('navigates through a data router when no useNavigate is supplied', async () => {
    const router = dataRouter()
    await reactRouterAdapter(router).write(new URLSearchParams({ q: 'a' }), deepReplace)

    expect(router.navigate).toHaveBeenCalledWith('/products?q=a', {
      replace: true,
      preventScrollReset: true,
    })
  })

  it('listens to a data router’s own state changes, and detaches on unsubscribe', () => {
    const router = dataRouter()
    const adapter = reactRouterAdapter(router)
    const listener = vi.fn()
    const unsubscribe = adapter.subscribe(listener)

    expect(router.listeners.size).toBe(1)
    for (const notify of router.listeners) notify()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    expect(router.listeners.size).toBe(0)
  })

  it('ignores a navigation that throws instead of failing the flush', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const navigate = vi.fn(() => {
      throw new Error('blocked by a route guard')
    })

    expect(() =>
      reactRouterAdapter(navigate).write(new URLSearchParams({ q: 'a' }), deepReplace),
    ).not.toThrow()
    expect(warn.mock.calls[0]?.[0]).toMatch(/reactRouterAdapter failed/)
    warn.mockRestore()
  })
})
