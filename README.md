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

## URL format

`?key=value&key=value`, RFC 3986-safe. Readable in the address bar and in shared links.

- `c.string()` → `?q=hello`
- `c.integer()` → `?page=2`
- `c.float()` → `?price=19.99`
- `c.boolean()` → `?open=true`
- `c.array(c.string())` → `?tags=react,zustand` (comma-joined, separator escaped inside items)
- `c.enum([...])` → `?sort=name`
- `c.isoDate()` → `?date=2025-01-15`
- `c.timestamp()` → `?ts=1736899200`
- `c.json<T>()` → `?data=%7B%22a%22%3A1%7D`

## Adapters

The middleware needs a `UrlAdapter` to read and write the URL. Pick one:

```ts
import { urlSync } from 'zustand-url-sync'
import { historyAdapter } from 'zustand-url-sync/adapters/history'
import { memoryAdapter } from 'zustand-url-sync/adapters/memory'
```

- **`historyAdapter()`** — default for browsers. Uses `window.history` directly. No router required.
- **`memoryAdapter(initialUrl)`** — for Node, React Native, or tests. Pure JS history stack.
- **Router adapters** — `zustand-url-sync/adapters/next`, `zustand-url-sync/adapters/react-router`, `zustand-url-sync/adapters/tanstack`.

Without an adapter, the middleware reads from `window.location` on the first pass; in non-browser environments, pass `initialUrl` or a `memoryAdapter()` explicitly.

## Status

`0.1.0` — alpha. The core sync engine, codecs, and basic adapters are stable. Storage tier, router adapters, and React provider are on the [roadmap](#roadmap).

Tested with 325 tests against a real history stack and `URLSearchParams`. Zero runtime dependencies. SSR-safe by design — no DOM access, no module-level mutable state reachable from a request.

## Roadmap

- `0.2` — Next.js, React Router, TanStack Router adapters
- `0.3` — Storage tier (cookie, IndexedDB) with declared keys
- `0.4` — React provider for SSR (`createStoreContext`)
- `1.0` — API freeze

## License

MIT
