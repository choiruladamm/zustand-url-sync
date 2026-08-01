import { parseWith } from './codec-runtime.js'
import { INVALID, type OnInvalid, type ParamEntry, type Source } from './types.js'

export type Resolution = {
  /** Keyed by `stateKey`. Always complete: every entry resolves to a value or its default. */
  values: Record<string, unknown>
  /** Which source won, per `stateKey`. Absent means the default won. */
  origin: Map<string, string>
}

/**
 * URL > storage > default, expressed as "lowest priority number holding a parseable
 * value wins". An `INVALID` at one source falls through to the next rather than aborting — a
 * hand-edited localStorage entry must not be able to veto the URL, or the reverse.
 */
export function resolveInitial(
  entries: readonly ParamEntry[],
  sources: readonly Source[],
  onInvalid?: OnInvalid,
): Resolution {
  const ordered = [...sources].sort((a, b) => a.priority - b.priority)
  const values: Record<string, unknown> = {}
  const origin = new Map<string, string>()

  for (const entry of entries) {
    let resolved = false
    for (const source of ordered) {
      const raw = source.read(entry.paramKey)
      if (raw === undefined) continue
      const parsed = parseWith(entry.spec, raw)
      if (parsed === INVALID) {
        onInvalid?.(entry.paramKey, raw)
        continue
      }
      values[entry.stateKey] = parsed
      origin.set(entry.stateKey, source.id)
      resolved = true
      break
    }
    if (!resolved) values[entry.stateKey] = entry.spec.default
  }

  return { values, origin }
}
