import { warn } from '../core/dev.js'
import { sameRaw } from '../core/params.js'
import type { RawValue, Source } from '../core/types.js'
import type { StateStorage } from './guarded.js'

export const STORAGE_SOURCE_ID = 'storage'

/** Priority 1: below the URL, above the store defaults. */
const STORAGE_PRIORITY = 1

/**
 * One entry per store rather than one per key, so a flush is a single `setItem` no matter how many
 * keys moved. `v` is the declared `version`; `s` holds the **serialized** form of each value —
 * byte-identical to what the URL would carry, which is what lets a key move between `params` and
 * `persist.extra` without a migration.
 */
type Blob = { v: number; s: Record<string, RawValue> }

export type StorageSourceOptions = {
  /** Namespaces the entry, so two stores in one app never share a slot. */
  name: string
  storage: StateStorage
  /** The param keys this source owns. Anything else in a write is another store's business. */
  keys: readonly string[]
  version: number
  migrate?:
    | ((persisted: Record<string, unknown>, from: number) => Record<string, unknown>)
    | undefined
}

export function storageKey(name: string): string {
  return `zustand-url-sync:${name}`
}

function isRawValue(value: unknown): value is RawValue {
  if (typeof value === 'string') return true
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/** Keeps the declared keys whose stored form is still a raw value; drops the rest silently. */
function collect(
  stored: Record<string, unknown>,
  owned: ReadonlySet<string>,
): Map<string, RawValue> {
  const values = new Map<string, RawValue>()
  for (const key of owned) {
    const value = stored[key]
    if (isRawValue(value)) values.set(key, value)
  }
  return values
}

function readBlob(raw: string): Blob | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const blob = parsed as Partial<Blob>
  if (typeof blob.v !== 'number') return undefined
  if (typeof blob.s !== 'object' || blob.s === null || Array.isArray(blob.s)) return undefined
  return { v: blob.v, s: blob.s }
}

/**
 * The stored half of the source list. Corruption is not a special case: a value that survives to
 * `read` still goes through the codec, so a hand-edited entry takes the same `INVALID` path as a
 * hostile URL param and degrades to the default.
 *
 * There is no `subscribe`: cross-tab sync is not in this version, and a store that reacted to
 * another tab's preferences without reacting to its URL would be inconsistent, not helpful.
 */
export function createStorageSource(options: StorageSourceOptions): Source {
  const { storage, version, migrate } = options
  const entry = storageKey(options.name)
  const owned = new Set(options.keys)
  const values = load()

  function load(): Map<string, RawValue> {
    const raw = storage.getItem(entry)
    if (raw === null) return new Map()

    const blob = readBlob(raw)
    if (!blob) {
      // Wholesale, not partial: a half-restored preference set is more confusing than a reset one.
      warn(`the stored entry "${entry}" is unreadable and was discarded.`)
      return new Map()
    }
    if (blob.v === version) return collect(blob.s, owned)
    if (blob.v > version) {
      // A user who downgraded must not crash on a format from the future.
      warn(`the stored entry "${entry}" is version ${blob.v}, newer than ${version}; discarded.`)
      return new Map()
    }
    if (!migrate) {
      warn(
        `the stored entry "${entry}" is version ${blob.v} but ${version} is declared, and there ` +
          'is no `persist.migrate` to upgrade it; discarded.',
      )
      return new Map()
    }

    let migrated: Record<string, unknown>
    try {
      migrated = migrate(blob.s, blob.v)
    } catch (error) {
      warn(`\`persist.migrate\` threw and the stored entry was discarded: ${String(error)}`)
      return new Map()
    }
    if (typeof migrated !== 'object' || migrated === null) return new Map()

    const upgraded = collect(migrated, owned)
    save(upgraded)
    return upgraded
  }

  function save(next: ReadonlyMap<string, RawValue>): void {
    const s: Record<string, RawValue> = {}
    for (const [key, value] of next) s[key] = value
    storage.setItem(entry, JSON.stringify({ v: version, s } satisfies Blob))
  }

  return Object.freeze({
    id: STORAGE_SOURCE_ID,
    priority: STORAGE_PRIORITY,

    read(key: string) {
      return values.get(key)
    },

    /**
     * One `setItem` for the whole batch, and none at all when nothing this source owns moved —
     * a store whose only change was an undeclared param must not rewrite the entry.
     */
    write(diff: ReadonlyMap<string, RawValue | undefined>) {
      let changed = false
      for (const [key, raw] of diff) {
        if (!owned.has(key)) continue
        if (raw === undefined) {
          changed = values.delete(key) || changed
          continue
        }
        if (sameRaw(values.get(key), raw)) continue
        values.set(key, raw)
        changed = true
      }
      if (changed) save(values)
    },
  })
}
