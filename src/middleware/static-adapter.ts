import type { UrlAdapter } from '../core/types.js'
import { pathnameOf, searchOf } from '../core/url.js'

/**
 * A URL that cannot change: what `initialUrl` resolves to. Reads params from a fixed string,
 * drops writes, never notifies.
 *
 * Dropping writes is the point rather than a limitation. On a server there is no history to push
 * to and no user to navigate; the response carries the URL the request already had. Because each
 * store builds its own instance, it is also its own scope root — one request cannot see another's
 * queue or param registry.
 */
export function staticAdapter(url: string): UrlAdapter {
  const params = searchOf(url)
  const path = pathnameOf(url)

  return Object.freeze({
    read() {
      return new URLSearchParams(params)
    },
    write() {},
    subscribe() {
      return () => {}
    },
    pathname() {
      return path
    },
  })
}
