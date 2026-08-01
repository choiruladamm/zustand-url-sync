import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingAdapter } from '../../../test/support/recording-adapter.js'
import { toSpec } from '../../codecs/builder.js'
import { c } from '../../codecs/c.js'
import { createEngine } from '../engine.js'
import { getScope } from '../scope.js'
import type { ParamSpec, Source } from '../types.js'

type State = { q: string }

const specs: Readonly<Record<string, ParamSpec>> = { q: toSpec(c.string().default('')) }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('setup-time programmer errors', () => {
  it('refuses a param declared without a default', () => {
    const adapter = recordingAdapter('/')
    expect(() =>
      createEngine<State>({
        storeName: 'filters',
        specs: {
          q: { codec: { parse: (raw: string) => raw, serialize: (v: string) => v } } as never,
        },
        adapter,
        scope: getScope(adapter),
      }),
    ).toThrow(/has no \.default\(\)/)
  })

  it('warns when a limiter asks for less than the browser rate-limit floor', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const adapter = recordingAdapter('/')
    createEngine<State>({
      storeName: 'filters',
      specs: { q: toSpec(c.string().default('').throttle(5)) },
      adapter,
      scope: getScope(adapter),
    })
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('50ms'))
  })

  it('warns when the store initializer disagrees with the declared default', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const adapter = recordingAdapter('/')
    const engine = createEngine<State>({
      storeName: 'filters',
      specs,
      adapter,
      scope: getScope(adapter),
    })
    engine.resolveInitial({ q: 'not the declared default' })
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('declared default'))
  })

  it('says nothing about any of it in a production build', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const adapter = recordingAdapter('/')
    const engine = createEngine<State>({
      storeName: 'filters',
      specs: { q: toSpec(c.string().default('').throttle(5)) },
      adapter,
      scope: getScope(adapter),
    })
    engine.resolveInitial({ q: 'mismatched' })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('failure degrades', () => {
  it('keeps going when a lower-priority source throws on write', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const hostile: Source = {
      id: 'storage',
      priority: 1,
      read: () => undefined,
      write: () => {
        throw new Error('quota exceeded')
      },
    }
    const adapter = recordingAdapter('/?q=hi')
    const engine = createEngine<State>({
      storeName: 'filters',
      specs,
      adapter,
      scope: getScope(adapter),
      sources: [hostile],
    })

    expect(() => engine.resolveInitial({ q: '' })).not.toThrow()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('storage'))
    await engine.flush()
  })

  it('treats a pathname that throws as no pathname', () => {
    const adapter = recordingAdapter('/')
    const engine = createEngine<State>({
      storeName: 'filters',
      specs,
      adapter: {
        ...adapter,
        pathname: () => {
          throw new Error('router not ready')
        },
      },
      scope: getScope(adapter),
    })
    expect(() => engine.applyExternal()).not.toThrow()
  })
})

describe("onRouteChange: 'unmount'", () => {
  it('gives the keys back to the registry when the route changes', async () => {
    const adapter = recordingAdapter('/products?q=shoes')
    const scope = getScope(adapter)
    const engine = createEngine<State>({
      storeName: 'filters',
      specs,
      adapter,
      scope,
      onRouteChange: 'unmount',
      onExternal: () => {},
    })
    engine.resolveInitial({ q: '' })

    adapter.navigate('/users')
    await vi.advanceTimersByTimeAsync(1000)

    expect(scope.registry.owner('q')).toBeUndefined()
  })
})

describe('pause and resume', () => {
  it('holds writes while paused', async () => {
    const adapter = recordingAdapter('/')
    const engine = createEngine<State>({
      storeName: 'filters',
      specs,
      adapter,
      scope: getScope(adapter),
    })
    engine.resolveInitial({ q: '' })

    engine.pause()
    engine.onStateChange({ q: 'held' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(adapter.writes).toHaveLength(0)

    engine.resume()
    await vi.advanceTimersByTimeAsync(1000)
    expect(adapter.read().get('q')).toBe('held')
  })
})

describe('dispose', () => {
  it('stops reacting to state changes', async () => {
    const adapter = recordingAdapter('/')
    const engine = createEngine<State>({
      storeName: 'filters',
      specs,
      adapter,
      scope: getScope(adapter),
      onExternal: () => {},
    })
    engine.resolveInitial({ q: '' })
    engine.dispose()

    engine.onStateChange({ q: 'ignored' })
    await vi.advanceTimersByTimeAsync(1000)

    expect(adapter.writes).toHaveLength(0)
    expect(engine.applyExternal()).toBeNull()
  })

  it('is idempotent', () => {
    const adapter = recordingAdapter('/')
    const engine = createEngine<State>({
      storeName: 'filters',
      specs,
      adapter,
      scope: getScope(adapter),
    })
    engine.dispose()
    expect(() => engine.dispose()).not.toThrow()
  })
})
