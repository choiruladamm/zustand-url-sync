import type { ReactElement } from 'react'
import type { UrlSyncApi } from 'zustand-url-sync'
import type { Filters, View } from './store'
import { TAGS } from './store'

/**
 * The identical app all five examples render: a search input, a page number, a multi-select, and a
 * second store sharing the same URL. Every control carries a `data-testid`, because the Playwright
 * suite is written once and run against each app — a behavioural difference between routers has to
 * show up as a failing assertion, not as a different spec file.
 */

export type StoreLike<S> = {
  (): S
  <T>(selector: (state: S) => T): T
}

export type DemoProps = {
  useFilters: StoreLike<Filters>
  useView: StoreLike<View>
  filtersApi: UrlSyncApi
  /**
   * Rendered by the server on each request, when there is a server. The suite reads it to prove
   * that a `shallow: false` write re-ran it and a shallow one did not.
   */
  serverStamp?: string | undefined
  /** Names the adapter under test, so a failure says which app produced it. */
  adapter: string
}

export function Demo(props: DemoProps): ReactElement {
  const { useFilters, useView, filtersApi, serverStamp, adapter } = props
  const q = useFilters((s) => s.q)
  const page = useFilters((s) => s.page)
  const tags = useFilters((s) => s.tags)
  const setQ = useFilters((s) => s.setQ)
  const setPage = useFilters((s) => s.setPage)
  const toggleTag = useFilters((s) => s.toggleTag)
  const view = useView((s) => s.view)
  const setView = useView((s) => s.setView)

  return (
    <main>
      <h1 data-testid="adapter">{adapter}</h1>

      <label>
        Search
        <input
          data-testid="q"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="search"
        />
      </label>

      <label>
        Page
        <input
          data-testid="page"
          type="number"
          value={page}
          onChange={(event) => setPage(Number(event.target.value) || 1)}
        />
      </label>

      <fieldset data-testid="tags">
        <legend>Tags</legend>
        {TAGS.map((tag) => (
          <label key={tag}>
            <input
              data-testid={`tag-${tag}`}
              type="checkbox"
              checked={tags.includes(tag)}
              onChange={() => toggleTag(tag)}
            />
            {tag}
          </label>
        ))}
      </fieldset>

      <button
        data-testid="view"
        type="button"
        onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
      >
        view: {view}
      </button>

      {/*
        `shallow: false` for exactly the writes this callback produces. On an app with a server it
        re-runs it; on the plain-history app it is simply a normal write, which is itself worth
        asserting — the flag must never break an adapter that has no router.
      */}
      <button
        data-testid="deep-write"
        type="button"
        onClick={() => {
          void filtersApi.commit(() => setPage(page + 1), {
            shallow: false,
            history: 'push',
          })
        }}
      >
        next page (server)
      </button>

      {/* Metric: `flush()` resolves after the navigation settles, not after the URL string moves. */}
      <button
        data-testid="flush"
        type="button"
        onClick={() => {
          void filtersApi
            .commit(() => setQ('flushed'), { shallow: false })
            .then((params) => {
              const el = document.querySelector('[data-testid="flush-result"]')
              if (el) el.textContent = params.toString()
            })
        }}
      >
        flush
      </button>
      <output data-testid="flush-result" />

      <button data-testid="reset" type="button" onClick={() => filtersApi.reset()}>
        reset
      </button>

      <pre data-testid="state">{JSON.stringify({ q, page, tags, view })}</pre>
      <pre data-testid="server-stamp">{serverStamp ?? ''}</pre>
    </main>
  )
}
