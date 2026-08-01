# M5 — SSR and per-request stores

**Goal:** the library is safe to use in a server-rendered app. No cross-request leaks, no hydration warnings, and a documented rule for which of the two store shapes to use.

**Size:** M · **Depends on:** M4 · **Next:** M6

Read first: `PRD.md` §5.8 (in full), §7 C3, `.claude/rules/architecture.md` (no server-reachable globals).

---

## Why this phase exists

This is the phase that decides whether the library is trustworthy. The failure mode — request A's filters rendered into request B's HTML — looks like a security bug, doesn't reproduce locally, and would be blamed on us rather than on a module-level singleton the user wrote. Getting it right is worth more than any feature in M6.

It is also the only remaining piece of design risk. PRD §14.1 flags it: the two-shape API (singleton for SPAs, factory + provider for SSR) is a real ergonomics trade, and this phase is where it gets judged with a real app in hand. If the Next example is clumsy to write, that is the signal to force the provider everywhere — and that decision belongs here, before 1.0.

---

## Prereqs

M4 exit checklist passed. At least the Next App Router adapter working.

---

## Context

- A module-level store is one instance per Node process, shared by concurrent requests.
- The server has no `window`, so params come from `initialUrl` instead.
- The adapter instance is the scope root, so scoping the adapter to a provider scopes the queue and the registry with it.
- `setDefaultAdapter` throws off-browser — it exists for SPAs only.

---

## Public shapes

```ts
// server/index.ts — no React, no DOM
export function parseSearchParams<T>(
  search: string | URLSearchParams | Record<string, string | string[]>,
  config: Pick<UrlSyncOptions<T>, 'params' | 'prefix'>,
): Partial<T>

export function buildSearchParams<T>(
  values: Partial<T>,
  config: Pick<UrlSyncOptions<T>, 'params' | 'prefix'>,
): URLSearchParams
```

```ts
// react/index.ts
export function UrlSyncProvider(props: {
  adapter: UrlAdapter
  children: ReactNode
  defaultOptions?: Partial<AdapterWriteOptions>
}): JSX.Element

export function createStoreContext<S, A>(factory: (initialUrl?: string) => StoreApi<S> & A): {
  Provider: (p: { initialUrl?: string; children: ReactNode }) => JSX.Element
  useStore: <U>(selector: (s: S) => U) => U
  useStoreApi: () => StoreApi<S> & A
}

export function useUrlSyncHydrated(store: { urlSync: UrlSyncApi }): boolean
```

`buildSearchParams` is what makes server-rendered `<Link href>` possible without instantiating a store — the same serialization the client would produce, callable from an RSC.

---

## Tasks

### 1. `server/` — DOM-free parsing

`parseSearchParams` runs the same precedence and codec path as the engine, minus sources and queue. It must accept Next's `searchParams` object shape (`Record<string, string | string[]>`) directly, because that's what an RSC receives.

`lint:arch` already forbids DOM imports here; also add a test that imports the entrypoint in a bare Node context with no DOM shim.

**Done when:** `node -e "import('./dist/server/index.js')"` works with no globals installed.

### 2. `initialUrl`

In `urlSync`: when `typeof window === 'undefined'`, read params from `initialUrl` instead of the adapter. When a window exists, ignore `initialUrl` in favour of the live URL — the client stays authoritative after hydration.

Creating a store off-browser **without** `initialUrl` warns in dev, with a link to PRD §5.8. It is not an error — a store created during a build step with no URL is legitimate — but it is almost always the leak about to happen.

### 3. `react/UrlSyncProvider`

Context carrying the adapter and default write options. `urlSync` resolves its adapter as: explicit option → provider context → `getDefaultAdapter()`.

Because the scope hangs off the adapter instance, a provider subtree gets its own queue and registry for free. Verify that rather than assuming it — a test with two providers on one page must show two independent registries.

### 4. `react/createStoreContext`

The standard Zustand SSR pattern, packaged: a ref-held store created once per mount, a context, and a `useStore(selector)` using `useStore` from `zustand` so selectors and equality work as users expect.

The `Provider` takes `initialUrl` and passes it to the factory. In a Next App Router layout that's `headers()`-derived or passed down from the page.

Keep it thin. This is convenience over a documented pattern, not a framework — if it starts growing options, that's scope creep.

### 5. Hydration

`skipHydration` + `useUrlSyncHydrated` for "render nothing until ready". But the primary path must not need them: server and client both derive from the same params, so the first client render matches. Prove it with zero-warning tests, not by recommending `suppressHydrationWarning`.

### 6. The two tests that matter

**Concurrency.** Render two requests with different query strings, interleaved in one Node process, asserting neither response contains the other's filters. Interleaved, not sequential — sequential passes even with a singleton.

**Hydration.** A Next app with params present on first paint, asserting zero React hydration warnings. Fail the test on any `console.error`.

### 7. Judge the two-shape API

With the Next example written, answer explicitly: is factory + provider acceptable to write, or clumsy enough that forcing it on SPA users is the lesser evil? Record the answer in the handoff and update PRD §14.1. Do not leave it open going into M6 — it's the last thing that can still change a public API.

---

## Success metrics

| # | Metric | Command | Pass |
|---|---|---|---|
| 1 | **Two interleaved requests, no cross-contamination** | `pnpm test ssr-concurrency` | green — this gates every release from here on |
| 2 | Zero hydration warnings with params on first paint | `pnpm e2e --grep hydration` | no `console.error` |
| 3 | `server/` imports in bare Node, no DOM shim | `pnpm test server-node` | green |
| 4 | `setDefaultAdapter` throws off-browser | `pnpm test ssr-guards` | green |
| 5 | Off-browser store without `initialUrl` warns | `pnpm test ssr-guards` | green |
| 6 | Two providers, two independent registries — same key in both, no throw | `pnpm test provider-scope` | green |
| 7 | `parseSearchParams` accepts Next's `searchParams` shape | `pnpm test server` | green |
| 8 | `buildSearchParams` output matches what the client writes | `pnpm test server` | byte-identical |
| 9 | `react/` is optional — no-React build unaffected | `pnpm size` | `.` unchanged |
| 10 | SPA singleton path still works unchanged | `pnpm e2e --project=vite` | green |

Metric 1 is the single most important test in the repository. If it is ever skipped or quarantined, the release does not go out.

---

## Traps

- **A sequential two-request test proves nothing.** It passes with a module-level singleton. Interleave: create A, create B, then read A.
- **`WeakMap` keyed by adapter is fine; a `Map` is a leak.** Scope lookup must not retain adapters.
- **Reading `window` at module scope**, even guarded, can break bundlers that evaluate modules on the server. Read it inside functions.
- **`useSyncExternalStore` server snapshot must be referentially stable.** Returning a fresh object each call causes an infinite render loop — React's error for this is unhelpful, so if you see repeated renders, check here first.
- **Next's `searchParams` gives `string | string[]`** — `string[]` for repeated keys, which is exactly D2's `repeat` mode. Handle it; don't take `[0]`.
- **Don't make the provider mandatory for SPAs** without deciding it deliberately in task 7. It's a public API decision, not an implementation detail.

---

## Handoff

*Fill in on completion.*

- **Verdict on the two-shape API** (keep both / force provider), and the evidence:
- Next version tested, and whether native history updates behaved as documented:
- Anything the concurrency test caught:
- PRD §14.1 updated: yes / no
