/**
 * Encodes the layer table in `.claude/rules/architecture.md`.
 * Imports flow DOWN only: core > codecs > storage > middleware > react.
 * adapters and server sit off to the side and see core (+ codecs) only.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'A cycle means the layering is wrong, not that the resolver needs help.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-is-pure',
      severity: 'error',
      comment: 'src/core/** must run in Node with no shims: no DOM, no React, no zustand, no deps.',
      from: { path: '^src/core/' },
      to: { pathNot: '^src/core/' },
    },
    {
      name: 'codecs-import-core-only',
      severity: 'error',
      from: { path: '^src/codecs/' },
      to: { pathNot: '^src/(core|codecs)/' },
    },
    {
      name: 'adapters-import-core-only',
      severity: 'error',
      comment: 'An adapter sees the UrlAdapter contract and nothing else in this package.',
      from: { path: '^src/adapters/' },
      to: { pathNot: '^src/(core|adapters)/' },
    },
    {
      name: 'storage-import-core-codecs-only',
      severity: 'error',
      from: { path: '^src/storage/' },
      to: { pathNot: '^src/(core|codecs|storage)/' },
    },
    {
      name: 'server-import-core-codecs-only',
      severity: 'error',
      comment: 'src/server/** is DOM-free parsing. It never reaches the middleware.',
      from: { path: '^src/server/' },
      to: { pathNot: '^src/(core|codecs|server)/' },
    },
    {
      name: 'middleware-not-import-react',
      severity: 'error',
      comment: 'react/ sits above middleware/. The arrow only points down.',
      from: { path: '^src/middleware/' },
      to: { path: '^(src/react/|node_modules/react)' },
    },
    {
      name: 'react-import-allowed-layers-only',
      severity: 'error',
      from: { path: '^src/react/' },
      to: { pathNot: '^(src/(core|middleware|react)/|node_modules/react)' },
    },
    {
      name: 'no-runtime-dependencies',
      severity: 'error',
      comment: 'Invariant 1: `dependencies` stays {}. Only peers and devDeps may be imported.',
      from: { path: '^src/' },
      to: { dependencyTypes: ['npm'] },
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment:
        'Peers are fine (zustand, react, the router peers). A devDependency that is not also ' +
        'a peer would ship as an undeclared import.',
      from: { path: '^src/' },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['npm-peer', 'type-only'] },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'index.ts files are barrels and build entrypoints — orphaned by design.',
      from: {
        orphan: true,
        pathNot: ['(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$', '\\.d\\.ts$', '(^|/)index\\.ts$'],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.cjs', '.mjs', '.ts', '.tsx', '.d.ts'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
}
