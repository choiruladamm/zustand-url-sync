---
"zustand-url-sync": minor
---

Add `urlSync`, the Zustand middleware that connects a store to the URL, plus `setDefaultAdapter`.

```ts
import { create } from 'zustand'
import { urlSync, c } from 'zustand-url-sync'

const useFilters = create<Filters>()(
  urlSync(
    (set) => ({ q: '', page: 1, tags: [], setQ: (q) => set({ q, page: 1 }) }),
    {
      name: 'filters',
      params: {
        q: c.string().default(''),
        page: c.integer().default(1),
        tags: c.array(c.string()).default([]),
      },
    },
  ),
)
```

A store with no `adapter` uses `window.history` in a browser, so the common case needs no
configuration. Pass `adapter` for a router, or `initialUrl` where there is no live URL to own.

The store gains a `urlSync` handle: `commit`, `flush`, `toSearchParams`, `applyUrl`, `pause`,
`resume`, `reset`, `hydrate`, `hasHydrated`, `onHydrated`, `dispose`.

Composes with `immer`, `devtools`, `subscribeWithSelector` and the official `persist` in either
order. With `persist`, put `urlSync` **outside** it so the URL resolves after storage rehydrates
and a shared link still wins.

Six footguns now fail to compile rather than being documented: an action declared as a param, a
param key absent from the state, a codec whose type does not match its field, `.throttle()` and
`.debounce()` on one key, an `async` function passed to `commit()`, and a reference-returning
codec with no `eq`.
