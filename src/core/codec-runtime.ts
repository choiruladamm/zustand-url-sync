import { guard } from './dev.js'
import {
  type CodecShape,
  INVALID,
  type Invalid,
  isMultiCodec,
  type ParamSpec,
  type RawValue,
} from './types.js'

/** `Codec<T>` is `CodecShape<T>` plus a required `eq` in its reference-type branch. */
const shapeOf = <T>(spec: ParamSpec<T>): CodecShape<T> => spec.codec as CodecShape<T>

/** User data is never trusted and never throws — a bad codec degrades to `INVALID`. */
export function parseWith<T>(spec: ParamSpec<T>, raw: RawValue): T | Invalid {
  const codec = shapeOf(spec)
  try {
    if (isMultiCodec(codec)) return codec.parseMany(typeof raw === 'string' ? [raw] : raw)
    // A repeated param handed to a single-slot codec: take the first, the way a server would.
    return codec.parse(typeof raw === 'string' ? raw : (raw[0] ?? ''))
  } catch {
    return INVALID
  }
}

export function valuesEqual<T>(spec: ParamSpec<T>, a: T, b: T): boolean {
  const eq = shapeOf(spec).eq
  if (!eq) return Object.is(a, b)
  return guard('codec.eq', () => eq(a, b)) ?? Object.is(a, b)
}

/**
 * `undefined` means "omit this param". A value equal to its default is omitted so a clean state
 * gives a clean URL, and `omitWhen` omits on top of that — both must parse back to the default or
 * the Back button stops undoing filters.
 */
export function serializeWith<T>(spec: ParamSpec<T>, value: T): RawValue | undefined {
  if (valuesEqual(spec, value, spec.default)) return undefined
  const omit = spec.omitWhen
  if (omit && (guard('omitWhen', () => omit(value)) ?? false)) return undefined
  const codec = shapeOf(spec)
  const raw = guard('codec.serialize', () =>
    isMultiCodec(codec) ? codec.serializeMany(value) : codec.serialize(value),
  )
  if (raw === undefined) return undefined
  if (typeof raw === 'string') return raw
  return raw.length === 0 ? undefined : raw
}
