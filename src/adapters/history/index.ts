import { guard } from '../../core/dev.js'
import type { AdapterWriteOptions, UrlAdapter } from '../../core/types.js'
import {
  currentPathname,
  hrefFor,
  rateLimitFactor,
  readSearch,
  subscribeHistory,
  writeHistory,
} from '../browser-url.js'

/**
 * The default adapter: `window.history` directly, no router required. `shallow` is ignored — there
 * is no router to notify, so every write is already shallow, which is also why this one costs
 * nothing beyond the history call itself.
 */
export function historyAdapter(): UrlAdapter {
  return Object.freeze({
    read: readSearch,
    pathname: currentPathname,
    rateLimitFactor: rateLimitFactor(),
    subscribe: subscribeHistory,
    write(next: URLSearchParams, options: AdapterWriteOptions) {
      guard('historyAdapter', () => writeHistory(hrefFor(next), options))
    },
  })
}
