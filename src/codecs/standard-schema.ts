/**
 * Standard Schema v1, inlined as types only. The spec is a type contract — there is nothing to
 * import at runtime — which is how zod / valibot / arktype support lands without a dependency.
 *
 * @see https://standardschema.dev
 */
export type StandardSchemaV1<Input = unknown, Output = Input> = {
  readonly '~standard': StandardSchemaV1Props<Input, Output>
}

export type StandardSchemaV1Props<Input = unknown, Output = Input> = {
  readonly version: 1
  readonly vendor: string
  readonly validate: (
    value: unknown,
  ) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>
  readonly types?: { readonly input: Input; readonly output: Output } | undefined
}

export type StandardSchemaV1Result<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<{ readonly message: string }> }

export type InferOutput<S extends StandardSchemaV1> = NonNullable<S['~standard']['types']>['output']
