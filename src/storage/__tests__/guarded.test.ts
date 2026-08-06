import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStorage } from '../../../test/support/memory-storage.js'
import { guardStorage, webStorage } from '../guarded.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('guardStorage', () => {
  it('degrades to absent when reading the storage property itself throws', () => {
    const guarded = guardStorage(() => {
      throw new DOMException('SecurityError')
    })

    expect(guarded).toBeUndefined()
  })

  it('degrades to absent when there is no storage at all', () => {
    expect(guardStorage(() => undefined)).toBeUndefined()
  })

  it('rejects a backend that is not a storage', () => {
    // A user handing us the wrong object must fail here, not on the first read.
    expect(guardStorage(() => ({}) as never)).toBeUndefined()
  })

  it('reports a throwing read as an absent value', () => {
    const guarded = guardStorage(() => memoryStorage({ failReads: true }))

    expect(guarded?.getItem('anything')).toBeNull()
  })

  it('drops a throwing write instead of propagating it', () => {
    const inner = memoryStorage({ failWrites: true })
    const guarded = guardStorage(() => inner)

    expect(() => guarded?.setItem('k', 'v')).not.toThrow()
    expect(inner.entries.size).toBe(0)
  })

  it('drops a throwing remove', () => {
    const inner = memoryStorage()
    inner.removeItem = () => {
      throw new Error('nope')
    }
    const guarded = guardStorage(() => inner)

    expect(() => guarded?.removeItem('k')).not.toThrow()
  })

  it('round-trips through a working backend', () => {
    const guarded = guardStorage(() => memoryStorage())
    guarded?.setItem('k', 'v')

    expect(guarded?.getItem('k')).toBe('v')
    guarded?.removeItem('k')
    expect(guarded?.getItem('k')).toBeNull()
  })

  it('stays synchronous, so a failure has no promise to go unhandled', () => {
    const guarded = guardStorage(() => memoryStorage({ failReads: true, failWrites: true }))

    expect(guarded?.getItem('k')).toBeNull()
    expect(guarded?.setItem('k', 'v')).toBeUndefined()
  })
})

describe('webStorage', () => {
  it('resolves the browser backends', () => {
    expect(webStorage('local')).toBeDefined()
    expect(webStorage('session')).toBeDefined()
  })

  it('warns once when the browser has storage switched off', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })

    expect(webStorage('local')).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('localStorage is unavailable'))
  })
})
