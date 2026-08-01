# Architecture

## Layers, and the one-way rule

Imports flow **down** this list only. A lower layer never imports an upper one.

| Layer | May import | Owns |
|---|---|---|
| `core/` | nothing (pure TS) | source model, precedence, diff, write queue, limiters, registry |
| `codecs/` | `core/` types | built-in codecs, Standard Schema bridge |
| `storage/` | `core/`, `codecs/` | guarded local/session/custom `StateStorage` |
| `middleware/` | all above + `zustand` | the `urlSync` middleware, store handle, type surface |
| `adapters/*` | `core/` types only | one router each |
| `react/` | `core/`, `middleware/`, `react` | provider, `createStoreContext`, hooks |
| `server/` | `core/`, `codecs/` | DOM-free parsing |

Enforced by `dependency-cruiser` in CI, not by review. A cycle or an upward import is a build failure.

**Where does new code go?** Answer "which layer" before writing a line. If it doesn't fit, the layering is wrong — raise it, don't smuggle the code into `middleware/`.

## Sources, not special cases

URL and storage are both `Source` implementations (PRD §6.2), ordered by `priority`. Precedence is "lowest priority number with a value wins".

Never add an `if (isUrl)` branch in `core/`. A new origin — cookie, IndexedDB, cross-tab — is a new `Source`, and it lands without touching precedence logic. If a change needs core to know *which* source it's talking to, that change is wrong.

## No server-reachable globals

Invariant 6, concretely. Module-level `let`/`Map`/`Set` that a store can write to is a cross-request leak under SSR: one Node process, many concurrent requests.

- Adapter and param registry are scoped to a provider instance, not the module.
- `setDefaultAdapter` is the SPA-only shortcut and throws when `typeof window === 'undefined'`.
- Module-level `const` that is genuinely immutable is fine.

If you need shared state, take it as a parameter or hang it off the store instance.

## The adapter instance is the scope root

Everything that must be shared between stores — the write queue and the param registry — hangs off the **adapter instance**, never off the module.

This falls out cleanly: stores sharing an adapter are exactly the stores sharing a URL, which is exactly the set that must coordinate (PRD C2). And on a server each provider builds its own adapter, so nothing crosses a request (C3). One rule solves both.

In a SPA `setDefaultAdapter` supplies the single instance, so the behaviour is what you'd expect from a global — without the global.

## Public surface

Only what `src/*/index.ts` re-exports is public. Deep imports (`zustand-url-sync/dist/core/queue`) are not supported and the `exports` map blocks them.

Everything else is internal and may change in a patch. Mark it `@internal` if it must be exported for another entrypoint to use.
