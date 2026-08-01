import { type Codec, INVALID } from '../core/types.js'
import { floatCodec } from './float.js'

export type NumberRange = readonly [min: number, max: number]

const FINITE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/

// Reused so a signed zero survives here for the same reason it survives in `c.float()`.
const bound = floatCodec()

/** `?price=10,250`. A comma rather than a dash, so negative bounds stay unambiguous. */
export function numberRangeCodec(): Codec<NumberRange> {
  return {
    parse: (raw) => {
      const parts = raw.split(',')
      if (parts.length !== 2) return INVALID
      const [min, max] = parts
      if (min === undefined || max === undefined) return INVALID
      if (!FINITE.test(min) || !FINITE.test(max)) return INVALID
      return [Number(min), Number(max)] as NumberRange
    },
    serialize: (value) => `${bound.serialize(value[0])},${bound.serialize(value[1])}`,
    eq: (a, b) => Object.is(a[0], b[0]) && Object.is(a[1], b[1]),
  }
}
