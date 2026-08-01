import { describe, expect, it } from 'vitest'
import { toSpec } from '../builder.js'
import { c } from '../c.js'

describe('the builder chain', () => {
  it('carries every modifier onto the spec', () => {
    const spec = toSpec(
      c
        .integer()
        .default(1)
        .debounce(300)
        .history('push')
        .shallow(false)
        .scroll()
        .priority(5)
        .serverOnly(),
    )

    expect(spec.default).toBe(1)
    expect(spec.limiter).toEqual({ kind: 'debounce', ms: 300 })
    expect(spec.history).toBe('push')
    expect(spec.shallow).toBe(false)
    expect(spec.scroll).toBe(true)
    expect(spec.priority).toBe(5)
    expect(spec.serverOnly).toBe(true)
  })

  it('is immutable — each modifier returns a new spec', () => {
    const base = c.string().default('')
    const throttled = base.throttle(200)
    expect(toSpec(base).limiter).toBeUndefined()
    expect(toSpec(throttled).limiter).toEqual({ kind: 'throttle', ms: 200 })
  })

  it('accepts a plain spec unchanged, so a hand-written codec needs no builder', () => {
    const spec = {
      codec: { parse: (raw: string) => raw, serialize: (v: string) => v },
      default: '',
    }
    expect(toSpec(spec)).toBe(spec)
  })

  it('exposes the codec so codecs nest', () => {
    expect(toSpec(c.array(c.integer()).default([])).codec).toBeDefined()
    expect(c.array(c.integer()).codec).toBeDefined()
  })

  it('applies omitWhen', () => {
    const spec = toSpec(
      c
        .string()
        .default('x')
        .omitWhen((value) => value === 'hide'),
    )
    expect(spec.omitWhen?.('hide')).toBe(true)
  })
})
