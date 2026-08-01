// Negative type tests: each of these MUST fail to compile. `@ts-expect-error` inverts the check,
// so if the footgun ever stops being an error, `tsc` fails with "Unused '@ts-expect-error'".
//
// See .claude/rules/testing.md. The remaining cases (an action declared as a param, an `async`
// function passed to `commit()`, `persist.keys` naming an undeclared key) land with the config
// types in M2 and M3.
import { expectTypeOf } from 'expect-type'
import { c, type ParamSpec, toSpec } from '../../src/index.js'

// --- a reference-returning codec must supply `eq` -----------------------------------------
// Without it, `Object.is` on a freshly built array is always false and every render writes the URL.

// @ts-expect-error — `Codec<string[]>` requires `eq`.
c.custom<string[]>({ parse: (raw) => raw.split(','), serialize: (value) => value.join(',') })

// @ts-expect-error — same for a plain object.
c.custom<{ from: string }>({ parse: () => ({ from: '' }), serialize: (v) => v.from })

// Supplying it compiles.
c.custom<string[]>({
  parse: (raw) => raw.split(','),
  serialize: (value) => value.join(','),
  eq: (a, b) => a.length === b.length && a.every((value, index) => value === b[index]),
})

// A primitive codec needs no `eq`.
c.custom<number>({ parse: (raw) => Number(raw), serialize: (value) => String(value) })

// --- .throttle() and .debounce() are mutually exclusive ------------------------------------
// PRD §5.4: a key may set only one.

// @ts-expect-error — `debounce` is gone once `throttle` has been used.
c.string().default('').throttle(50).debounce(300)

// @ts-expect-error — and the other way round.
c.string().default('').debounce(300).throttle(50)

// Either one alone is fine, and stays chainable.
c.string().default('').throttle(50).history('push').priority(2)
c.string().default('').debounce(300).shallow(false)

// --- .default() comes first ----------------------------------------------------------------
// A param with no default has nothing for precedence to fall back to.

// @ts-expect-error — the modifiers only exist after `.default()`.
c.integer().throttle(50)

// --- the builder produces a usable spec ----------------------------------------------------
expectTypeOf(toSpec(c.integer().default(1))).toEqualTypeOf<ParamSpec<number>>()
expectTypeOf(toSpec(c.array(c.string()).default([]))).toEqualTypeOf<ParamSpec<string[]>>()
expectTypeOf(toSpec(c.enum(['a', 'b']).default('a'))).toEqualTypeOf<ParamSpec<'a' | 'b'>>()

// `.default()` is typed against the codec.
// @ts-expect-error — a string is not an integer.
c.integer().default('1')
