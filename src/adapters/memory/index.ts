import { serializeParams } from '../../core/params.js'
import type { AdapterWriteOptions, UrlAdapter } from '../../core/types.js'

export type MemoryAdapter = UrlAdapter & {
  /** The full current URL, for assertions. */
  url(): string
  /** Simulates the Back button: notifies subscribers, the way `popstate` does. */
  back(): void
  forward(): void
  /** Simulates an external navigation (a router pushing a new route). */
  navigate(url: string): void
  entries(): readonly string[]
}

const split = (url: string): [string, string] => {
  const at = url.indexOf('?')
  return at === -1 ? [url, ''] : [url.slice(0, at), url.slice(at + 1)]
}

/**
 * The substrate every core test runs on: a real history stack with no DOM. Also the adapter for
 * Node and React Native, where there is no URL to own.
 */
export function memoryAdapter(initialUrl = '/'): MemoryAdapter {
  const stack: string[] = [initialUrl]
  let index = 0
  const listeners = new Set<() => void>()

  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }

  const current = (): string => stack[index] ?? '/'

  return Object.freeze({
    read() {
      return new URLSearchParams(split(current())[1])
    },
    write(next: URLSearchParams, options: AdapterWriteOptions) {
      const query = serializeParams(next)
      const url = query === '' ? split(current())[0] : `${split(current())[0]}?${query}`
      if (options.history === 'push') {
        stack.splice(index + 1)
        stack.push(url)
        index = stack.length - 1
      } else {
        stack[index] = url
      }
      // A programmatic write never fires `popstate`; neither does this one.
    },
    subscribe(onExternalChange: () => void) {
      listeners.add(onExternalChange)
      return () => listeners.delete(onExternalChange)
    },
    pathname() {
      return split(current())[0]
    },
    url: current,
    back() {
      if (index === 0) return
      index -= 1
      notify()
    },
    forward() {
      if (index >= stack.length - 1) return
      index += 1
      notify()
    },
    navigate(url: string) {
      stack.splice(index + 1)
      stack.push(url)
      index = stack.length - 1
      notify()
    },
    entries() {
      return [...stack]
    },
  })
}
