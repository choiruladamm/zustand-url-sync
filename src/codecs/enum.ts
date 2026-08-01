import { type Codec, type CodecShape, INVALID } from '../core/types.js'

export function enumCodec<const V extends readonly string[]>(values: V): Codec<V[number]> {
  const codec: CodecShape<V[number]> = {
    parse: (raw) => (values.includes(raw) ? (raw as V[number]) : INVALID),
    serialize: (value) => value,
  }
  // `V[number]` is a string subtype, so `Codec` resolves to its no-`eq` branch — but TypeScript
  // cannot see through the conditional while `V` is still generic.
  return codec as Codec<V[number]>
}
