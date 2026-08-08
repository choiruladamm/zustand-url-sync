import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act, memo, useRef, useState } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { memoryAdapter } from '../../adapters/memory/index.js'
import { c } from '../../codecs/c.js'
import type { UrlAdapter } from '../../core/types.js'
import { urlSync } from '../../middleware/url-sync.js'
import {
  createStoreContext,
  UrlSyncProvider,
  useUrlSyncAdapter,
  useUrlSyncHydrated,
} from '../index.js'

function createDeferredStore(initialUrl?: string, adapter?: UrlAdapter) {
  return createStore<{ q: string; setQ: (q: string) => void }>()(
    urlSync(
      (set) => ({
        q: '',
        setQ: (q) => set({ q }),
      }),
      {
        name: 'deferred',
        params: { q: c.string().default('') },
        ...(initialUrl !== undefined ? { initialUrl } : {}),
        ...(adapter !== undefined ? { adapter } : {}),
        skipHydration: true,
      },
    ),
  )
}

// happy-dom doesn't mark itself as an act()-aware environment the way jsdom does; without this,
// React warns that `act(...)` calls may not flush updates deterministically.
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => cleanup())

function createFiltersStore(initialUrl?: string, adapter?: UrlAdapter) {
  return createStore<{
    q: string
    page: number
    setQ: (q: string) => void
  }>()(
    urlSync(
      (set) => ({
        q: '',
        page: 1,
        setQ: (q) => set({ q }),
      }),
      {
        name: 'filters',
        params: {
          q: c.string().default(''),
          page: c.integer().default(1),
        },
        ...(initialUrl !== undefined ? { initialUrl } : {}),
        ...(adapter !== undefined ? { adapter } : {}),
      },
    ),
  )
}

const { Provider: FiltersProvider, useStore: useFilters } = createStoreContext(createFiltersStore)

function DisplayQ() {
  const q = useFilters((s) => s.q)
  return <span data-testid="q">{q}</span>
}

describe('createStoreContext', () => {
  it('creates a store and useStore reads from it', () => {
    render(
      <FiltersProvider initialUrl="/?q=hello">
        <DisplayQ />
      </FiltersProvider>,
    )
    expect(screen.getByTestId('q').textContent).toBe('hello')
  })

  it('two providers create independent stores', () => {
    render(
      <div>
        <FiltersProvider initialUrl="/?q=first">
          <DisplayQ />
        </FiltersProvider>
        <FiltersProvider initialUrl="/?q=second">
          <DisplayQ />
        </FiltersProvider>
      </div>,
    )
    const spans = screen.getAllByTestId('q')
    expect(spans[0]?.textContent).toBe('first')
    expect(spans[1]?.textContent).toBe('second')
  })
})

describe('UrlSyncProvider', () => {
  it('passes adapter from provider context to the factory', () => {
    const adapter = memoryAdapter('/?q=from-adapter')
    render(
      <UrlSyncProvider adapter={adapter}>
        <FiltersProvider>
          <DisplayQ />
        </FiltersProvider>
      </UrlSyncProvider>,
    )
    expect(screen.getByTestId('q').textContent).toBe('from-adapter')
  })
})

describe('useUrlSyncHydrated', () => {
  it('returns true immediately when hydration happened during creation', () => {
    const { Provider, useStoreApi } = createStoreContext(createFiltersStore)

    function HydrationDisplay() {
      const store = useStoreApi()
      const hydrated = useUrlSyncHydrated(store)
      return <span data-testid="hydrated">{hydrated ? 'yes' : 'no'}</span>
    }
    render(
      <Provider initialUrl="/?q=hello">
        <HydrationDisplay />
      </Provider>,
    )
    expect(screen.getByTestId('hydrated').textContent).toBe('yes')
  })

  it('returns false, then true once urlSync.hydrate() runs, with skipHydration', () => {
    const { Provider: DeferredProvider, useStoreApi: useDeferredApi } =
      createStoreContext(createDeferredStore)

    let capturedStore: ReturnType<typeof createDeferredStore> | undefined

    function HydrationDisplay() {
      const store = useDeferredApi()
      capturedStore = store
      const hydrated = useUrlSyncHydrated(store)
      return <span data-testid="hydrated">{hydrated ? 'yes' : 'no'}</span>
    }

    render(
      <DeferredProvider initialUrl="/?q=hello">
        <HydrationDisplay />
      </DeferredProvider>,
    )
    expect(screen.getByTestId('hydrated').textContent).toBe('no')
    expect(capturedStore?.getState().q).toBe('')

    act(() => {
      capturedStore?.urlSync.hydrate()
    })

    expect(screen.getByTestId('hydrated').textContent).toBe('yes')
    expect(capturedStore?.getState().q).toBe('hello')
  })

  it('resyncs when the store argument is swapped for one with a different hydration status', () => {
    const hydratedStore = createFiltersStore('/?q=already-hydrated')
    const deferredStore = createDeferredStore('/?q=later')

    function Harness({ store }: { store: { urlSync: typeof hydratedStore.urlSync } }) {
      const hydrated = useUrlSyncHydrated(store)
      return <span data-testid="hydrated">{hydrated ? 'yes' : 'no'}</span>
    }

    const { rerender } = render(<Harness store={hydratedStore} />)
    expect(screen.getByTestId('hydrated').textContent).toBe('yes')

    rerender(<Harness store={deferredStore} />)
    expect(screen.getByTestId('hydrated').textContent).toBe('no')
  })
})

describe('UrlSyncProvider context stability', () => {
  it('keeps context identity stable across re-renders when adapter/defaultOptions are unchanged', () => {
    const adapter = memoryAdapter('/?q=stable')
    const renders = { count: 0 }

    const Consumer = memo(function Consumer() {
      renders.count += 1
      const seen = useUrlSyncAdapter()
      return <span data-testid="consumer">{seen ? 'has-adapter' : 'no-adapter'}</span>
    })

    function Harness() {
      const [, setTick] = useState(0)
      const bump = useRef(() => setTick((t) => t + 1))
      return (
        <div>
          <button type="button" data-testid="bump" onClick={() => bump.current()}>
            bump
          </button>
          <UrlSyncProvider adapter={adapter}>
            <Consumer />
          </UrlSyncProvider>
        </div>
      )
    }

    render(<Harness />)
    expect(renders.count).toBe(1)

    fireEvent.click(screen.getByTestId('bump'))
    fireEvent.click(screen.getByTestId('bump'))

    // Harness (and so UrlSyncProvider) re-rendered twice, but the memoized consumer must not:
    // a fresh context object every render would force it to, defeating the point of memo.
    expect(renders.count).toBe(1)
  })
})
