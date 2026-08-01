# M1 — Core engine

**Goal:** the whole synchronisation engine, working, tested, and knowing nothing about Zustand or React. By the end of this phase the library's hard problems are solved; M2 only connects them to a store.

**Size:** L · **Depends on:** M0 · **Next:** M2

Read first: `PRD.md` §5.2, §5.3, §5.4, §6.2, §7 (all constraints), `.claude/rules/architecture.md`.

---

## Why this phase exists

Every correctness constraint in PRD §7 is a `core/` problem: the queue (C1, C2, C12), the feedback guard (C6), overflow (C10), route change (C11). Solving them behind a pure interface means they get tested with fake timers and a memory adapter instead of a browser, and M2–M5 inherit correctness instead of re-deriving it.

The rule that keeps this phase honest: **if a piece of code needs to know it is talking to a URL, it does not belong in `core/`.**

---

## Prereqs

M0 exit checklist passed. `pnpm build` green on an empty `src/`.

---

## Context — the decisions being implemented

- **Sources, not special cases.** URL and storage are both `Source`. Precedence = lowest `priority` number holding a value wins. URL is priority 0. (PRD §6.2)
- **Scope root is the adapter instance.** One queue and one registry per adapter — not per module. (PRD C2/C3, `architecture.md`)
- **Limiter defaults follow history semantics**, not value type: `replace` → `throttle(50)`, `push` or `shallow:false` → `debounce(300)`. Floor of 50 ms, multiplied by `rateLimitFactor`. (PRD §5.4, D4)
- **Hostile input never throws.** `INVALID` → fall through to the next source → default. (PRD §5.2)
- **Wire format is public API** from the moment the first codec lands. Every codec added here adds a row to `api/wire-format.md`.

---

## Public shapes this phase defines

Fix these before writing implementations — M2 through M5 all type against them.

```ts
// core/types.ts
export const INVALID: unique symbol
export type Invalid = typeof INVALID

export type Codec<T> = {
  parse: (raw: string) => T | Invalid
  serialize: (value: T) => string
  /** required when T is a reference type — see conventions.md */
  eq?: (a: T, b: T) => boolean
}

export type Limiter = { kind: 'throttle' | 'debounce'; ms: number }

export type ParamSpec<T = unknown> = {
  codec: Codec<T>
  default: T
  limiter?: Limiter
  history?: 'push' | 'replace'
  shallow?: boolean
  scroll?: boolean
  priority?: number          // C10 drop order; default 0
  omitWhen?: (value: T) => boolean
  serverOnly?: boolean
}

export type Source = {
  id: string
  priority: number
  read: (key: string) => string | undefined
  write: (entries: ReadonlyMap<string, string | undefined>) => void | Promise<void>
  subscribe?: (onExternalChange: () => void) => () => void
}

export type AdapterWriteOptions = { history: 'push' | 'replace'; shallow: boolean; scroll: boolean }

export type UrlAdapter = {
  read: () => URLSearchParams
  write: (next: URLSearchParams, o: AdapterWriteOptions) => void | Promise<void>
  subscribe: (onExternalChange: () => void) => () => void
  pathname?: () => string
  rateLimitFactor?: number
}
```

```ts
// core/engine.ts
export type Engine<S extends object> = {
  resolveInitial: (defaults: S) => Partial<S>
  onStateChange: (next: S, prev: S) => void
  applyExternal: () => Partial<S> | null   // null when nothing changed
  flush: () => Promise<URLSearchParams>
  commit: <R>(fn: () => R, o?: Partial<AdapterWriteOptions> & { limit?: 'immediate' }) => Promise<URLSearchParams>
  pause: () => void
  resume: () => void
  dispose: () => void
}

export function createEngine<S extends object>(opts: {
  specs: Readonly<Record<string, ParamSpec>>
  sources: readonly Source[]
  scope: Scope                    // from the adapter instance
  prefix?: string
  maxUrlLength?: number           // default 2000
  onRouteChange?: 'keep' | 'reset' | 'unmount'
  onInvalid?: (key: string, raw: string, issues?: unknown) => void
}): Engine<S>
```

`Scope` is the per-adapter container holding the queue and the registry:

```ts
// core/scope.ts
export function getScope(adapter: UrlAdapter): Scope   // WeakMap-backed, created on first use
```

A `WeakMap<UrlAdapter, Scope>` is module-level but **not mutable state a request can corrupt** — entries are keyed by an object the request itself owns, and die with it. This is the one permitted exception to invariant 6, and it is permitted precisely because it inverts the ownership.

---

## Tasks

### 1. `core/types.ts`, `core/dev.ts`

Types above. `dev.ts` exports `warn(msg)` and `invariant(cond, msg)`, both wrapped in `process.env.NODE_ENV !== 'production'` so bundlers strip them. Message prefix `[zustand-url-sync]`.

**Done when:** a production build of a file using `warn` contains no message string.

### 2. `core/limiter.ts`

`createLimiter(spec, rateLimitFactor)` → `{ schedule(fn), cancel(), flushNow() }`.

- `throttle`: leading edge fires immediately, trailing edge coalesces.
- `debounce`: trailing only.
- Effective delay is `max(50, ms) * (rateLimitFactor ?? 1)`. A configured value below 50 warns once per key in dev.

**Done when:** fake-timer tests cover leading/trailing, cancel, and the Safari factor (2.4 → ≥120 ms spacing).

### 3. `core/queue.ts` — the hard one

`createQueue(adapter)` → `{ enqueue(key, raw|undefined, opts), flush(), pause(), resume() }`. One per adapter, held by `Scope`.

Behaviour, in order:

1. `enqueue` records a **pending key diff**, never a full snapshot. Later writes to the same key overwrite the earlier pending value.
2. Flush is scheduled per the strictest limiter among pending keys.
3. On flush: `adapter.read()` for the **live** params, apply pending diffs onto that, drop keys whose value equals their default, then apply the C10 length budget.
4. Merge write options across the batch: `history` is `push` if any pending key asks for it; `shallow` is `false` if any asks for it; `scroll` likewise.
5. `await adapter.write(...)` — it may return a promise (C12). While one write is in flight, further enqueues accumulate; they flush after settlement. Two pushes can never interleave.
6. Record the serialized result as `lastWritten` for the feedback guard (C6).
7. Resolve every `flush()` promise awaiting this batch with the written `URLSearchParams`.

**Done when:** the multi-store test passes — two independent enqueue sources in one tick produce one `adapter.write` containing both keys, and a stale snapshot cannot clobber.

### 4. `core/registry.ts`

Per-scope `Map<paramKey, storeName>`. `register(keys, storeName)` throws in dev on a duplicate, naming both stores; warns in prod. Returns an `unregister()` for `dispose`.

Resolved keys include the prefix — `prefix: 'tbl_'` means `tbl_q` is what gets registered, so two prefixed stores don't collide.

### 5. `core/codec-runtime.ts`

`parseWith(spec, raw, onInvalid)` → `T | Invalid`, `serializeWith(spec, value)` → `string | undefined` (undefined = omit: value equals default, or `omitWhen` says so).

Equality uses `spec.codec.eq ?? Object.is`.

### 6. `core/precedence.ts`

`resolveInitial(defaults, specs, sources)`. For each key: walk sources by ascending priority, first non-`undefined` raw that parses to non-`INVALID` wins; otherwise the default. An `INVALID` at one source falls through to the next — it does not abort.

**Done when:** the precedence matrix test passes — every combination of {URL present / absent / invalid} × {storage present / absent / invalid}.

### 7. `core/overflow.ts` (C10)

Given serialized entries and `maxUrlLength`, drop in ascending `priority`, then declaration order, until the URL fits. `priority: Infinity` is never dropped. Each drop warns in dev. Returns the kept set — dropped keys retain their store value.

### 8. `core/engine.ts`

Wire tasks 2–7 together. `onStateChange` diffs declared keys using codec `eq`, enqueues changed ones. `applyExternal` reads the adapter, compares to `lastWritten` (C6) — equal means it was our own write, return `null`. `commit` sets a synchronous override flag, runs `fn`, clears it, returns `flush()`.

Route-change policy (C11): if `adapter.pathname` exists, subscribe and apply `keep` / `reset` / `unmount` on change.

### 9. `codecs/*`

`string`, `integer`, `float`, `boolean`, `enum`, `array`, `isoDate`, `timestamp`, `json`, `numberRange`, `schema` (Standard Schema v1, types-only import).

`array` per D2: `mode: 'join' | 'repeat'`, `sep` default `,`, separator escaped **inside each element before joining**. Every reference-returning codec ships `eq`.

The `c` builder produces `ParamSpec` via `.default()`, `.throttle()`, `.debounce()`, `.history()`, `.shallow()`, `.scroll()`, `.priority()`, `.omitWhen()`, `.serverOnly()`.

**Done when:** every codec has a round-trip property test and a row in `api/wire-format.md`.

### 10. `adapters/memory`, `adapters/history`

`memoryAdapter(initialUrl?)` — full `UrlAdapter` over an in-memory string, with `push`/`replace` history so Back can be simulated in tests. This is the substrate for every M1 test.

`historyAdapter()` — `window.history`, `popstate` + `hashchange`, `rateLimitFactor` 2.4 when Safari is detected. Ignores `shallow` (no router to notify).

---

## Success metrics

| # | Metric | Command | Pass |
|---|---|---|---|
| 1 | Round-trip holds for every codec, incl. unicode, `%`, `+`, separator, empty string | `pnpm test codecs` | all properties green, 1000 runs each |
| 2 | `['a,b']` and `['a','b']` serialize differently and both round-trip | `pnpm test array` | green |
| 3 | Precedence matrix, all 9 combinations | `pnpm test precedence` | green |
| 4 | Two stores, one tick → one write, no lost keys | `pnpm test queue` | green |
| 5 | Safari factor produces ≥120 ms spacing | `pnpm test limiter` | green |
| 6 | Async `adapter.write` serialises; two pushes never interleave | `pnpm test queue` | green |
| 7 | Feedback guard: our own write produces no `applyExternal` | `pnpm test engine` | green |
| 8 | Overflow drops by priority, keeps store values | `pnpm test overflow` | green |
| 9 | `core/` coverage | `pnpm test --coverage` | ≥ 90% |
| 10 | `core/` is pure | `pnpm lint:arch` | green |
| 11 | Wire format recorded | `pnpm api:check` | green, table non-empty |
| 12 | Size floor | `pnpm size` | core within 3 kB budget |

---

## Traps

- **Queueing snapshots instead of diffs** is the C2 bug, and it passes single-store tests. Write the two-store test before the queue, not after.
- **The feedback guard must compare serialized strings, not object identity.** A router may hand back a different `URLSearchParams` with identical content.
- **`throttle` leading-edge + `flush()`** — a `flush()` during a throttle window must resolve with the *eventual* written params, not the current ones. Easy to resolve too early and produce a promise that lies.
- **`omitWhen` and defaults interact.** A value equal to its default is omitted; `omitWhen` omits on top of that. Both must round-trip back to the default, or Back-button behaviour breaks (C5).
- **Don't let `core/` import the codecs.** Codecs depend on core types, not the reverse. If the engine seems to need a specific codec, it needs a `ParamSpec` instead.
- **Escape before join, not after.** Escaping the joined string is the bug D2 exists to prevent; it round-trips in the happy path and corrupts the moment a value contains the separator.

---

## Handoff

*Fill in on completion.*

- Final `Engine` / `Source` / `UrlAdapter` signatures if they moved from the shapes above:
- Measured core size vs the 3 kB budget:
- Any PRD §7 constraint that turned out to need a different mechanism than described:
- Codecs shipped, and any deferred:
