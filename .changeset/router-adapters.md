---
'zustand-url-sync': minor
---

Router adapters for Next.js, React Router and TanStack Router.

Three entrypoints that were placeholders now ship:

```ts
import { nextAppRouterAdapter, nextPagesRouterAdapter } from 'zustand-url-sync/adapters/next'
import { reactRouterAdapter } from 'zustand-url-sync/adapters/react-router'
import { tanstackRouterAdapter } from 'zustand-url-sync/adapters/tanstack'
```

Each takes its router as its one argument, and none of them imports its router package — they are
structurally typed against the handful of methods they call, so there is no new peer dependency and
no version to keep in step.

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
const searchParams = useSearchParams()
useEffect(() => adapter.notify(), [adapter, searchParams])
```

### TanStack Router does not go through `router.navigate()`

Worth knowing, because it looks like an omission and is not. TanStack serialises search params with
`stringifySearchWith(JSON.stringify, JSON.parse)`, which re-encodes any string that happens to parse
as JSON: handed a search object, `page: '2'` reaches the URL as `?page="2"` and `open: 'true'` as
`?open="true"`. Links people bookmarked would stop resolving.

What makes the alternative work is that `@tanstack/history` replaces `window.history.pushState` and
`replaceState` with its own. Writing the href through the History API is not a way *around* the
router, it goes *through* it — TanStack sees the write, re-resolves the route and re-runs the loaders.
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
  first notification it is asked about, and a notification that is *not* ours retires it too, because
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
