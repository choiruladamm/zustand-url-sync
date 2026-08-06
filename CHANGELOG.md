# zustand-url-sync

## 0.3.0

### Minor Changes

- a44b70a: Add the storage tier: declared keys can now survive a reload, without ever outranking the URL.

  ```ts
  urlSync(init, {
    name: "filters",
    params: {
      q: c.string().default(""),
      sort: c.enum(["created_at", "name"]).default("created_at"),
    },
    persist: {
      storage: "local", // 'local' | 'session' | your own StateStorage | false
      keys: ["sort"], // params that also persist
      extra: {
        // storage-only keys, each with its own codec
        pageSize: c.integer().default(25),
      },
      version: 1,
      migrate: (persisted, from) => persisted,
    },
  });
  ```

  Precedence is **URL > storage > default** and there is no option to change it: a shared link renders
  what the sender saw, and the stored value fills in only the keys that link left out. Once the URL has
  decided, the merged result is written back, so the link is remembered on the next visit.

  Notes:

  - Only keys with a declared codec persist. There is no `partialize` and no "persist everything" — for
    that, compose the official `persist` middleware around the rest of your store.
  - The entry is one `localStorage` slot per store, `zustand-url-sync:<name>`, holding the same
    serialized strings the URL carries. A key can move between `params` and `persist.extra` without a
    migration.
  - A corrupt, hand-edited, or version-mismatched entry degrades to the default and warns in dev. It
    cannot crash hydration.
  - Unavailable storage (Safari Private Mode, disabled storage) and an exceeded quota degrade to
    URL-only. The store keeps working.
  - `urlSync.reset()` now clears the storage entry along with the URL.
  - New exported types: `PersistOptions`, `StorageOption`, `StateStorage`.
  - The root entrypoint's size budget moves from 6 kB to 7 kB gzip to cover the tier.

## 0.2.0

### Minor Changes

- b8901a5: Router adapters for Next.js, React Router and TanStack Router.

  Three entrypoints that were placeholders now ship:

  ```ts
  import {
    nextAppRouterAdapter,
    nextPagesRouterAdapter,
  } from "zustand-url-sync/adapters/next";
  import { reactRouterAdapter } from "zustand-url-sync/adapters/react-router";
  import { tanstackRouterAdapter } from "zustand-url-sync/adapters/tanstack";
  ```

  Each takes its router as its one argument, and none of them imports its router package — they are
  structurally typed against the handful of methods they call, so there is no new peer dependency and
  no version to keep in step.

  ```tsx
  // Next App Router — inside a component, because useRouter() is a hook
  const router = useRouter();
  const adapter = useMemo(() => nextAppRouterAdapter(router), [router]);

  // Next Pages Router — same shape, from next/router
  nextPagesRouterAdapter(useRouter());

  // React Router — a navigate function, or a data router
  reactRouterAdapter(useNavigate());
  reactRouterAdapter(createBrowserRouter(routes));

  // TanStack — at module scope
  tanstackRouterAdapter(router);
  ```

  **`shallow` means the same thing everywhere.** `shallow: true` — the default, and every keystroke —
  is `history.replaceState` and never reaches the router, so no loader re-runs and no server component
  re-renders. `shallow: false` hands the same href to the router, so the server does.

  The trade-off, stated plainly because it is the one surprise: a shallow write is invisible to router
  hooks, so `router.query`, `useSearch()` and `useLocation().search` keep the value they last parsed.
  Read those keys from the store, or declare the param `shallow: false` when something outside the
  store must see them.

  **`flush()` now means what it says** on TanStack and Next Pages Router, both of which settle
  asynchronously. `await store.urlSync.flush()` resolves after the navigation has settled, not after
  the URL string changed. A rejected navigation degrades with a dev warning instead of surfacing as an
  unhandled rejection.

  **`notify()`** is on every router adapter. Next's App Router navigates without emitting `popstate`,
  so a `<Link>` click would otherwise leave the store reading a URL that is no longer on screen:

  ```tsx
  const searchParams = useSearchParams();
  useEffect(() => adapter.notify(), [adapter, searchParams]);
  ```

  ### TanStack Router does not go through `router.navigate()`

  Worth knowing, because it looks like an omission and is not. TanStack serialises search params with
  `stringifySearchWith(JSON.stringify, JSON.parse)`, which re-encodes any string that happens to parse
  as JSON: handed a search object, `page: '2'` reaches the URL as `?page="2"` and `open: 'true'` as
  `?open="true"`. Links people bookmarked would stop resolving.

  What makes the alternative work is that `@tanstack/history` replaces `window.history.pushState` and
  `replaceState` with its own. Writing the href through the History API is not a way _around_ the
  router, it goes _through_ it — TanStack sees the write, re-resolves the route and re-runs the loaders.
  So the adapter writes the URL and uses the router only for what it alone knows: `router.load()` to
  await settlement, and `subscribe('onResolved')` to hear navigations it did not cause.

  One consequence: with TanStack, `shallow` cannot mean "the router does not see this", because the
  router sees every history write. What `shallow: false` adds there is that the write is awaited.

  `validateSearch` and `urlSync` coexist by owning different keys — the href carries the whole live
  query, so keys TanStack owns survive untouched.

  ### Fixes

  - **Back, then Forward, onto a value the store itself wrote no longer strips it.** The feedback guard
    that ignores our own write echoing back kept the written URL indefinitely, so navigating away and
    returning to it looked like the echo: the URL moved and the store did not. It is now spent on the
    first notification it is asked about, and a notification that is _not_ ours retires it too, because
    that means the URL has moved on.
  - **Adapters no longer throw when built during a server render.** `subscribe` and the write path
    reached for `addEventListener`, `history` and `location` unguarded. Constructing an adapter inside a
    client component is the documented way to build the Next ones, and the server renders that
    component first, so this took down the first render. All of it degrades quietly now, the way the
    reads already did.
  - **`nextPagesRouterAdapter` tolerates a router with no `events`,** which is what `next/router` hands
    a page during a server render.

  Two smaller notes:

  - Every router adapter also exports `RouterAdapter`, the `UrlAdapter` that additionally has
    `notify()`.
  - The per-adapter size budget moved from 600 B to 740–800 B gzip for the three router adapters.
    `historyAdapter` and `memoryAdapter` are unchanged and still comfortably under it.

## 0.1.1

### Patch Changes

- 57ec2f6: Rename `urlSync.applyUrl(url)` to `urlSync.patchFromUrl(url)`. The method only ever parsed the URL string and patched the store — it never wrote to the URL bar — so the new name matches what the call actually does. Signature is identical. Update any direct callers.

## 0.1.0

### Minor Changes

- 66cbbf0: Add `urlSync`, the Zustand middleware that connects a store to the URL, plus `setDefaultAdapter`.

  ```ts
  import { create } from "zustand";
  import { urlSync, c } from "zustand-url-sync";

  const useFilters = create<Filters>()(
    urlSync(
      (set) => ({ q: "", page: 1, tags: [], setQ: (q) => set({ q, page: 1 }) }),
      {
        name: "filters",
        params: {
          q: c.string().default(""),
          page: c.integer().default(1),
          tags: c.array(c.string()).default([]),
        },
      }
    )
  );
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

- cd5d96f: Add the core synchronisation engine, the built-in codecs, and the `memory` and `history` adapters.

  Nothing in this release depends on Zustand or on a DOM — the engine is a pure module that reads
  and writes through `Source` implementations, so it runs in Node with no shims. The middleware that
  connects it to a store lands next.

  **Codecs** — `c.string`, `c.integer`, `c.float`, `c.boolean`, `c.enum`, `c.array`, `c.isoDate`,
  `c.timestamp`, `c.json`, `c.numberRange`, `c.schema` (any Standard Schema validator: zod, valibot,
  arktype — types only, no runtime dependency) and `c.custom`.

  ```ts
  import { c } from "zustand-url-sync";

  const params = {
    q: c.string().default(""),
    page: c.integer().default(1),
    tags: c.array(c.string()).default([]),
    sort: c.enum(["created_at", "name"]).default("created_at").history("push"),
  };
  ```

  `.default()` comes first and is the only way into the rest of the chain, so a param without a
  default cannot be declared. `.throttle()` and `.debounce()` are mutually exclusive at the type
  level. A codec that returns a reference type must supply `eq`, or it will not compile.

  **Adapters** — `memoryAdapter(initialUrl?)` from `zustand-url-sync/adapters/memory` for Node,
  React Native and tests, with `back()` / `forward()` / `navigate()` for driving history in a test;
  `historyAdapter()` from `zustand-url-sync/adapters/history` for the browser, which detects Safari
  and spaces its writes accordingly.

  **Query strings stay readable.** `,` and `:` are emitted unescaped — both are legal in a query per
  RFC 3986 — so a filter list renders as `?tags=react,zustand` and a date as
  `?from=2026-08-01T00:00:00.000Z` rather than as a wall of `%2C` and `%3A`. The frozen table in
  `api/wire-format.md` records exactly what every codec emits.
