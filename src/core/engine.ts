import { parseWith, serializeWith, valuesEqual } from './codec-runtime.js'
import { fail, warn } from './dev.js'
import { MIN_DELAY_MS } from './limiter.js'
import { applyDiff, readRaw, serializeParams } from './params.js'
import { resolveInitial as resolvePrecedence } from './precedence.js'
import { DEFAULT_MAX_URL_LENGTH, type EnqueueOptions } from './queue.js'
import type { Scope } from './scope.js'
import {
  type AdapterWriteOptions,
  INVALID,
  type Limiter,
  type OnInvalid,
  type ParamEntry,
  type ParamSpec,
  type RawValue,
  type RouteChangePolicy,
  type Source,
  type UrlAdapter,
} from './types.js'
import { createUrlSource } from './url-source.js'

export type CommitOptions = Partial<AdapterWriteOptions> & { limit?: 'immediate' }

export type Engine<S extends object> = {
  resolveInitial(defaults: S): Partial<S>
  onStateChange(next: S): void
  /** `null` when nothing changed — including when the change was our own write. */
  applyExternal(): Partial<S> | null
  /** Applies an arbitrary query string, as if the adapter had reported it. `null` if it changes nothing. */
  applyParams(params: URLSearchParams): Partial<S> | null
  flush(): Promise<URLSearchParams>
  settled(): Promise<URLSearchParams>
  commit<R>(fn: () => R, o?: CommitOptions): Promise<URLSearchParams>
  toSearchParams(state: S): URLSearchParams
  reset(): Partial<S>
  pause(): void
  resume(): void
  dispose(): void
}

export type EngineOptions = {
  storeName: string
  specs: Readonly<Record<string, ParamSpec>>
  adapter: UrlAdapter
  scope: Scope
  /** Sources beyond the URL — the storage tier lands here, at priority 1. */
  sources?: readonly Source[]
  prefix?: string | undefined
  maxUrlLength?: number | undefined
  onRouteChange?: RouteChangePolicy | undefined
  onInvalid?: OnInvalid | undefined
  /** Called with the patch produced by an external URL change (popstate, router navigation). */
  onExternal?: ((patch: Record<string, unknown>) => void) | undefined
}

/** The limiter follows what the write costs, not what the value is. */
function defaultLimiter(spec: ParamSpec): Limiter {
  const expensive = spec.history === 'push' || spec.shallow === false
  return expensive ? { kind: 'debounce', ms: 300 } : { kind: 'throttle', ms: MIN_DELAY_MS }
}

function buildEntries(
  specs: Readonly<Record<string, ParamSpec>>,
  prefix: string,
  storeName: string,
): ParamEntry[] {
  return Object.entries(specs).map(([stateKey, spec]) => {
    if (!('default' in spec)) {
      fail(`"${stateKey}" in store "${storeName}" has no .default() — precedence needs one.`)
    }
    return { stateKey, paramKey: `${prefix}${stateKey}`, spec }
  })
}

export function createEngine<S extends object>(options: EngineOptions): Engine<S> {
  const { adapter, scope, storeName, onInvalid, onExternal } = options
  const policy: RouteChangePolicy = options.onRouteChange ?? 'keep'
  const entries = buildEntries(options.specs, options.prefix ?? '', storeName)
  const writable = entries.filter((entry) => entry.spec.serverOnly !== true)
  const sources: Source[] = [createUrlSource(adapter), ...(options.sources ?? [])]

  if (process.env.NODE_ENV !== 'production') {
    for (const entry of entries) {
      const ms = entry.spec.limiter?.ms
      if (ms !== undefined && ms < MIN_DELAY_MS) {
        warn(
          `"${entry.paramKey}" asks for ${ms}ms but the browser history rate limit floor is ` +
            `${MIN_DELAY_MS}ms; it will be clamped.`,
        )
      }
    }
  }

  const { queue, registry } = scope
  const releaseKeys = registry.claim(
    entries.map((entry) => entry.paramKey),
    storeName,
  )
  const releaseOwned = queue.declare(
    writable.map((entry) => ({ key: entry.paramKey, priority: entry.spec.priority ?? 0 })),
  )
  queue.setMaxUrlLength(options.maxUrlLength ?? DEFAULT_MAX_URL_LENGTH)

  /** What the engine believes the store holds. External changes diff against this, not `prev`. */
  const known = new Map<string, unknown>()
  let override: CommitOptions | undefined
  let lastPathname = readPathname()
  let disposed = false

  function readPathname(): string | undefined {
    try {
      return adapter.pathname?.()
    } catch {
      return undefined
    }
  }

  function enqueueOptions(entry: ParamEntry): EnqueueOptions {
    const spec = entry.spec
    const history = override?.history ?? spec.history ?? 'replace'
    const shallow = override?.shallow ?? spec.shallow ?? true
    const scroll = override?.scroll ?? spec.scroll ?? false
    // `limit: 'immediate'` is deliberately not forwarded per key. `commit` flushes once when the
    // callback returns; flushing per enqueue would turn one commit of three sets into three
    // history entries, which is the footgun the override exists to avoid.
    const limiter = spec.limiter ?? defaultLimiter({ ...spec, history, shallow })
    return { limiter, history, shallow, scroll }
  }

  function push(entry: ParamEntry, raw: RawValue | undefined): void {
    queue.enqueue(entry.paramKey, raw, enqueueOptions(entry))
  }

  function valueFromUrl(entry: ParamEntry, params: URLSearchParams): unknown {
    const raw = readRaw(params, entry.paramKey)
    // C5: a key absent from the new URL reverts to its default, not to its current value —
    // otherwise Back does not undo a filter.
    if (raw === undefined) return entry.spec.default
    const parsed = parseWith(entry.spec, raw)
    if (parsed !== INVALID) return parsed
    onInvalid?.(entry.paramKey, raw)
    return entry.spec.default
  }

  function patchFrom(params: URLSearchParams): Record<string, unknown> | null {
    const patch: Record<string, unknown> = {}
    let changed = false
    for (const entry of entries) {
      const next = valueFromUrl(entry, params)
      if (valuesEqual(entry.spec, next, known.get(entry.stateKey))) continue
      known.set(entry.stateKey, next)
      patch[entry.stateKey] = next
      changed = true
    }
    return changed ? patch : null
  }

  function serializedFor(state: Record<string, unknown>): Map<string, RawValue | undefined> {
    const diff = new Map<string, RawValue | undefined>()
    for (const entry of writable) {
      diff.set(entry.paramKey, serializeWith(entry.spec, state[entry.stateKey]))
    }
    return diff
  }

  function writeSources(diff: ReadonlyMap<string, RawValue | undefined>): void {
    for (const source of sources) {
      if (source.priority === 0) continue
      try {
        void source.write(diff)
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          warn(`source "${source.id}" write failed and was ignored: ${String(error)}`)
        }
      }
    }
  }

  function applyRoutePolicy(): Record<string, unknown> | null {
    const patch: Record<string, unknown> = {}
    for (const entry of entries) {
      known.set(entry.stateKey, entry.spec.default)
      patch[entry.stateKey] = entry.spec.default
    }
    for (const entry of writable) push(entry, undefined)
    if (policy === 'unmount') {
      releaseKeys()
      releaseOwned()
    }
    return patch
  }

  const engine: Engine<S> = {
    resolveInitial(defaults) {
      if (process.env.NODE_ENV !== 'production') {
        const initial = defaults as Record<string, unknown>
        for (const entry of entries) {
          if (!(entry.stateKey in initial)) continue
          if (valuesEqual(entry.spec, initial[entry.stateKey], entry.spec.default)) continue
          warn(
            `"${entry.stateKey}" in store "${storeName}" starts as ` +
              `${JSON.stringify(initial[entry.stateKey])} but declares ` +
              `.default(${JSON.stringify(entry.spec.default)}). The declared default is what ` +
              'gets omitted from the URL, so the two must match.',
          )
        }
      }
      const { values } = resolvePrecedence(entries, sources, onInvalid)
      for (const [stateKey, value] of Object.entries(values)) known.set(stateKey, value)

      // One write-back pass, so an invalid or redundant param leaves the URL and the storage
      // tier learns what the URL decided. Always a `replace` — arriving on a page is not a
      // Back-button stop.
      const diff = serializedFor(values)
      const live = adapter.read()
      for (const entry of writable) {
        const next = diff.get(entry.paramKey)
        const current = readRaw(live, entry.paramKey)
        if (sameRaw(current, next)) continue
        queue.enqueue(entry.paramKey, next, {
          ...enqueueOptions(entry),
          history: 'replace',
        })
      }
      writeSources(diff)

      // Only the keys precedence actually decided; the rest of the store is not ours to touch.
      return values as Partial<S>
    },

    onStateChange(next) {
      if (disposed) return
      const state = next as Record<string, unknown>
      const changed = new Map<string, RawValue | undefined>()
      for (const entry of writable) {
        const value = state[entry.stateKey]
        if (valuesEqual(entry.spec, value, known.get(entry.stateKey))) continue
        known.set(entry.stateKey, value)
        const raw = serializeWith(entry.spec, value)
        changed.set(entry.paramKey, raw)
        push(entry, raw)
      }
      if (changed.size > 0) writeSources(changed)
    },

    applyExternal() {
      if (disposed) return null
      const pathname = readPathname()
      if (pathname !== lastPathname) {
        lastPathname = pathname
        if (policy !== 'keep') return applyRoutePolicy() as Partial<S>
      }
      const params = adapter.read()
      // C6: compare serialized strings, not identity — a router hands back a fresh
      // URLSearchParams with identical content on every notification.
      if (serializeParams(params) === queue.lastWritten()) return null
      return patchFrom(params) as Partial<S> | null
    },

    applyParams(params) {
      if (disposed) return null
      return patchFrom(params) as Partial<S> | null
    },

    flush() {
      return queue.flush()
    },

    settled() {
      return queue.settled()
    },

    commit(fn, o) {
      override = o
      try {
        fn()
      } finally {
        override = undefined
      }
      return o?.limit === 'immediate' ? queue.flush() : queue.settled()
    },

    toSearchParams(state) {
      return applyDiff(adapter.read(), serializedFor(state as Record<string, unknown>))
    },

    reset() {
      const patch: Record<string, unknown> = {}
      for (const entry of entries) {
        known.set(entry.stateKey, entry.spec.default)
        patch[entry.stateKey] = entry.spec.default
      }
      const cleared = new Map<string, RawValue | undefined>()
      for (const entry of writable) {
        cleared.set(entry.paramKey, undefined)
        push(entry, undefined)
      }
      writeSources(cleared)
      return patch as Partial<S>
    },

    pause() {
      queue.pause()
    },

    resume() {
      queue.resume()
    },

    dispose() {
      if (disposed) return
      disposed = true
      unsubscribe?.()
      releaseKeys()
      releaseOwned()
    },
  }

  const unsubscribe = onExternal
    ? adapter.subscribe(() => {
        const patch = engine.applyExternal()
        if (patch) onExternal(patch as Record<string, unknown>)
      })
    : undefined

  return Object.freeze(engine)
}

function sameRaw(a: RawValue | undefined, b: RawValue | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  const left = typeof a === 'string' ? [a] : a
  const right = typeof b === 'string' ? [b] : b
  return left.length === right.length && left.every((value, index) => value === right[index])
}
