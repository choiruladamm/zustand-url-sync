/**
 * The browser URL surface every adapter shares: read the live query string, write one back through
 * `history`, and hear about the navigations the user makes.
 *
 * It sits beside the adapters rather than inside `core/` because it touches `location`, `history`
 * and `navigator`. Core has to run in Node with no shims.
 *
 * @internal not part of the published surface — adapters are.
 */

import { serializeParams } from '../core/params.js'
import type { AdapterWriteOptions } from '../core/types.js'

/** Safari throws `SecurityError` past ~100 history calls / 30s, so its floor is 120ms. */
const SAFARI_RATE_LIMIT_FACTOR = 2.4

export function isSafari(): boolean {
  const ua = globalThis.navigator?.userAgent ?? ''
  return /Safari/.test(ua) && !/Chrom(e|ium)|Android/.test(ua)
}

/** 2.4 on Safari, 1 everywhere else. Read once per adapter, not once per write. */
export function rateLimitFactor(): number {
  return isSafari() ? SAFARI_RATE_LIMIT_FACTOR : 1
}

export function readSearch(): URLSearchParams {
  return new URLSearchParams(globalThis.location?.search ?? '')
}

export function currentPathname(): string {
  return globalThis.location?.pathname ?? ''
}

/** `/products?q=a#reviews` for the params given, keeping whatever path and hash are live. */
export function hrefFor(next: URLSearchParams): string {
  const query = serializeParams(next)
  const { pathname = '', hash = '' } = globalThis.location ?? {}
  return `${pathname}${query === '' ? '' : `?${query}`}${hash}`
}

/**
 * Every one of these degrades to a no-op without a DOM rather than throwing, because an adapter can
 * legitimately be built while rendering on a server: Next's is constructed from `useRouter()` inside
 * a client component, and the server renders that component first. The reads already return empty
 * there; the write path and the subscription have to be just as quiet, or the first render crashes.
 */
export function writeHistory(href: string, options: AdapterWriteOptions): void {
  const history = globalThis.history as History | undefined
  if (history === undefined) return
  const method = options.history === 'push' ? 'pushState' : 'replaceState'
  history[method](history.state, '', href)
  if (options.scroll) globalThis.scrollTo?.({ top: 0 })
}

export function subscribeHistory(onExternalChange: () => void): () => void {
  if (typeof globalThis.addEventListener !== 'function') return () => {}
  globalThis.addEventListener('popstate', onExternalChange)
  globalThis.addEventListener('hashchange', onExternalChange)
  return () => {
    globalThis.removeEventListener('popstate', onExternalChange)
    globalThis.removeEventListener('hashchange', onExternalChange)
  }
}
