import { guard } from '../../core/dev.js'
import { serializeParams } from '../../core/params.js'
import type { AdapterWriteOptions, UrlAdapter } from '../../core/types.js'

/** Safari throws `SecurityError` past ~100 history calls / 30s, so its floor is 120ms. */
const SAFARI_RATE_LIMIT_FACTOR = 2.4

function isSafari(): boolean {
  const ua = globalThis.navigator?.userAgent ?? ''
  return /Safari/.test(ua) && !/Chrom(e|ium)|Android/.test(ua)
}

/**
 * The default adapter: `window.history` directly, no router required. `shallow` is ignored — there
 * is no router to notify, so every write is already shallow.
 */
export function historyAdapter(): UrlAdapter {
  return Object.freeze({
    read() {
      return new URLSearchParams(globalThis.location?.search ?? '')
    },
    write(next: URLSearchParams, options: AdapterWriteOptions) {
      guard('history write', () => {
        const query = serializeParams(next)
        const { pathname, hash } = globalThis.location
        const url = `${pathname}${query === '' ? '' : `?${query}`}${hash}`
        const method = options.history === 'push' ? 'pushState' : 'replaceState'
        globalThis.history[method](globalThis.history.state, '', url)
        if (options.scroll) globalThis.scrollTo({ top: 0 })
      })
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
      return globalThis.location?.pathname ?? ''
    },
    rateLimitFactor: isSafari() ? SAFARI_RATE_LIMIT_FACTOR : 1,
  })
}
