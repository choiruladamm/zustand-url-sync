import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingAdapter } from '../../../test/support/recording-adapter.js'
import { memoryAdapter } from '../../adapters/memory/index.js'
import { createQueue } from '../queue.js'
import type { UrlAdapter } from '../types.js'

const THROTTLE = { limiter: { kind: 'throttle' as const, ms: 50 } }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('coalescing', () => {
  it('turns two stores writing in one tick into one write with both keys', async () => {
    const adapter = recordingAdapter('/products')
    const queue = createQueue(adapter)

    // Leading edge consumes the first write; the two below land in the trailing batch together.
    queue.enqueue('warmup', 'x', THROTTLE)
    adapter.clearWrites()

    queue.enqueue('q', 'hello', THROTTLE)
    queue.enqueue('sort', 'name', THROTTLE)
    await vi.advanceTimersByTimeAsync(50)

    expect(adapter.writes).toHaveLength(1)
    const written = adapter.writes[0]?.params as URLSearchParams
    expect(written.get('q')).toBe('hello')
    expect(written.get('sort')).toBe('name')
  })

  it('applies diffs onto the live URL, so a foreign param survives', async () => {
    const adapter = memoryAdapter('/products?theirs=1')
    const queue = createQueue(adapter)

    queue.enqueue('ours', 'a', THROTTLE)
    await vi.advanceTimersByTimeAsync(0)

    expect(adapter.url()).toBe('/products?theirs=1&ours=a')
  })

  it('keeps the last value when one key is enqueued twice before a flush', async () => {
    const adapter = memoryAdapter('/')
    const queue = createQueue(adapter)

    queue.enqueue('q', 'a', THROTTLE)
    queue.enqueue('q', 'b', THROTTLE)
    queue.enqueue('q', 'c', THROTTLE)
    await vi.advanceTimersByTimeAsync(50)

    expect(adapter.read().get('q')).toBe('c')
  })

  it('does not reorder existing params when updating one of them', async () => {
    const adapter = memoryAdapter('/?a=1&b=2&c=3')
    const queue = createQueue(adapter)

    queue.enqueue('b', '9', THROTTLE)
    await vi.advanceTimersByTimeAsync(0)

    expect(adapter.read().toString()).toBe('a=1&b=9&c=3')
  })

  it('deletes a key enqueued as undefined', async () => {
    const adapter = memoryAdapter('/?a=1&b=2')
    const queue = createQueue(adapter)

    queue.enqueue('a', undefined, THROTTLE)
    await vi.advanceTimersByTimeAsync(0)

    expect(adapter.read().toString()).toBe('b=2')
  })

  it('writes a repeated param as several slots', async () => {
    const adapter = memoryAdapter('/')
    const queue = createQueue(adapter)

    queue.enqueue('tags', ['a', 'b'], THROTTLE)
    await vi.advanceTimersByTimeAsync(0)

    expect(adapter.read().getAll('tags')).toEqual(['a', 'b'])
  })
})

describe('write options', () => {
  it('makes the whole batch a push if any key asks for one', async () => {
    const adapter = recordingAdapter('/')
    const queue = createQueue(adapter)

    queue.enqueue('a', '1', { ...THROTTLE, history: 'replace' })
    queue.enqueue('b', '2', { ...THROTTLE, history: 'push' })
    await vi.advanceTimersByTimeAsync(0)

    expect(adapter.writes[0]?.options.history).toBe('push')
  })

  it('makes the whole batch non-shallow if any key asks for it', async () => {
    const adapter = recordingAdapter('/')
    const queue = createQueue(adapter)

    queue.enqueue('a', '1', THROTTLE)
    queue.enqueue('b', '2', { ...THROTTLE, shallow: false })
    await vi.advanceTimersByTimeAsync(0)

    expect(adapter.writes[0]?.options.shallow).toBe(false)
  })
})

describe('async adapters', () => {
  const deferredAdapter = (): UrlAdapter & { settle(): void; calls: URLSearchParams[] } => {
    let params = new URLSearchParams()
    const calls: URLSearchParams[] = []
    let resolvePending: (() => void) | undefined
    return {
      read: () => new URLSearchParams(params),
      write(next) {
        calls.push(new URLSearchParams(next))
        return new Promise<void>((resolve) => {
          resolvePending = () => {
            params = new URLSearchParams(next)
            resolve()
          }
        })
      },
      subscribe: () => () => {},
      settle() {
        resolvePending?.()
        resolvePending = undefined
      },
      calls,
    }
  }

  it('never lets two writes interleave', async () => {
    const adapter = deferredAdapter()
    const queue = createQueue(adapter)

    queue.enqueue('a', '1', THROTTLE)
    await vi.advanceTimersByTimeAsync(0)
    expect(adapter.calls).toHaveLength(1)

    queue.enqueue('b', '2', THROTTLE)
    await vi.advanceTimersByTimeAsync(1000)
    expect(adapter.calls).toHaveLength(1)

    adapter.settle()
    await vi.advanceTimersByTimeAsync(1000)
    expect(adapter.calls).toHaveLength(2)
    expect(adapter.calls[1]?.get('a')).toBe('1')
    expect(adapter.calls[1]?.get('b')).toBe('2')
  })

  it('resolves flush() only after the navigation settles', async () => {
    const adapter = deferredAdapter()
    const queue = createQueue(adapter)
    let resolved = false

    queue.enqueue('a', '1', THROTTLE)
    void queue.flush().then(() => {
      resolved = true
    })

    await vi.advanceTimersByTimeAsync(1000)
    expect(resolved).toBe(false)

    adapter.settle()
    await vi.advanceTimersByTimeAsync(0)
    expect(resolved).toBe(true)
  })
})

describe('flush and settled', () => {
  it('flush() bypasses the limiter', async () => {
    const adapter = memoryAdapter('/')
    const queue = createQueue(adapter)

    queue.enqueue('warmup', 'x', THROTTLE)
    await vi.advanceTimersByTimeAsync(0)
    queue.enqueue('q', 'now', THROTTLE)

    const params = await queue.flush()
    expect(params.get('q')).toBe('now')
  })

  it('settled() waits for the scheduled write instead of forcing one', async () => {
    const adapter = recordingAdapter('/')
    const queue = createQueue(adapter)

    queue.enqueue('warmup', 'x', THROTTLE)
    await vi.advanceTimersByTimeAsync(0)
    adapter.clearWrites()

    queue.enqueue('q', 'later', THROTTLE)
    const settled = queue.settled()
    expect(adapter.writes).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(50)
    expect((await settled).get('q')).toBe('later')
    expect(adapter.writes).toHaveLength(1)
  })

  it('settled() resolves immediately when nothing is pending', async () => {
    const queue = createQueue(memoryAdapter('/?a=1'))
    expect((await queue.settled()).get('a')).toBe('1')
  })
})

describe('pause, resume, dispose', () => {
  it('holds writes while paused and releases them on resume', async () => {
    const adapter = recordingAdapter('/')
    const queue = createQueue(adapter)

    queue.pause()
    queue.enqueue('q', 'held', THROTTLE)
    await vi.advanceTimersByTimeAsync(1000)
    expect(adapter.writes).toHaveLength(0)

    queue.resume()
    await vi.advanceTimersByTimeAsync(1000)
    expect(adapter.read().get('q')).toBe('held')
  })

  it('stops accepting work once disposed', async () => {
    const adapter = recordingAdapter('/')
    const queue = createQueue(adapter)

    queue.dispose()
    queue.enqueue('q', 'ignored', THROTTLE)
    await vi.advanceTimersByTimeAsync(1000)
    expect(adapter.writes).toHaveLength(0)
  })
})

describe('failure degrades', () => {
  it('survives an adapter whose write throws', async () => {
    const adapter: UrlAdapter = {
      read: () => new URLSearchParams(),
      write: () => {
        throw new Error('router exploded')
      },
      subscribe: () => () => {},
    }
    const queue = createQueue(adapter)
    queue.enqueue('q', 'x', THROTTLE)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await queue.flush()).toBeInstanceOf(URLSearchParams)
  })

  it('survives an adapter whose write rejects', async () => {
    const adapter: UrlAdapter = {
      read: () => new URLSearchParams(),
      write: () => Promise.reject(new Error('navigation cancelled')),
      subscribe: () => () => {},
    }
    const queue = createQueue(adapter)
    queue.enqueue('q', 'x', THROTTLE)
    await expect(queue.flush()).resolves.toBeInstanceOf(URLSearchParams)
  })
})

describe('length budget', () => {
  it('drops the lowest-priority key when the URL overflows', async () => {
    const adapter = memoryAdapter('/')
    const queue = createQueue(adapter)
    queue.declare([
      { key: 'keep', priority: 10 },
      { key: 'drop', priority: 0 },
    ])
    queue.setMaxUrlLength(40)

    queue.enqueue('keep', 'x'.repeat(20), THROTTLE)
    queue.enqueue('drop', 'y'.repeat(20), THROTTLE)
    await vi.advanceTimersByTimeAsync(0)

    expect(adapter.read().get('keep')).not.toBeNull()
    expect(adapter.read().get('drop')).toBeNull()
  })
})

describe('declared keys', () => {
  it('ignores a duplicate declaration and releases only its own', async () => {
    const adapter = memoryAdapter('/')
    const queue = createQueue(adapter)

    const releaseFirst = queue.declare([{ key: 'a', priority: 0 }])
    queue.declare([{ key: 'a', priority: 9 }])
    releaseFirst()

    queue.setMaxUrlLength(20)
    queue.enqueue('a', 'x'.repeat(40), THROTTLE)
    await vi.advanceTimersByTimeAsync(0)

    // Released, so no longer ours to drop — a long URL beats trampling someone else's param.
    expect(adapter.read().get('a')).not.toBeNull()
  })

  it('keeps the smallest maxUrlLength any store asked for', async () => {
    const adapter = memoryAdapter('/')
    const queue = createQueue(adapter)
    queue.declare([{ key: 'a', priority: 0 }])
    queue.setMaxUrlLength(2000)
    queue.setMaxUrlLength(20)
    queue.setMaxUrlLength(500)

    queue.enqueue('a', 'x'.repeat(40), THROTTLE)
    await vi.advanceTimersByTimeAsync(0)
    expect(adapter.read().get('a')).toBeNull()
  })
})

describe('edge cases', () => {
  it('resume is a no-op when the queue was never paused', async () => {
    const adapter = recordingAdapter('/')
    const queue = createQueue(adapter)
    queue.resume()
    await vi.advanceTimersByTimeAsync(1000)
    expect(adapter.writes).toHaveLength(0)
  })

  it('flush resolves the waiter after a pause is lifted', async () => {
    const adapter = memoryAdapter('/')
    const queue = createQueue(adapter)
    queue.pause()
    queue.enqueue('q', 'held', THROTTLE)

    let resolved = false
    void queue.flush().then(() => {
      resolved = true
    })
    await vi.advanceTimersByTimeAsync(1000)
    expect(resolved).toBe(false)

    queue.resume()
    await vi.advanceTimersByTimeAsync(1000)
    expect(resolved).toBe(true)
  })

  it('treats an adapter whose read throws as an empty query', async () => {
    const adapter: UrlAdapter = {
      read: () => {
        throw new Error('detached')
      },
      write: () => {},
      subscribe: () => () => {},
    }
    const queue = createQueue(adapter)
    queue.enqueue('q', 'x', THROTTLE)
    expect((await queue.flush()).get('q')).toBe('x')
  })

  it('carries the scroll option when a key asks for it', async () => {
    const adapter = recordingAdapter('/')
    const queue = createQueue(adapter)
    queue.enqueue('a', '1', { ...THROTTLE, scroll: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(adapter.writes[0]?.options.scroll).toBe(true)
  })

  it('flush after dispose resolves rather than hanging', async () => {
    const queue = createQueue(memoryAdapter('/?a=1'))
    queue.dispose()
    expect((await queue.flush()).get('a')).toBe('1')
    expect((await queue.settled()).get('a')).toBe('1')
  })
})
