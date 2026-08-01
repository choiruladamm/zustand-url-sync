import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { throughUrl } from '../../../test/support/round-trip.js'
import { INVALID } from '../../core/types.js'
import { isoDateCodec } from '../iso-date.js'

const codec = isoDateCodec()

describe('isoDateCodec', () => {
  it('round-trips any valid date', () => {
    fc.assert(
      fc.property(fc.date({ noInvalidDate: true }), (value) => {
        expect((throughUrl(codec, value) as Date).getTime()).toBe(value.getTime())
      }),
      { numRuns: 1000 },
    )
  })

  it.each(['', 'not a date', '2026-13-45T99:99:99Z'])('rejects %o', (raw) => {
    expect(codec.parse(raw)).toBe(INVALID)
  })

  it('compares by instant, not by reference', () => {
    expect(codec.eq(new Date(0), new Date(0))).toBe(true)
  })
})
