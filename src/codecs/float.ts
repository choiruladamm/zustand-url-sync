import { type Codec, INVALID } from '../core/types.js'

export function floatCodec(): Codec<number> {
  return {
    parse: (raw) => {
      // Round-tripping these explicitly is what lets the property test include them rather than
      // filter them out and pretend the edge does not exist.
      if (raw === 'NaN') return Number.NaN
      if (raw === 'Infinity') return Number.POSITIVE_INFINITY
      if (raw === '-Infinity') return Number.NEGATIVE_INFINITY
      if (raw.trim() === '') return INVALID
      const value = Number(raw)
      return Number.isFinite(value) ? value : INVALID
    },
    // `String(-0)` is `'0'`, which would turn a signed zero into an unsigned one on the way back.
    serialize: (value) => (Object.is(value, -0) ? '-0' : String(value)),
  }
}
