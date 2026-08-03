import { beforeEach, describe, expect, it, vi } from 'vitest'
import { describeAdapterConformance } from '../../../../test/support/adapter-conformance.js'
import type { AdapterWriteOptions } from '../../../core/types.js'
import {
  type NextAppRouter,
  type NextPagesRouter,
  nextAppRouterAdapter,
  nextPagesRouterAdapter,
} from '../index.js'

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

const appRouter = (): NextAppRouter => ({ push: vi.fn(), replace: vi.fn() })

const pagesRouter = (): NextPagesRouter & { handlers: Set<() => void> } => {
  const handlers = new Set<() => void>()
  return {
    push: vi.fn(() => Promise.resolve(true)),
    replace: vi.fn(() => Promise.resolve(true)),
    events: {
      on: (_event: string, handler: () => void) => handlers.add(handler),
      off: (_event: string, handler: () => void) => handlers.delete(handler),
    },
    handlers,
  }
}

describeAdapterConformance('nextAppRouterAdapter', {
  create: () => nextAppRouterAdapter(appRouter()),
})

describeAdapterConformance('nextPagesRouterAdapter', {
  create: () => nextPagesRouterAdapter(pagesRouter()),
})

describe('nextAppRouterAdapter', () => {
  beforeEach(() => {
    globalThis.history.replaceState(null, '', '/products')
  })

  it('keeps a shallow write away from the router entirely', () => {
    const router = appRouter()
    nextAppRouterAdapter(router).write(new URLSearchParams({ q: 'a' }), shallowReplace)

    expect(router.replace).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
    expect(globalThis.location.search).toBe('?q=a')
  })

  it('routes a non-shallow write so the server re-runs', () => {
    const router = appRouter()
    nextAppRouterAdapter(router).write(new URLSearchParams({ q: 'a' }), deepReplace)

    expect(router.replace).toHaveBeenCalledWith('/products?q=a', {
      scroll: false,
    })
  })

  it('pushes and restores scroll when asked to', () => {
    const router = appRouter()
    nextAppRouterAdapter(router).write(new URLSearchParams({ q: 'a' }), deepPush)

    expect(router.push).toHaveBeenCalledWith('/products?q=a', { scroll: true })
  })

  it('keeps the pathname and hash the user is on', () => {
    globalThis.history.replaceState(null, '', '/products/42#reviews')
    const router = appRouter()
    nextAppRouterAdapter(router).write(new URLSearchParams({ q: 'a' }), deepReplace)

    expect(router.replace).toHaveBeenCalledWith('/products/42?q=a#reviews', {
      scroll: false,
    })
  })

  it('resolves immediately, because App Router navigation returns nothing to await', async () => {
    const adapter = nextAppRouterAdapter(appRouter())
    await expect(Promise.resolve(adapter.write(new URLSearchParams(), deepReplace))).resolves.toBe(
      undefined,
    )
  })

  it('notifies subscribers on demand, since its own navigations skip popstate', () => {
    const adapter = nextAppRouterAdapter(appRouter())
    const listener = vi.fn()
    const unsubscribe = adapter.subscribe(listener)

    adapter.notify()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    adapter.notify()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('survives a router that throws mid-navigation', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const router: NextAppRouter = {
      push: vi.fn(),
      replace: vi.fn(() => {
        throw new Error('navigation aborted')
      }),
    }

    expect(() =>
      nextAppRouterAdapter(router).write(new URLSearchParams({ q: 'a' }), deepReplace),
    ).not.toThrow()
    warn.mockRestore()
  })
})

describe('nextPagesRouterAdapter', () => {
  beforeEach(() => {
    globalThis.history.replaceState(null, '', '/products')
  })

  it('keeps a shallow write away from the router', () => {
    const router = pagesRouter()
    nextPagesRouterAdapter(router).write(new URLSearchParams({ q: 'a' }), shallowReplace)

    expect(router.replace).not.toHaveBeenCalled()
    expect(globalThis.location.search).toBe('?q=a')
  })

  it('asks Next for a non-shallow navigation, which re-runs getServerSideProps', () => {
    const router = pagesRouter()
    nextPagesRouterAdapter(router).write(new URLSearchParams({ q: 'a' }), deepReplace)

    expect(router.replace).toHaveBeenCalledWith('/products?q=a', undefined, {
      scroll: false,
      shallow: false,
    })
  })

  it('resolves the write only once the navigation settles', async () => {
    let settle: (() => void) | undefined
    const router = pagesRouter()
    router.replace = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          settle = () => resolve(true)
        }),
    )

    const pending = nextPagesRouterAdapter(router).write(
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

  it('hears the app’s own navigations through routeChangeComplete', () => {
    const router = pagesRouter()
    const adapter = nextPagesRouterAdapter(router)
    const listener = vi.fn()
    const unsubscribe = adapter.subscribe(listener)

    expect(router.handlers.size).toBe(1)
    for (const handler of router.handlers) handler()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    expect(router.handlers.size).toBe(0)
  })

  it('ignores a rejected navigation instead of failing the flush', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const router = pagesRouter()
    router.replace = vi.fn(() => Promise.reject(new Error('route cancelled')))

    await expect(
      nextPagesRouterAdapter(router).write(new URLSearchParams({ q: 'a' }), deepReplace),
    ).resolves.toBe(undefined)
    expect(warn.mock.calls[0]?.[0]).toMatch(/nextPagesRouterAdapter failed/)
    warn.mockRestore()
  })
})
