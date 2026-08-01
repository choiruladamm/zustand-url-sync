# M3 — Storage tier

**Goal:** the second source. Declared keys survive in `localStorage`/`sessionStorage`, versioned and migratable, without ever outranking the URL.

**Size:** M · **Depends on:** M2 · **Next:** M6 (or run alongside M4)

Read first: `PRD.md` §5.1 (`persist` block), §5.3, §6, §6.1, §6.2, §7 C8.

---

## Why this phase exists

This is the half of the original problem that no competitor solves, and it is small **only** because M1 built the source model. If this phase starts to feel large, that is a signal the source abstraction is leaking — stop and fix `core/`, don't special-case storage in the middleware.

The whole phase is one `Source` implementation plus a guarded storage wrapper. If it grows a second concept, something went wrong.

---

## Prereqs

M2 exit checklist passed. `Source` interface stable.

---

## Context

- **URL > storage > default**, always, no config to change it. A shared link renders what the sender saw.
- **Only declared keys.** `persist.keys` selects from `params`; `persist.extra` declares storage-only keys with their own codecs. There is no `partialize`, no "persist everything" — that absence is the design (PRD §6.1).
- **Corruption is not special.** A bad storage entry takes the same `INVALID` path as a hostile URL param.
- Storage is priority 1; URL is 0.

---

## Public shapes

```ts
// middleware/types.ts — fills in the `persist` field stubbed in M2
export type PersistOptions<T> = {
  storage?: 'local' | 'session' | StateStorage | false   // default 'local' when persist is present
  keys?: readonly ParamKey<T>[]                          // must exist in `params`
  extra?: { [K in ParamKey<T>]?: ParamSpec<T[K]> }       // storage-only, must not be in `params`
  version?: number
  migrate?: (persisted: Record<string, unknown>, from: number) => Record<string, unknown>
}
```

```ts
// storage/index.ts
export function createStorageSource(o: {
  name: string
  storage: StateStorage
  specs: Readonly<Record<string, ParamSpec>>
  version: number
  migrate?: PersistOptions<never>['migrate']
  onInvalid?: (key: string, raw: string) => void
}): Source

export function guardStorage(get: () => Storage | undefined): StateStorage | undefined
```

`StateStorage` matches Zustand's own shape (`getItem`/`setItem`/`removeItem`) so a user's existing custom storage drops in.

**On-disk layout** — one entry per store, not per key, so a write is one `setItem`:

```json
{ "v": 1, "s": { "sort": "name", "pageSize": "50" } }
```

Values are the **serialized** strings, identical to what the URL would carry. Same codec, same wire format, one thing to reason about — and it means a value can move between `params` and `persist.extra` without a migration.

---

## Tasks

### 1. `storage/guarded.ts`

Wrap every access in `try`/`catch`. Safari Private Mode throws on `setItem`; a disabled-storage browser throws on *access to the property itself*, so even `typeof localStorage` must be guarded.

Unavailable storage → the source is simply not added. The store works, URL-only. Warn once in dev, silent in prod (C8).

**Done when:** tests with a throwing storage stub pass and produce no unhandled rejection.

### 2. `storage/source.ts`

Implement `Source`:

- `read(key)` — from the parsed entry, `undefined` if missing/corrupt.
- `write(entries)` — merge into the existing entry, single `setItem`. Never write on the initial hydration pass (that would persist values that came from the URL, defeating the point of a clean URL later).
- No `subscribe` in v1 — cross-tab is deferred (PRD §14).

Parse once at construction. A corrupt or unparseable blob is discarded wholesale with a dev warning; do not attempt partial recovery, since a half-restored preference set is more confusing than a reset one.

### 3. Versioning

Read `v`. If it's below `version` and `migrate` exists, run it and rewrite. If it's below and no `migrate`, discard with a dev warning. If it's *above*, discard — a user who downgraded shouldn't crash on a future format.

Migrated values still go through codec `parse`, so a bad migration degrades instead of injecting garbage into the store.

### 4. Wire into the middleware

In `urlSync`, when `persist` is present: build the merged spec map (`params` ∩ `keys`, plus `extra`), create the source, append it after the URL source. Everything else — precedence, invalid handling — is already generic.

Validate at setup: a `keys` entry not in `params` throws; an `extra` key also in `params` throws. Both are programmer errors, both at setup time (`conventions.md`).

### 5. `reset()` and the write-back pass

`reset()` clears storage entries for declared keys too. The initial write-back (PRD §5.3 step 4) persists the merged result — this is what makes "URL wins now, and is remembered next time" true.

Order is load-bearing: defaults → storage → URL → one write-back. Test it explicitly, both directions.

---

## Success metrics

| # | Metric | Command | Pass |
|---|---|---|---|
| 1 | URL beats storage beats default, all 9 combinations incl. invalid | `pnpm test precedence` | green |
| 2 | Storage throwing (private mode) degrades to URL-only, no crash | `pnpm test storage-guard` | green, no unhandled rejection |
| 3 | Quota exceeded on write degrades, store unaffected | `pnpm test storage-guard` | green |
| 4 | Corrupt blob → defaults + one dev warning | `pnpm test storage-source` | green |
| 5 | Version below with `migrate` → migrated; without → discarded; above → discarded | `pnpm test storage-version` | green |
| 6 | `extra` key persists but never appears in the URL | `pnpm test storage-source` | URL clean |
| 7 | `keys` naming a non-`params` key is a type error **and** a setup throw | `pnpm test:types && pnpm test storage-source` | green |
| 8 | Storage write is one `setItem` per flush, not one per key | `pnpm test storage-source` | call count = 1 |
| 9 | `reset()` clears URL and storage | `pnpm test middleware` | green |
| 10 | Size | `pnpm size` | within budget |

---

## Traps

- **Persisting during initial hydration.** If the write-back runs before precedence resolves, URL values get written to storage and then outlive the link — the user's preferences become whatever the last link they clicked contained. Order matters more than anything else in this phase.
- **`typeof localStorage` throws** in some configurations. Guard the access, not just the call.
- **Storing parsed values instead of serialized strings** looks tidier and breaks the "same wire format everywhere" property, which is what lets a key move between tiers without a migration.
- **Don't add a `partialize` escape hatch** because it's three lines. It's the exact thing §6.1 exists to prevent, and it can't be removed later without a major.
- **Async storage is out of scope.** The `Source` interface allows a promise from `write`, but the read path is synchronous by design — async rehydration is the failure mode described in PRD §6. If someone needs it, the answer is composing with official `persist`.

---

## Handoff

*Fill in on completion.*

- Final on-disk format if it moved from `{ v, s }`:
- Behaviour chosen for a downgraded (`v` too high) entry:
- Whether any storage concern leaked into `core/` or `middleware/` — and if so, why it couldn't stay in `storage/`:
