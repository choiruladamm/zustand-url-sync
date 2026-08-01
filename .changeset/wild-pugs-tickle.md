---
'zustand-url-sync': minor
---

Add the core synchronisation engine, the built-in codecs, and the `memory` and `history` adapters.

Nothing in this release depends on Zustand or on a DOM — the engine is a pure module that reads
and writes through `Source` implementations, so it runs in Node with no shims. The middleware that
connects it to a store lands next.

**Codecs** — `c.string`, `c.integer`, `c.float`, `c.boolean`, `c.enum`, `c.array`, `c.isoDate`,
`c.timestamp`, `c.json`, `c.numberRange`, `c.schema` (any Standard Schema validator: zod, valibot,
arktype — types only, no runtime dependency) and `c.custom`.

```ts
import { c } from 'zustand-url-sync'

const params = {
  q: c.string().default(''),
  page: c.integer().default(1),
  tags: c.array(c.string()).default([]),
  sort: c.enum(['created_at', 'name']).default('created_at').history('push'),
}
```

`.default()` comes first and is the only way into the rest of the chain, so a param without a
default cannot be declared. `.throttle()` and `.debounce()` are mutually exclusive at the type
level. A codec that returns a reference type must supply `eq`, or it will not compile.

**Adapters** — `memoryAdapter(initialUrl?)` from `zustand-url-sync/adapters/memory` for Node,
React Native and tests, with `back()` / `forward()` / `navigate()` for driving history in a test;
`historyAdapter()` from `zustand-url-sync/adapters/history` for the browser, which detects Safari
and spaces its writes accordingly.

**Query strings stay readable.** `,` and `:` are emitted unescaped — both are legal in a query per
RFC 3986 — so a filter list renders as `?tags=react,zustand` and a date as
`?from=2026-08-01T00:00:00.000Z` rather than as a wall of `%2C` and `%3A`. The frozen table in
`api/wire-format.md` records exactly what every codec emits.
