import { afterEach, describe, expect, it, vi } from 'vitest'
import { fail, guard, warn } from '../dev.js'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('warn', () => {
  it('names the library so a console line is traceable', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warn('two stores claim "page"')
    expect(spy).toHaveBeenCalledWith('[zustand-url-sync] two stores claim "page"')
  })

  it('says nothing in a production build', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warn('should not appear')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('fail', () => {
  it('throws a prefixed error', () => {
    expect(() => fail('duplicate key')).toThrow('[zustand-url-sync] duplicate key')
  })
})

describe('guard', () => {
  it('returns the value when nothing goes wrong', () => {
    expect(guard('read', () => 42)).toBe(42)
  })

  it('swallows the error and warns in dev', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = guard('write', () => {
      throw new Error('quota exceeded')
    })
    expect(result).toBeUndefined()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('quota exceeded'))
  })

  it('swallows the error silently in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      guard('write', () => {
        throw new Error('quota exceeded')
      }),
    ).toBeUndefined()
    expect(spy).not.toHaveBeenCalled()
  })
})
