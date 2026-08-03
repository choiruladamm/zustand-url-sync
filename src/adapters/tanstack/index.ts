/**
 * TanStack Router. Built from the router object, so it can live at module scope:
 *
 * ```ts
 * const router = createRouter({ routeTree })
 * setDefaultAdapter(tanstackRouterAdapter(router))
 * ```
 *
 * **This adapter does not call `router.navigate()`, and that is deliberate.** TanStack navigates by
 * search *object* and serialises it itself, with `stringifySearchWith(JSON.stringify, JSON.parse)`:
 * any string that happens to parse as JSON is re-encoded on the way out, so `page: '2'` reaches the
 * URL as `?page="2"` and `open: 'true'` as `?open="true"`. Handing TanStack a search object therefore
 * cannot preserve this library's wire format, and a bookmarked link would stop resolving.
 *
 * What makes the alternative work is that `@tanstack/history` replaces `window.history.pushState` and
 * `replaceState` with its own. Writing the href through the History API is not a way around the
 * router — it goes *through* it: TanStack sees the write, re-resolves the route and re-runs the
 * loaders. So the adapter writes the URL and uses the router only for the two things it alone knows,
 * namely when a navigation has settled and when one happened without us.
 *
 * Two consequences worth stating plainly:
 *
 * - `shallow` cannot mean "the router does not see this" here, because the router sees every history
 *   write. What `shallow: false` adds is that the write is awaited until the router has resolved.
 * - `validateSearch` and `urlSync` coexist by owning different keys. The href carries the whole live
 *   query, so keys TanStack owns survive untouched.
 */

import { writeHistory } from '../browser-url.js'
import { createRouterAdapter, type RouterAdapter } from '../router-adapter.js'

/** The parts of `createRouter()`'s result an adapter touches. */
export type TanStackRouter = {
  /** Resolves once the router has finished resolving the current location. */
  load(): Promise<void>
  subscribe(event: 'onResolved', listener: () => void): () => void
}

export function tanstackRouterAdapter(router: TanStackRouter): RouterAdapter {
  return createRouterAdapter({
    label: 'tanstackRouterAdapter',
    navigate: (href, o) => {
      // The href already carries the diff merged onto the live URL, and TanStack's patched
      // `history` turns this into a router navigation.
      writeHistory(href, o)
      return router.load()
    },
    subscribe: (onExternalChange) => router.subscribe('onResolved', onExternalChange),
  })
}
