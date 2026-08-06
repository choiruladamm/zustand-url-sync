import { guard, warn } from '../core/dev.js'

/**
 * The three methods a storage backend has to provide, matching the shape Zustand's own `persist`
 * uses so an existing custom storage drops in unchanged.
 *
 * Synchronous by design: precedence resolves during store creation, and a value that arrives after
 * that would land on top of the URL — the exact failure this tier exists to avoid. An async
 * backend belongs behind the official `persist` middleware instead.
 */
export type StateStorage = {
  getItem(name: string): string | null
  setItem(name: string, value: string): void
  removeItem(name: string): void
}

/**
 * Wraps a backend so nothing it does can reach the host app. Reads that throw report "absent",
 * writes that throw are dropped — a full quota degrades the tier, it does not break the store.
 *
 * The getter is a function rather than the object itself because reading `localStorage` can
 * *itself* throw: with third-party storage blocked, the property access is what raises, before any
 * method is ever called.
 */
export function guardStorage(get: () => StateStorage | undefined): StateStorage | undefined {
  const backend = guard('storage access', get)
  if (!backend || typeof backend.getItem !== 'function') return undefined

  return Object.freeze({
    getItem: (name: string) => guard('storage.getItem', () => backend.getItem(name)) ?? null,
    setItem: (name: string, value: string) => {
      guard('storage.setItem', () => {
        backend.setItem(name, value)
      })
    },
    removeItem: (name: string) => {
      guard('storage.removeItem', () => {
        backend.removeItem(name)
      })
    },
  })
}

/**
 * Resolves one of the two web backends, or `undefined` where there is none — a server render, a
 * React Native bundle, or a browser with storage switched off.
 */
export function webStorage(kind: 'local' | 'session'): StateStorage | undefined {
  const resolved = guardStorage(() => {
    const scope = globalThis as { localStorage?: StateStorage; sessionStorage?: StateStorage }
    return kind === 'local' ? scope.localStorage : scope.sessionStorage
  })
  if (!resolved && typeof window !== 'undefined') {
    warn(
      `${kind}Storage is unavailable, so nothing will persist. The store still works and the URL ` +
        'still syncs; pass `persist.storage` to supply a backend of your own.',
    )
  }
  return resolved
}
