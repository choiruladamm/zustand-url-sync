import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { throughUrl } from '../../../test/support/round-trip.js'
import { INVALID } from '../../core/types.js'
import { type NumberRange, numberRangeCodec } from '../number-range.js'

const codec = numberRangeCodec()

describe('numberRangeCodec', () => {
  it('round-trips any finite pair', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        (min, max) => {
          expect(throughUrl(codec, [min, max] as NumberRange)).toEqual([min, max])
        },
      ),
      { numRuns: 1000 },
    )
  })

  it('handles negative bounds, which a dash separator would not', () => {
    expect(codec.serialize([-5, 10])).toBe('-5,10')
    expect(throughUrl(codec, [-5, 10] as NumberRange)).toEqual([-5, 10])
  })

  it.each(['', '1', '1,2,3', 'a,b', 'NaN,1', '1,Infinity'])('rejects %o', (raw) => {
    expect(codec.parse(raw)).toBe(INVALID)
  })
})
