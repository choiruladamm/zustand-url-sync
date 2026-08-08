import {
  createContext,
  createElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useStore as useStoreBase } from 'zustand/react'
import type { StoreApi } from 'zustand/vanilla'
import type { AdapterWriteOptions, UrlAdapter } from '../core/types.js'
import type { UrlSyncApi } from '../middleware/types.js'

type UrlSyncContextValue = {
  adapter?: UrlAdapter
  defaultOptions?: Partial<AdapterWriteOptions> | undefined
}

const UrlSyncContext = createContext<UrlSyncContextValue | undefined>(undefined)

/**
 * Provides an adapter and default write options to all `urlSync` stores in the subtree.
 *
 * In an SSR app, wrap your app (or a layout) in this provider and pass the router adapter.
 * `createStoreContext` reads the adapter automatically.
 */
export function UrlSyncProvider({
  adapter,
  defaultOptions,
  children,
}: {
  adapter: UrlAdapter
  children: ReactNode
  defaultOptions?: Partial<AdapterWriteOptions> | undefined
}): ReactElement {
  // A fresh object every render would change context identity even when nothing did, forcing
  // every consumer in the subtree to re-render on every `UrlSyncProvider` render.
  const value = useMemo<UrlSyncContextValue>(
    () => ({ adapter, defaultOptions: defaultOptions ?? undefined }),
    [adapter, defaultOptions],
  )
  return createElement(UrlSyncContext.Provider, { value }, children)
}

/** Read the adapter from the nearest `UrlSyncProvider`, if any. */
export function useUrlSyncAdapter(): UrlAdapter | undefined {
  return useContext(UrlSyncContext)?.adapter
}

/** Read the default write options from the nearest `UrlSyncProvider`, if any. */
export function useUrlSyncDefaultOptions(): Partial<AdapterWriteOptions> | undefined {
  return useContext(UrlSyncContext)?.defaultOptions
}

/**
 * The standard Zustand SSR pattern, packaged: a ref-held store created once per mount,
 * a context, and a `useStore(selector)` using Zustand's own hook so selectors and
 * equality work as users expect.
 *
 * The `Provider` takes `initialUrl` and passes it to the factory. If the subtree is
 * wrapped in `UrlSyncProvider`, the adapter is passed as a second argument.
 *
 * ```tsx
 * export const createFiltersStore = (initialUrl?: string, adapter?: UrlAdapter) =>
 *   createStore<FiltersState>()(
 *     urlSync((set) => ({ ... }), { ...filtersConfig, initialUrl, adapter }),
 *   )
 *
 * export const { Provider: FiltersProvider, useStore: useFilters } =
 *   createStoreContext(createFiltersStore)
 * ```
 *
 * The `Provider` never calls `urlSync.dispose()` on unmount — matching every other
 * ref-held-store-in-render example, since disposing in a `useEffect` cleanup would leave a
 * dead store with no way to recreate it across React 18 Strict Mode's dev-only
 * mount → cleanup → remount cycle (the store is built in the render body, not the effect).
 * Fine for the SSR case this is meant for: one `Provider` mount per request, thrown away with
 * the request. If you mount and unmount the *same* `Provider` repeatedly on the client instead
 * (a modal, an accordion row), each cycle leaks that store's adapter subscription — call
 * `useStoreApi().urlSync.dispose()` yourself from your own unmount effect in that case, or keep
 * the `Provider` mounted for the life of the app.
 */
export function createStoreContext<S, A>(
  factory: (initialUrl?: string, adapter?: UrlAdapter) => StoreApi<S> & A,
): {
  Provider: (p: { initialUrl?: string; children: ReactNode }) => ReactElement
  useStore: <U>(selector: (s: S) => U) => U
  useStoreApi: () => StoreApi<S> & A
} {
  const StoreContext = createContext<(StoreApi<S> & A) | null>(null)

  function Provider({
    initialUrl,
    children,
  }: {
    initialUrl?: string
    children: ReactNode
  }): ReactElement {
    const parent = useContext(UrlSyncContext)
    const storeRef = useRef<(StoreApi<S> & A) | null>(null)
    if (!storeRef.current) {
      storeRef.current = factory(initialUrl, parent?.adapter)
    }
    return createElement(StoreContext.Provider, { value: storeRef.current }, children)
  }

  const useStore = <U>(selector: (s: S) => U): U => {
    const store = useContext(StoreContext)
    if (!store) {
      throw new Error(
        '[zustand-url-sync] useStore must be used inside the Provider returned by createStoreContext.',
      )
    }
    return useStoreBase(store, selector)
  }

  const useStoreApi = (): StoreApi<S> & A => {
    const store = useContext(StoreContext)
    if (!store) {
      throw new Error(
        '[zustand-url-sync] useStoreApi must be used inside the Provider returned by createStoreContext.',
      )
    }
    return store
  }

  return { Provider, useStore, useStoreApi }
}

/**
 * Returns `true` once the store has hydrated from the URL (or `initialUrl`).
 * Useful with `skipHydration` for "render nothing until ready".
 */
export function useUrlSyncHydrated(store: { urlSync: UrlSyncApi }): boolean {
  const [hydrated, setHydrated] = useState(store.urlSync.hasHydrated())
  useEffect(() => {
    // Re-sync on every `store` change, not just the first: if `store` is swapped for one with a
    // different hydration status, the state from the previous store must not linger.
    setHydrated(store.urlSync.hasHydrated())
    if (store.urlSync.hasHydrated()) return
    return store.urlSync.onHydrated(() => setHydrated(true))
  }, [store])
  return hydrated
}
