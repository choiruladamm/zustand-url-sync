/**
 * The source model. Nothing in here knows what a URL is — a URL is one `Source` among several,
 * and precedence is "lowest priority number holding a value wins".
 *
 * Methods are declared with method shorthand rather than arrow properties on purpose: method
 * parameters are checked bivariantly even under `strictFunctionTypes`, which is what lets a
 * `ParamSpec<string>` sit in a `Record<string, ParamSpec>` without an `any` anywhere.
 */

/** A parse that failed. Never `null` — `null` is a value a codec is allowed to produce. */
export const INVALID = Symbol('zustand-url-sync/INVALID')
export type Invalid = typeof INVALID

/**
 * One query-param slot's raw form. An array means the param repeats (`?tags=a&tags=b`),
 * which only `c.array(..., { mode: 'repeat' })` produces.
 */
export type RawValue = string | readonly string[]

/** @internal the shape every codec has, before the reference-type `eq` requirement is applied. */
export type CodecShape<T> = {
  parse(raw: string): T | Invalid
  serialize(value: T): string
  eq?(a: T, b: T): boolean
}

/**
 * `eq` is required for reference types: `Object.is` on a freshly built array is always false, so
 * an immer producer would enqueue a URL write on every render.
 */
export type Codec<T> = [T] extends [object]
  ? CodecShape<T> & { eq(a: T, b: T): boolean }
  : CodecShape<T>

/** A codec that occupies more than one slot for the same key: `?tags=a&tags=b`. */
export type MultiCodec<T> = CodecShape<T> & {
  readonly multi: true
  eq(a: T, b: T): boolean
  serializeMany(value: T): readonly string[]
  parseMany(raws: readonly string[]): T | Invalid
}

export function isMultiCodec<T>(codec: CodecShape<T>): codec is MultiCodec<T> {
  return (codec as { multi?: unknown }).multi === true
}

export type Limiter = { kind: 'throttle' | 'debounce'; ms: number }

export type ParamSpec<T = unknown> = {
  codec: Codec<T>
  default: T
  limiter?: Limiter | undefined
  history?: 'push' | 'replace' | undefined
  shallow?: boolean | undefined
  scroll?: boolean | undefined
  /** C10 drop order. Lower drops first; `Infinity` never drops. Default 0. */
  priority?: number | undefined
  omitWhen?(value: T): boolean
  /** Read from the URL so a server can render it; never written back from the client. */
  serverOnly?: boolean | undefined
}

/** A declared param after prefix resolution. `stateKey` addresses the store, `paramKey` the URL. */
export type ParamEntry<T = unknown> = {
  stateKey: string
  paramKey: string
  spec: ParamSpec<T>
  /**
   * `false` for a key that has no query-param form at all: it never reads from the URL and never
   * writes to it, and exists only for the sources below it. Distinct from `serverOnly`, which is a
   * key the URL still carries.
   */
  inUrl: boolean
}

export type Source = {
  id: string
  priority: number
  read(key: string): RawValue | undefined
  write(entries: ReadonlyMap<string, RawValue | undefined>): void | Promise<void>
  subscribe?(onExternalChange: () => void): () => void
}

export type AdapterWriteOptions = {
  history: 'push' | 'replace'
  /** `false` -> let the router navigate, so the server re-runs loaders / RSC. */
  shallow: boolean
  scroll: boolean
}

export type UrlAdapter = {
  read(): URLSearchParams
  write(next: URLSearchParams, o: AdapterWriteOptions): void | Promise<void>
  subscribe(onExternalChange: () => void): () => void
  /** Current pathname, for the route-change policy. */
  pathname?(): string
  /** Multiplier on the base throttle; 2.4 on Safari. */
  rateLimitFactor?: number | undefined
}

export type RouteChangePolicy = 'keep' | 'reset' | 'unmount'

export type OnInvalid = (key: string, raw: RawValue, issues?: unknown) => void
