import { describe, expect, it } from 'vitest'
import { INVALID } from '../../core/types.js'
import { jsonSchemaCodec, schemaCodec } from '../schema.js'
import type { StandardSchemaV1 } from '../standard-schema.js'

/** A hand-rolled Standard Schema, to prove the bridge needs no validator library at runtime. */
const nonEmpty: StandardSchemaV1<unknown, string> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) =>
      typeof value === 'string' && value.length > 0
        ? { value }
        : { issues: [{ message: 'expected a non-empty string' }] },
  },
}

const asyncSchema: StandardSchemaV1<unknown, string> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) => Promise.resolve({ value: value as string }),
  },
}

describe('schemaCodec', () => {
  it('accepts what the schema accepts', () => {
    expect(schemaCodec(nonEmpty).parse('hello')).toBe('hello')
  })

  it('returns INVALID rather than throwing on a validation failure', () => {
    expect(schemaCodec(nonEmpty).parse('')).toBe(INVALID)
  })

  it('refuses an async validator instead of returning a promise as a value', () => {
    expect(schemaCodec(asyncSchema).parse('hello')).toBe(INVALID)
  })
})

describe('jsonSchemaCodec', () => {
  const objectSchema: StandardSchemaV1<unknown, { from: string }> = {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value) =>
        typeof value === 'object' && value !== null && 'from' in value
          ? { value: value as { from: string } }
          : { issues: [{ message: 'expected { from }' }] },
    },
  }

  it('parses JSON before validating', () => {
    expect(jsonSchemaCodec(objectSchema).parse('{"from":"2026-01-01"}')).toEqual({
      from: '2026-01-01',
    })
  })

  it('returns INVALID on malformed JSON', () => {
    expect(jsonSchemaCodec(objectSchema).parse('{oops}')).toBe(INVALID)
  })

  it('returns INVALID when the JSON is well formed but the schema rejects it', () => {
    expect(jsonSchemaCodec(objectSchema).parse('{"other":1}')).toBe(INVALID)
  })
})
