import { readRaw } from './params.js'
import type { Source, UrlAdapter } from './types.js'

export const URL_SOURCE_ID = 'url'

/**
 * The URL as one `Source` among several, so precedence never needs to know which
 * source it is talking to.
 *
 * `write` is a no-op: URL writes go through the per-adapter queue, which is what coalesces them
 * across stores, merges history options across a batch, applies the length budget and
 * awaits async router navigations. None of that fits a per-key `Source.write`.
 */
export function createUrlSource(adapter: UrlAdapter): Source {
  return Object.freeze({
    id: URL_SOURCE_ID,
    priority: 0,
    read(key: string) {
      return readRaw(adapter.read(), key)
    },
    write() {},
    subscribe(onExternalChange: () => void) {
      return adapter.subscribe(onExternalChange)
    },
  })
}
