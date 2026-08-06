import { toSpec } from '../codecs/builder.js'
import { fail, warn } from '../core/dev.js'
import type { ParamSpec, Source } from '../core/types.js'
import {
  createStorageSource,
  guardStorage,
  type StateStorage,
  webStorage,
} from '../storage/index.js'
import type { ParamsDecl, PersistOptions, StorageOption } from './types.js'

type AnyState = Record<string, unknown>

export type PersistTier = {
  /** Absent when storage is unavailable or switched off: the store runs URL-only. */
  source: Source | undefined
  /** Storage-only specs, keyed by state key. The engine prefixes them like any other param. */
  extraSpecs: Record<string, ParamSpec>
}

function resolveStorage(storage: StorageOption | undefined): StateStorage | undefined {
  if (storage === false) return undefined
  if (storage === undefined || storage === 'local') return webStorage('local')
  if (storage === 'session') return webStorage('session')
  // A backend of the user's own is guarded too — a throwing `setItem` must degrade, not propagate.
  return guardStorage(() => storage)
}

/**
 * Compiles the `persist` block into one `Source`. Both failure modes here are programmer error, so
 * both throw at setup: a `keys` entry with no codec would silently never persist, and a key
 * declared twice would have two defaults and two codecs for one slot.
 */
export function createPersistTier(options: {
  name: string
  prefix: string
  params: Readonly<Record<string, ParamSpec>>
  persist: PersistOptions<AnyState> | false | undefined
}): PersistTier | undefined {
  const persist = options.persist
  if (!persist) return undefined

  const keys = persist.keys ?? []
  for (const key of keys) {
    if (key in options.params) continue
    fail(
      `persist.keys names "${String(key)}" in store "${options.name}", which is not in \`params\`. ` +
        'Declare it as a param, or move it to `persist.extra` with its own codec.',
    )
  }

  const extraSpecs: Record<string, ParamSpec> = {}
  // `extra` is `params` minus the already-declared keys; over a loosely typed state the two shapes
  // are the same declaration map, and the key exclusion is enforced above by `fail`.
  const extra = (persist.extra ?? {}) as ParamsDecl<AnyState>
  for (const [stateKey, decl] of Object.entries(extra)) {
    if (decl === undefined) continue
    if (stateKey in options.params) {
      fail(
        `"${stateKey}" in store "${options.name}" is declared in both \`params\` and ` +
          '`persist.extra`. Drop the `persist.extra` entry and list it in `persist.keys` instead.',
      )
    }
    extraSpecs[stateKey] = toSpec(decl) as ParamSpec
  }

  const owned = [...keys, ...Object.keys(extraSpecs)].map(
    (key) => `${options.prefix}${String(key)}`,
  )
  if (owned.length === 0) {
    warn(
      `store "${options.name}" declares \`persist\` but neither \`keys\` nor \`extra\`, so nothing ` +
        'persists. Nothing is persisted without a declared codec.',
    )
    return { source: undefined, extraSpecs }
  }

  const storage = resolveStorage(persist.storage)
  if (!storage) return { source: undefined, extraSpecs }

  return {
    source: createStorageSource({
      name: options.name,
      storage,
      keys: owned,
      version: persist.version ?? 0,
      migrate: persist.migrate,
    }),
    extraSpecs,
  }
}
