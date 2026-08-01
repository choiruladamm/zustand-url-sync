import { type Codec, INVALID } from '../core/types.js'

const INTEGER = /^[+-]?\d+$/

export function integerCodec(): Codec<number> {
  return {
    // `Number('')` is 0 and `Number(' 1 ')` is 1; the regex is what keeps `?page=` invalid
    // instead of silently meaning page zero.
    parse: (raw) => (INTEGER.test(raw) ? Number(raw) : INVALID),
    serialize: (value) => String(Math.trunc(value)),
  }
}
