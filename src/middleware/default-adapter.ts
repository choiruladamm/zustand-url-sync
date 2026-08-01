import { historyAdapter } from '../adapters/history/index.js'
import { fail } from '../core/dev.js'
import type { UrlAdapter } from '../core/types.js'

/**
 * Module-level, and deliberately so — but only ever written from a browser. One Node process
 * serves concurrent requests, so a server-set default would be whichever request wrote last.
 * Both writers below are gated on `window`, which is what keeps invariant 6 intact.
 */
let configured: UrlAdapter | undefined
let browserDefault: UrlAdapter | undefined

const isBrowser = (): boolean => typeof window !== 'undefined'

/**
 * The SPA shortcut: one adapter for every store in the app. Throws off-browser, where the
 * per-request alternatives are `initialUrl`, an explicit `adapter`, or a provider.
 */
export function setDefaultAdapter(adapter: UrlAdapter): void {
  if (!isBrowser()) {
    fail(
      'setDefaultAdapter() writes module-level state, and one Node process serves concurrent ' +
        'requests — the last request to call it would win for all of them. On a server, pass ' +
        '`adapter` or `initialUrl` per store instead.',
    )
  }
  configured = adapter
}

/**
 * The adapter a store falls back to. In a browser that is `historyAdapter()` — no router
 * required, which is what makes the common case need no configuration at all.
 */
export function getDefaultAdapter(): UrlAdapter | undefined {
  if (configured) return configured
  if (!isBrowser()) return undefined
  browserDefault ??= historyAdapter()
  return browserDefault
}

/** @internal resets both caches; tests only. */
export function clearDefaultAdapter(): void {
  configured = undefined
  browserDefault = undefined
}
