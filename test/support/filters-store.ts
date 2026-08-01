import { createStore } from 'zustand/vanilla'
import { c } from '../../src/codecs/c.js'
import type { UrlSyncOptions } from '../../src/middleware/types.js'
import { urlSync } from '../../src/middleware/url-sync.js'

/** `pageSize` is deliberately undeclared: it proves an unsynced key costs nothing. */
export type Filters = {
  q: string
  page: number
  tags: string[]
  sort: 'created_at' | 'name'
  pageSize: number
  setQ: (q: string) => void
  setPage: (page: number) => void
}

export function createFiltersStore(options: Partial<UrlSyncOptions<Filters>> = {}) {
  return createStore<Filters>()(
    urlSync(
      (set) => ({
        q: '',
        page: 1,
        tags: [],
        sort: 'created_at',
        pageSize: 25,
        setQ: (q) => set({ q, page: 1 }),
        setPage: (page) => set({ page }),
      }),
      {
        name: 'filters',
        params: {
          q: c.string().default(''),
          page: c.integer().default(1),
          tags: c.array(c.string()).default([]),
          sort: c.enum(['created_at', 'name']).default('created_at'),
        },
        ...options,
      },
    ),
  )
}
