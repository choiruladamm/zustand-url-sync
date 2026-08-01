import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { throughUrl } from '../../../test/support/round-trip.js'
import { INVALID } from '../../core/types.js'
import { timestampCodec } from '../timestamp.js'

const codec = timestampCodec()

describe('timestampCodec', () => {
  it('round-trips any valid date', () => {
    fc.assert(
      fc.property(fc.date({ noInvalidDate: true }), (value) => {
        expect((throughUrl(codec, value) as Date).getTime()).toBe(value.getTime())
      }),
      { numRuns: 1000 },
    )
  })

  it.each(['', '1.5', 'abc', '99999999999999999999'])('rejects %o', (raw) => {
    expect(codec.parse(raw)).toBe(INVALID)
  })
})
