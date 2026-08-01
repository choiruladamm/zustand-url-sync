import { type Codec, type CodecShape, INVALID } from '../core/types.js'

/**
 * The escape hatch, not the default. Equality is `JSON.stringify` on both sides, so two objects
 * with the same entries in a different key order compare unequal and write the URL again — which
 * is the honest answer for a codec whose wire format is key-order-sensitive anyway.
 */
export function jsonCodec<T>(): Codec<T> {
  const codec: CodecShape<T> = {
    parse: (raw) => {
      try {
        return JSON.parse(raw) as T
      } catch {
        return INVALID
      }
    },
    serialize: (value) => JSON.stringify(value),
    eq: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  }
  // `eq` is present, so the literal satisfies both branches of the conditional; TypeScript cannot
  // resolve which one applies while `T` is generic.
  return codec as Codec<T>
}
