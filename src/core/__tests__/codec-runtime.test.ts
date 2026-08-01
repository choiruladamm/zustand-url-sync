import { describe, expect, it } from 'vitest'
import { toSpec } from '../../codecs/builder.js'
import { c } from '../../codecs/c.js'
import { parseWith, serializeWith, valuesEqual } from '../codec-runtime.js'
import { INVALID, type ParamSpec } from '../types.js'

describe('parseWith', () => {
  it('hands a repeated param to a multi codec as a list', () => {
    const spec = toSpec(c.array(c.string(), { mode: 'repeat' }).default([]))
    expect(parseWith(spec, ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('takes the first slot when a single-slot codec meets a repeated param', () => {
    expect(parseWith(toSpec(c.integer().default(0)), ['7', '9'])).toBe(7)
  })

  it('returns INVALID rather than propagating a throwing codec', () => {
    const spec: ParamSpec<string> = {
      codec: {
        parse: () => {
          throw new Error('hostile')
        },
        serialize: (value) => value,
      },
      default: '',
    }
    expect(parseWith(spec, 'anything')).toBe(INVALID)
  })
})

describe('serializeWith', () => {
  it('omits a value equal to its default', () => {
    expect(serializeWith(toSpec(c.integer().default(1)), 1)).toBeUndefined()
  })

  it('omits a value omitWhen rejects', () => {
    const spec = toSpec(
      c
        .string()
        .default('x')
        .omitWhen((value) => value === 'hide'),
    )
    expect(serializeWith(spec, 'hide')).toBeUndefined()
    expect(serializeWith(spec, 'show')).toBe('show')
  })

  it('omits rather than throwing when a codec fails to serialize', () => {
    const spec: ParamSpec<string> = {
      codec: {
        parse: (raw) => raw,
        serialize: () => {
          throw new Error('hostile')
        },
      },
      default: '',
    }
    expect(serializeWith(spec, 'value')).toBeUndefined()
  })

  it('omits an empty multi-slot value', () => {
    expect(serializeWith(toSpec(c.array(c.string()).default(['x'])), [])).toBeUndefined()
  })
})

describe('valuesEqual', () => {
  it('falls back to Object.is without a codec eq', () => {
    const spec = toSpec(c.integer().default(0))
    expect(valuesEqual(spec, 1, 1)).toBe(true)
    expect(valuesEqual(spec, 1, 2)).toBe(false)
  })

  it('uses the codec eq for reference values', () => {
    const spec = toSpec(c.array(c.string()).default([]))
    expect(valuesEqual(spec, ['a'], ['a'])).toBe(true)
  })

  it('falls back to Object.is when a codec eq throws', () => {
    const spec: ParamSpec<string> = {
      codec: {
        parse: (raw) => raw,
        serialize: (value) => value,
        eq: () => {
          throw new Error('hostile')
        },
      },
      default: '',
    }
    expect(valuesEqual(spec, 'a', 'a')).toBe(true)
  })
})
