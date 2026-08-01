import type { Codec } from '../core/types.js'
import { type ArrayOptions, arrayCodec } from './array.js'
import { booleanCodec } from './boolean.js'
import { type ParamStart, start } from './builder.js'
import { enumCodec } from './enum.js'
import { floatCodec } from './float.js'
import { integerCodec } from './integer.js'
import { isoDateCodec } from './iso-date.js'
import { jsonCodec } from './json.js'
import { type NumberRange, numberRangeCodec } from './number-range.js'
import { jsonSchemaCodec, schemaCodec } from './schema.js'
import type { InferOutput, StandardSchemaV1 } from './standard-schema.js'
import { stringCodec } from './string.js'
import { timestampCodec } from './timestamp.js'

/** Either a bare codec or the result of another `c.*` call, so codecs nest. */
export type CodecLike<T> = Codec<T> | ParamStart<T>

const unwrap = <T>(input: CodecLike<T>): Codec<T> =>
  'codec' in input ? input.codec : (input as Codec<T>)

export type SchemaStart<T> = ParamStart<T> & {
  /** The param carries a JSON-serialized value rather than a bare string. */
  json(): ParamStart<T>
}

/**
 * The codec builders. Sugar over plain `Codec` objects — anything here can be hand-written and
 * passed to `c.custom`.
 */
export const c = Object.freeze({
  string: (): ParamStart<string> => start(stringCodec()),
  integer: (): ParamStart<number> => start(integerCodec()),
  float: (): ParamStart<number> => start(floatCodec()),
  boolean: (): ParamStart<boolean> => start(booleanCodec()),
  enum: <const V extends readonly string[]>(values: V): ParamStart<V[number]> =>
    start(enumCodec(values)),
  array: <T>(inner: CodecLike<T>, options?: ArrayOptions): ParamStart<T[]> =>
    // `arrayCodec` returns a `MultiCodec<T[]>`, which carries the required `eq`; TypeScript
    // cannot resolve `Codec`'s reference-type branch while `T` is generic.
    start(arrayCodec(unwrap(inner), options) as unknown as Codec<T[]>),
  isoDate: (): ParamStart<Date> => start(isoDateCodec()),
  timestamp: (): ParamStart<Date> => start(timestampCodec()),
  json: <T>(): ParamStart<T> => start(jsonCodec<T>()),
  numberRange: (): ParamStart<NumberRange> => start(numberRangeCodec()),
  schema: <S extends StandardSchemaV1>(schema: S): SchemaStart<InferOutput<S>> =>
    Object.freeze({
      ...start(schemaCodec(schema)),
      json: () => start(jsonSchemaCodec(schema)),
    }),
  custom: <T>(codec: Codec<T>): ParamStart<T> => start(codec),
})
