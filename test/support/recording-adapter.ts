import { type MemoryAdapter, memoryAdapter } from '../../src/adapters/memory/index.js'
import type { AdapterWriteOptions } from '../../src/core/types.js'

export type RecordedWrite = { params: URLSearchParams; options: AdapterWriteOptions }

export type RecordingAdapter = MemoryAdapter & {
  writes: RecordedWrite[]
  clearWrites(): void
}

/**
 * Factories return frozen objects (`.claude/rules/conventions.md`), so `vi.spyOn` cannot patch
 * `memoryAdapter`. Wrapping is the seam instead — and it records what was written rather than
 * just that a write happened.
 */
export function recordingAdapter(initialUrl = '/'): RecordingAdapter {
  const inner = memoryAdapter(initialUrl)
  const writes: RecordedWrite[] = []

  return Object.freeze({
    ...inner,
    read: inner.read,
    write(next: URLSearchParams, options: AdapterWriteOptions) {
      writes.push({ params: new URLSearchParams(next), options })
      return inner.write(next, options)
    },
    writes,
    clearWrites() {
      writes.length = 0
    },
  })
}
