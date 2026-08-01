import { fail } from '../core/dev.js'
import { type Codec, type CodecShape, INVALID, type MultiCodec } from '../core/types.js'

export type ArrayMode = 'join' | 'repeat'

export type ArrayOptions = {
  /** `'join'` -> `?tags=a,b` · `'repeat'` -> `?tags=a&tags=b`. */
  mode?: ArrayMode
  /** Single character, and not `%`. Default `,`. */
  sep?: string
}

const token = (sep: string): string =>
  `%${sep.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`

/**
 * The non-negotiable half: the separator is escaped **inside each element before
 * joining**, so `['a,b']` and `['a','b']` can never produce the same query string. Escaping the
 * joined string instead round-trips in the happy path and corrupts the first time a user types a
 * comma into a filter.
 *
 * `%` goes first on the way in and last on the way out, which makes the pair exact inverses:
 * `'a%2Cb'` encodes to `'a%252Cb'`, and `'%2C'` never appears inside it to be mis-decoded.
 */
const encodeElement = (value: string, sep: string): string =>
  value.split('%').join('%25').split(sep).join(token(sep))

const decodeElement = (value: string, sep: string): string =>
  value.split(token(sep)).join(sep).split('%25').join('%')

export function arrayCodec<T>(inner: Codec<T>, options: ArrayOptions = {}): MultiCodec<T[]> {
  const mode = options.mode ?? 'join'
  const sep = options.sep ?? ','
  if (sep.length !== 1) fail(`c.array sep must be a single character, got "${sep}".`)
  if (sep === '%') fail('c.array sep cannot be "%" — it is the escape character.')

  const element = inner as CodecShape<T>
  const eqElement = element.eq ?? Object.is

  const parseElements = (parts: readonly string[]): T[] | typeof INVALID => {
    const out: T[] = []
    for (const part of parts) {
      const parsed = element.parse(part)
      if (parsed === INVALID) return INVALID
      out.push(parsed)
    }
    return out
  }

  return {
    multi: true,
    eq: (a, b) =>
      a.length === b.length && a.every((value, index) => eqElement(value, b[index] as T)),
    parse: (raw) =>
      mode === 'join'
        ? parseElements(raw.split(sep).map((part) => decodeElement(part, sep)))
        : parseElements([raw]),
    serialize: (value) =>
      value.map((item) => encodeElement(element.serialize(item), sep)).join(sep),
    parseMany: (raws) => {
      if (mode === 'repeat') return parseElements(raws)
      const first = raws[0]
      if (first === undefined) return []
      return parseElements(first.split(sep).map((part) => decodeElement(part, sep)))
    },
    serializeMany: (value) => {
      if (value.length === 0) return []
      if (mode === 'repeat') return value.map((item) => element.serialize(item))
      return [value.map((item) => encodeElement(element.serialize(item), sep)).join(sep)]
    },
  }
}
