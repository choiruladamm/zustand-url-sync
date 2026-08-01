import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { HOSTILE_STRINGS, throughUrl } from '../../../test/support/round-trip.js'
import { stringCodec } from '../string.js'

const codec = stringCodec()

describe('stringCodec', () => {
  it('round-trips any string through a real URLSearchParams', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (value) => {
        expect(throughUrl(codec, value)).toBe(value)
      }),
      { numRuns: 1000 },
    )
  })

  for (const value of HOSTILE_STRINGS) {
    it(`round-trips ${JSON.stringify(value)}`, () => {
      expect(throughUrl(codec, value)).toBe(value)
    })
  }

  it('never rejects — any string is a valid string', () => {
    expect(codec.parse('anything at all')).toBe('anything at all')
  })
})
