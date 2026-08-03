import { createFiltersStore, createViewStore, Demo, urlSyncApi } from '@example/shared'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, useLoaderData } from 'react-router'
import { reactRouterAdapter } from 'zustand-url-sync/adapters/react-router'

/**
 * Stands in for the server. React Router re-runs a loader on a real navigation and not on a
 * `replaceState`, so the count here is the observable difference between a shallow write and a
 * `shallow: false` one.
 */
let loaderRuns = 0

function Page() {
  const stamp = useLoaderData() as string

  return (
    <Demo
      adapter="reactRouterAdapter"
      useFilters={useFilters}
      useView={useView}
      filtersApi={urlSyncApi(useFilters)}
      serverStamp={stamp}
    />
  )
}

const router = createBrowserRouter([
  {
    path: '*',
    loader: () => {
      loaderRuns += 1
      return String(loaderRuns)
    },
    Component: Page,
  },
])

// A data router supplies both halves the adapter wants: navigation for `shallow: false` writes, and
// its own subscription so the store hears navigations React Router makes itself.
const adapter = reactRouterAdapter(router)

const useFilters = createFiltersStore({ adapter })
const useView = createViewStore({ adapter })

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
