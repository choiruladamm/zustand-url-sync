/** @type {import('next').NextConfig} */
const config = {
  // The shared app is raw TypeScript in a linked workspace package, so Next has to compile it
  // rather than treat it as a pre-built dependency.
  transpilePackages: ['@example/shared'],
}

export default config
