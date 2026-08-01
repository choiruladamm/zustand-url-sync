import type { Limiter } from './types.js'

/** Safari throws `SecurityError` past ~100 history calls / 30s. 50ms is the floor. */
export const MIN_DELAY_MS = 50

export function effectiveDelay(limiter: Limiter, rateLimitFactor = 1): number {
  return Math.max(MIN_DELAY_MS, limiter.ms) * Math.max(1, rateLimitFactor)
}

/**
 * The schedule a batch runs on, given every limiter that contributed a key to it.
 *
 * A batch is as expensive as its most expensive member: the write options merge the same way
 * (one `push` makes the whole batch a push), so one debounced key debounces the batch. Otherwise
 * a `debounce(300)` key would be dragged onto a 50ms throttle by an unrelated `q`.
 */
export function strictestLimiter(limiters: readonly Limiter[]): Limiter | undefined {
  let winner: Limiter | undefined
  for (const limiter of limiters) {
    if (!winner) {
      winner = limiter
      continue
    }
    if (winner.kind === 'debounce' && limiter.kind === 'throttle') continue
    if (winner.kind === 'throttle' && limiter.kind === 'debounce') {
      winner = limiter
      continue
    }
    if (limiter.ms > winner.ms) winner = limiter
  }
  return winner
}

export type Scheduler = {
  /** Re-schedules the pending run; the latest `limiter` wins. */
  schedule(limiter: Limiter | undefined, run: () => void): void
  cancel(): void
  /** Runs a pending callback now, if there is one. */
  flushNow(): void
}

/**
 * `throttle` fires on the leading edge and coalesces the trailing one; `debounce` is trailing
 * only and its timer restarts on every `schedule`.
 */
export function createScheduler(rateLimitFactor = 1): Scheduler {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: (() => void) | undefined
  let lastRunAt = Number.NEGATIVE_INFINITY

  const fire = (): void => {
    timer = undefined
    const run = pending
    pending = undefined
    if (!run) return
    lastRunAt = Date.now()
    run()
  }

  const clear = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  return Object.freeze({
    schedule(limiter, run) {
      pending = run
      if (!limiter) {
        clear()
        fire()
        return
      }
      const delay = effectiveDelay(limiter, rateLimitFactor)
      if (limiter.kind === 'throttle') {
        const waited = Date.now() - lastRunAt
        // The leading edge waits zero, not zero *time*: firing synchronously would let the first
        // store in a tick write before the second one has enqueued, which is the C2 bug wearing a
        // different hat. A 0ms timer coalesces the tick and still skips the throttle window.
        if (waited >= delay) {
          if (timer === undefined) timer = setTimeout(fire, 0)
          return
        }
        if (timer === undefined) timer = setTimeout(fire, delay - waited)
        return
      }
      clear()
      timer = setTimeout(fire, delay)
    },
    cancel() {
      clear()
      pending = undefined
    },
    flushNow() {
      clear()
      fire()
    },
  })
}
