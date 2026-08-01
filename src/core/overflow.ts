import { warn } from './dev.js'
import { fromEntries, serializeParams, toEntries } from './params.js'

export type OwnedKey = { key: string; priority: number }

export type BudgetResult = {
  params: URLSearchParams
  dropped: readonly string[]
}

/**
 * Drops params until the URL fits: ascending `priority`, and among equal priorities the
 * later-declared key goes first — declaration order is the closest thing to a stated importance
 * ranking, so the tail is what degrades.
 *
 * Keys the caller does not own are never dropped. Degrading someone else's params to make room
 * for ours would be a worse failure than a long URL.
 */
export function applyUrlBudget(
  params: URLSearchParams,
  owned: readonly OwnedKey[],
  maxUrlLength: number,
  reserved = 0,
): BudgetResult {
  const measure = (candidate: URLSearchParams): number => {
    const query = serializeParams(candidate)
    return reserved + (query.length === 0 ? 0 : query.length + 1)
  }

  if (measure(params) <= maxUrlLength) return { params, dropped: [] }

  const order = owned
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => Number.isFinite(entry.priority))
    .sort((a, b) => a.priority - b.priority || b.index - a.index)

  let entries = toEntries(params)
  const dropped: string[] = []
  for (const candidate of order) {
    if (measure(fromEntries(entries)) <= maxUrlLength) break
    const at = entries.findIndex(([key]) => key === candidate.key)
    if (at === -1) continue
    entries = entries.filter((_, index) => index !== at)
    dropped.push(candidate.key)
  }

  if (process.env.NODE_ENV !== 'production' && dropped.length > 0) {
    warn(
      `URL exceeded maxUrlLength (${maxUrlLength}); dropped ${dropped
        .map((key) => `"${key}"`)
        .join(', ')} in ascending .priority() order. The store still holds their values — raise ` +
        '.priority(n) on anything that must survive.',
    )
  }

  return { params: fromEntries(entries), dropped }
}
