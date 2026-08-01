import { describe, expect, it, vi } from 'vitest'
import { memoryAdapter } from '../../adapters/memory/index.js'
import { createUrlSource, URL_SOURCE_ID } from '../url-source.js'

describe('createUrlSource', () => {
  it('is the highest-priority source, so the URL always wins', () => {
    const source = createUrlSource(memoryAdapter('/'))
    expect(source.priority).toBe(0)
    expect(source.id).toBe(URL_SOURCE_ID)
  })

  it('reads one slot as a string and several as a list', () => {
    const source = createUrlSource(memoryAdapter('/?q=hi&t=1&t=2'))
    expect(source.read('q')).toBe('hi')
    expect(source.read('t')).toEqual(['1', '2'])
    expect(source.read('missing')).toBeUndefined()
  })

  it('does not write — the queue owns URL writes', () => {
    const adapter = memoryAdapter('/')
    createUrlSource(adapter).write(new Map([['q', 'ignored']]))
    expect(adapter.url()).toBe('/')
  })

  it('forwards subscriptions to the adapter', () => {
    const adapter = memoryAdapter('/')
    const listener = vi.fn()
    const unsubscribe = createUrlSource(adapter).subscribe?.(listener)

    adapter.navigate('/next')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe?.()
    adapter.navigate('/again')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
