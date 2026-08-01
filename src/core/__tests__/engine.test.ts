import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingAdapter } from '../../../test/support/recording-adapter.js'
import { toSpec } from '../../codecs/builder.js'
import { c } from '../../codecs/c.js'
import { createEngine, type EngineOptions } from '../engine.js'
import { getScope } from '../scope.js'
import type { ParamSpec, Source } from '../types.js'

type Filters = { q: string; page: number; tags: string[] }

const specs: Readonly<Record<string, ParamSpec>> = {
  q: toSpec(c.string().default('')),
  page: toSpec(c.integer().default(1)),
  tags: toSpec(c.array(c.string()).default([])),
}

const setup = (url: string, overrides: Partial<EngineOptions> = {}) => {
  const adapter = recordingAdapter(url)
  const engine = createEngine<Filters>({
    storeName: 'filters',
    specs,
    adapter,
    scope: getScope(adapter),
    ...overrides,
  })
  return { adapter, engine }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('resolveInitial', () => {
  it('takes declared params out of the URL', () => {
    const { engine } = setup('/products?q=hello&page=3&tags=a,b')
    expect(engine.resolveInitial({ q: '', page: 1, tags: [] })).toEqual({
      q: 'hello',
      page: 3,
      tags: ['a', 'b'],
    })
  })

  it('falls back to the default for a param that will not parse, and strips it', async () => {
    const { adapter, engine } = setup('/products?page=nonsense')
    expect(engine.resolveInitial({ q: '', page: 1, tags: [] }).page).toBe(1)

    await engine.flush()
    expect(adapter.read().has('page')).toBe(false)
  })

  it('reports the invalid value through onInvalid rather than throwing', () => {
    const onInvalid = vi.fn()
    const { engine } = setup('/?page=nonsense', { onInvalid })
    engine.resolveInitial({ q: '', page: 1, tags: [] })
    expect(onInvalid).toHaveBeenCalledWith('page', 'nonsense')
  })

  it('lets the URL beat a lower-priority source', () => {
    const storage: Source = {
      id: 'storage',
      priority: 1,
      read: (key) => (key === 'page' ? '9' : undefined),
      write: () => {},
    }
    const { engine } = setup('/?page=2', { sources: [storage] })
    expect(engine.resolveInitial({ q: '', page: 1, tags: [] }).page).toBe(2)
  })

  it('writes back to every source below the URL', () => {
    const write = vi.fn()
    const storage: Source = { id: 'storage', priority: 1, read: () => undefined, write }
    const { engine } = setup('/?q=hi', { sources: [storage] })
    engine.resolveInitial({ q: '', page: 1, tags: [] })
    expect(write).toHaveBeenCalledTimes(1)
    const diff = write.mock.calls[0]?.[0] as Map<string, unknown>
    expect(diff.get('q')).toBe('hi')
  })

  it('never writes back a param that already matches the URL', async () => {
    const { adapter, engine } = setup('/?q=hello')
    engine.resolveInitial({ q: '', page: 1, tags: [] })
    await vi.advanceTimersByTimeAsync(1000)
    expect(adapter.writes).toHaveLength(0)
  })
})

describe('onStateChange', () => {
  it('writes only the keys that changed', async () => {
    const { adapter, engine } = setup('/')
    engine.resolveInitial({ q: '', page: 1, tags: [] })

    engine.onStateChange({ q: 'shoes', page: 1, tags: [] })
    await engine.flush()

    expect(adapter.read().get('q')).toBe('shoes')
    expect(adapter.read().has('page')).toBe(false)
  })

  it('omits a value equal to its default, so a clean state is a clean URL', async () => {
    const { adapter, engine } = setup('/?q=shoes')
    engine.resolveInitial({ q: '', page: 1, tags: [] })

    engine.onStateChange({ q: '', page: 1, tags: [] })
    await engine.flush()

    expect(adapter.read().toString()).toBe('')
  })

  it('does not write when a reference-typed value is rebuilt but equal', async () => {
    const { adapter, engine } = setup('/?tags=a')
    engine.resolveInitial({ q: '', page: 1, tags: [] })
    adapter.clearWrites()

    engine.onStateChange({ q: '', page: 1, tags: ['a'] })
    await vi.advanceTimersByTimeAsync(1000)

    expect(adapter.writes).toHaveLength(0)
  })

  it('leaves a serverOnly param alone', async () => {
    const { adapter, engine } = setup('/?token=abc', {
      specs: { token: toSpec(c.string().default('').serverOnly()) },
    })
    engine.resolveInitial({ q: '', page: 1, tags: [] })
    engine.onStateChange({ q: '', page: 1, tags: [] })
    await vi.advanceTimersByTimeAsync(1000)

    expect(adapter.writes).toHaveLength(0)
    expect(adapter.read().get('token')).toBe('abc')
  })
})

describe('applyExternal', () => {
  it('ignores the notification caused by our own write', async () => {
    const { engine } = setup('/')
    engine.resolveInitial({ q: '', page: 1, tags: [] })

    engine.onStateChange({ q: 'shoes', page: 1, tags: [] })
    await engine.flush()

    expect(engine.applyExternal()).toBeNull()
  })

  it('reverts a key missing from the new URL to its default', async () => {
    const { adapter, engine } = setup('/')
    engine.resolveInitial({ q: '', page: 1, tags: [] })

    engine.onStateChange({ q: 'shoes', page: 1, tags: [] })
    await engine.flush()
    adapter.navigate('/')

    expect(engine.applyExternal()).toEqual({ q: '' })
  })

  it('pushes the patch to onExternal when the adapter notifies', async () => {
    const onExternal = vi.fn()
    const { adapter, engine } = setup('/', { onExternal })
    engine.resolveInitial({ q: '', page: 1, tags: [] })

    adapter.navigate('/?q=boots')
    await vi.advanceTimersByTimeAsync(0)

    expect(onExternal).toHaveBeenCalledWith({ q: 'boots' })
  })
})

describe('route change', () => {
  it('keeps params by default', async () => {
    const onExternal = vi.fn()
    const { adapter, engine } = setup('/products?q=shoes', { onExternal })
    engine.resolveInitial({ q: '', page: 1, tags: [] })

    adapter.navigate('/users?q=shoes')
    await vi.advanceTimersByTimeAsync(0)

    expect(onExternal).not.toHaveBeenCalled()
  })

  it("resets the store's params when the pathname changes under 'reset'", async () => {
    const onExternal = vi.fn()
    const { adapter, engine } = setup('/products?q=shoes', {
      onExternal,
      onRouteChange: 'reset',
    })
    engine.resolveInitial({ q: '', page: 1, tags: [] })

    adapter.navigate('/users?q=shoes')
    await vi.advanceTimersByTimeAsync(1000)

    expect(onExternal).toHaveBeenCalledWith({ q: '', page: 1, tags: [] })
    expect(adapter.read().has('q')).toBe(false)
  })
})

describe('commit', () => {
  it("flushes immediately under limit: 'immediate'", async () => {
    const { adapter, engine } = setup('/')
    engine.resolveInitial({ q: '', page: 1, tags: [] })

    const params = await engine.commit(
      () => {
        engine.onStateChange({ q: 'enter', page: 1, tags: [] })
      },
      { limit: 'immediate', history: 'push' },
    )

    expect(params.get('q')).toBe('enter')
    expect(adapter.writes[adapter.writes.length - 1]?.options.history).toBe('push')
  })

  it('drops the override as soon as the callback returns', async () => {
    const { adapter, engine } = setup('/')
    engine.resolveInitial({ q: '', page: 1, tags: [] })

    await engine.commit(
      () => {
        engine.onStateChange({ q: 'a', page: 1, tags: [] })
      },
      { limit: 'immediate', history: 'push' },
    )
    engine.onStateChange({ q: 'b', page: 1, tags: [] })
    await engine.flush()

    expect(adapter.writes[adapter.writes.length - 1]?.options.history).toBe('replace')
  })
})

describe('registry', () => {
  it('throws when a second store claims a key on the same adapter', () => {
    const adapter = recordingAdapter('/')
    const scope = getScope(adapter)
    createEngine<Filters>({ storeName: 'a', specs, adapter, scope })
    expect(() => createEngine<Filters>({ storeName: 'b', specs, adapter, scope })).toThrow(
      /two stores claim the param "q"/,
    )
  })

  it('does not collide when the second store uses a prefix', () => {
    const adapter = recordingAdapter('/')
    const scope = getScope(adapter)
    createEngine<Filters>({ storeName: 'a', specs, adapter, scope })
    expect(() =>
      createEngine<Filters>({ storeName: 'b', specs, adapter, scope, prefix: 'tbl_' }),
    ).not.toThrow()
  })
})

describe('handle helpers', () => {
  it('toSearchParams builds a URL without navigating', async () => {
    const { adapter, engine } = setup('/?other=1')
    engine.resolveInitial({ q: '', page: 1, tags: [] })
    adapter.clearWrites()

    const params = engine.toSearchParams({ q: 'link', page: 2, tags: [] })
    await vi.advanceTimersByTimeAsync(1000)

    expect(params.toString()).toBe('other=1&q=link&page=2')
    expect(adapter.writes).toHaveLength(0)
  })

  it('reset clears every synced key', async () => {
    const { adapter, engine } = setup('/?q=x&page=4')
    engine.resolveInitial({ q: '', page: 1, tags: [] })

    expect(engine.reset()).toEqual({ q: '', page: 1, tags: [] })
    await engine.flush()
    expect(adapter.read().toString()).toBe('')
  })

  it('dispose releases the claimed keys', () => {
    const adapter = recordingAdapter('/')
    const scope = getScope(adapter)
    const first = createEngine<Filters>({ storeName: 'a', specs, adapter, scope })
    first.dispose()
    expect(() => createEngine<Filters>({ storeName: 'b', specs, adapter, scope })).not.toThrow()
  })
})
