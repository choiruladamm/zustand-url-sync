import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { throughUrl } from '../../../test/support/round-trip.js'
import { INVALID } from '../../core/types.js'
import { jsonCodec } from '../json.js'

const codec = jsonCodec<Record<string, number>>()
const anyJson = jsonCodec<unknown>()

describe('jsonCodec', () => {
  it('round-trips anything JSON can represent', () => {
    fc.assert(
      // Compared as JSON, not structurally: `JSON.stringify(-0)` is `'0'`, so a signed zero is
      // outside what any JSON codec can promise to preserve.
      fc.property(fc.jsonValue(), (value) => {
        expect(JSON.stringify(throughUrl(anyJson, value))).toBe(JSON.stringify(value))
      }),
      { numRuns: 1000 },
    )
  })

  it.each(['', '{oops}', 'undefined'])('rejects %o rather than throwing', (raw) => {
    expect(anyJson.parse(raw)).toBe(INVALID)
  })

  it('compares by serialized form, so key order is significant', () => {
    expect(codec.eq({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true)
    expect(codec.eq({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false)
  })
})
