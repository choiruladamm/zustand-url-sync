// `process.env.NODE_ENV` is the strip marker every bundler understands, so dev-only code is
// guarded with it. Declaring it here rather than depending on @types/node keeps `src/core/**`
// free of an ambient Node dependency it does not otherwise have.
declare const process: {
  env: { NODE_ENV?: string | undefined } & Record<string, string | undefined>
}
