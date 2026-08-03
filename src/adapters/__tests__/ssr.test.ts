// @vitest-environment node

/**
 * Every adapter, built and used with no DOM at all.
 *
 * This is not hypothetical: the documented way to build the Next adapters is `useRouter()` inside a
 * client component, and the server renders that component before the browser ever sees it. An
 * adapter that touches `window` on construction — or on the first `subscribe` — takes the whole
 * first render down with it. The examples caught exactly that; this keeps it caught.
 */

import { describe, expect, it, vi } from 'vitest'
import type { AdapterWriteOptions, UrlAdapter } from '../../core/types.js'
import { historyAdapter } from '../history/index.js'
import { memoryAdapter } from '../memory/index.js'
import { nextAppRouterAdapter, nextPagesRouterAdapter } from '../next/index.js'
import { reactRouterAdapter } from '../react-router/index.js'
import { tanstackRouterAdapter } from '../tanstack/index.js'

const replace: AdapterWriteOptions = {
  history: 'replace',
  shallow: true,
  scroll: true,
}

const adapters: Array<[string, () => UrlAdapter]> = [
  ['historyAdapter', historyAdapter],
  ['memoryAdapter', () => memoryAdapter('/products')],
  ['nextAppRouterAdapter', () => nextAppRouterAdapter({ push: vi.fn(), replace: vi.fn() })],
  [
    // No `events`, which is what `next/router` actually hands a page during a server render.
    'nextPagesRouterAdapter',
    () =>
      nextPagesRouterAdapter({
        push: vi.fn(() => Promise.resolve(true)),
        replace: vi.fn(() => Promise.resolve(true)),
      }),
  ],
  ['reactRouterAdapter', () => reactRouterAdapter(vi.fn(() => {}))],
  [
    'tanstackRouterAdapter',
    () =>
      tanstackRouterAdapter({
        load: vi.fn(() => Promise.resolve()),
        subscribe: vi.fn(() => () => {}),
      }),
  ],
]

describe.each(adapters)('%s without a DOM', (_name, create) => {
  it('constructs', () => {
    expect(() => create()).not.toThrow()
  })

  it('reads an empty query rather than throwing', () => {
    expect([...create().read().keys()]).toEqual([])
  })

  it('drops a write instead of throwing', () => {
    expect(() => create().write(new URLSearchParams({ q: 'a' }), replace)).not.toThrow()
  })

  it('returns a working unsubscribe from subscribe', () => {
    const adapter = create()
    let unsubscribe: (() => void) | undefined
    expect(() => {
      unsubscribe = adapter.subscribe(() => {})
    }).not.toThrow()
    expect(() => unsubscribe?.()).not.toThrow()
  })

  it('reports a pathname, or none at all', () => {
    expect(() => create().pathname?.()).not.toThrow()
  })
})
