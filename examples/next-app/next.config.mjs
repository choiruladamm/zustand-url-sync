import path from 'node:path'
import { fileURLToPath } from 'node:url'

// These examples install as their own pnpm workspace nested inside the library repo, so Next sees
// two lockfiles and has to guess which one bounds the project. The guess has to be the repo root —
// `zustand-url-sync` is linked from there and Turbopack refuses to compile files outside the root —
// so state it rather than leave it inferred.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** @type {import('next').NextConfig} */
const config = {
  turbopack: { root: repoRoot },
  // The shared app is raw TypeScript in a linked workspace package, so Next has to compile it
  // rather than treat it as a pre-built dependency.
  transpilePackages: ['@example/shared'],
}

export default config
