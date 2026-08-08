import type { Codec, Limiter, ParamSpec } from '../core/types.js'

/**
 * Where a builder keeps the spec it is accumulating. A named key rather than a `unique symbol`,
 * so it survives declaration emit without putting a symbol on the public surface.
 */
const SPEC = '~spec'

/** Anything the builder chain has produced, whatever modifiers it has closed off. */
export type BuiltParam<T> = { readonly '~spec': ParamSpec<T> }

/** Either the result of a `c.*` chain or a hand-written spec. */
export type ParamDecl<T> = BuiltParam<T> | ParamSpec<T>

/** The value type a declaration resolves to, whichever form it takes. */
export type ParamValue<D> =
  D extends BuiltParam<infer V> ? V : D extends ParamSpec<infer V> ? V : never

/**
 * `.default()` comes first and is the only way to reach the rest of the chain, so a param with no
 * default cannot be written at all — precedence has nothing to fall back to without one.
 */
export type ParamStart<T> = {
  /** Exposed so a codec can nest: `c.array(c.string())`. */
  readonly codec: Codec<T>
  default(value: T): ParamBuilder<T>
}

interface BuilderShape<T, Ex extends string> {
  readonly '~spec': ParamSpec<T>
  /** Coalesce a burst; keeps the URL live while typing. Mutually exclusive with `debounce`. */
  throttle(ms: number): ParamBuilder<T, Ex | 'debounce'>
  /** Wait for the burst to end; for pushes and server refetches. Excludes `throttle`. */
  debounce(ms: number): ParamBuilder<T, Ex | 'throttle'>
  history(mode: 'push' | 'replace'): ParamBuilder<T, Ex>
  shallow(value?: boolean): ParamBuilder<T, Ex>
  scroll(value?: boolean): ParamBuilder<T, Ex>
  priority(value: number): ParamBuilder<T, Ex>
  omitWhen(predicate: (value: T) => boolean): ParamBuilder<T, Ex>
  serverOnly(value?: boolean): ParamBuilder<T, Ex>
}

/**
 * `Ex` accumulates the modifiers this chain has closed off. `.throttle().debounce()` fails to
 * compile because `debounce` is no longer on the type.
 */
export type ParamBuilder<T, Ex extends string = never> = Omit<BuilderShape<T, Ex>, Ex>

export function createBuilder<T>(spec: ParamSpec<T>): ParamBuilder<T> {
  const next = (patch: Partial<ParamSpec<T>>): ParamBuilder<T> =>
    createBuilder({ ...spec, ...patch })
  const limiter = (kind: Limiter['kind'], ms: number): ParamBuilder<T> =>
    next({ limiter: { kind, ms } })

  // `Omit` erases the call signatures' relationship to the frozen literal; the literal above is
  // the only construction site, so the shape is guaranteed by construction.
  return Object.freeze({
    [SPEC]: spec,
    throttle: (ms: number) => limiter('throttle', ms),
    debounce: (ms: number) => limiter('debounce', ms),
    history: (mode: 'push' | 'replace') => next({ history: mode }),
    shallow: (value = true) => next({ shallow: value }),
    scroll: (value = true) => next({ scroll: value }),
    priority: (value: number) => next({ priority: value }),
    omitWhen: (predicate: (value: T) => boolean) => next({ omitWhen: predicate }),
    serverOnly: (value = true) => next({ serverOnly: value }),
  }) as ParamBuilder<T>
}

export function start<T>(codec: Codec<T>): ParamStart<T> {
  return Object.freeze({
    codec,
    default: (value: T) => createBuilder<T>({ codec, default: value }),
  })
}

/** Unwraps a builder back to the plain spec the engine consumes. Accepts a raw spec unchanged. */
export function toSpec<T>(input: BuiltParam<T> | ParamSpec<T>): ParamSpec<T> {
  const carrier = input as Partial<BuiltParam<T>>
  return carrier[SPEC] ?? (input as ParamSpec<T>)
}
