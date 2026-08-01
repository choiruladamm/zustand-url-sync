import { describe, expect, it, vi } from 'vitest'
import { memoryAdapter } from '../index.js'

const options = { history: 'replace' as const, shallow: true, scroll: false }

describe('memoryAdapter', () => {
  it('reads the query out of the initial URL', () => {
    expect(memoryAdapter('/products?q=hi').read().get('q')).toBe('hi')
  })

  it('replaces in place by default', () => {
    const adapter = memoryAdapter('/products')
    adapter.write(new URLSearchParams({ q: 'a' }), options)
    adapter.write(new URLSearchParams({ q: 'b' }), options)
    expect(adapter.entries()).toEqual(['/products?q=b'])
  })

  it('pushes a new history entry when asked', () => {
    const adapter = memoryAdapter('/products')
    adapter.write(new URLSearchParams({ q: 'a' }), { ...options, history: 'push' })
    expect(adapter.entries()).toEqual(['/products', '/products?q=a'])
  })

  it('drops the query entirely when nothing is left', () => {
    const adapter = memoryAdapter('/products?q=a')
    adapter.write(new URLSearchParams(), options)
    expect(adapter.url()).toBe('/products')
  })

  it('does not notify on our own write, the way pushState does not fire popstate', () => {
    const adapter = memoryAdapter('/')
    const listener = vi.fn()
    adapter.subscribe(listener)
    adapter.write(new URLSearchParams({ q: 'a' }), options)
    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies on back and forward', () => {
    const adapter = memoryAdapter('/a')
    const listener = vi.fn()
    adapter.subscribe(listener)

    adapter.write(new URLSearchParams({ q: '1' }), { ...options, history: 'push' })
    adapter.back()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(adapter.url()).toBe('/a')

    adapter.forward()
    expect(adapter.url()).toBe('/a?q=1')
  })

  it('ignores back at the start and forward at the end of the stack', () => {
    const adapter = memoryAdapter('/a')
    const listener = vi.fn()
    adapter.subscribe(listener)
    adapter.back()
    adapter.forward()
    expect(listener).not.toHaveBeenCalled()
  })

  it('drops the forward stack on a push, like a real history', () => {
    const adapter = memoryAdapter('/a')
    adapter.write(new URLSearchParams({ q: '1' }), { ...options, history: 'push' })
    adapter.back()
    adapter.write(new URLSearchParams({ q: '2' }), { ...options, history: 'push' })
    expect(adapter.entries()).toEqual(['/a', '/a?q=2'])
  })

  it('exposes the pathname for the route-change policy', () => {
    expect(memoryAdapter('/users?q=1').pathname?.()).toBe('/users')
  })

  it('stops notifying after unsubscribe', () => {
    const adapter = memoryAdapter('/a')
    const listener = vi.fn()
    adapter.subscribe(listener)()
    adapter.navigate('/b')
    expect(listener).not.toHaveBeenCalled()
  })

  it('emits readable commas rather than %2C', () => {
    const adapter = memoryAdapter('/')
    adapter.write(new URLSearchParams({ tags: 'a,b' }), options)
    expect(adapter.url()).toBe('/?tags=a,b')
  })
})
