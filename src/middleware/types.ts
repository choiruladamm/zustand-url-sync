import type { StateCreator, StoreMutatorIdentifier } from 'zustand/vanilla'
import type { BuiltParam } from '../codecs/builder.js'
import type { CommitOptions } from '../core/engine.js'
import type { OnInvalid, ParamSpec, RouteChangePolicy, UrlAdapter } from '../core/types.js'

/** An optional state key still carries its own type; only the absence is stripped. */
type Value<T, K extends keyof T> = Exclude<T[K], undefined>

/**
 * The keys a param may be declared on: everything that is not an action. A function has no
 * serialized form, so declaring one is a typo, and this is what turns it into a compile error.
 */
export type ParamKey<T> = {
  [K in keyof T]-?: Value<T, K> extends (...args: never[]) => unknown ? never : K
}[keyof T]

/** Either the result of a `c.*` chain or a hand-written spec. */
export type ParamDecl<T> = BuiltParam<T> | ParamSpec<T>

/**
 * Every declared key must exist on the state and must match its type. Nothing syncs without a
 * declaration — there is no `partialize` and no "sync everything".
 */
export type ParamsDecl<T> = {
  [K in ParamKey<T>]?: ParamDecl<Value<T, K>>
}

export type UrlSyncOptions<T> = {
  /** Namespaces the storage tier, and supplies the param prefix when `prefix: true`. */
  name: string
  params: ParamsDecl<T>
  /** `'tbl_'` prefixes every param; `true` uses `name` (`filters` → `filters_q`). */
  prefix?: string | true
  adapter?: UrlAdapter
  /** Read params from this URL instead of a live one — a server render, or a store built before the router exists. */
  initialUrl?: string
  /** The storage tier. Not implemented yet; declaring it is a compile error until it is. */
  persist?: never
  maxUrlLength?: number
  onRouteChange?: RouteChangePolicy
  onInvalid?: OnInvalid
  /** Defer the first URL → store pass until `urlSync.hydrate()` runs. */
  skipHydration?: boolean
}

/**
 * `commit`'s override applies to the writes made during the *synchronous* execution of `fn`.
 * Carrying it across an `await` would need `AsyncLocalStorage` or a zone library; both are out, so
 * the trap is closed here instead of in a docs footnote.
 *
 * The brand is an intersection rather than a constraint on `R` because `R extends SyncOnly<R>` is
 * a circular constraint. Here `R` is still inferred from the function half, and a thenable one
 * then has to satisfy a property no function has.
 *
 * `Extract` rather than a bare conditional: a bare one distributes, and `never` distributes to
 * `never` — which would reject the perfectly good `fn` that only ever throws.
 */
export type SyncOnly<R> = (() => R) &
  ([Extract<R, PromiseLike<unknown>>] extends [never]
    ? unknown
    : { __commitIsSynchronous_doNotPassAnAsyncFunction: never })

export type UrlSyncApi = {
  /** Runs `fn` with URL-write options overridden for exactly the writes it produces. */
  commit<R>(fn: SyncOnly<R>, o?: CommitOptions): Promise<URLSearchParams>
  /** Forces the pending write out now and resolves with what landed. */
  flush(): Promise<URLSearchParams>
  /** Builds the URL this state would produce, without navigating. For `<Link>`. */
  toSearchParams(): URLSearchParams
  /** Forces a URL → store pass. A string with no `?` carries no params. */
  applyUrl(url: string): void
  pause(): void
  resume(): void
  /** All declared keys back to their defaults, cleared from the URL. */
  reset(): void
  /** Runs the deferred first URL → store pass. A no-op once hydrated. */
  hydrate(): void
  hasHydrated(): boolean
  /** Fires immediately if hydration already happened. Returns an unsubscribe. */
  onHydrated(cb: () => void): () => void
  /** Releases the adapter subscription and this store's claim on its param keys. */
  dispose(): void
}

type Cast<T, U> = T extends U ? T : U
type Write<T, U> = Omit<T, keyof U> & U

export type UrlSync = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  initializer: StateCreator<T, [...Mps, ['url-sync', unknown]], Mcs>,
  options: UrlSyncOptions<T>,
) => StateCreator<T, Mps, [['url-sync', unknown], ...Mcs]>

declare module 'zustand/vanilla' {
  interface StoreMutators<S, A> {
    'url-sync': Write<Cast<S, object>, { urlSync: UrlSyncApi }>
  }
}
