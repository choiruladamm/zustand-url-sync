import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { HOSTILE_STRINGS, throughUrl } from '../../../test/support/round-trip.js'
import { INVALID } from '../../core/types.js'
import { arrayCodec } from '../array.js'
import { integerCodec } from '../integer.js'
import { stringCodec } from '../string.js'

const join = arrayCodec(stringCodec())
const repeat = arrayCodec(stringCodec(), { mode: 'repeat' })
const pipes = arrayCodec(stringCodec(), { sep: '|' })

describe('join mode', () => {
  it('round-trips arbitrary string arrays', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: 'binary' })), (value) => {
        expect(throughUrl(join, value)).toEqual(value)
      }),
      { numRuns: 1000 },
    )
  })

  it('round-trips arrays built only from the characters that break naive joins', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...HOSTILE_STRINGS)), (value) => {
        expect(throughUrl(join, value)).toEqual(value)
      }),
      { numRuns: 1000 },
    )
  })

  it("keeps ['a,b'] and ['a','b'] distinct", () => {
    expect(join.serializeMany(['a,b'])).not.toEqual(join.serializeMany(['a', 'b']))
    expect(throughUrl(join, ['a,b'])).toEqual(['a,b'])
    expect(throughUrl(join, ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('escapes the separator inside the element, not around the join', () => {
    expect(join.serializeMany(['a,b'])).toEqual(['a%2Cb'])
    expect(join.serializeMany(['a', 'b'])).toEqual(['a,b'])
  })

  it('survives an element that already looks escaped', () => {
    expect(join.serializeMany(['a%2Cb'])).toEqual(['a%252Cb'])
    expect(throughUrl(join, ['a%2Cb'])).toEqual(['a%2Cb'])
  })

  it('serializes an empty array to no param at all', () => {
    expect(join.serializeMany([])).toEqual([])
  })

  it('keeps a single empty string distinct from an empty array', () => {
    expect(join.serializeMany([''])).toEqual([''])
    expect(throughUrl(join, [''])).toEqual([''])
  })

  it('honours a custom separator', () => {
    expect(pipes.serializeMany(['a|b', 'c'])).toEqual(['a%7Cb|c'])
    expect(throughUrl(pipes, ['a|b', 'c'])).toEqual(['a|b', 'c'])
  })

  it('rejects the whole array when one element will not parse', () => {
    expect(arrayCodec(integerCodec()).parseMany(['1,nope,3'])).toBe(INVALID)
  })
})

describe('repeat mode', () => {
  it('round-trips through several slots', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: 'binary' })), (value) => {
        expect(throughUrl(repeat, value)).toEqual(value)
      }),
      { numRuns: 1000 },
    )
  })

  it('never escapes, because the separator is not load-bearing', () => {
    expect(repeat.serializeMany(['a,b', 'c'])).toEqual(['a,b', 'c'])
  })
})

describe('equality', () => {
  it('is structural, so a rebuilt array does not look changed', () => {
    expect(join.eq(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(join.eq(['a'], ['a', 'b'])).toBe(false)
  })

  it('uses the inner codec eq when it has one', () => {
    const nested = arrayCodec(arrayCodec(stringCodec()))
    expect(nested.eq([['a']], [['a']])).toBe(true)
  })
})

describe('construction', () => {
  it('refuses a multi-character separator', () => {
    expect(() => arrayCodec(stringCodec(), { sep: '::' })).toThrow(/single character/)
  })

  it('refuses the escape character as a separator', () => {
    expect(() => arrayCodec(stringCodec(), { sep: '%' })).toThrow(/escape character/)
  })
})
