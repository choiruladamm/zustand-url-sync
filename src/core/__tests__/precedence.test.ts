import { describe, expect, it, vi } from 'vitest'
import { toSpec } from '../../codecs/builder.js'
import { c } from '../../codecs/c.js'
import { resolveInitial } from '../precedence.js'
import type { ParamEntry, RawValue, Source } from '../types.js'

const entry: ParamEntry = {
  stateKey: 'page',
  paramKey: 'page',
  spec: toSpec(c.integer().default(1)),
}

/** `undefined` = absent, a string = present. `'oops'` is the invalid case for `c.integer()`. */
const source = (id: string, priority: number, value: RawValue | undefined): Source => ({
  id,
  priority,
  read: () => value,
  write: () => {},
})

type Cell = 'present' | 'absent' | 'invalid'
const raw: Record<Cell, RawValue | undefined> = {
  present: '',
  absent: undefined,
  invalid: 'oops',
}

describe('resolveInitial — the precedence matrix', () => {
  const cases: Array<[Cell, Cell, number, string | undefined]> = [
    ['present', 'present', 7, 'url'],
    ['present', 'absent', 7, 'url'],
    ['present', 'invalid', 7, 'url'],
    ['absent', 'present', 9, 'storage'],
    ['absent', 'absent', 1, undefined],
    ['absent', 'invalid', 1, undefined],
    ['invalid', 'present', 9, 'storage'],
    ['invalid', 'absent', 1, undefined],
    ['invalid', 'invalid', 1, undefined],
  ]

  for (const [url, storage, expected, origin] of cases) {
    it(`url ${url} + storage ${storage} -> ${expected}`, () => {
      const sources = [
        source('url', 0, url === 'present' ? '7' : raw[url]),
        source('storage', 1, storage === 'present' ? '9' : raw[storage]),
      ]
      const result = resolveInitial([entry], sources)
      expect(result.values.page).toBe(expected)
      expect(result.origin.get('page')).toBe(origin)
    })
  }

  it('sorts by priority rather than trusting the given order', () => {
    const sources = [source('storage', 1, '9'), source('url', 0, '7')]
    expect(resolveInitial([entry], sources).values.page).toBe(7)
  })

  it('reports every invalid value it walked past', () => {
    const onInvalid = vi.fn()
    resolveInitial([entry], [source('url', 0, 'oops'), source('storage', 1, 'nope')], onInvalid)
    expect(onInvalid).toHaveBeenCalledTimes(2)
    expect(onInvalid).toHaveBeenCalledWith('page', 'oops')
  })
})
