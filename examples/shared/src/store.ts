import { create } from 'zustand'
import { c, type UrlAdapter, urlSync } from 'zustand-url-sync'

/**
 * Where a store reads the URL from.
 *
 * A browser hands over a live adapter. A server has no `window` to read, so it hands over the URL
 * of the request being rendered instead. Skipping that is a hydration mismatch and not a subtle
 * one: the server renders every declared key at its default while the client renders the deep link.
 */
export type UrlSource = { adapter: UrlAdapter } | { initialUrl: string }

export type Filters = {
  q: string
  page: number
  tags: string[]
  setQ: (q: string) => void
  setPage: (page: number) => void
  toggleTag: (tag: string) => void
}

/**
 * The store every example app mounts. The adapter is the only thing that differs between them,
 * which is the whole point: if a router behaves differently, the shared Playwright suite is the
 * thing that says so.
 */
export function createFiltersStore(source: UrlSource) {
  return create<Filters>()(
    urlSync(
      (set) => ({
        q: '',
        page: 1,
        tags: [],
        setQ: (q) => set({ q, page: 1 }),
        setPage: (page) => set({ page }),
        toggleTag: (tag) =>
          set((state) => ({
            tags: state.tags.includes(tag)
              ? state.tags.filter((t) => t !== tag)
              : [...state.tags, tag],
          })),
      }),
      {
        name: 'filters',
        ...source,
        params: {
          // Throttled rather than debounced: the URL stays live while typing, which is also what
          // makes the 30-keystroke test meaningful — it is the path that hits the history limit.
          q: c.string().default('').throttle(100),
          page: c.integer().default(1),
          tags: c.array(c.string()).default([]),
        },
      },
    ),
  )
}

export type View = {
  view: 'grid' | 'list'
  setView: (view: View['view']) => void
}

/** A second store on the same page and the same adapter, to prove the two do not fight. */
export function createViewStore(source: UrlSource) {
  return create<View>()(
    urlSync(
      (set) => ({
        view: 'grid',
        setView: (view) => set({ view }),
      }),
      {
        name: 'view',
        ...source,
        params: { view: c.enum(['grid', 'list']).default('grid') },
      },
    ),
  )
}

export const TAGS = ['react', 'zustand', 'router'] as const
