---
'zustand-url-sync': minor
---

Add the storage tier: declared keys can now survive a reload, without ever outranking the URL.

```ts
urlSync(init, {
  name: 'filters',
  params: {
    q: c.string().default(''),
    sort: c.enum(['created_at', 'name']).default('created_at'),
  },
  persist: {
    storage: 'local',           // 'local' | 'session' | your own StateStorage | false
    keys: ['sort'],             // params that also persist
    extra: {                    // storage-only keys, each with its own codec
      pageSize: c.integer().default(25),
    },
    version: 1,
    migrate: (persisted, from) => persisted,
  },
})
```

Precedence is **URL > storage > default** and there is no option to change it: a shared link renders
what the sender saw, and the stored value fills in only the keys that link left out. Once the URL has
decided, the merged result is written back, so the link is remembered on the next visit.

Notes:

- Only keys with a declared codec persist. There is no `partialize` and no "persist everything" — for
  that, compose the official `persist` middleware around the rest of your store.
- The entry is one `localStorage` slot per store, `zustand-url-sync:<name>`, holding the same
  serialized strings the URL carries. A key can move between `params` and `persist.extra` without a
  migration.
- A corrupt, hand-edited, or version-mismatched entry degrades to the default and warns in dev. It
  cannot crash hydration.
- Unavailable storage (Safari Private Mode, disabled storage) and an exceeded quota degrade to
  URL-only. The store keeps working.
- `urlSync.reset()` now clears the storage entry along with the URL.
- New exported types: `PersistOptions`, `StorageOption`, `StateStorage`.
- The root entrypoint's size budget moves from 6 kB to 7 kB gzip to cover the tier.
