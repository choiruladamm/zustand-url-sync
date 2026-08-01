import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { throughUrl } from '../../../test/support/round-trip.js'
import { INVALID } from '../../core/types.js'
import { floatCodec } from '../float.js'

const codec = floatCodec()

describe('floatCodec', () => {
  it('round-trips any double, including NaN and the infinities', () => {
    fc.assert(
      fc.property(fc.double(), (value) => {
        expect(Object.is(throughUrl(codec, value), value)).toBe(true)
      }),
      { numRuns: 1000 },
    )
  })

  it('preserves the sign of a negative zero', () => {
    expect(Object.is(throughUrl(codec, -0), -0)).toBe(true)
    expect(codec.serialize(-0)).toBe('-0')
  })

  it.each(['', ' ', 'abc', '1,5', '--1'])('rejects %o', (raw) => {
    expect(codec.parse(raw)).toBe(INVALID)
  })
})
