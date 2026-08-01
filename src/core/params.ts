import type { RawValue } from './types.js'

/**
 * `URLSearchParams.delete` + `append` moves a key to the end, so every write would reshuffle the
 * query string and produce a different-looking URL for identical state. These helpers apply a diff
 * in place instead: existing keys keep their position, new keys append.
 */
export type ParamEntries = Array<[string, string[]]>

export function toEntries(params: URLSearchParams): ParamEntries {
  const out: ParamEntries = []
  const index = new Map<string, string[]>()
  for (const [key, value] of params) {
    const bucket = index.get(key)
    if (bucket) {
      bucket.push(value)
      continue
    }
    const created = [value]
    index.set(key, created)
    out.push([key, created])
  }
  return out
}

export function fromEntries(entries: ParamEntries): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, values] of entries) {
    for (const value of values) params.append(key, value)
  }
  return params
}

export function applyDiff(
  base: URLSearchParams,
  diff: ReadonlyMap<string, RawValue | undefined>,
): URLSearchParams {
  const entries = toEntries(base)
  for (const [key, raw] of diff) {
    const at = entries.findIndex(([k]) => k === key)
    if (raw === undefined) {
      if (at !== -1) entries.splice(at, 1)
      continue
    }
    const values = typeof raw === 'string' ? [raw] : [...raw]
    if (values.length === 0) {
      if (at !== -1) entries.splice(at, 1)
      continue
    }
    if (at === -1) entries.push([key, values])
    else entries[at] = [key, values]
  }
  return fromEntries(entries)
}

/**
 * The one place a query string is turned into text. `URLSearchParams.toString()` percent-encodes
 * `,` and `:`, which would render `?tags=react%2Czustand` and
 * `?from=2026-08-01T00%3A00%3A00.000Z` — both legal, both unreadable, and neither is what the
 * public format promises. Both characters are permitted unescaped in a query by RFC 3986 §3.4.
 *
 * This is safe against the array codec's own escaping: an element containing a real separator is
 * already `%2C`, which encodes to `%252C` here, and `%252C` does not contain the substring `%2C`.
 *
 * Wire format — changing this set is a major version.
 */
export function serializeParams(params: URLSearchParams): string {
  return params.toString().split('%2C').join(',').split('%3A').join(':')
}

export function readRaw(params: URLSearchParams, key: string): RawValue | undefined {
  const all = params.getAll(key)
  if (all.length === 0) return undefined
  return all.length === 1 ? all[0] : all
}
