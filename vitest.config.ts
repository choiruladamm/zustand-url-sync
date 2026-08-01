import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // M0 ships no library code and therefore no tests. Flip to false once M1 lands.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Coverage is a smoke alarm for core/ only (.claude/rules/testing.md).
      include: ['src/core/**'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
})
