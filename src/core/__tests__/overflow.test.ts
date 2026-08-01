import { describe, expect, it } from 'vitest'
import { applyUrlBudget } from '../overflow.js'

const params = (init: Record<string, string>): URLSearchParams => new URLSearchParams(init)

describe('applyUrlBudget', () => {
  it('leaves a URL that fits untouched', () => {
    const result = applyUrlBudget(params({ a: '1' }), [{ key: 'a', priority: 0 }], 2000)
    expect(result.dropped).toEqual([])
    expect(result.params.toString()).toBe('a=1')
  })

  it('drops in ascending priority order', () => {
    const result = applyUrlBudget(
      params({ keep: 'x'.repeat(20), drop: 'y'.repeat(20) }),
      [
        { key: 'keep', priority: 10 },
        { key: 'drop', priority: 1 },
      ],
      30,
    )
    expect(result.dropped).toEqual(['drop'])
    expect(result.params.get('keep')).not.toBeNull()
  })

  it('breaks ties by dropping the later-declared key first', () => {
    const result = applyUrlBudget(
      params({ first: 'x'.repeat(20), second: 'y'.repeat(20) }),
      [
        { key: 'first', priority: 0 },
        { key: 'second', priority: 0 },
      ],
      30,
    )
    expect(result.dropped).toEqual(['second'])
  })

  it('never drops a key marked priority Infinity', () => {
    const result = applyUrlBudget(
      params({ pinned: 'x'.repeat(60) }),
      [{ key: 'pinned', priority: Number.POSITIVE_INFINITY }],
      20,
    )
    expect(result.dropped).toEqual([])
    expect(result.params.get('pinned')).not.toBeNull()
  })

  it('never drops a key it does not own', () => {
    const result = applyUrlBudget(
      params({ theirs: 'x'.repeat(40), ours: 'y'.repeat(40) }),
      [{ key: 'ours', priority: 0 }],
      20,
    )
    expect(result.dropped).toEqual(['ours'])
    expect(result.params.get('theirs')).not.toBeNull()
  })

  it('counts the pathname against the budget', () => {
    const short = applyUrlBudget(params({ a: 'x'.repeat(10) }), [{ key: 'a', priority: 0 }], 20, 0)
    const long = applyUrlBudget(params({ a: 'x'.repeat(10) }), [{ key: 'a', priority: 0 }], 20, 15)
    expect(short.dropped).toEqual([])
    expect(long.dropped).toEqual(['a'])
  })
})
