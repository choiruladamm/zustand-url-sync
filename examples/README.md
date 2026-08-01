# Examples

Five apps, one adapter each, and **one** Playwright spec run against all of them.

| App | Adapter | Port |
|---|---|---|
| `vite-history` | `historyAdapter()` — no router at all | 4301 |
| `react-router` | `reactRouterAdapter(dataRouter)` | 4302 |
| `tanstack` | `tanstackRouterAdapter(router)` | 4303 |
| `next-app` | `nextAppRouterAdapter(router)` | 4304 |
| `next-pages` | `nextPagesRouterAdapter(router)` | 4305 |

Every app renders the *same* component, from `@example/shared`. That is the whole design: a
behavioural difference between routers has to show up as a failing assertion in the shared spec, not
as a second spec file that quietly encodes the difference as expected.

## Running

```bash
pnpm build            # from the repo root — the apps consume dist/, not src/
pnpm examples:install
pnpm e2e:install      # Playwright browsers, once
pnpm e2e
```

`pnpm -C examples e2e -- --project=next-app:chromium` narrows it down. Note that Playwright starts
*all five* dev servers whatever you filter to, so one broken app fails every run.

The apps resolve `zustand-url-sync` through `link:../..` and its `exports` map, so the e2e suite is
also a check that the published surface is the one that works.

## What each app is here to prove

- **vite-history** — the documented common case needs no configuration and no router.
- **react-router** — a `shallow: false` write re-runs loaders; a shallow one does not.
- **tanstack** — `flush()` resolves after the router resolved the location, not after the URL moved.
- **next-app** — a keystroke costs no RSC round-trip, and `notify()` closes the `popstate` gap.
- **next-pages** — the server renders the deep link, so there is no hydration mismatch.

## Two things the apps have to do that a provider will do for you

Both Next adapters are built from `useRouter()`, which is a hook, so the store cannot be created at
import time. Until there is a provider, each Next example does the bookkeeping by hand:

1. **The store cache is browser-only.** One Node process serves concurrent requests; a module-level
   store shared between them would hand one user another user's filters.
2. **The server reads the URL from `initialUrl`, not from an adapter.** There is no `window` there.
   Skip it and the server renders defaults while the browser renders the deep link.

The Vite apps need neither, because they only ever run in a browser.

## Not published

`examples/` is its own pnpm workspace with its own lockfile, is outside the root `tsconfig`'s
`include`, and is not in the package's `files`. Nothing here ships.
