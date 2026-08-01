import { type Codec, INVALID } from '../core/types.js'

/** `?from=2026-08-01T00:00:00.000Z`. Readable in a shared link; sorts lexicographically. */
export function isoDateCodec(): Codec<Date> {
  return {
    parse: (raw) => {
      const time = Date.parse(raw)
      return Number.isNaN(time) ? INVALID : new Date(time)
    },
    serialize: (value) => value.toISOString(),
    eq: (a, b) => a.getTime() === b.getTime(),
  }
}
