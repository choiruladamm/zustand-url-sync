import { type ParamDecl, type ParamValue, toSpec } from '../codecs/builder.js'
import { serializeWith } from '../core/codec-runtime.js'
import { applyDiff } from '../core/params.js'
import { resolveInitial } from '../core/precedence.js'
import type { OnInvalid, ParamEntry, ParamSpec, RawValue, Source } from '../core/types.js'

type ServerParams = Record<string, ParamDecl<unknown>>

/** The state shape a `params` record resolves to, key by key. */
type InferState<P extends ServerParams> = { [K in keyof P]: ParamValue<P[K]> }

type ServerConfig<P extends ServerParams> = {
  name: string
  params: P
  prefix?: string | true
  onInvalid?: OnInvalid
}

function buildSpecs<P extends ServerParams>(params: P): Record<string, ParamSpec> {
  const specs: Record<string, ParamSpec> = {}
  for (const [stateKey, decl] of Object.entries(params)) {
    specs[stateKey] = toSpec(decl) as ParamSpec
  }
  return specs
}

function buildEntries(specs: Readonly<Record<string, ParamSpec>>, prefix: string): ParamEntry[] {
  return Object.entries(specs).map(([stateKey, spec]) => ({
    stateKey,
    paramKey: `${prefix}${stateKey}`,
    spec,
    inUrl: true,
  }))
}

function resolvePrefix<P extends ServerParams>(config: ServerConfig<P>): string {
  if (config.prefix === true) {
    if (!config.name) {
      throw new Error('[zustand-url-sync] prefix: true requires a name to derive the prefix from.')
    }
    return `${config.name}_`
  }
  return config.prefix ?? ''
}

function toSearchParams(
  input: string | URLSearchParams | Record<string, string | string[] | undefined>,
): URLSearchParams {
  if (typeof input === 'string') {
    const at = input.indexOf('?')
    return new URLSearchParams(at === -1 ? input : input.slice(at + 1))
  }
  if (input instanceof URLSearchParams) {
    return new URLSearchParams(input)
  }
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v)
    } else {
      params.append(key, value)
    }
  }
  return params
}

function createUrlSource(params: URLSearchParams): Source {
  return {
    id: 'url',
    priority: 0,
    read(key: string): RawValue | undefined {
      const all = params.getAll(key)
      if (all.length === 0) return undefined
      return all.length === 1 ? all[0] : all
    },
    write() {},
  }
}

/**
 * Parse query params into typed state values — DOM-free, no React, no Zustand.
 * Accepts Next.js `searchParams` shape (`Record<string, string | string[] | undefined>`) directly.
 *
 * URL > default. Invalid params fall back to the declared default.
 */
export function parseSearchParams<P extends ServerParams>(
  search: string | URLSearchParams | Record<string, string | string[] | undefined>,
  config: ServerConfig<P>,
): Partial<InferState<P>> {
  const params = toSearchParams(search)
  const prefix = resolvePrefix(config)
  const specs = buildSpecs(config.params)
  const entries = buildEntries(specs, prefix)
  const source = createUrlSource(params)

  const { values } = resolveInitial(entries, [source], config.onInvalid)
  return values as Partial<InferState<P>>
}

/**
 * Build a `URLSearchParams` from state values, using the same serialization the client uses.
 * Useful for server-rendered `<Link href>` without instantiating a store.
 *
 * Defaults are omitted. `omitWhen` predicates are honoured.
 */
export function buildSearchParams<P extends ServerParams>(
  values: Partial<InferState<P>>,
  config: ServerConfig<P>,
): URLSearchParams {
  const prefix = resolvePrefix(config)
  const specs = buildSpecs(config.params)
  const entries = buildEntries(specs, prefix)

  const diff = new Map<string, RawValue | undefined>()
  for (const entry of entries) {
    const value = (values as Record<string, unknown>)[entry.stateKey]
    if (value === undefined) {
      diff.set(entry.paramKey, undefined)
      continue
    }
    const raw = serializeWith(entry.spec, value)
    diff.set(entry.paramKey, raw)
  }

  return applyDiff(new URLSearchParams(), diff)
}
