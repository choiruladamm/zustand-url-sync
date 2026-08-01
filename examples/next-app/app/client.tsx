'use client'

import {
  createFiltersStore,
  createViewStore,
  Demo,
  type UrlSource,
  urlSyncApi,
} from '@example/shared'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { nextAppRouterAdapter } from 'zustand-url-sync/adapters/next'

/**
 * The App Router adapter is the one that cannot be built at module scope: `useRouter()` is a hook,
 * so the adapter only exists once a component is rendering. The stores therefore have to be built on
 * first render rather than at import time.
 *
 * Two things follow, and both are what a provider exists to take care of:
 *
 * 1. The cache is browser-only. One Node process serves concurrent requests, so a module-level store
 *    shared across them would hand one user another user's filters.
 * 2. The server has no `window`, so it reads the URL from `initialUrl` instead of an adapter. Skip
 *    that and the server renders defaults while the browser renders the deep link — a hydration
 *    mismatch, and a visible one.
 */
type Stores = {
  adapter: ReturnType<typeof nextAppRouterAdapter> | undefined
  useFilters: ReturnType<typeof createFiltersStore>
  useView: ReturnType<typeof createViewStore>
}

let browserStores: Stores | undefined

function build(source: UrlSource, adapter: Stores['adapter']): Stores {
  return {
    adapter,
    useFilters: createFiltersStore(source),
    useView: createViewStore(source),
  }
}

function useStores(router: Parameters<typeof nextAppRouterAdapter>[0], initialUrl: string): Stores {
  if (typeof window === 'undefined') return build({ initialUrl }, undefined)
  if (browserStores === undefined) {
    // One instance, shared by both stores: the adapter is the scope root, and two of them would
    // mean two write queues fighting over one URL.
    const adapter = nextAppRouterAdapter(router)
    browserStores = build({ adapter }, adapter)
  }
  return browserStores
}

export function Client({ serverStamp, initialUrl }: { serverStamp: string; initialUrl: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { adapter, useFilters, useView } = useStores(router, initialUrl)

  // App Router navigations do not emit `popstate`, so this is the only thing that tells the store a
  // `<Link>` click or a `router.push` elsewhere in the app changed the query.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `searchParams` is the trigger, not an input — it is what re-runs the effect when the router moved the query without a popstate.
  useEffect(() => adapter?.notify(), [adapter, searchParams])

  return (
    <Demo
      adapter="nextAppRouterAdapter"
      useFilters={useFilters}
      useView={useView}
      filtersApi={urlSyncApi(useFilters)}
      serverStamp={serverStamp}
    />
  )
}
