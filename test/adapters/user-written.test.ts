/**
 * A fifth adapter, written against the published `UrlAdapter` type and nothing else — no shared
 * helper from `src/adapters/`, no peeking at how the built-in ones do it. It keeps its params in
 * the fragment instead of the query string, which is about as far from the built-ins as an adapter
 * can get while still being useful (a static host that never sees the fragment, an embedded widget
 * that must not touch the host page's query).
 *
 * It exists to keep the interface honest. If this file ever gets awkward to write, the interface is
 * too big or too vague, and that has to be fixed before 1.0 rather than after.
 */

import { describe, expect, it } from 'vitest'
import type { AdapterWriteOptions, UrlAdapter } from '../../src/core/types.js'
import { describeAdapterConformance } from '../support/adapter-conformance.js'

function hashAdapter(): UrlAdapter {
  const href = (params: URLSearchParams): string => {
    const query = params.toString()
    const { pathname, search } = globalThis.location
    return `${pathname}${search}${query === '' ? '' : `#${query}`}`
  }

  return {
    read() {
      return new URLSearchParams(globalThis.location.hash.slice(1))
    },

    write(next: URLSearchParams, options: AdapterWriteOptions) {
      // Guarded because a write must never take down the host app: Safari's history rate limit is
      // the reason, and it arrives as a throw.
      try {
        const method = options.history === 'push' ? 'pushState' : 'replaceState'
        globalThis.history[method](globalThis.history.state, '', href(next))
        if (options.scroll) globalThis.scrollTo({ top: 0 })
      } catch {
        // The fragment keeps whatever it had; the store keeps the new value.
      }
    },

    subscribe(onExternalChange: () => void) {
      globalThis.addEventListener('popstate', onExternalChange)
      globalThis.addEventListener('hashchange', onExternalChange)
      return () => {
        globalThis.removeEventListener('popstate', onExternalChange)
        globalThis.removeEventListener('hashchange', onExternalChange)
      }
    },

    pathname() {
      return globalThis.location.pathname
    },
  }
}

describeAdapterConformance('hashAdapter (written from the public interface)', {
  create: hashAdapter,
})

describe('hashAdapter', () => {
  it('leaves the query string alone, because it does not own it', () => {
    globalThis.history.replaceState(null, '', '/products?owned=by-someone-else')
    hashAdapter().write(new URLSearchParams({ q: 'a' }), {
      history: 'replace',
      shallow: true,
      scroll: false,
    })

    expect(globalThis.location.search).toBe('?owned=by-someone-else')
    expect(globalThis.location.hash).toBe('#q=a')
  })
})
