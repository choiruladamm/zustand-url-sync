import type { Codec } from '../core/types.js'

/**
 * Identity. `URLSearchParams` owns percent-encoding, so a codec always sees and returns the
 * decoded value — `+`, `%` and unicode need no handling here.
 */
export function stringCodec(): Codec<string> {
  return { parse: (raw) => raw, serialize: (value) => value }
}
