import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { throughUrl } from '../../../test/support/round-trip.js'
import { INVALID } from '../../core/types.js'
import { integerCodec } from '../integer.js'

const codec = integerCodec()

describe('integerCodec', () => {
  it('round-trips any safe integer', () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), (value) => {
        expect(throughUrl(codec, value)).toBe(value)
      }),
      { numRuns: 1000 },
    )
  })

  it.each(['', ' ', '1.5', '1e3', 'abc', '0x10', ' 1', '1 ', 'NaN', 'Infinity'])(
    'rejects %o rather than coercing it',
    (raw) => {
      expect(codec.parse(raw)).toBe(INVALID)
    },
  )

  it('accepts an explicit sign', () => {
    expect(codec.parse('+7')).toBe(7)
    expect(codec.parse('-7')).toBe(-7)
  })

  it('truncates a float on the way out rather than emitting a decimal point', () => {
    expect(codec.serialize(2.9)).toBe('2')
  })
})
