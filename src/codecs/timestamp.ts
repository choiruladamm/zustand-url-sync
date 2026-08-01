import { type Codec, INVALID } from '../core/types.js'

const INTEGER = /^[+-]?\d+$/

/** `?at=1785283200000`. Shorter than ISO, at the cost of being unreadable. */
export function timestampCodec(): Codec<Date> {
  return {
    parse: (raw) => {
      if (!INTEGER.test(raw)) return INVALID
      const value = new Date(Number(raw))
      return Number.isNaN(value.getTime()) ? INVALID : value
    },
    serialize: (value) => String(value.getTime()),
    eq: (a, b) => a.getTime() === b.getTime(),
  }
}
