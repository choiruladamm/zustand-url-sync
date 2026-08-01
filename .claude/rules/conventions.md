# Conventions

Only rules a linter can't check. Everything about spacing, quotes, import order and semicolons is Biome's — run it, don't discuss it.

## Files

- One concept per file, named after it: `queue.ts`, `precedence.ts`, `array.ts`.
- `index.ts` re-exports. It contains no logic.
- Tests sit next to the source: `queue.ts` → `queue.test.ts`.
- No `utils.ts`, no `helpers.ts`, no `types.ts` grab-bags. If a helper has no home, it belongs to whichever concept uses it.

## Code

- **Named exports only.** No `export default`.
- **Closures over classes.** Factories return frozen objects: `createQueue(opts) => { push, flush }`.
- **No `any`.** `unknown` and narrow. A cast needs a comment saying what guarantees it.
- **Public functions get an explicit return type.** Inference is fine internally.
- Prefer a discriminated union to a boolean pair. `INVALID` is a unique symbol, not `null`.

## Errors

Two categories, treated differently — this is a library, so a throw in the wrong place takes down someone's app.

- **User data** (a URL param, a storage entry) is never trusted and never throws. Return `INVALID`, fall back per PRD §5.2, report via `onInvalid`.
- **Programmer error** (duplicate param key, action declared as a param, adapter missing) throws — but only at *setup* time, never inside a `set` or a flush.
- Everything in the write path is `try`-guarded. A storage or history failure degrades; it doesn't propagate.

## Dev-only code

Wrap so bundlers strip it:

```ts
if (process.env.NODE_ENV !== 'production') {
  warn(`[zustand-url-sync] two stores claim "${key}"`)
}
```

Every message starts `[zustand-url-sync]`, names the offending key/store, and says what to do. No bare `console.log` — use the `warn`/`invariant` helpers in `core/dev.ts`.

## Comments

Explain **why**, never what. A comment restating the code gets deleted.

Worth a comment: a spec quirk, a browser workaround, a deliberate deviation from the obvious approach. Link the PRD section (`// PRD §7 C1: Safari rate limit`) rather than re-explaining it.

## Recipes

Follow these exactly — they're where drift shows up first.

**Add a codec** — `codecs/<name>.ts` with `parse`/`serialize`, plus `eq` if it returns a reference · export from `codecs/index.ts` · add to the `c` builder · round-trip property test · **add a row to the wire-format snapshot** · changeset.

**Add an adapter** — `adapters/<name>/index.ts` implementing `UrlAdapter` · honour `shallow` and return a promise from `write` if the router settles async · own entrypoint in `tsdown.config.ts` · optional peer in `package.json` · a Playwright app under `examples/` · changeset.
