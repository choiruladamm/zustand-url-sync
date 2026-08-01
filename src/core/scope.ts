import { createQueue, type Queue } from './queue.js'
import { createRegistry, type Registry } from './registry.js'
import type { UrlAdapter } from './types.js'

export type Scope = {
  queue: Queue
  registry: Registry
}

/**
 * The adapter instance is the scope root. This `WeakMap` is module-level but is **not** state a
 * request can corrupt: entries are keyed by an object the request itself owns and die with it.
 * That inversion of ownership is what makes it the one permitted exception to invariant 6.
 */
const scopes = new WeakMap<UrlAdapter, Scope>()

export function getScope(adapter: UrlAdapter): Scope {
  const existing = scopes.get(adapter)
  if (existing) return existing
  const created: Scope = Object.freeze({
    queue: createQueue(adapter),
    registry: createRegistry(),
  })
  scopes.set(adapter, created)
  return created
}
