# Testing

Vitest + happy-dom. Playwright for adapters. `fast-check` for properties.

## Rules

- A bug fix **starts** with a failing test that reproduces it. No test, no fix.
- Test observable behaviour through the public API. Reaching into internals means the seam is in the wrong place — fix the seam.
- Fake timers for anything touching limiters or the queue. Never `await sleep()`.
- No snapshot tests except the two deliberate ones in `versioning.md`. A snapshot of a data structure just records whatever the code did.

## Gates — these fail CI, don't skip them

| Gate | Guards |
|---|---|
| Round-trip property, every codec | `parse(serialize(x)) === x` incl. unicode, `%`, `+`, the separator itself, empty string |
| Wire-format snapshot | accidental major (`versioning.md`) |
| Precedence matrix | URL > storage > default, across present/absent/invalid |
| SSR concurrency | two requests, different query strings, interleaved in one process → no cross-contamination. **This is the one that catches a regression to a module-level singleton.** |
| Multi-store same tick | interleaved writes lose no params; duplicate param key throws in dev |
| Rate limit | ≥120ms spacing under a simulated Safari `rateLimitFactor` |
| Negative type tests | see below |
| `publint` + `attw` | broken published package |
| size-limit | budget per entrypoint |

## Negative type tests

Live in `test/types/*.test-d.ts`. These assert code **fails** to compile — as load-bearing as the runtime tests, because each one is a footgun the type system is supposed to close:

- an action declared as a param
- `.throttle()` and `.debounce()` on the same key
- an `async` function passed to `commit()`
- a reference-returning codec with no `eq`
- `persist.keys` naming a key absent from `params`

## Coverage

Gate on `src/core` only, and treat it as a smoke alarm, not a score. Uncovered branches in `core/` usually mean a real edge case nobody thought about; chasing the number elsewhere produces tests that assert nothing.
