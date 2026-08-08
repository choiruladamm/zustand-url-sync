# zustand-url-sync

Sync declared Zustand store keys to URL query params. No router lock-in.

```bash
pnpm add zustand-url-sync zustand
```

## Quickstart

```ts
import { create } from 'zustand'
import { urlSync, c } from 'zustand-url-sync'

const useFilters = create(
  urlSync(
    (set) => ({
      search: '',
      page: 1,
      tags: [],
      sort: 'created_at' as 'created_at' | 'name',
      pageSize: 25,                  // not declared → never in URL
      setSearch: (v: string) => set({ search: v }),
      setPage: (v: number) => set({ page: v }),
      setTags: (v: string[]) => set({ tags: v }),
    }),
    {
      name: 'filters',
      params: {
        search: c.string().default(''),
        page: c.integer().default(1),
        tags: c.array(c.string()).default([]),
        sort: c.enum(['created_at', 'name']).default('created_at'),
      },
    },
  ),
)

// ?search=hello&page=2&tags=react,zustand&sort=name
// Page reload restores the store from the URL.
```

Only declared keys are synced. `pageSize` is undeclared → never written, never read.

A value equal to its default is left out of the URL, so a fresh page has a clean address bar. An
unparseable param falls back to the default and is stripped rather than throwing — a URL someone
hand-edited is untrusted input, not a crash.

## URL format

`?key=value&key=value`, RFC 3986-safe. Readable in the address bar and in shared links.

- `c.string()` → `?q=hello`
- `c.integer()` → `?page=2`
- `c.float()` → `?price=19.99`
- `c.boolean()` → `?open=true`
- `c.enum([...])` → `?sort=name`
- `c.array(c.string())` → `?tags=react,zustand` (comma-joined, a comma inside an item is escaped)
- `c.array(c.string(), { mode: 'repeat' })` → `?tags=react&tags=zustand`
- `c.array(c.string(), { sep: '|' })` → `?tags=react%7Czustand`
- `c.numberRange()` → `?price=10,250`
- `c.isoDate()` → `?from=2026-08-01T00:00:00.000Z`
- `c.timestamp()` → `?at=1785283200000` (epoch milliseconds — shorter than ISO, unreadable)
- `c.json<T>()` → `?data=%7B%22a%22:1%7D`

Every row is frozen in `api/wire-format.md`. Changing how a built-in codec serialises is a major
release, because links people already bookmarked stop resolving to the same view.

## Adapters

`UrlAdapter` reads and writes the URL. `historyAdapter()` (browser default, no router) and
`memoryAdapter()` (Node/tests, no DOM) need nothing. Router adapters exist for when a URL change
should re-run a loader or server component.

| Adapter | Import from | Takes |
|---|---|---|
| `historyAdapter()` | `zustand-url-sync/adapters/history` | nothing |
| `memoryAdapter(initialUrl?)` | `zustand-url-sync/adapters/memory` | a URL string |
| `nextAppRouterAdapter(router)` | `zustand-url-sync/adapters/next` | `useRouter()` from `next/navigation` |
| `nextPagesRouterAdapter(router)` | `zustand-url-sync/adapters/next` | `useRouter()` from `next/router` |
| `reactRouterAdapter(target)` | `zustand-url-sync/adapters/react-router` | `useNavigate()` or a data router |
| `tanstackRouterAdapter(router)` | `zustand-url-sync/adapters/tanstack` | the router instance |

```tsx
const adapter = useMemo(() => nextAppRouterAdapter(useRouter()), [router]) // App Router
nextPagesRouterAdapter(useRouter()) // Pages Router, from next/router
reactRouterAdapter(useNavigate()) // or reactRouterAdapter(createBrowserRouter(routes))
tanstackRouterAdapter(router) // at module scope
```

No router package is imported — each adapter is structurally typed against the few methods it
calls, so there's no peer dependency or version to track. Off-browser, pass `initialUrl` instead of
an adapter, or the server renders defaults while the client renders the deep link.

### `shallow`, `flush()`, `notify()`

`shallow: true` (default) writes with `replaceState` — no loader, no server re-render.
`shallow: false` hands the write to the router, so it does re-run. A shallow write is invisible to
`router.query`/`useSearch()` — read the value from the store instead, or mark that one param
`shallow: false`.

```ts
await store.urlSync.flush() // resolves once the write has settled, not just serialized
```

Call `adapter.notify()` when the router moved the URL without a `popstate` — Next App Router's
`<Link>` needs it:

```tsx
useEffect(() => adapter.notify(), [adapter, useSearchParams()])
```

## `persist` — keep a subset across reloads

```ts
persist: {
  storage: 'local',   // 'local' | 'session' | your own StateStorage | false
  keys: ['sort'],     // declared params that also persist
  extra: { pageSize: c.integer().default(25) },  // storage-only keys, own codec
  version: 1,
  migrate: (persisted, from) => persisted,
}
```

**URL > storage > default**, always — a shared link never loses to a stored preference. Nothing
persists without a declared codec (no `partialize`). Degrades rather than breaks: a corrupt entry,
full quota, or private-mode storage falls back to URL-only.

## SSR

**`zustand-url-sync/server`** — parse/build query params with no DOM, React, or Zustand:

```ts
import { parseSearchParams, buildSearchParams } from 'zustand-url-sync/server'

const filters = parseSearchParams(await searchParams, filtersConfig) // Next hands this shape directly
const href = `/products?${buildSearchParams(filters, filtersConfig)}`
```

**`zustand-url-sync/react`** — one store per request, via context:

```tsx
import { createStoreContext, UrlSyncProvider } from 'zustand-url-sync/react'

export const createFiltersStore = (initialUrl?: string, adapter?: UrlAdapter) =>
  createStore<FiltersState>()(urlSync((set) => ({ ... }), { ...filtersConfig, initialUrl, adapter }))

export const { Provider: FiltersProvider, useStore: useFilters } =
  createStoreContext(createFiltersStore)

// wrap a layout once so every store beneath it shares an adapter
<UrlSyncProvider adapter={nextAppRouterAdapter(router)}>
  <FiltersProvider initialUrl={initialUrl}>{children}</FiltersProvider>
</UrlSyncProvider>
```

A store built off-browser with no `adapter`/`initialUrl` warns and degrades to an empty URL rather
than throwing. `skipHydration: true` + `useUrlSyncHydrated(store)` defer the first URL → store pass
until you call `urlSync.hydrate()`.

## Status

Pre-1.0, surface may still move. Zero runtime deps — `zustand` is the only required peer, `react`
optional, no router package is a peer at all.

564 unit tests + one Playwright spec across five real apps in Chromium and WebKit (Safari's history
rate limit needs a real browser), including a hydration-warning check for the SSR apps.

See [`examples/`](./examples) for one working app per adapter.

## Roadmap

- `0.2` — Next.js, React Router, TanStack Router adapters ✅
- `0.3` — Storage tier (`local` / `session` / custom) with declared keys ✅
- `0.4` — SSR: server-side parsing and the React provider (`createStoreContext`) ✅
- `1.0` — API freeze

## License

MIT
