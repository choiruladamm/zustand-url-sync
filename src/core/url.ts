/**
 * Splitting a URL *string* into a path and a query. Distinct from `params.ts`, which only ever
 * handles an already-parsed `URLSearchParams`.
 *
 * A string with no `?` has no query — not "the whole string is the query". Guessing the other way
 * would turn `patchFromUrl('/products')` into a param literally named `/products`.
 */

export function searchOf(url: string): URLSearchParams {
  const at = url.indexOf('?')
  if (at === -1) return new URLSearchParams()
  const rest = url.slice(at + 1)
  const hash = rest.indexOf('#')
  return new URLSearchParams(hash === -1 ? rest : rest.slice(0, hash))
}

export function pathnameOf(url: string): string {
  const end = url.search(/[?#]/)
  return end === -1 ? url : url.slice(0, end)
}
