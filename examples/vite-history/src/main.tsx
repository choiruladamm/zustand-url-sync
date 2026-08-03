import { createFiltersStore, createViewStore, Demo, urlSyncApi } from '@example/shared'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { historyAdapter } from 'zustand-url-sync/adapters/history'

// One adapter instance for the whole app: it is the scope root, so both stores share its queue and
// its param registry, which is exactly what stops them overwriting each other's params.
const adapter = historyAdapter()

const useFilters = createFiltersStore({ adapter })
const useView = createViewStore({ adapter })

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Demo
      adapter="historyAdapter"
      useFilters={useFilters}
      useView={useView}
      filtersApi={urlSyncApi(useFilters)}
    />
  </StrictMode>,
)
