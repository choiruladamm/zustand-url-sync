---
"zustand-url-sync": minor
---

Add the SSR surface: `zustand-url-sync/server` for DOM-free parsing, and `zustand-url-sync/react` for the store-per-request pattern.

```ts
// zustand-url-sync/server — no DOM, no React, no Zustand
import { parseSearchParams, buildSearchParams } from "zustand-url-sync/server";

const filters = parseSearchParams(searchParams, filtersConfig); // Next.js `searchParams` shape works directly
const href = buildSearchParams(filters, filtersConfig).toString();
```

```tsx
// zustand-url-sync/react — one store per request, via context
import { createStoreContext, UrlSyncProvider, useUrlSyncHydrated } from "zustand-url-sync/react";

export const { Provider: FiltersProvider, useStore: useFilters } =
  createStoreContext(createFiltersStore);

// wrap a layout once to hand every store in the subtree the same router adapter
<UrlSyncProvider adapter={nextAppRouterAdapter(router)}>
  <FiltersProvider initialUrl={initialUrl}>{children}</FiltersProvider>
</UrlSyncProvider>;
```

A store built with `skipHydration: true` now exposes `urlSync.hasHydrated()` and `urlSync.onHydrated(cb)`; `useUrlSyncHydrated(store)` wraps both for a "render nothing until ready" pattern.

A store built off-browser with no `adapter` and no `initialUrl` no longer throws — it warns in dev and falls back to an empty URL, so a misconfigured store degrades instead of taking down the render.

`parseSearchParams` takes an `onInvalid` callback, matching the client-side `urlSync` option, and its `search` parameter now accepts `undefined` values — Next's real `searchParams` type is `{ [key: string]: string | string[] | undefined }`, so this was required for the type to actually accept what Next hands it.

Fixed: under `skipHydration`, a `set()` on a declared param key before `urlSync.hydrate()` runs no longer leaks to the URL or storage tier — it used to write immediately, corrupting the very values `hydrate()` was about to read back.
