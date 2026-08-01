import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { throughUrl } from '../../../test/support/round-trip.js'
import { INVALID } from '../../core/types.js'
import { enumCodec } from '../enum.js'

const values = ['created_at', 'name', 'a,b', '👋🏽'] as const
const codec = enumCodec(values)

describe('enumCodec', () => {
  it('round-trips every member, including ones with hostile characters', () => {
    fc.assert(
      fc.property(fc.constantFrom(...values), (value) => {
        expect(throughUrl(codec, value)).toBe(value)
      }),
    )
  })

  it('rejects anything outside the declared set', () => {
    expect(codec.parse('rank')).toBe(INVALID)
    expect(codec.parse('')).toBe(INVALID)
  })
})
