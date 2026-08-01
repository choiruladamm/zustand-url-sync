import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/codecs/index.ts',
    'src/react/index.ts',
    'src/server/index.ts',
    'src/adapters/*/index.ts',
  ],
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2020',
  dts: true,
  // `legacy: false` keeps main/module/types out of package.json — they fight the generated
  // exports map and publint flags the result (M0 trap list).
  exports: { legacy: false },
  treeshake: true,
  publint: true,
  attw: { enabled: 'ci-only', profile: 'node16' },
  clean: true,
})
