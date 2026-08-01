// Proves the negative-type-test harness itself works.
//
// `@ts-expect-error` is the mechanism: if the line below ever STOPS being an error,
// tsc fails with "Unused '@ts-expect-error' directive" — which is exactly what makes
// the negative tests in .claude/rules/testing.md load-bearing rather than decorative.
import { expectTypeOf } from 'expect-type'

const answer: number = 42

// @ts-expect-error — a number is not assignable to a string.
const wrong: string = answer

expectTypeOf(answer).toEqualTypeOf<number>()
expectTypeOf(wrong).toEqualTypeOf<string>()
