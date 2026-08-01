import { guard, warn } from './dev.js'
import { createScheduler, strictestLimiter } from './limiter.js'
import { applyUrlBudget, type OwnedKey } from './overflow.js'
import { applyDiff, serializeParams } from './params.js'
import type { AdapterWriteOptions, Limiter, RawValue, UrlAdapter } from './types.js'

export const DEFAULT_MAX_URL_LENGTH = 2000

export type EnqueueOptions = {
  limiter?: Limiter | undefined
  history?: 'push' | 'replace' | undefined
  shallow?: boolean | undefined
  scroll?: boolean | undefined
  immediate?: boolean | undefined
}

export type Queue = {
  /** Declares the keys this queue owns, in declaration order, for the C10 drop ordering. */
  declare(keys: readonly OwnedKey[]): () => void
  enqueue(key: string, raw: RawValue | undefined, opts?: EnqueueOptions): void
  /** Forces the pending batch out now; resolves with what was written. */
  flush(): Promise<URLSearchParams>
  /** Resolves when the pending batch lands on its own schedule. Does not force it. */
  settled(): Promise<URLSearchParams>
  pause(): void
  resume(): void
  /** The serialized form of our own last write — the feedback guard's comparison key. */
  lastWritten(): string | undefined
  setMaxUrlLength(value: number): void
  dispose(): void
}

type Batch = {
  history: 'push' | 'replace'
  shallow: boolean
  scroll: boolean
}

const freshBatch = (): Batch => ({ history: 'replace', shallow: true, scroll: false })

/**
 * One queue per adapter instance. Stores sharing an adapter are exactly the stores
 * sharing a URL, so that is the set that must coalesce; and on a server each request builds its
 * own adapter, so nothing crosses a request.
 *
 * The queue holds **key diffs, never snapshots**. Two stores flushing in the same tick from their
 * own snapshots is precisely how params get lost: at flush time the live URL is re-read and the
 * diffs are applied onto it.
 */
export function createQueue(adapter: UrlAdapter): Queue {
  const scheduler = createScheduler(adapter.rateLimitFactor)
  const pending = new Map<string, RawValue | undefined>()
  const owned: OwnedKey[] = []
  let limiters: Limiter[] = []
  let batch = freshBatch()
  let waiters: Array<(params: URLSearchParams) => void> = []
  let maxUrlLength = DEFAULT_MAX_URL_LENGTH
  let inFlight = false
  let paused = false
  let disposed = false
  let last: string | undefined

  const read = (): URLSearchParams =>
    guard('adapter.read', () => adapter.read()) ?? new URLSearchParams()

  const settle = (
    targets: Array<(params: URLSearchParams) => void>,
    params: URLSearchParams,
  ): void => {
    for (const resolve of targets) resolve(params)
  }

  const scheduleFlush = (immediate: boolean): void => {
    if (disposed) return
    scheduler.schedule(immediate ? undefined : strictestLimiter(limiters), () => {
      doFlush()
    })
  }

  function doFlush(): void {
    if (disposed || paused || inFlight) return

    if (pending.size === 0) {
      if (waiters.length === 0) return
      const targets = waiters
      waiters = []
      settle(targets, read())
      return
    }

    const diff = new Map(pending)
    const options: AdapterWriteOptions = { ...batch }
    const targets = waiters
    pending.clear()
    limiters = []
    batch = freshBatch()
    waiters = []

    const reserved = guard('adapter.pathname', () => adapter.pathname?.().length ?? 0) ?? 0
    const { params } = applyUrlBudget(applyDiff(read(), diff), owned, maxUrlLength, reserved)
    last = serializeParams(params)

    inFlight = true
    const written = guard('adapter.write', () => adapter.write(params, options))
    Promise.resolve(written)
      .catch((error: unknown) => {
        if (process.env.NODE_ENV !== 'production') {
          warn(`adapter.write rejected and was ignored: ${String(error)}`)
        }
      })
      .then(() => {
        inFlight = false
        settle(targets, params)
        // Anything enqueued while the navigation was settling goes out as the next batch —
        // two pushes can never interleave.
        if (pending.size > 0 || waiters.length > 0) scheduleFlush(false)
      })
  }

  return Object.freeze({
    declare(keys) {
      for (const key of keys) {
        if (!owned.some((entry) => entry.key === key.key)) owned.push(key)
      }
      return () => {
        for (const key of keys) {
          const at = owned.findIndex((entry) => entry.key === key.key)
          if (at !== -1) owned.splice(at, 1)
        }
      }
    },
    enqueue(key, raw, opts = {}) {
      if (disposed) return
      pending.set(key, raw)
      if (opts.limiter) limiters.push(opts.limiter)
      // A batch is as expensive as its most expensive member.
      if (opts.history === 'push') batch.history = 'push'
      if (opts.shallow === false) batch.shallow = false
      if (opts.scroll === true) batch.scroll = true
      scheduleFlush(opts.immediate === true)
    },
    flush() {
      if (disposed) return Promise.resolve(read())
      const promise = new Promise<URLSearchParams>((resolve) => waiters.push(resolve))
      scheduler.cancel()
      doFlush()
      return promise
    },
    settled() {
      if (disposed || (pending.size === 0 && !inFlight)) return Promise.resolve(read())
      return new Promise<URLSearchParams>((resolve) => waiters.push(resolve))
    },
    pause() {
      paused = true
      scheduler.cancel()
    },
    resume() {
      if (!paused) return
      paused = false
      if (pending.size > 0 || waiters.length > 0) scheduleFlush(false)
    },
    lastWritten() {
      return last
    },
    setMaxUrlLength(value) {
      maxUrlLength = Math.min(maxUrlLength, value)
    },
    dispose() {
      disposed = true
      scheduler.cancel()
      pending.clear()
      const targets = waiters
      waiters = []
      settle(targets, read())
    },
  })
}
