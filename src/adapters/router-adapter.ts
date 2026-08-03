/**
 * What every router adapter has in common, which turns out to be everything except how to navigate.
 *
 * @internal the factory is; `RouterAdapter` is re-exported by each adapter entrypoint.
 */

import { guard, warn } from '../core/dev.js'
import type { AdapterWriteOptions, UrlAdapter } from '../core/types.js'
import {
  currentPathname,
  hrefFor,
  rateLimitFactor,
  readSearch,
  subscribeHistory,
  writeHistory,
} from './browser-url.js'

/**
 * Turns a full href into a router navigation. Return the router's promise when it settles
 * asynchronously — that is what lets `flush()` resolve on settlement rather than on the URL string
 * changing. Anything else it returns is ignored.
 */
export type RouterNavigate = (href: string, options: AdapterWriteOptions) => unknown

export type RouterAdapterOptions = {
  /** Names the adapter in the dev warning a failed write earns. */
  label: string
  /** Handles `shallow: false` writes. */
  navigate: RouterNavigate
  /** The router's own change notification, listened to alongside `popstate`. */
  subscribe?: ((onExternalChange: () => void) => () => void) | undefined
}

/**
 * A `UrlAdapter` that can also be told the URL moved.
 *
 * Some routers navigate without emitting `popstate` — Next's App Router is the one that matters —
 * which leaves the store reading a URL that is no longer on screen. `notify()` is how an app closes
 * that gap, usually from an effect on whatever hook does see the change.
 */
export type RouterAdapter = UrlAdapter & { notify(): void }

/**
 * Assembles a router adapter from the one thing that actually differs per router.
 *
 * `shallow: true` — the default, and every keystroke — never reaches the router. It is a
 * `replaceState`, so no loader re-runs, no server component re-renders, and nothing queues behind a
 * navigation. `shallow: false` hands the same href to the router, which is the whole point of the
 * flag: the server gets to re-run.
 *
 * The trade-off is worth stating plainly, because it is the one surprise here: a shallow write is
 * invisible to router hooks. `router.query`, `useSearch()` and `useLocation().search` keep the value
 * they last parsed. Read those keys from the store — that is what the store is for — or declare the
 * param `shallow: false` when something outside the store has to see it.
 */
export function createRouterAdapter(options: RouterAdapterOptions): RouterAdapter {
  const { label, navigate, subscribe } = options
  const listeners = new Set<() => void>()

  return Object.freeze({
    read: readSearch,
    pathname: currentPathname,
    rateLimitFactor: rateLimitFactor(),

    notify() {
      for (const listener of [...listeners]) listener()
    },

    write(next: URLSearchParams, o: AdapterWriteOptions) {
      const href = hrefFor(next)
      if (o.shallow) {
        guard(label, () => writeHistory(href, o))
        return
      }
      const settled = guard(label, () => navigate(href, o))
      if (!(settled instanceof Promise)) return
      // A rejected navigation degrades like a thrown one, and resolves to `void` whatever the
      // router resolved to. An unhandled rejection inside a flush would reach the host app.
      return settled.then(
        () => {},
        (error: unknown) => {
          if (process.env.NODE_ENV !== 'production') warn(`${label} failed: ${String(error)}`)
        },
      )
    },

    subscribe(onExternalChange: () => void) {
      listeners.add(onExternalChange)
      const offHistory = subscribeHistory(onExternalChange)
      const offRouter = subscribe?.(onExternalChange)
      return () => {
        listeners.delete(onExternalChange)
        offHistory()
        offRouter?.()
      }
    },
  })
}
