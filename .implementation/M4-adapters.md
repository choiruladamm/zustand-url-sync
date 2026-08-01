# M4 — Router adapters

**Goal:** the library works with the four routers people actually use, proven by real apps in CI rather than by unit tests against mocks.

**Size:** L (mostly the example apps) · **Depends on:** M2 · **Next:** M5

Read first: `PRD.md` §5.5, §7 C4, C11, C12, M1 handoff (final `UrlAdapter` shape).

---

## Why this phase exists

The adapter layer is the reason this library is usable outside the codebase it was written in. It is also the part most likely to rot, because Next and TanStack change. Two defences, both built here:

1. The interface stays tiny — four methods and two optional hints. A small surface is cheap to re-implement when a router changes, and cheap for a user to write for a router we don't ship.
2. Every adapter has a real app driven by Playwright in CI. A mock adapter test proves the adapter matches your idea of the router; only a real app proves it matches the router.

---

## Prereqs

M2 exit checklist passed. Adapter-origin tagging documented in M2's handoff.

---

## Context

- `UrlAdapter` = `read`, `write`, `subscribe`, optional `pathname` and `rateLimitFactor`.
- `shallow: true` (default) → `window.history.replaceState`, no router involvement, no server work. `shallow: false` → the router's own navigation, so loaders/RSC re-run (C4).
- `write` may return a promise; the queue awaits it (C12). Return one whenever the router settles asynchronously — otherwise `flush()` resolves before the navigation completes and lies to the caller.
- `pathname()` enables the route-change policy (C11).
- The adapter instance is the scope root, so each adapter constructor call creates an independent queue and registry.

---

## Tasks

### 1. `adapters/next` — App Router

Two exports, distinct entrypoints in `tsdown.config.ts`: `nextAppRouterAdapter()` and `nextPagesRouterAdapter()`.

App Router:
- `read` — from `window.location.search`. Not `useSearchParams()`: the adapter is not a hook and must be callable from the queue at flush time.
- `write` shallow → `window.history.replaceState` / `pushState`. Natively supported since Next 14.1 and the whole point of C4 — no RSC round-trip per keystroke.
- `write` non-shallow → `router.replace`/`router.push`, `{ scroll }` honoured, returning a promise if the Next version resolves one.
- `subscribe` — `popstate`. Next's own navigations also need to notify; verify which events actually fire in the example app rather than assuming.
- `pathname` — `window.location.pathname`.

The router instance comes from `useRouter()`, so the adapter is constructed inside a component and passed to `<UrlSyncProvider>` (M5) or `setDefaultAdapter` on mount. Document this — it's the one adapter that can't be constructed at module scope.

Pages Router: same, on `next/router`'s `router.replace` with `{ shallow: true }`.

**Done when:** both example apps pass their Playwright suites.

### 2. `adapters/react-router`

Construct from `useNavigate` + `useLocation`, or from a `router` object for data routers. `write` non-shallow → `navigate({ search }, { replace })`, which re-runs loaders. `subscribe` → the router's subscribe if available, else `popstate`.

### 3. `adapters/tanstack`

`router.navigate({ search, replace, resetScroll })`. TanStack returns a promise from `navigate` — return it (C12); this is the adapter where async settlement actually matters.

Note in the docs that TanStack's `validateSearch` and this library both want to own search params. The supported combination: let `urlSync` own the keys it declares, and keep `validateSearch` for the rest. Say so explicitly, because the failure mode is two systems fighting.

### 4. Route-change policy (C11)

Implemented in `core/engine.ts` in M1; this phase supplies `pathname()` and proves the policy end-to-end. Test all three: `keep` (default), `reset`, `unmount`.

### 5. Example apps

Under `examples/`, one per adapter: Next App Router, Next Pages Router, React Router, TanStack Router, plain Vite (history adapter). Each is the **same minimal app** — a search input, a page number, a multi-select — so the Playwright suite is shared and a behavioural difference between routers shows up as a diff, not as a different test file.

Excluded from the published package and from the root tsconfig's build.

### 6. Shared Playwright suite

One spec, run against each app:

| Scenario | Assertion |
|---|---|
| type into search | URL updates, throttled |
| Back | previous state restored |
| Forward | state re-applied |
| refresh | state restored from URL |
| deep link with params | renders those params on first paint |
| deep link with a garbage param | renders defaults, no crash, param stripped |
| `shallow: false` write | server re-ran (assert on a server-rendered timestamp or request log) |
| two stores on one page | both params coexist |
| rapid typing (30 keystrokes) | no `SecurityError`, final URL correct |

The rapid-typing case is the one that catches rate-limit regressions in a real browser, which fake timers cannot.

---

## Success metrics

| # | Metric | Command | Pass |
|---|---|---|---|
| 1 | Shared suite green on all five example apps | `pnpm e2e` | 100% |
| 2 | `shallow: false` demonstrably re-runs the server | `pnpm e2e --grep shallow` | green |
| 3 | 30 rapid keystrokes, real Safari/WebKit | `pnpm e2e --project=webkit --grep rapid` | no `SecurityError`, correct final URL |
| 4 | Async `write` settlement — `flush()` resolves after navigation | `pnpm e2e --grep flush` | green |
| 5 | Route-change policy, all three modes | `pnpm test route-change && pnpm e2e --grep route` | green |
| 6 | Each adapter within size budget | `pnpm size` | ≤ 0.6 kB gzip each |
| 7 | Adapters import only `core/` types | `pnpm lint:arch` | green |
| 8 | Router packages are optional peers; core install pulls none | `pnpm why` on a clean install | zero router deps |
| 9 | A user-written adapter works | write a throwaway hash adapter in a test, run the shared unit suite against it | green |

Metric 9 is the real test of whether the interface is small enough. If writing a fifth adapter from the docs alone is awkward, fix the interface now — after 1.0 it's a major.

---

## Traps

- **Calling hooks inside the adapter.** The queue invokes `read`/`write` at flush time, outside React's render. Capture what you need when the adapter is constructed; never call a hook inside a method.
- **Assuming Next's App Router notifies `popstate` for its own navigations.** Verify in the example app. Guessing here produces a store that silently desyncs after a `<Link>` click.
- **Forgetting to return the promise** from `navigate`. Everything appears to work; only `flush()`-dependent code breaks, and it breaks intermittently.
- **`scroll` defaulting differently per router.** Normalise: our default is no scroll restoration on a param change, since a filter update isn't a navigation.
- **Example apps drifting apart.** They must stay identical in behaviour or the shared suite loses its value. Keep the app component in one shared file, imported by each.
- **Testing only Chromium.** WebKit is where the rate limit bites (C1). It must be in the matrix.

---

## Handoff

*Fill in on completion.*

- Per-router quirks discovered that aren't in the PRD:
- Which routers resolve a promise from navigation, and which don't:
- Final adapter sizes:
- Whether the interface changed to accommodate a router — and what that implies for user-written adapters:
