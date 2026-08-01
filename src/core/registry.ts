import { fail, report } from './dev.js'

export type Registry = {
  /** Returns the release function. Throws in dev on a collision, naming both stores. */
  claim(keys: readonly string[], storeName: string): () => void
  owner(key: string): string | undefined
}

/**
 * Scoped to an adapter instance, never to the module: stores sharing an adapter are exactly the
 * stores sharing a URL, and on a server each request builds its own adapter.
 */
export function createRegistry(): Registry {
  const owners = new Map<string, string>()

  return Object.freeze({
    claim(keys, storeName) {
      for (const key of keys) {
        const existing = owners.get(key)
        if (existing !== undefined && existing !== storeName) {
          const message =
            `two stores claim the param "${key}": "${existing}" and "${storeName}". ` +
            'Give one of them a `prefix`, or drop the key from one `params` block.'
          if (process.env.NODE_ENV !== 'production') fail(message)
          report(message)
          continue
        }
        owners.set(key, storeName)
      }
      return () => {
        for (const key of keys) {
          if (owners.get(key) === storeName) owners.delete(key)
        }
      }
    },
    owner(key) {
      return owners.get(key)
    },
  })
}
