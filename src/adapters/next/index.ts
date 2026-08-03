/**
 * Next.js adapters, one per router. Neither imports `next` — the router arrives as an argument, so
 * the adapter is structurally typed against it and works across Next versions without a peer
 * dependency on any of them.
 *
 * Both must be constructed inside a component, because `useRouter()` is a hook. That is the one
 * thing that makes these different from every other adapter here:
 *
 * ```tsx
 * 'use client'
 * const router = useRouter()
 * const adapter = useMemo(() => nextAppRouterAdapter(router), [router])
 * return <UrlSyncProvider adapter={adapter}>{children}</UrlSyncProvider>
 * ```
 *
 * The router is required. Without one there is nothing a `shallow: false` write could ask to
 * re-run, and `historyAdapter()` is already the adapter for "no router involved".
 */

import { createRouterAdapter, type RouterAdapter } from '../router-adapter.js'

/** The parts of `useRouter()` from `next/navigation` an adapter touches. */
export type NextAppRouter = {
  push(href: string, options?: { scroll?: boolean }): void
  replace(href: string, options?: { scroll?: boolean }): void
}

/** The parts of `useRouter()` from `next/router` an adapter touches. */
export type NextPagesRouter = {
  push(
    url: string,
    as?: string,
    options?: { scroll?: boolean; shallow?: boolean },
  ): Promise<unknown>
  replace(
    url: string,
    as?: string,
    options?: { scroll?: boolean; shallow?: boolean },
  ): Promise<unknown>
  /** Absent while the server renders the page — `next/router` only wires it up in the browser. */
  events?: {
    on(event: string, handler: () => void): void
    off(event: string, handler: () => void): void
  }
}

/**
 * App Router. A default `shallow: true` write is `history.replaceState`, natively supported since
 * Next 14.1, which is what keeps a keystroke from costing an RSC round-trip.
 *
 * App Router navigations — a `<Link>` click, a `router.push` from elsewhere in the app — do not emit
 * `popstate`, so nothing tells the store the query changed. Call `notify()` when they do:
 *
 * ```tsx
 * const searchParams = useSearchParams()
 * useEffect(() => adapter.notify(), [adapter, searchParams])
 * ```
 */
export function nextAppRouterAdapter(router: NextAppRouter): RouterAdapter {
  return createRouterAdapter({
    label: 'nextAppRouterAdapter',
    // App Router's push/replace return void, so there is nothing to await and `flush()` resolves
    // as soon as the navigation is dispatched.
    navigate(href, o) {
      if (o.history === 'push') router.push(href, { scroll: o.scroll })
      else router.replace(href, { scroll: o.scroll })
    },
  })
}

/**
 * Pages Router. `routeChangeComplete` covers the navigations the app makes itself, so this one needs
 * no `notify()` in practice.
 *
 * A `shallow: false` write is `{ shallow: false }` to Next, which re-runs `getServerSideProps`.
 * Next's own `shallow` flag means the same thing ours does, one layer lower.
 */
export function nextPagesRouterAdapter(router: NextPagesRouter): RouterAdapter {
  return createRouterAdapter({
    label: 'nextPagesRouterAdapter',
    navigate(href, o) {
      const go = o.history === 'push' ? router.push : router.replace
      return go.call(router, href, undefined, {
        scroll: o.scroll,
        shallow: false,
      })
    },
    subscribe(onExternalChange) {
      // `router.events` is undefined during a server render, where there is nothing to navigate.
      const events = router.events
      if (events === undefined) return () => {}
      events.on('routeChangeComplete', onExternalChange)
      return () => events.off('routeChangeComplete', onExternalChange)
    },
  })
}

export type { RouterAdapter } from '../router-adapter.js'
