import type { StateStorage } from '../../src/storage/index.js'

export type MemoryStorage = StateStorage & {
  /** The backing map, so a test can seed a stored entry or read one back. */
  entries: Map<string, string>
  /** Counted rather than spied: the tier promises one write per flush, not one per key. */
  writes: number
}

export type MemoryStorageOptions = {
  /** Throws on every `setItem`, the way a full quota or Safari Private Mode does. */
  failWrites?: boolean
  failReads?: boolean
}

export function memoryStorage(options: MemoryStorageOptions = {}): MemoryStorage {
  const entries = new Map<string, string>()
  const storage = {
    entries,
    writes: 0,
    getItem(name: string) {
      if (options.failReads) throw new DOMException('SecurityError')
      return entries.get(name) ?? null
    },
    setItem(name: string, value: string) {
      if (options.failWrites) throw new DOMException('QuotaExceededError')
      storage.writes += 1
      entries.set(name, value)
    },
    removeItem(name: string) {
      entries.delete(name)
    },
  }
  return storage
}
