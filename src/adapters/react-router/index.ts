/**
 * React Router. One argument, either shape the library hands you:
 *
 * ```tsx
 * // inside a component
 * reactRouterAdapter(useNavigate())
 *
 * // or a data router, at module scope — no hook, and it reports its own changes
 * reactRouterAdapter(createBrowserRouter(routes))
 * ```
 *
 * `useLocation()` is deliberately not part of it. Reading the query from `window.location` is what
 * lets `read()` work when the queue calls it at flush time, outside React's render.
 */

import { createRouterAdapter, type RouterAdapter } from '../router-adapter.js'

/** `useNavigate()`. It accepts a full href, which is exactly what an adapter has. */
export type ReactRouterNavigate = (
  to: string,
  options?: { replace?: boolean; preventScrollReset?: boolean },
) => unknown

/** The parts of a data router (`createBrowserRouter`) an adapter touches. */
export type ReactRouterDataRouter = {
  navigate(to: string, options?: { replace?: boolean; preventScrollReset?: boolean }): unknown
  subscribe(listener: (state: unknown) => void): () => void
}

/**
 * A `shallow: false` write goes through `navigate`, which re-runs the route's loaders. The default
 * shallow write does not, so typing into a filter never refetches.
 */
export function reactRouterAdapter(
  source: ReactRouterNavigate | ReactRouterDataRouter,
): RouterAdapter {
  const router = typeof source === 'function' ? undefined : source
  const navigate: ReactRouterNavigate =
    router === undefined ? (source as ReactRouterNavigate) : router.navigate.bind(router)

  return createRouterAdapter({
    label: 'reactRouterAdapter',
    navigate: (href, o) =>
      navigate(href, {
        replace: o.history === 'replace',
        preventScrollReset: !o.scroll,
      }),
    // A data router's listener receives its state; the engine only needs to know something moved.
    subscribe: router && ((onExternalChange) => router.subscribe(() => onExternalChange())),
  })
}

export type { RouterAdapter } from '../router-adapter.js'
