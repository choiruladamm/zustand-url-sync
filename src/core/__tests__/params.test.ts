import { describe, expect, it } from 'vitest'
import { applyDiff, fromEntries, readRaw, serializeParams, toEntries } from '../params.js'
import type { RawValue } from '../types.js'

const diff = (entries: Record<string, RawValue | undefined>): Map<string, RawValue | undefined> =>
  new Map(Object.entries(entries))

describe('applyDiff', () => {
  it('updates a key in place rather than moving it to the end', () => {
    const next = applyDiff(new URLSearchParams('a=1&b=2&c=3'), diff({ b: '9' }))
    expect(next.toString()).toBe('a=1&b=9&c=3')
  })

  it('appends a key it has not seen', () => {
    expect(applyDiff(new URLSearchParams('a=1'), diff({ z: '2' })).toString()).toBe('a=1&z=2')
  })

  it('removes a key set to undefined', () => {
    expect(applyDiff(new URLSearchParams('a=1&b=2'), diff({ a: undefined })).toString()).toBe('b=2')
  })

  it('removes a key set to an empty list', () => {
    expect(applyDiff(new URLSearchParams('a=1&b=2'), diff({ a: [] })).toString()).toBe('b=2')
  })

  it('replaces every slot of a repeated key at once', () => {
    const next = applyDiff(new URLSearchParams('t=1&t=2&z=9'), diff({ t: ['a', 'b', 'c'] }))
    expect(next.getAll('t')).toEqual(['a', 'b', 'c'])
    expect(next.toString()).toBe('t=a&t=b&t=c&z=9')
  })

  it('leaves the params untouched for an empty diff', () => {
    expect(applyDiff(new URLSearchParams('a=1'), diff({})).toString()).toBe('a=1')
  })
})

describe('toEntries / fromEntries', () => {
  it('groups repeated keys and survives a round trip', () => {
    const entries = toEntries(new URLSearchParams('t=1&z=9&t=2'))
    expect(entries).toEqual([
      ['t', ['1', '2']],
      ['z', ['9']],
    ])
    expect(fromEntries(entries).toString()).toBe('t=1&t=2&z=9')
  })
})

describe('readRaw', () => {
  it('is undefined for an absent key', () => {
    expect(readRaw(new URLSearchParams('a=1'), 'b')).toBeUndefined()
  })

  it('is a string for one slot and a list for several', () => {
    expect(readRaw(new URLSearchParams('a=1'), 'a')).toBe('1')
    expect(readRaw(new URLSearchParams('a=1&a=2'), 'a')).toEqual(['1', '2'])
  })

  it('distinguishes an empty value from an absent one', () => {
    expect(readRaw(new URLSearchParams('a='), 'a')).toBe('')
  })
})

describe('serializeParams', () => {
  it('leaves commas and colons readable', () => {
    expect(serializeParams(new URLSearchParams({ tags: 'a,b', at: '00:00' }))).toBe(
      'tags=a,b&at=00:00',
    )
  })

  it('does not touch an escaped separator inside a value', () => {
    expect(serializeParams(new URLSearchParams({ tags: 'a%2Cb' }))).toBe('tags=a%252Cb')
  })

  it('still encodes everything else', () => {
    expect(serializeParams(new URLSearchParams({ q: 'a b&c' }))).toBe('q=a+b%26c')
  })
})
