import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRegistry } from '../registry.js'

describe('createRegistry', () => {
  it('records the owner of each claimed key', () => {
    const registry = createRegistry()
    registry.claim(['q', 'page'], 'filters')
    expect(registry.owner('q')).toBe('filters')
  })

  it('throws in dev when two stores claim one key, naming both', () => {
    const registry = createRegistry()
    registry.claim(['page'], 'products')
    expect(() => registry.claim(['page'], 'users')).toThrow(/"products".*"users"/)
  })

  it('lets one store re-claim its own keys', () => {
    const registry = createRegistry()
    registry.claim(['page'], 'products')
    expect(() => registry.claim(['page'], 'products')).not.toThrow()
  })

  it('frees the keys on release, so a remount can re-claim them', () => {
    const registry = createRegistry()
    const release = registry.claim(['page'], 'products')
    release()
    expect(registry.owner('page')).toBeUndefined()
    expect(() => registry.claim(['page'], 'users')).not.toThrow()
  })

  it('warns instead of throwing in production, so a collision never takes down the app', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = createRegistry()
    registry.claim(['page'], 'products')

    expect(() => registry.claim(['page'], 'users')).not.toThrow()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('two stores claim the param "page"'))
    // The first claimant keeps the key rather than being silently displaced.
    expect(registry.owner('page')).toBe('products')
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
