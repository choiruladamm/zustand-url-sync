import { defineConfig, devices } from '@playwright/test'

/**
 * One spec, five apps, two engines.
 *
 * WebKit is not optional. Safari's history rate limit is the constraint the write queue exists for,
 * and fake timers cannot reproduce it — only a real browser throwing `SecurityError` can.
 *
 * Each app is a project, and `use.baseURL` is what the shared spec navigates against. The
 * `capabilities` metadata says what an app can prove: a plain-history SPA has no server to re-run,
 * so the scenarios that assert on one skip there rather than being written twice.
 */

export type AppCapabilities = {
  /** A loader or a server component that re-runs on a non-shallow navigation. */
  rerunsOnDeepWrite: boolean
  /** Navigation resolves asynchronously, so `flush()` can be observed waiting on it. */
  asyncNavigation: boolean
  /**
   * A shallow write is invisible to the router. False for TanStack, which replaces
   * `window.history.pushState`/`replaceState` with its own and therefore sees every write.
   */
  shallowSkipsRouter: boolean
}

type App = {
  name: string
  port: number
  command: string
  cwd: string
  caps: AppCapabilities
}

const APPS: App[] = [
  {
    name: 'vite-history',
    port: 4301,
    command: 'pnpm --filter=@example/vite-history dev',
    cwd: 'vite-history',
    caps: {
      rerunsOnDeepWrite: false,
      asyncNavigation: false,
      shallowSkipsRouter: true,
    },
  },
  {
    name: 'react-router',
    port: 4302,
    command: 'pnpm --filter=@example/react-router dev',
    cwd: 'react-router',
    caps: {
      rerunsOnDeepWrite: true,
      asyncNavigation: true,
      shallowSkipsRouter: true,
    },
  },
  {
    name: 'tanstack',
    port: 4303,
    command: 'pnpm --filter=@example/tanstack dev',
    cwd: 'tanstack',
    caps: {
      rerunsOnDeepWrite: true,
      asyncNavigation: true,
      shallowSkipsRouter: false,
    },
  },
  {
    name: 'next-app',
    port: 4304,
    command: 'pnpm --filter=@example/next-app dev',
    cwd: 'next-app',
    caps: {
      rerunsOnDeepWrite: true,
      asyncNavigation: false,
      shallowSkipsRouter: true,
    },
  },
  {
    name: 'next-pages',
    port: 4305,
    command: 'pnpm --filter=@example/next-pages dev',
    cwd: 'next-pages',
    caps: {
      rerunsOnDeepWrite: true,
      asyncNavigation: true,
      shallowSkipsRouter: true,
    },
  },
]

const ENGINES = [
  { suffix: 'chromium', use: devices['Desktop Chrome'] },
  { suffix: 'webkit', use: devices['Desktop Safari'] },
]

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list']],

  projects: APPS.flatMap((app) =>
    ENGINES.map((engine) => ({
      name: `${app.name}:${engine.suffix}`,
      use: { ...engine.use, baseURL: `http://localhost:${app.port}` },
      metadata: { app: app.name, caps: app.caps },
    })),
  ),

  webServer: APPS.map((app) => ({
    command: app.command,
    url: `http://localhost:${app.port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  })),
})
