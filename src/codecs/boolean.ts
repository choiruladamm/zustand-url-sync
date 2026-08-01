import { type Codec, INVALID } from '../core/types.js'

/** `true` / `false` only. Accepting `1` and `0` on the way in would invite emitting them later. */
export function booleanCodec(): Codec<boolean> {
  return {
    parse: (raw) => (raw === 'true' ? true : raw === 'false' ? false : INVALID),
    serialize: (value) => (value ? 'true' : 'false'),
  }
}
