import type { StateCreator } from 'zustand/vanilla'
import { toSpec } from '../codecs/builder.js'
import { fail } from '../core/dev.js'
import { createEngine } from '../core/engine.js'
import { getScope } from '../core/scope.js'
import type { ParamSpec, UrlAdapter } from '../core/types.js'
import { searchOf } from '../core/url.js'
import { getDefaultAdapter } from './default-adapter.js'
import { createPersistTier } from './persist.js'
import { staticAdapter } from './static-adapter.js'
import type { ParamsDecl, UrlSync, UrlSyncApi, UrlSyncOptions } from './types.js'

type AnyState = Record<string, unknown>
type Setter = (partial: unknown, replace?: boolean) => void

function resolveAdapter(options: UrlSyncOptions<AnyState>): UrlAdapter {
  if (options.adapter) return options.adapter
  if (options.initialUrl !== undefined) return staticAdapter(options.initialUrl)
  const fallback = getDefaultAdapter()
  if (fallback) return fallback
  return fail(
    `store "${options.name}" has no URL adapter and there is no window to fall back to. ` +
      'Pass `adapter`, or `initialUrl` for a store built where no live URL exists.',
  )
}

function buildSpecs(params: ParamsDecl<AnyState>): Record<string, ParamSpec> {
  const specs: Record<string, ParamSpec> = {}
  for (const [stateKey, decl] of Object.entries(params)) {
    if (decl === undefined) continue
    specs[stateKey] = toSpec(decl) as ParamSpec
  }
  return specs
}

const urlSyncImpl =
  (
    initializer: StateCreator<AnyState, [], []>,
    options: UrlSyncOptions<AnyState>,
  ): StateCreator<AnyState, [], []> =>
  (set, get, api) => {
    const adapter = resolveAdapter(options)
    const prefix = options.prefix === true ? `${options.name}_` : (options.prefix ?? '')
    const rawSet = set as unknown as Setter
    const specs = buildSpecs(options.params)
    const tier = createPersistTier({
      name: options.name,
      prefix,
      params: specs,
      persist: options.persist,
    })

    let ready = false
    let hydrated = false
    const hydrationListeners = new Set<() => void>()

    const engine = createEngine<AnyState>({
      storeName: options.name,
      specs,
      sourceOnlySpecs: tier?.extraSpecs,
      sources: tier?.source ? [tier.source] : undefined,
      adapter,
      scope: getScope(adapter),
      prefix,
      maxUrlLength: options.maxUrlLength,
      onRouteChange: options.onRouteChange,
      onInvalid: options.onInvalid,
      // Adapter-originated writes take the raw setter, so they never feed back into the engine
      // and out to the URL again. The engine has already recorded what the URL says.
      onExternal: (patch) => {
        rawSet(patch, false)
      },
    })

    /**
     * `prev` is not captured here: the engine tracks what it believes the store holds, which is
     * the only view that stays correct after an external change. A function updater may touch
     * anything, so the whole next state is handed over and the engine diffs it.
     */
    const wrappedSet = ((partial: unknown, replace?: boolean) => {
      rawSet(partial, replace)
      if (ready) engine.onStateChange(get())
    }) as typeof set

    const notifyHydrated = (): void => {
      for (const listener of [...hydrationListeners]) listener()
      hydrationListeners.clear()
    }

    const handle: UrlSyncApi = Object.freeze({
      commit: (fn, o) => engine.commit(fn, o),
      flush: () => engine.flush(),
      toSearchParams: () => engine.toSearchParams(get()),
      patchFromUrl: (url) => {
        const patch = engine.applyParams(searchOf(url))
        if (patch) rawSet(patch, false)
      },
      pause: () => engine.pause(),
      resume: () => engine.resume(),
      reset: () => {
        rawSet(engine.reset(), false)
      },
      hydrate: () => {
        if (hydrated) return
        hydrated = true
        rawSet(engine.resolveInitial(pristine), false)
        notifyHydrated()
      },
      hasHydrated: () => hydrated,
      onHydrated: (cb) => {
        if (hydrated) {
          cb()
          return () => {}
        }
        hydrationListeners.add(cb)
        return () => hydrationListeners.delete(cb)
      },
      dispose: () => engine.dispose(),
    })

    const store = api as typeof api & { urlSync: UrlSyncApi }
    store.urlSync = handle
    // Assigned before the initializer runs so a nested middleware wraps *this* setter rather
    // than replacing it — `store.setState(...)` from outside has to reach the engine too.
    store.setState = wrappedSet

    const pristine = initializer(wrappedSet, get, api)
    ready = true
    if (options.skipHydration === true) return pristine

    hydrated = true
    // Merged rather than `set`: during creation zustand overwrites `state` with whatever the
    // initializer returns, so a `set` here would be discarded a line later.
    const merged = { ...pristine, ...engine.resolveInitial(pristine) }
    notifyHydrated()
    return merged
  }

/**
 * Syncs the declared keys of a store with the URL query string.
 *
 * The single cast in this file. Zustand's mutator pairs cannot be tracked through an
 * implementation typed loosely enough to run, so the contract lives in `UrlSync` and is applied
 * once, here — the same shape every official middleware uses.
 */
export const urlSync = urlSyncImpl as unknown as UrlSync
