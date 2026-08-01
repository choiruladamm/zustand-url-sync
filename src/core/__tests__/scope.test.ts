import { describe, expect, it } from 'vitest'
import { memoryAdapter } from '../../adapters/memory/index.js'
import { getScope } from '../scope.js'

describe('getScope', () => {
  it('gives one queue and registry per adapter instance', () => {
    const adapter = memoryAdapter('/')
    expect(getScope(adapter)).toBe(getScope(adapter))
  })

  it('keeps two adapters completely separate — this is the SSR guarantee', () => {
    const a = getScope(memoryAdapter('/?q=one'))
    const b = getScope(memoryAdapter('/?q=two'))

    expect(a).not.toBe(b)
    a.registry.claim(['q'], 'request-a')
    expect(b.registry.owner('q')).toBeUndefined()
    expect(() => b.registry.claim(['q'], 'request-b')).not.toThrow()
  })
})
