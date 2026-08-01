import { warn } from '../core/dev.js'
import { type Codec, type CodecShape, INVALID } from '../core/types.js'
import type { InferOutput, StandardSchemaV1 } from './standard-schema.js'

function validateSync<T>(schema: StandardSchemaV1, value: unknown): T | typeof INVALID {
  const result = schema['~standard'].validate(value)
  if (result instanceof Promise) {
    if (process.env.NODE_ENV !== 'production') {
      warn('c.schema() needs a synchronous validator; an async one always resolves to INVALID.')
    }
    return INVALID
  }
  if (result.issues) return INVALID
  return result.value as T
}

/** Validates the raw string. Use `.json()` when the param carries a serialized object. */
export function schemaCodec<S extends StandardSchemaV1>(schema: S): Codec<InferOutput<S>> {
  const codec: CodecShape<InferOutput<S>> = {
    parse: (raw) => validateSync<InferOutput<S>>(schema, raw),
    serialize: (value) => String(value),
  }
  // Callers reach this through `c.schema()`, which chooses the branch for them.
  return codec as Codec<InferOutput<S>>
}

export function jsonSchemaCodec<S extends StandardSchemaV1>(schema: S): Codec<InferOutput<S>> {
  const codec: CodecShape<InferOutput<S>> = {
    parse: (raw) => {
      let decoded: unknown
      try {
        decoded = JSON.parse(raw)
      } catch {
        return INVALID
      }
      return validateSync<InferOutput<S>>(schema, decoded)
    },
    serialize: (value) => JSON.stringify(value),
    eq: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  }
  return codec as Codec<InferOutput<S>>
}
