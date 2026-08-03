import type { UrlSyncApi } from 'zustand-url-sync'

/**
 * The middleware augments the store with `.urlSync` through a `declare module` block in the
 * library's source. An app that consumes the built package picks it up from the shipped types; this
 * helper exists so the examples read the handle in one place either way.
 */
export function urlSyncApi(store: unknown): UrlSyncApi {
  return (store as { urlSync: UrlSyncApi }).urlSync
}
