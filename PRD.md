# PRD — `zustand-url-sync`

**Status:** Draft v1 · **Date:** 2026-08-01 · **Owner:** choiruladamm@gmail.com
**One-liner:** A Zustand middleware that makes URL query params the source of truth for filter/search/sort state, with an optional `localStorage` fallback tier — typed, router-agnostic, zero-dependency.

---

## 1. Problem

Every dashboard-style React app rebuilds the same plumbing:

- A page has filters / search / sort / pagination / date-range.
- Those values must live in the **URL**, so a view can be shared, bookmarked, deep-linked, and restored on refresh or back/forward.
- Some of them should *also* survive as a **user preference** (page size, sort column, table density) via `localStorage` even when the URL is clean.
- The state itself is already in a Zustand store, because other parts of the page read it.

Today the developer hand-writes, per project:

1. Read initial state from `location.search`, coerce strings into numbers / booleans / arrays / dates.
2. Subscribe to the store, serialize changed keys back into the query string.
3. Debounce the writes so a search input doesn't blow up the History API.
4. Listen to `popstate` so Back/Forward actually moves state.
5. Do all of the above without breaking SSR hydration in Next.js.
6. Keep it from fighting a second store that also writes to the same URL.

Steps 3–6 are where the hand-rolled version is quietly broken in most codebases. That is the wedge.

---

## 2. Market research

### 2.1 Sizing (npm weekly downloads, week of 2026-07-24 → 2026-07-30)

| Package | Weekly downloads | What it is |
|---|---:|---|
| `zustand` | 49,301,264 | The host state library |
| `nuqs` | 3,990,085 | Hook-based URL state (not Zustand) |
| `use-query-params` | 553,952 | Older hook-based URL state |
| `@standard-schema/spec` | 87,862,478 | Validator-agnostic schema interface |
| `zod` | 246,441,398 | Validation |
| `valibot` | 16,071,193 | Validation |
| `tsdown` | 3,346,538 | Target bundler |
| **`zustand-querystring`** | **6,697** | The only real incumbent in this exact niche |

Read: ~49M weekly Zustand installs, and the only Zustand↔URL middleware serves 6.7k of them — a ratio of about 1:7,400. Either the problem doesn't exist (it does — `nuqs` at 4M proves demand for URL-as-state) or the existing option isn't good enough. The demand is proven; the Zustand-native supply is not.

### 2.2 Prior art teardown

**`nuqs` (4M/wk)** — the quality bar. What it gets right and we should copy conceptually:
- **Adapter layer.** A tiny interface (`{ searchParams, updateUrl, rateLimitFactor }`) implemented per router: Next App Router, Next Pages Router, React Router, Remix, TanStack Router, plain React SPA, testing adapter. This is why it works everywhere.
- **Rate limiting is a first-class concern.** Default throttle 50ms; Safari needs 120ms (320ms on older versions) or the History API throws `SecurityError`. Values below 50ms are ignored on purpose.
- **Batching.** Multiple updates in one tick coalesce into one URL write; the setter returns a `Promise<URLSearchParams>` that resolves after the flush.
- **Typed parsers** (`parseAsInteger`, `parseAsArrayOf`, `.withDefault()`, `.withOptions()`) plus a Standard Schema v1 bridge (`createStandardSchemaV1`) so Zod/Valibot/ArkType all work.
- Per-call option overrides (throttle only while typing, not on Enter).

Why it doesn't close our gap: `nuqs` is a **hook**, and its state lives in the URL adapter, not in a store. If your state already lives in Zustand — read by non-React code, by other middleware, by `store.getState()` in an event handler — you end up mirroring `useQueryState` into Zustand by hand, which is the bug factory we set out to delete. It also has no storage tier.

**`zustand-querystring` (6.7k/wk, v0.7.0, peer `zustand >=5`)** — closest competitor. Its `select` / `prefix` / `map` design is genuinely thoughtful. Concrete gaps we exploit:
- **Runtime dependency on `lodash-es`.** Non-negotiable weight for a utility middleware.
- **Custom serialization format** (`marked`, ~14kB of parser) that produces URLs like `?state=search%3Dhello%2Cpage%3A2`. Non-idiomatic, not readable by a backend, not compatible with `URLSearchParams` consumers or server-side rendering of the same params.
- **No storage tier.** The "remember my sort order" half of the problem is unsolved.
- **No router adapters.** Writes via raw History API, so Next App Router / TanStack Router integration is the user's problem.
- **No documented History API rate limiting.** A search input bound to it will hit Safari's limit.
- **No validation/codec story** — no per-key typed parsers, no Standard Schema bridge, no graceful handling of a hostile URL (`?page=drop-table`).

**Framework-native options** — TanStack Router `validateSearch`, SvelteKit `sveltekit-search-params`, Next.js `useSearchParams`. All router-locked; none integrate with a store.

### 2.3 Positioning

> **The Zustand-native answer to URL state.** Keep writing plain Zustand stores. Add one middleware and your filters become shareable URLs, with an optional preference tier — no dependencies, works with any router.

Namespace check: `zustand-url-sync`, `zustand-urlsync` and `zustand-sync-url` all return 404 on the npm registry. **Ships unscoped as `zustand-url-sync`**, personally owned and maintained — no organisation affiliation.

---

## 3. Goals / Non-goals

### Goals (v1.0)
1. One middleware call turns selected store keys into query params, both directions.
2. Typed, safe codecs: numbers, booleans, arrays, enums, dates, JSON, and any Standard Schema validator.
3. Optional second tier: persist a subset to `localStorage` / `sessionStorage`, with **URL > storage > store default** precedence.
4. Correct under real conditions: back/forward, refresh, SSR hydration, two stores sharing one URL, rapid typing, Safari.
5. Router-agnostic via a ~15-line adapter interface; first-party adapters for the common four.
6. Zero runtime dependencies. Core ≤ 3 kB gzip.
7. Works in vanilla Zustand (`zustand/vanilla`) — React is an optional entrypoint, not a requirement.

### Non-goals (v1.0)
- Being a router. No path segments, no route matching, no navigation. Query string only.
- Replacing `zustand/middleware`'s `persist` for general app state. Our storage tier only ever touches **keys you declared a codec for** — never the whole store (§6).
- Cross-tab realtime sync (v1.1 candidate via `storage` event).
- Server-side mutation of the URL, redirects, or cookie state.
- Encoding whole objects into a single opaque param by default (opt-in codec, not the house style).

---

## 4. Users & stories

**P1 — Dashboard dev (primary).** Has a `useFiltersStore`, needs shareable URLs by Friday.
> *"I add `urlSync` to my existing store, declare four params, and the URL just works. I don't rewrite my components."*

**P2 — Design-system / platform dev.** Owns a `<DataTable>` used on 12 pages, each with its own store.
> *"Two tables on one page must not overwrite each other's params. I set `prefix` and they coexist."*

**P3 — Next.js App Router dev.** Cares about not blowing away RSC state on every keystroke.
> *"Shallow updates by default; when I want the server to re-fetch, I flip one option."*

**P4 — Library-cautious dev.** Reads `package.json` before installing.
> *"Zero deps, 3 kB, ESM+CJS, real types, `publint`/`attw` clean. Fine."*

---

## 5. Proposed API

### 5.1 The 80% case

```ts
import { create } from 'zustand'
import { urlSync, c } from 'zustand-url-sync'

type FiltersState = {
  q: string
  page: number
  tags: string[]
  sort: 'created_at' | 'name'
  pageSize: number
  setQ: (q: string) => void
  setPage: (page: number) => void
}

export const useFilters = create<FiltersState>()(
  urlSync(
    (set) => ({
      q: '',
      page: 1,
      tags: [],
      sort: 'created_at',
      pageSize: 25,
      setQ: (q) => set({ q, page: 1 }),
      setPage: (page) => set({ page }),
    }),
    {
      name: 'filters', // storage key namespace; NOT a URL prefix unless `prefix: true`
      params: {
        q:    c.string().default(''),   // no limiter -> D4 default: throttle(50)
        page: c.integer().default(1),
        tags: c.array(c.string()).default([]),
        sort: c.enum(['created_at', 'name']).default('created_at'),
        // pageSize is absent -> never touches the URL
      },
      persist: {
        storage: 'local',           // 'local' | 'session' | StateStorage | false
        keys: ['sort'],             // subset of `params` — preference tier
        extra: {                    // storage-only keys, each with its own codec
          pageSize: c.integer().default(25),
        },
        version: 1,                 // bump to invalidate; `migrate` handles the upgrade
      },
    },
  ),
)
```

Resulting URL: `?q=hello&page=2&tags=react,zustand` — readable, `URLSearchParams`-parseable, backend-parseable.

Defaults are **omitted** from the URL (`clearOnDefault` behaviour). Clean state = clean URL.

### 5.2 Codecs

A codec is a plain object; the `c.*` builders are sugar.

```ts
type Codec<T> = {
  parse: (raw: string) => T | typeof INVALID
  serialize: (value: T) => string
  eq?: (a: T, b: T) => boolean   // defaults to Object.is; needed for arrays/objects
}
```

Built-ins: `c.string`, `c.integer`, `c.float`, `c.boolean`, `c.enum`, `c.array(codec, opts?)`, `c.isoDate`, `c.timestamp`, `c.json`, `c.numberRange`.

Modifiers: `.default(v)`, `.throttle(ms)`, `.debounce(ms)`, `.history('push' | 'replace')`, `.shallow(boolean)`, `.scroll(boolean)`, `.serverOnly()`, `.omitWhen(pred)`, `.priority(n)` (§7 C10).

**`eq` is not optional for reference types.** `Object.is` on a fresh array is always `false`, so an `immer` producer or a `set({ tags: [...tags] })` would enqueue a URL write on every render. Every built-in that yields a reference (`c.array`, `c.json`, `c.numberRange`, `c.schema(...).json()`) ships a structural `eq`. A hand-written codec whose `parse` returns an object **must** supply one; the type refuses it otherwise.

**Which keys may be params.** `params` is typed against the non-function keys of the state:

```ts
type ParamKey<T> = { [K in keyof T]: T[K] extends (...a: never[]) => unknown ? never : K }[keyof T]
```

Actions can't be synced; declaring one is a type error, not a runtime surprise. Same constraint applies to `persist.keys` and `persist.extra`.

**Array encoding** — `c.array(codec, { mode, sep })`:

| mode | `['a', 'b']` renders as | when |
|---|---|---|
| `'join'` *(default)* | `?tags=a,b` | shortest, one param per key, reads cleanly |
| `'repeat'` | `?tags=a&tags=b` | backend expects repeated keys (Express `qs`, Spring, Go `r.URL.Query()`) |

`sep` defaults to `,` and is configurable. In `join` mode the separator is escaped inside each element **before** joining (`a,b` → `a%2Cb`), so `['a,b']` and `['a', 'b']` never collide — the roundtrip property test in §9 covers exactly this. Empty array serialises to an absent param, not `?tags=`.

Validator bridge — one function, every validator, via Standard Schema v1 (88M weekly downloads for the spec package; zod / valibot / arktype all implement it):

```ts
import { z } from 'zod'
import { c } from 'zustand-url-sync'

params: {
  status: c.schema(z.enum(['open', 'closed'])).default('open'),
  range:  c.schema(z.object({ from: z.string(), to: z.string() })).json(),
}
```

**Hostile-input policy:** a codec returning `INVALID` (or a schema failing) never throws and never crashes hydration. The key falls back to storage, then to the store default, and the bad param is stripped from the URL on the next write. `onInvalid(key, raw, issues)` is available for logging.

### 5.3 Precedence and lifecycle — the contract

This is the part hand-rolled implementations get wrong, so it is specified, not implied.

**On store creation (client):**
```
1. store defaults        (from your initializer)
2. <- storage tier       (persist.keys present in storage, if any)
3. <- URL                (params present in the query string)
4. one write-back pass   (persist the merged result; strip invalid/default params)
```
**URL always wins.** A shared link must render what the sender saw, regardless of the recipient's saved preferences.

**On state change:** diff the synced keys → per-key throttle/debounce → coalesce into one queued URL write → flush → adapter writes → persist tier writes.

**On `popstate` (Back/Forward):** URL → store, bypassing the write-back (no history entry for a history navigation). Keys absent from the new URL revert to their **default**, not to their current value — otherwise Back doesn't undo a filter.

**On SSR / first paint:** see §7.

### 5.4 Write scheduling — throttle vs debounce

The default is chosen per key by **what the write does to history**, because that is what the user feels:

| key writes with | default limiter | rationale |
|---|---|---|
| `history: 'replace'` *(default)* | `throttle(50)` | URL stays live while typing; replace creates no history entries, so there is nothing to spam. 50ms is the browser rate-limit floor (§7 C1). |
| `history: 'push'` | `debounce(300)` | Every flush is a Back-button stop. Throttling here produces 20 history entries for one typed word — the classic footgun. Debounce collapses a burst into one entry. |
| `shallow: false` (server refetch) | `debounce(300)` | Every flush is a network request. |

`throttle` and `debounce` are per-key overrides. A key may set only one; setting both is a build-time type error.

**Per-write override** — the "debounce while typing, commit on Enter" case, without changing the store's API:

```ts
const { setQ } = useFilters.getState()

<input
  onChange={(e) => setQ(e.target.value)}                                  // debounced
  onKeyDown={(e) => {
    if (e.key === 'Enter')
      useFilters.urlSync.commit(() => setQ(e.currentTarget.value), {
        limit: 'immediate',       // skip the limiter, flush now
        history: 'push',          // and make it a Back-button stop
      })
  }}
/>
```

`commit(fn, opts)` runs `fn` with URL-write options overridden for exactly the writes it produces, then returns `Promise<URLSearchParams>` resolving after the flush. Zustand's `set` stays untouched — no option-threading through every action.

**Scope is synchronous, by definition.** The override applies to `set` calls made during the synchronous execution of `fn`, and nothing else. Tracking it across an `await` would need `AsyncLocalStorage` (no browser equivalent) or a zone library (a dependency) — both are out. `commit` returns a promise so callers can await the *flush*; it does not extend the override across one. Passing an `async` function is a type error, so the trap is closed at compile time instead of in a docs footnote.

### 5.5 Adapters

```ts
export type AdapterWriteOptions = {
  history: 'push' | 'replace'
  /** false -> let the router navigate, so the server re-runs loaders / RSC */
  shallow: boolean
  scroll: boolean
}

export type UrlAdapter = {
  read: () => URLSearchParams
  write: (next: URLSearchParams, o: AdapterWriteOptions) => void | Promise<void>
  subscribe: (onExternalChange: () => void) => () => void
  /** current pathname, for the route-change policy (§7 C11) */
  pathname?: () => string
  /** multiplier on the base throttle; 2.4 on Safari */
  rateLimitFactor?: number
}
```

`shallow` is the option C4 and §5.4 depend on, so it belongs in the interface, not just in prose. `historyAdapter` ignores it (there is no router to notify); every router adapter honours it: `shallow: true` → `window.history.replaceState`, `shallow: false` → the router's own navigation. An adapter returning a promise from `write` lets `flush()`/`commit()` resolve after the navigation settles, not merely after the URL string changes.

Shipped: `historyAdapter()` (default, no router required), `nextAppRouterAdapter()`, `nextPagesRouterAdapter()`, `reactRouterAdapter()`, `tanstackRouterAdapter()`, `memoryAdapter(initialUrl?)` (tests + Node).

**Injection: provider first, global setter as a client-only shortcut.**

```tsx
// preferred — scoped, SSR-safe, testable
import { UrlSyncProvider } from 'zustand-url-sync/react'
import { nextAppRouterAdapter } from 'zustand-url-sync/adapters/next'

<UrlSyncProvider adapter={nextAppRouterAdapter()}>{children}</UrlSyncProvider>
```

`setDefaultAdapter()` still exists for plain SPAs, but it writes module-level mutable state, which is wrong on a server: one Node process serves concurrent requests, and the last one to call it wins. It therefore **throws when called in a non-browser environment**. Same reasoning governs the D1 param registry — see §5.8.

### 5.6 Store handle (escape hatches)

The middleware augments the store via `StoreMutators` module augmentation:

```ts
useFilters.urlSync.commit(fn, opts) // run writes with overridden URL options (§5.4)
useFilters.urlSync.flush()          // Promise<URLSearchParams> — await the pending write
useFilters.urlSync.toSearchParams() // build the URL without navigating (for <Link>)
useFilters.urlSync.applyUrl(url)    // force a URL -> store pass
useFilters.urlSync.pause() / .resume()
useFilters.urlSync.reset()          // all synced keys back to defaults, clears URL + storage
useFilters.urlSync.hasHydrated()
useFilters.urlSync.onHydrated(cb)
```

### 5.7 Server helper

```ts
// zustand-url-sync/server — no React, no DOM
import { parseSearchParams } from 'zustand-url-sync/server'

const initial = parseSearchParams(searchParams, filtersConfig)
// -> Partial<FiltersState>, ready for a server component or a per-request store
```

### 5.8 SSR: the store must be per-request

The single hardest correctness problem in this library, and the one a "just add middleware" pitch tends to skip.

A module-level store (`export const useFilters = create(...)`) is a **singleton per Node process**. Under SSR that process serves concurrent requests, so request A's filters leak into request B's HTML. This is already true of plain Zustand — Zustand's own docs prescribe a store *factory* plus a React context provider — but `urlSync` makes it sharper, because the store now reads request-scoped input (the URL) at creation time. There is no `window.location` on the server to read it from, either.

So the SSR-supported shape is a factory, and the library provides the plumbing rather than leaving it to a docs page:

```tsx
// store.ts — a factory, not a singleton
import { createStore } from 'zustand/vanilla'
import { urlSync } from 'zustand-url-sync'

export const filtersConfig = { name: 'filters', params: { /* … */ } } as const

export const createFiltersStore = (initialUrl?: string) =>
  createStore<FiltersState>()(
    urlSync((set) => ({ /* … */ }), { ...filtersConfig, initialUrl }),
  )

// provider.tsx — one store instance per request, one per client mount
export const { Provider: FiltersProvider, useStore: useFilters } =
  createStoreContext(createFiltersStore)   // shipped from zustand-url-sync/react
```

Three pieces make this work:

- **`initialUrl`** — on the server the middleware has no `window`, so it reads params from this string instead. On the client it is ignored in favour of the live URL, which keeps the client authoritative after hydration.
- **`createStoreContext(factory)`** — the standard Zustand SSR pattern (factory + context + `useStore` with a selector), packaged so users don't hand-roll it. It also scopes the D1 param registry and the adapter to that provider subtree, which is what makes both safe on a server: **the registry is per-provider, not module-global**, and `setDefaultAdapter` throws outside a browser (§5.5).
- **`hydrateFromServer`** — the client store is created with the same params the server rendered, so the first client render is byte-identical. No `suppressHydrationWarning`, no flash of default filters.

The plain-SPA path keeps the module-level singleton — it's correct there, and forcing a provider on everyone would be a tax paid for a problem they don't have. The rule in one line: **singleton in a SPA, factory + provider anywhere that renders on a server.** The Next.js example app in M5 exists to prove it.

---

## 6. Two-tier storage: why we don't just use `persist`

Composing the official middleware — `create()(urlSync(persist(f, o), o2))` — *almost* works, and the failure mode matters:

- With **sync** storage, `persist` rehydrates during creation, then `urlSync` applies the URL on top. Correct order, by luck.
- With **async** storage (`AsyncStorage`, IndexedDB), `persist` rehydrates *after* creation and calls `set` — silently clobbering the URL values. A shared link renders the recipient's old filters. Debugging this costs an afternoon.

So v1 ships its own narrow, sync-first tier that is precedence-aware by construction. Composition with the official `persist` remains supported and documented for the rest of your store, with an explicit note: put `urlSync` **outside** `persist`, and if the storage is async, pass `persist: false` to `urlSync` and let it re-apply the URL on `onFinishHydration`. A `syncAfterPersist(store)` helper wires that in one line.

### 6.1 The boundary that stops this becoming a second `persist`

One rule, enforced by types:

> **`urlSync` persists only keys that have a declared codec.** Never `partialize`, never the whole store.

`persist.keys` selects from `params` (already codec'd). `persist.extra` declares storage-only keys — each with its own codec, so `pageSize: 25` round-trips as a typed integer instead of `JSON.parse`-of-anything. There is no way to say "persist everything", which is exactly the escape valve that would turn this into a worse `persist`. If a user wants that, the answer is the official middleware, composed as above.

Two properties fall out of the codec requirement for free:
- **Versioning.** Every declared key has a known shape, so `version` + `migrate(persisted, from)` is well-defined and cheap.
- **Corruption immunity.** Storage goes through the same `INVALID` path as a hostile URL (§5.2). A stale or hand-edited `localStorage` entry degrades to the default; it cannot crash boot.

### 6.2 Layered sources — how this scales past v1

Internally `params` + `persist` compile to one ordered source list per key:

```ts
type Source = { id: string; read(key): string | undefined; write(key, raw): void; priority: number }
// v1: [urlSource (priority 0), storageSource (priority 1)]
```

Precedence (§5.3) is just "lowest priority number that has a value wins". Adding a cookie source for SSR, an IndexedDB source, or cross-tab sync later means registering a source — not redesigning the public API. The facade stays two config blocks; the core stays open.

---

## 7. Technical constraints (design must address each)

| # | Constraint | Handling |
|---|---|---|
| C1 | **History API rate limit.** Safari throws `SecurityError` past ~100 calls / 30s. | Global write queue. Base throttle 50ms, `rateLimitFactor` 2.4 on Safari (→120ms). Sub-50ms configs are clamped, with a dev warning. |
| C2 | **Multiple stores, one URL.** Two stores flushing in the same tick, each from its own snapshot, lose each other's params. | **One queue per adapter instance** — not per module, which would leak across SSR requests (C3). Stores sharing an adapter share a queue, which is exactly the set that shares a URL. At flush time the queue re-reads the **live** URL, applies all queued key diffs onto it, and writes once. Never write from a stale snapshot. The D1 param registry is scoped the same way: two stores on one adapter claiming one key fail loudly at creation instead of silently fighting. |
| C3 | **SSR: cross-request state leak + hydration mismatch.** A module-level store is one instance per Node process, shared by concurrent requests; and the server has no `window` to read the URL from. | **§5.8**, in full: store factory + `createStoreContext` provider, `initialUrl` for the server read, per-provider param registry, `setDefaultAdapter` throws off-browser. Client renders from the same params the server did. `skipHydration` + `useUrlSyncHydrated()` remain for the "render nothing until ready" pattern. |
| C4 | **Next.js App Router.** A naive `router.replace` re-runs server components on every keystroke. | Adapter defaults to `window.history.replaceState` (shallow, supported natively since Next 14.1). `shallow: false` opts into a real router navigation for server-driven refetch. |
| C5 | **Back/Forward.** | `popstate` + `hashchange` subscription; keys missing from the new URL revert to defaults; no write-back loop. |
| C6 | **Feedback loop.** Store write → URL write → adapter notify → store write → ∞. | Origin-tagged writes; ignore external notifications whose serialized params equal the last write we issued. |
| C7 | **Zustand v5 typing.** Middleware must survive composition with `devtools`, `immer`, `persist` in any order. | Standard `Mps`/`Mcs` mutator-pair signature + `declare module 'zustand' { interface StoreMutators }`. Type-level tests are part of CI. |
| C8 | **Storage unavailable.** Safari Private Mode, disabled cookies, quota exceeded. | Every storage call is guarded; failure degrades to URL-only, silently in prod, warned in dev. |
| C9 | **Non-browser targets.** Node, RN, tests. | Core imports no DOM globals; `memoryAdapter` covers Node. React Native gets URL-less, storage-only mode. |
| C10 | **URL length.** Browsers cap around 2,000 characters. | `maxUrlLength` budget (default 2000). On overflow, params are dropped in ascending `.priority(n)` order (declaration order breaks ties; default priority 0) until the URL fits, and each drop warns in dev. Dropped params keep their store value — the URL degrades, the app does not. A key marked `.priority(Infinity)` is never dropped. |
| C11 | **Route change in an SPA.** Navigating `/products` → `/users` carries `?q=` from a store that page never mounts, or resets filters a user expected to keep. | `onRouteChange: 'keep' \| 'reset' \| 'unmount'` (default `'keep'`). `'reset'` clears the store's params when `adapter.pathname()` changes; `'unmount'` additionally deregisters from the param registry. Prior art: `zustand-querystring`'s `select(pathname)` solves the same problem with a different shape — ours is a policy, not a predicate, because a predicate re-runs on every read. |
| C12 | **Adapter write is async.** Router navigations settle after the URL string changes. | `write` may return a promise; the queue awaits it before flushing the next batch, so `flush()`/`commit()` resolve on settlement and two rapid pushes cannot interleave. |

---

## 8. Package architecture

```
src/
  core/        store-agnostic engine: diffing, queue, precedence, codec runtime
  codecs/      built-ins + Standard Schema bridge
  adapters/    history · next · react-router · tanstack · memory
  storage/     local / session / custom StateStorage, guarded
  middleware/  the Zustand middleware + type surface
  react/       <UrlSyncProvider>, createStoreContext, useUrlSyncHydrated
  server/      parseSearchParams, buildSearchParams — DOM-free
```

`package.json` exports (generated by tsdown's `exports: true`):

| Entry | Contents |
|---|---|
| `.` | `urlSync`, `c`, `setDefaultAdapter`, types |
| `./codecs` | codecs alone, for shared config files |
| `./adapters/next` · `/react-router` · `/tanstack` · `/memory` | one adapter each, peer-optional |
| `./react` | React-only helpers |
| `./server` | DOM-free parsing |

**Dependencies: none.** `peerDependencies`: `zustand >=5`, `react >=18` (optional), plus optional peers per adapter. Standard Schema is types-only — the spec is a type contract, no runtime import.

### Build — tsdown (`tsdown` 0.22.14; requires Node `^22.18.0 || >=24.11.0`)

```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/codecs/index.ts',
    'src/react/index.ts',
    'src/server/index.ts',
    'src/adapters/*/index.ts',
  ],
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2020',
  dts: true,
  exports: true,     // auto-generate the exports map
  treeshake: true,
  publint: true,     // lint the published package
  attw: { enabled: 'ci-only', profile: 'node16' }, // are-the-types-wrong
  clean: true,
})
```

Size budget enforced in CI (`size-limit`): core `.` ≤ 3 kB gzip, each adapter ≤ 0.6 kB.

### Support policy (stated once, so it can be held to)

| | |
|---|---|
| **Runtime targets** | ES2020. Browsers: last 2 versions of Chrome/Edge/Firefox/Safari, plus Safari 15.4+ (the floor for `URLSearchParams` ergonomics we rely on). Node ≥ 20 at runtime — the `^22.18 \|\| >=24.11` requirement is tsdown's, for **building**, not for consuming. |
| **Peers** | `zustand ^5` (v4 is not supported: the mutator typing differs enough that supporting both doubles the type surface for a shrinking audience). `react ^18 \|\| ^19`, optional. Router peers optional, per adapter. |
| **Versioning** | Semver, changesets-driven. The **URL wire format is part of the public API** — any change to how a built-in codec serialises is a major, because it breaks links people have already shared and bookmarked. This is the constraint most likely to be violated by accident, so it is a written rule with a snapshot test (§9) behind it. |
| **License** | MIT. |

---

## 9. Testing

- **Unit** — Vitest + happy-dom. Codec round-trips, precedence matrix, queue coalescing, feedback-loop guard, route-change policy (C11), overflow drop order (C10).
- **Property** — fast-check: `parse(serialize(x)) === x` for every built-in codec, including unicode, `+`, `%`, the separator character itself, empty strings, and `NaN`.
- **Wire-format snapshot** — a frozen table of `value → query string` for every built-in codec. A diff here fails CI and forces a deliberate major-version decision, since the URL format is public API (§8).
- **Type** — `expect-type` / `tsd`: `urlSync(immer(devtools(f)))` in every permutation; plus the negative cases that must *fail* to compile — an action declared as a param, `.throttle()` and `.debounce()` on one key, `async` passed to `commit()`, a reference-returning codec with no `eq`.
- **Adapter integration** — one minimal app per adapter (Next App Router, React Router, TanStack, plain Vite), driven by Playwright: type → assert URL, Back → assert state, refresh → assert restore, `shallow: false` → assert the server actually re-ran.
- **Rate limit** — a fake-timer test asserting ≥120ms spacing under a simulated Safari `rateLimitFactor`.
- **SSR** — two tests, because C3 has two failure modes: (a) a Next.js app asserting zero hydration warnings with params present on first paint; (b) a **concurrency** test rendering two requests with different query strings interleaved in one process, asserting neither response contains the other's filters. (b) is the one that catches a regression back to a module-level singleton.
- **Multi-store** — two stores on one page, interleaved writes in the same tick, asserting no lost params; and a duplicate-key registration asserting a dev-time throw.

CI: Node 22 + 24, `publint`, `attw`, size-limit, typecheck, coverage gate on `src/core`.

---

## 10. Milestones

| # | Scope | Exit criteria |
|---|---|---|
| **M0 — Skeleton** | Repo, tsdown, Vitest, CI, size-limit, changesets | `pnpm build` emits clean ESM+CJS+dts; publint/attw green |
| **M1 — Core engine** | Layered source model (D3/§6.2), diff, queue, limiters (D4), codecs incl. array escaping (D2), param registry (D1), `historyAdapter` | Precedence matrix + round-trip properties pass; `['a,b']` vs `['a','b']` distinct |
| **M2 — Middleware** | Zustand v5 middleware + `StoreMutators` augmentation + store handle + `commit()` | Type tests pass under all composition orders; `.throttle()+.debounce()` is a type error |
| **M3 — Storage tier** | `storageSource`: local/session, guarded, `persist.keys` + `extra`, `version`/`migrate` | Private-mode, quota-exceeded and corrupted-entry tests pass |
| **M4 — Adapters** | Next App/Pages, React Router, TanStack, memory; `shallow` honoured; async `write` settlement (C12); route-change policy (C11) | Playwright suite green per adapter, incl. `shallow: false` server re-run |
| **M5 — SSR + server** | `initialUrl`, `parseSearchParams`, `createStoreContext`, per-provider registry, hydration hooks | Zero hydration warnings **and** the two-concurrent-requests leak test passes |
| **M6 — Docs + 1.0** | README, docs site, migration-from-`nuqs` and from-`zustand-querystring` guides, a real dashboard demo | Published; a stranger ships a filter bar in <10 minutes |

Post-1.0 candidates: cross-tab sync via the `storage` event, hash-mode adapter, compression codec for large filter objects, devtools panel, Svelte/Vue stores via the vanilla core.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Router adapters rot as Next/TanStack change | Adapter surface is 4 methods; keep integration apps in CI; document writing your own in one page |
| Zustand v5 middleware typing is famously sharp | Type tests from M2, not at the end. Copy the documented mutator-pair pattern verbatim |
| Scope creep into "a router" | §3 non-goals are binding for 1.0 |
| **SSR is where this library gets a bad reputation.** Two API shapes (singleton vs factory+provider) is the cost of not forcing a provider on SPA users, but a user who picks the wrong one gets a cross-request leak — a bug that looks like a security issue and won't reproduce locally. | The concurrency test in §9 gates every release. Docs lead with the decision rule, not the API. Dev-mode detection: if a store is created off-browser without `initialUrl`, warn with a link to §5.8 |
| URL wire format changes silently in a patch, breaking shared links | Snapshot test in §9; the rule is written into §8 |
| Nobody finds it | Ship the two migration guides; the `zustand-querystring` gap list is the marketing copy |
| `nuqs` adds a Zustand binding | Our differentiator stays the store-native model + storage tier + zero deps. Also fine: interop, not war |

---

## 12. Success metrics

- **M1 (3 mo):** 1,000 weekly downloads, ≥25 GitHub stars, ≥3 issues from real users.
- **M2 (6 mo):** 10,000 weekly downloads (≈1.5× the incumbent), used in ≥1 public OSS project we didn't write.
- **Quality (permanent):** 0 runtime deps · core ≤3 kB gzip · publint+attw green on every release · a working example per supported router.

---

## 13. Decisions

All five resolved. Recorded with the rationale so they can be re-litigated on evidence, not vibes.

### D1 — Param naming: flat by default, opt-in prefix, collisions detected at runtime

`?q=hello`, not `?filters.q=hello`. The URL is a user-facing surface; readable beats defensive. Namespacing every param to guard against a collision that most apps never hit is a tax on the common case.

```ts
{ name: 'filters', prefix: 'tbl_' }   // string  -> ?tbl_q=hello
{ name: 'filters', prefix: true }     // true    -> uses `name` -> ?filters_q=hello
```

**What makes it scalable:** a module-level param registry. Every store registers its resolved param keys on creation; a second store claiming a key that is already owned throws in dev and warns in prod, naming both stores. The collision becomes a five-second fix at boot instead of a heisenbug where two tables fight over `?page=`. The registry is dev-only code, stripped by `NODE_ENV` guards in the production build.

### D2 — Array encoding: `join` default with escaped separator, `repeat` opt-in

`?tags=a,b`. Half the characters of the repeated form, and one param per key keeps the registry in D1 meaningful. Spec in §5.2.

The non-negotiable part is the escaping: the separator is escaped **inside each element before joining**, so `['a,b']` and `['a','b']` produce different URLs. Most hand-rolled comma joins skip this and silently corrupt data the first time a user types a comma into a filter. `mode: 'repeat'` exists for backends that expect it (`qs`, Spring, Go), and `sep` is configurable for the rest.

### D3 — Storage tier: declared keys only, versioned — the boundary is a type, not a docs note

Resolved in favour of the real use case (remember `pageSize` even though it never hits the URL), with a hard rule that prevents scope creep: **only keys with a declared codec are persisted, and there is no "persist everything" option.** `persist.keys` selects from `params`; `persist.extra` declares storage-only keys with their own codecs. Full reasoning, plus the layered-source model that lets cookie/IndexedDB/cross-tab sources land later without an API change, in §6.1–6.2.

This is the decision that most shapes the codebase, so it lands in M1's type design rather than M3's implementation.

### D4 — Limiter default follows history semantics, not value type

Not "throttle for strings". The limiter is chosen by what the write costs: `throttle(50)` when the write is a `replace` (cheap, no history entry, keeps the URL live), `debounce(300)` when it is a `push` or a `shallow: false` server refetch (each flush is a Back-button stop or a network request). Table in §5.4.

`nuqs` throttles by default because it is a hook with no notion of which writes are expensive; a middleware that owns the whole param config does know, so it can pick correctly per key. Setting both `.throttle()` and `.debounce()` on one key is a type error.

**Escape hatch instead of an option flood:** `urlSync.commit(fn, opts)` overrides options for the writes one callback produces — that covers debounce-while-typing / flush-on-Enter without threading options through every Zustand action.

### D5 — Package name: unscoped `zustand-url-sync`

Personally owned and maintained by choiruladamm@gmail.com; no organisation affiliation. Unscoped wins on discovery — `zustand-` prefixed packages are how people search this ecosystem, and the name is free on npm (§2.3). A scope would buy branding this project does not need.

---

## 14. Still open (do not block M0)

Deliberately unresolved. None of them change a v1 interface; each can be added behind the source model (§6.2) or as a new adapter.

- **Cross-tab sync** via the `storage` event — v1.1. The open part isn't the mechanism, it's the conflict policy: two tabs on the same page with different URLs, one writes a preference. Needs a real user report before guessing.
- **Hash-mode adapter** (`#?q=`) for static hosts. Cheap, unclear demand — wait for an issue.
- **Devtools surface.** Whether the store handle exposes a change log for a panel, or whether composing with `devtools` is enough.
- **`sessionStorage` per key** rather than one storage per tier. Only matters if someone wants `page` in session and `sort` in local. Not worth the config surface until asked.

### 14.1 Readiness

Conceptually closed for v1. The design now names its own hardest failure modes and says what it does about each: SSR request leaks (§5.8/C3), lost params across stores (C2), URL overflow order (C10), route change (C11), async router settlement (C12), separator corruption (D2), and wire-format drift (§8). Every one has a gating test in §9.

What remains is implementation risk, not design risk — with one honest caveat: **§5.8's two-shape API (singleton vs factory+provider) is the only part that could still be wrong.** It is a real ergonomics trade, and if the Next.js example in M5 turns out clumsy to write, that is the signal to force the provider everywhere and eat the SPA tax. Decide with the example in hand, not now.

---

### Appendix — research sources

- npm registry search + downloads API, 2026-08-01 (figures in §2.1 are last-week actuals).
- `nuqs` docs — adapters, options, batching, limits (`nuqs.dev/docs/*`; `packages/nuqs/src/adapters/lib/defs.ts`).
- `zustand-querystring@0.7.0` — README and published `dist` manifest via unpkg.
- Zustand docs — `advanced-typescript` (custom middleware + `StoreMutators`), `persisting-store-data` (`skipHydration`, `onRehydrateStorage`, `createJSONStorage`).
- tsdown docs — `dts`, `exports`, `unbundle`, `publint`/`attw` options; `tsdown@0.22.14` engines field.
