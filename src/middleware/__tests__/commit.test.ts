import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFiltersStore } from '../../../test/support/filters-store.js'
import { recordingAdapter } from '../../../test/support/recording-adapter.js'

const setup = (url = '/products') => {
  const adapter = recordingAdapter(url)
  const store = createFiltersStore({ adapter })
  adapter.clearWrites()
  return { adapter, store }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('commit', () => {
  it('overrides the write options for exactly the writes fn produces', async () => {
    const { adapter, store } = setup()

    await store.urlSync.commit(() => store.getState().setQ('hello'), {
      limit: 'immediate',
      history: 'push',
    })

    expect(adapter.writes).toHaveLength(1)
    expect(adapter.writes[0]?.options.history).toBe('push')
    expect(adapter.url()).toBe('/products?q=hello')
  })

  it('leaves the next write on the store defaults', async () => {
    const { adapter, store } = setup()

    await store.urlSync.commit(() => store.getState().setQ('hello'), {
      limit: 'immediate',
      history: 'push',
    })
    adapter.clearWrites()

    store.getState().setQ('goodbye')
    await store.urlSync.flush()

    expect(adapter.writes[0]?.options.history).toBe('replace')
  })

  it('resolves with what landed in the URL', async () => {
    const { store } = setup()

    const params = await store.urlSync.commit(() => store.getState().setPage(4), {
      limit: 'immediate',
    })

    expect(params.get('page')).toBe('4')
  })

  it('adds one history entry for a burst, not one per set', async () => {
    const { adapter, store } = setup()

    await store.urlSync.commit(
      () => {
        store.getState().setQ('a')
        store.getState().setQ('ab')
        store.getState().setQ('abc')
      },
      { limit: 'immediate', history: 'push' },
    )

    expect(adapter.writes).toHaveLength(1)
    expect(adapter.entries()).toEqual(['/products', '/products?q=abc'])
  })

  it('without limit: immediate, waits for the batch to land on its own schedule', async () => {
    const { adapter, store } = setup()

    const settled = store.urlSync.commit(() => store.getState().setQ('hello'))
    expect(adapter.writes).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(100)
    await settled
    expect(adapter.url()).toBe('/products?q=hello')
  })

  it('restores the override even when fn throws', async () => {
    const { adapter, store } = setup()

    expect(() =>
      store.urlSync.commit(
        () => {
          throw new Error('boom')
        },
        { limit: 'immediate', history: 'push' },
      ),
    ).toThrow('boom')

    store.getState().setPage(2)
    await store.urlSync.flush()

    expect(adapter.writes[0]?.options.history).toBe('replace')
  })
})
