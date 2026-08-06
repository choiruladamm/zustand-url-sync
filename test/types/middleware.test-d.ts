// Negative type tests: each `@ts-expect-error` below MUST stay an error. If a footgun ever stops
// failing to compile, `tsc` reports "Unused '@ts-expect-error'" and this file fails CI.
//
// Every case here replaces a paragraph in the docs that nobody reads.
import { expectTypeOf } from 'expect-type'
import { createStore } from 'zustand/vanilla'
import { c, type UrlSyncApi, urlSync } from '../../src/index.js'

type Filters = {
  q: string
  page: number
  tags: string[]
  sort: 'created_at' | 'name'
  setQ: (q: string) => void
}

const base = (set: (partial: Partial<Filters>) => void): Filters => ({
  q: '',
  page: 1,
  tags: [],
  sort: 'created_at',
  setQ: (q) => set({ q }),
})

// --- the store gains the handle, and only the handle -------------------------------------------

const store = createStore<Filters>()(
  urlSync(base, {
    name: 'filters',
    params: { q: c.string().default(''), page: c.integer().default(1) },
  }),
)

expectTypeOf(store.urlSync).toEqualTypeOf<UrlSyncApi>()
expectTypeOf(store.getState()).toEqualTypeOf<Filters>()

// @ts-expect-error — the handle exposes nine methods and no engine.
store.urlSync.engine

// --- an action cannot be declared as a param ---------------------------------------------------
// A function has no serialized form, so this is always a typo.

createStore<Filters>()(
  urlSync(base, {
    name: 'filters',
    // @ts-expect-error — `setQ` is an action, so it is not a `ParamKey<Filters>`.
    params: { setQ: c.string().default('') },
  }),
)

// --- a param key must exist on the state -------------------------------------------------------

createStore<Filters>()(
  urlSync(base, {
    name: 'filters',
    // @ts-expect-error — `qq` is not a key of `Filters`.
    params: { qq: c.string().default('') },
  }),
)

// --- a codec must match the type of the field it is declared on --------------------------------

createStore<Filters>()(
  urlSync(base, {
    name: 'filters',
    // @ts-expect-error — `page` is a number; a string codec cannot carry it.
    params: { page: c.string().default('') },
  }),
)

createStore<Filters>()(
  urlSync(base, {
    name: 'filters',
    // @ts-expect-error — `'newest'` is not a member of the declared union.
    params: { sort: c.enum(['created_at', 'newest']).default('created_at') },
  }),
)

// --- throttle and debounce are mutually exclusive ----------------------------------------------
// A key that both coalesces a burst and waits for it to end has no defined schedule.

c.string().default('').throttle(50)
c.string().default('').debounce(300)

// @ts-expect-error — `.throttle()` closes off `.debounce()`.
c.string().default('').throttle(50).debounce(300)

// @ts-expect-error — and the reverse.
c.string().default('').debounce(300).throttle(50)

// --- commit() is synchronously scoped ----------------------------------------------------------
// The override applies to the writes made during the synchronous run of `fn`, so an `async`
// function would silently lose it at the first `await`.

store.urlSync.commit(() => {
  store.getState().setQ('hello')
})

store.urlSync.commit(() => store.getState().setQ('hello'), { history: 'push' })

// @ts-expect-error — an `async` function cannot carry the override across an await.
store.urlSync.commit(async () => {
  store.getState().setQ('hello')
})

// @ts-expect-error — same for a plain function that returns a promise.
store.urlSync.commit(() => Promise.resolve(1))

// --- the storage tier persists declared keys, and only declared keys ---------------------------

createStore<Filters>()(
  urlSync(base, {
    name: 'filters',
    params: {
      q: c.string().default(''),
      sort: c.enum(['created_at', 'name']).default('created_at'),
    },
    persist: {
      storage: 'local',
      keys: ['sort'],
      extra: { tags: c.array(c.string()).default([]) },
      version: 1,
    },
  }),
)

createStore<Filters>()(
  urlSync(base, {
    name: 'filters',
    params: { q: c.string().default('') },
    // @ts-expect-error — `sort` has no codec in `params`, so there is nothing to persist it with.
    persist: { keys: ['sort'] },
  }),
)

createStore<Filters>()(
  urlSync(base, {
    name: 'filters',
    params: { q: c.string().default('') },
    // @ts-expect-error — `q` is already a param; declaring it again in `extra` is two slots for one key.
    persist: { extra: { q: c.string().default('') } },
  }),
)

createStore<Filters>()(
  urlSync(base, {
    name: 'filters',
    params: { q: c.string().default('') },
    // @ts-expect-error — `setQ` is an action, so it is not a `ParamKey<Filters>`.
    persist: { extra: { setQ: c.string().default('') } },
  }),
)

createStore<Filters>()(
  urlSync(base, {
    name: 'filters',
    params: { q: c.string().default('') },
    // @ts-expect-error — `tags` is a string array; a string codec cannot carry it.
    persist: { extra: { tags: c.string().default('') } },
  }),
)
