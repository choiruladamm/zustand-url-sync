# M2 — Middleware and type surface

**Goal:** `urlSync` — a Zustand v5 middleware that drives M1's engine from a store, plus the type surface that makes the whole thing pleasant and makes the known footguns fail to compile.

**Size:** L · **Depends on:** M1 · **Next:** M3 and M4 (either order)

Read first: `PRD.md` §5.1, §5.4, §5.6, §7 C7, `.claude/rules/testing.md` (negative type tests).

---

## Why this phase exists

M1 solved synchronisation. This phase is where it becomes *ergonomic* — and where the library either earns "Zustand-native" or doesn't. Two things carry that weight:

1. Composing with `devtools`, `immer` and `persist` in any order without breaking types. Zustand's mutator-pair typing is unforgiving, and a middleware that only works when it's outermost is a middleware people work around.
2. The type surface closing footguns at compile time rather than documenting them. Every negative type test in this phase replaces a paragraph nobody reads.

Roughly half of this phase is types. Budget it that way.

---

## Prereqs

M1 exit checklist passed. `Engine`, `Source`, `UrlAdapter` signatures final (check M1's handoff — they may have moved).

---

## Context

- The middleware wraps `set`, diffs declared keys, hands changes to the engine. It never re-implements queueing or precedence.
- The scope root is the adapter instance (`getScope`), so two stores sharing an adapter coordinate automatically.
- `commit()` is **synchronous-scoped** — `async` passed to it is a type error, not a runtime warning (PRD §5.4).
- Limiter defaults come from history semantics (D4), resolved here because this is where `history`/`shallow` per key are known.

---

## Public shapes

```ts
// middleware/types.ts
export type ParamKey<T> = {
  [K in keyof T]: T[K] extends (...a: never[]) => unknown ? never : K
}[keyof T]

export type UrlSyncOptions<T> = {
  name: string
  params: { [K in ParamKey<T>]?: ParamSpec<T[K]> }
  prefix?: string | true
  adapter?: UrlAdapter
  initialUrl?: string                       // M5 uses this; accept it now
  persist?: PersistOptions<T>               // M3 fills this in; type it as never for now
  maxUrlLength?: number
  onRouteChange?: 'keep' | 'reset' | 'unmount'
  onInvalid?: (key: string, raw: string, issues?: unknown) => void
  skipHydration?: boolean
}

export type UrlSyncApi = {
  commit: <R>(fn: () => R, o?: CommitOptions) => Promise<URLSearchParams>
  flush: () => Promise<URLSearchParams>
  toSearchParams: () => URLSearchParams
  applyUrl: (url: string) => void
  pause: () => void
  resume: () => void
  reset: () => void
  hasHydrated: () => boolean
  onHydrated: (cb: () => void) => () => void
}
```

Mutator signature — follow Zustand's documented pattern verbatim, don't invent:

```ts
type UrlSync = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  initializer: StateCreator<T, [...Mps, ['url-sync', unknown]], Mcs>,
  options: UrlSyncOptions<T>,
) => StateCreator<T, Mps, [['url-sync', unknown], ...Mcs]>

declare module 'zustand' {
  interface StoreMutators<S, A> {
    'url-sync': Write<Cast<S, object>, { urlSync: UrlSyncApi }>
  }
}
```

---

## Tasks

### 1. Type surface first

Write `middleware/types.ts` and the negative type tests **before** the implementation. The types are the design; discovering at the end that `ParamKey<T>` doesn't distribute the way you assumed is a rewrite.

Required compile failures (`test/types/*.test-d.ts`):

| Must not compile | Why |
|---|---|
| an action declared in `params` | actions can't serialize |
| `.throttle()` and `.debounce()` on one spec | ambiguous |
| `async` fn passed to `commit()` | override scope is synchronous |
| a reference-returning codec with no `eq` | silent write-per-render |
| `params` key absent from the state type | typo protection |
| `ParamSpec<string>` on a `number` field | codec/field mismatch |

Mutual exclusion of throttle/debounce is cleanest as a branded builder: `.throttle()` returns a type lacking `.debounce`, and vice versa.

**Done when:** `pnpm test:types` passes, and each case has been confirmed to fail for the *stated* reason — a test that fails because of an unrelated type error is a false pass. Check the expected error message, not just the failure.

### 2. `middleware/urlSync.ts`

Implement as `urlSyncImpl` typed loosely, cast once at the export boundary — the Zustand-documented approach. One cast, commented.

Creation order:

1. Resolve adapter: `options.adapter` → provider context (M5) → `getDefaultAdapter()`. Throw with a clear message if none and not in a browser.
2. `getScope(adapter)`; register params (D1 registry).
3. Build the source list. M2 ships URL only; M3 appends storage.
4. `createEngine(...)`.
5. Run the initializer to get defaults, then `engine.resolveInitial(defaults)` and merge — unless `skipHydration`.
6. Wrap `set` so every write feeds `engine.onStateChange(next, prev)`.
7. Subscribe to the adapter; on external change call `engine.applyExternal()` and `setState` the result, tagged so it doesn't loop back out.
8. Attach `store.urlSync`.

**Done when:** with `memoryAdapter`, a `set` produces the expected query string and a simulated `popstate` produces the expected state.

### 3. `set` wrapping — get this exactly right

The wrapped `set` must:
- pass through `replace` semantics unchanged
- compute `prev` before the underlying `set`, `next` after — never assume the partial is the delta, since a function updater may touch anything
- skip the engine entirely for writes tagged as originating from the adapter (C6)
- stay cheap: a `set` touching no declared key does nothing beyond one `eq` per declared key

### 4. Composition

Verify against `immer`, `devtools`, `subscribeWithSelector`, and official `persist`, in both orders where meaningful. Runtime tests, not just types — `immer` in particular changes object identity on every produce, which is exactly what codec `eq` exists to absorb.

Document the ordering rule found for official `persist` (PRD §6) in a comment where users will hit it.

### 5. Store handle

All of `UrlSyncApi`. `reset()` restores declared keys to defaults, clears them from the URL, and (from M3) from storage. `toSearchParams()` builds without navigating — no queue involvement, no side effects.

### 6. Vanilla parity

Everything above works with `createStore` from `zustand/vanilla`. No React import anywhere in `middleware/` — `lint:arch` enforces it, but the tests should also exercise the vanilla path directly, since that's the one users of the vanilla core will hit.

---

## Success metrics

| # | Metric | Command | Pass |
|---|---|---|---|
| 1 | All six negative type tests fail to compile, for the right reason | `pnpm test:types` | green |
| 2 | Composition with immer / devtools / subscribeWithSelector / persist, both orders | `pnpm test composition` | green, types included |
| 3 | `set` → URL, `popstate` → state, via memoryAdapter | `pnpm test middleware` | green |
| 4 | Two stores, one adapter, no lost params; duplicate key throws in dev | `pnpm test multi-store` | green |
| 5 | `commit()` overrides synchronously and resolves after flush | `pnpm test commit` | green |
| 6 | An immer producer on an unchanged array enqueues **nothing** | `pnpm test middleware` | zero adapter writes |
| 7 | Vanilla store works with no React present | `pnpm test vanilla` | green |
| 8 | `middleware/` imports no React | `pnpm lint:arch` | green |
| 9 | Public API recorded | `pnpm api:check` | green |
| 10 | Size | `pnpm size` | core within 3 kB |

Metric 6 is the one that catches the most common real-world performance complaint. Do not skip it.

---

## Traps

- **Casting too early.** Cast once at the export. Casting inside the implementation hides the errors that tell you the mutator chain is wrong.
- **`prev` captured after `set`.** Then the diff is always empty and everything silently stops syncing — with all single-value tests still passing.
- **Untagged external writes** cause an infinite loop the first time a router echoes a change back. C6 handles it in the engine, but only if the middleware routes adapter-originated writes through the tagged path.
- **`ParamKey<T>` and optional properties.** `T[K] extends Function` behaves differently under `exactOptionalPropertyTypes`. Test with a state type that has optional fields.
- **Don't let the handle leak the engine.** `store.urlSync` exposes the nine documented methods and nothing else; anything more becomes API you can't remove without a major.

---

## Handoff

*Fill in on completion.*

- Final `UrlSyncOptions` / `UrlSyncApi` shape if changed:
- Composition orders verified, and any that don't work:
- Where the adapter-origin tag lives, so M4 adapters honour it:
- Size after middleware:
