import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { throughUrl } from '../../../test/support/round-trip.js'
import { INVALID } from '../../core/types.js'
import { booleanCodec } from '../boolean.js'

const codec = booleanCodec()

describe('booleanCodec', () => {
  it('round-trips', () => {
    fc.assert(
      fc.property(fc.boolean(), (value) => {
        expect(throughUrl(codec, value)).toBe(value)
      }),
    )
  })

  it.each(['1', '0', 'yes', 'TRUE', ''])('rejects %o — the wire format is true/false', (raw) => {
    expect(codec.parse(raw)).toBe(INVALID)
  })
})
