import { createFiltersStore, createViewStore, Demo, urlSyncApi } from '@example/shared'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { tanstackRouterAdapter } from 'zustand-url-sync/adapters/tanstack'

/** Stands in for the server, the same way the React Router example's loader does. */
let loaderRuns = 0

const rootRoute = createRootRoute({ component: () => <Outlet /> })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  // `urlSync` owns `q`, `page`, `tags` and `view`; `validateSearch` keeps whatever else the app
  // declares. Passing the search through unchanged is what lets the two coexist.
  validateSearch: (search: Record<string, unknown>) => search,
  // Without deps a loader would not re-run on a search change, and `shallow: false` would look
  // indistinguishable from a shallow write.
  loaderDeps: ({ search }) => search,
  loader: () => {
    loaderRuns += 1
    return String(loaderRuns)
  },
  component: function Page() {
    const stamp = indexRoute.useLoaderData()

    return (
      <Demo
        adapter="tanstackRouterAdapter"
        useFilters={useFilters}
        useView={useView}
        filtersApi={urlSyncApi(useFilters)}
        serverStamp={stamp}
      />
    )
  },
})

const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) })

// TanStack resolves a promise from `navigate`, and the adapter returns it — which is what makes
// `flush()` resolve after the navigation settles rather than after the URL string changes.
const adapter = tanstackRouterAdapter(router)

const useFilters = createFiltersStore({ adapter })
const useView = createViewStore({ adapter })

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
