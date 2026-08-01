import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScheduler, effectiveDelay, MIN_DELAY_MS, strictestLimiter } from '../limiter.js'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('effectiveDelay', () => {
  it('clamps below the browser history floor', () => {
    expect(effectiveDelay({ kind: 'throttle', ms: 5 })).toBe(MIN_DELAY_MS)
  })

  it('multiplies by the adapter rate limit factor', () => {
    expect(effectiveDelay({ kind: 'throttle', ms: 50 }, 2.4)).toBe(120)
  })
})

describe('strictestLimiter', () => {
  it('lets one debounced key debounce the whole batch', () => {
    expect(
      strictestLimiter([
        { kind: 'throttle', ms: 50 },
        { kind: 'debounce', ms: 300 },
      ]),
    ).toEqual({ kind: 'debounce', ms: 300 })
  })

  it('takes the longest delay among limiters of the same kind', () => {
    expect(
      strictestLimiter([
        { kind: 'throttle', ms: 50 },
        { kind: 'throttle', ms: 200 },
      ]),
    ).toEqual({ kind: 'throttle', ms: 200 })
  })

  it('is undefined for an empty batch, which means flush now', () => {
    expect(strictestLimiter([])).toBeUndefined()
  })
})

describe('throttle', () => {
  it('skips the window on the leading edge but still coalesces the tick', () => {
    const scheduler = createScheduler()
    const run = vi.fn()

    // Three schedules in one tick — a leading edge that fired synchronously would produce two
    // writes here, which is the multi-store bug in miniature.
    scheduler.schedule({ kind: 'throttle', ms: 50 }, run)
    scheduler.schedule({ kind: 'throttle', ms: 50 }, run)
    scheduler.schedule({ kind: 'throttle', ms: 50 }, run)
    expect(run).not.toHaveBeenCalled()

    vi.advanceTimersByTime(0)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('coalesces the trailing edge inside the window', () => {
    const scheduler = createScheduler()
    const run = vi.fn()

    scheduler.schedule({ kind: 'throttle', ms: 50 }, run)
    vi.advanceTimersByTime(0)
    expect(run).toHaveBeenCalledTimes(1)

    scheduler.schedule({ kind: 'throttle', ms: 50 }, run)
    scheduler.schedule({ kind: 'throttle', ms: 50 }, run)
    vi.advanceTimersByTime(49)
    expect(run).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('spaces writes at least 120ms apart under the Safari factor', () => {
    const scheduler = createScheduler(2.4)
    const at: number[] = []
    const run = (): void => {
      at.push(Date.now())
    }

    scheduler.schedule({ kind: 'throttle', ms: 50 }, run)
    vi.advanceTimersByTime(0)
    expect(at).toHaveLength(1)

    scheduler.schedule({ kind: 'throttle', ms: 50 }, run)
    vi.advanceTimersByTime(119)
    expect(at).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(at).toHaveLength(2)
    expect((at[1] as number) - (at[0] as number)).toBeGreaterThanOrEqual(120)
  })
})

describe('debounce', () => {
  it('is trailing only and restarts on every schedule', () => {
    const scheduler = createScheduler()
    const run = vi.fn()

    scheduler.schedule({ kind: 'debounce', ms: 300 }, run)
    vi.advanceTimersByTime(299)
    expect(run).not.toHaveBeenCalled()

    scheduler.schedule({ kind: 'debounce', ms: 300 }, run)
    vi.advanceTimersByTime(299)
    expect(run).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('control', () => {
  it('cancel drops the pending run', () => {
    const scheduler = createScheduler()
    const run = vi.fn()
    scheduler.schedule({ kind: 'debounce', ms: 300 }, run)
    scheduler.cancel()
    vi.advanceTimersByTime(1000)
    expect(run).not.toHaveBeenCalled()
  })

  it('flushNow runs the pending callback immediately', () => {
    const scheduler = createScheduler()
    const run = vi.fn()
    scheduler.schedule({ kind: 'debounce', ms: 300 }, run)
    scheduler.flushNow()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('an absent limiter runs synchronously', () => {
    const scheduler = createScheduler()
    const run = vi.fn()
    scheduler.schedule(undefined, run)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
