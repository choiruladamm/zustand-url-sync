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

The middleware needs a `UrlAdapter` to read and write the URL.

| Adapter | Import from | Takes |
|---|---|---|
| `historyAdapter()` | `zustand-url-sync/adapters/history` | nothing |
| `memoryAdapter(initialUrl?)` | `zustand-url-sync/adapters/memory` | a URL string |
| `nextAppRouterAdapter(router)` | `zustand-url-sync/adapters/next` | `useRouter()` from `next/navigation` |
| `nextPagesRouterAdapter(router)` | `zustand-url-sync/adapters/next` | `useRouter()` from `next/router` |
| `reactRouterAdapter(target)` | `zustand-url-sync/adapters/react-router` | `useNavigate()` or a data router |
| `tanstackRouterAdapter(router)` | `zustand-url-sync/adapters/tanstack` | the router instance |

- **`historyAdapter()`** — the default in a browser. Uses `window.history` directly, no router
  required. A store with no adapter falls back to it, which is why the common case needs no
  configuration.
- **`memoryAdapter()`** — Node, React Native, tests. A pure JS history stack, no DOM.
- **Router adapters** — for apps where a URL change has to re-run something: a loader, a server
  component, a data fetch.

No router adapter imports its router package. Each is structurally typed against the handful of
methods it calls, so there is no new peer dependency and no version to keep in step.

```tsx
// Next App Router — inside a component, because useRouter() is a hook
const router = useRouter()
const adapter = useMemo(() => nextAppRouterAdapter(router), [router])

// Next Pages Router — same shape, from next/router
nextPagesRouterAdapter(useRouter())

// React Router — a navigate function, or a data router
reactRouterAdapter(useNavigate())
reactRouterAdapter(createBrowserRouter(routes))

// TanStack — at module scope
tanstackRouterAdapter(router)
```

Outside a browser there is no URL to read, so pass `initialUrl` (or a `memoryAdapter()`) instead of
an adapter. Skip it and the server renders defaults while the browser renders the deep link.

### `shallow`, `flush()`, `notify()`

`shallow: true` — the default, and every keystroke — is a `replaceState` that never reaches the
router: no loader re-runs, no server component re-renders. `shallow: false` hands the same href to
the router, so the server does.

The one surprise, stated plainly: a shallow write is invisible to router hooks, so `router.query`,
`useSearch()` and `useLocation().search` keep the value they last parsed. Read those keys from the
store, or declare the param `shallow: false` when something outside the store must see them.

TanStack is the exception — `@tanstack/history` replaces `pushState`/`replaceState` with its own, so
the router observes every write and `shallow` cannot mean "the router does not see this". What
`shallow: false` adds there is that the write is awaited.

`await store.urlSync.flush()` resolves after the navigation has *settled*, not after the URL string
changed — which is the distinction that matters on TanStack and Next's Pages Router, both async.

`adapter.notify()` tells the store the URL moved underneath it. Next's App Router navigates without
emitting `popstate`, so a `<Link>` click needs it:

```tsx
const searchParams = useSearchParams()
useEffect(() => adapter.notify(), [adapter, searchParams])
```

## Persisting a subset — `persist`

Keep some keys across reloads, without letting them beat a shared link.

```ts
persist: {
  storage: 'local',   // 'local' | 'session' | your own StateStorage | false
  keys: ['sort'],     // params that also persist
  extra: {            // storage-only keys, each with its own codec
    pageSize: c.integer().default(25),
  },
  version: 1,                              // bump to invalidate what is stored
  migrate: (persisted, from) => persisted,  // upgrade it instead of discarding
}
```

**URL > storage > default**, always. The link decides; storage fills in the keys it left out. The
merged result is then written back, so this visit's URL becomes next visit's default.

| field | means |
|---|---|
| `keys` | params you already declared that should also persist |
| `extra` | keys that live only in storage and never touch the URL |
| `version` + `migrate` | an older entry is migrated, or discarded if you gave no `migrate` |

Nothing persists without a declared codec — no `partialize`, no "persist everything". For the rest
of your store, compose the official `persist` middleware around `urlSync`.

Stored as one slot per store, `zustand-url-sync:<name>`, holding the same strings the URL carries —
so a key can move between `params` and `extra` without a migration:

```json
{ "v": 1, "s": { "sort": "name", "pageSize": "50" } }
```

It degrades rather than breaks: a corrupt or version-mismatched entry falls back to defaults,
unavailable storage or a full quota leaves the store URL-only, and `urlSync.reset()` clears the
entry with the URL. Reads are synchronous by design — an async backend rehydrates *after* creation
and would land on top of the URL.

## Status

Pre-1.0, and the surface may still move.

Implemented and covered: the sync engine, every codec above, the storage tier, and all six adapters.
539 unit tests,
plus one Playwright spec run against five real apps in both Chromium and WebKit. WebKit is not
optional — Safari's history rate limit is the constraint the write queue exists for, and only a real
browser throwing `SecurityError` reproduces it.

Not built yet. These entrypoints resolve but export nothing:

- `zustand-url-sync/react` — provider, `createStoreContext`, hooks
- `zustand-url-sync/server` — DOM-free parsing

Zero runtime dependencies. `zustand` is the only required peer; `react` is optional, and no router
package is a peer at all. SSR-safe by design: no DOM access in the core, and no module-level mutable
state a request can reach.

See [`examples/`](./examples) for one working app per adapter.

## Roadmap

- `0.2` — Next.js, React Router, TanStack Router adapters ✅
- `0.3` — Storage tier (`local` / `session` / custom) with declared keys ✅
- `0.4` — React provider for SSR (`createStoreContext`)
- `1.0` — API freeze

## License

MIT
