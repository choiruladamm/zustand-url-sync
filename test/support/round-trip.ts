import { type CodecShape, INVALID, isMultiCodec } from '../../src/core/types.js'

/**
 * Serializes, pushes the result through a real `URLSearchParams`, and parses it back — so a codec
 * that only round-trips in memory but not through percent-encoding fails here rather than in
 * someone's shared link.
 */
export function throughUrl<T>(codec: CodecShape<T>, value: T): T | typeof INVALID {
  const params = new URLSearchParams()
  if (isMultiCodec(codec)) {
    for (const raw of codec.serializeMany(value)) params.append('v', raw)
    return codec.parseMany(params.getAll('v'))
  }
  params.set('v', codec.serialize(value))
  return codec.parse(params.get('v') ?? '')
}

/** The characters that break naive implementations, plus a few that break clever ones. */
export const HOSTILE_STRINGS = [
  '',
  ' ',
  ',',
  ',,',
  '%',
  '%2C',
  '%25',
  '+',
  '&',
  '=',
  '?',
  '#',
  '/',
  'a,b',
  'a%2Cb',
  'a+b',
  '日本語',
  '👋🏽',
  '\n\t',
  'null',
  'undefined',
] as const

export { INVALID }
