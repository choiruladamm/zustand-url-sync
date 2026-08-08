import { expect, type Page, test } from '@playwright/test'
import type { AppCapabilities } from '../playwright.config.js'

/**
 * The one spec. Every example app renders the identical component, so a behavioural difference
 * between routers shows up here as a failing assertion rather than as a second spec file.
 */

const caps = (): AppCapabilities => test.info().project.metadata.caps as AppCapabilities

const query = (page: Page): URLSearchParams => new URLSearchParams(new URL(page.url()).search)

const state = async (
  page: Page,
): Promise<{ q: string; page: number; tags: string[]; view: string }> =>
  JSON.parse((await page.getByTestId('state').textContent()) ?? '{}')

/** The URL is written by a throttled queue, so assertions wait for it rather than racing it. */
const expectQuery = async (page: Page, key: string, value: string | null): Promise<void> => {
  await expect
    .poll(() => query(page).get(key), {
      timeout: 4000,
      message: `?${key} should be ${value}`,
    })
    .toBe(value)
}

/**
 * Paint is not readiness. The two Next apps ship server-rendered HTML, so every control is visible
 * and clickable before the bundle has run — an interaction in that window is dropped, and the test
 * then waits out its timeout on a URL nobody was listening for. `data-hydrated` is the app saying
 * its handlers are attached.
 */
const ready = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('adapter')).toHaveAttribute('data-hydrated', 'true')
}

const visit = async (page: Page, url: string): Promise<void> => {
  await page.goto(url)
  await ready(page)
}

test.beforeEach(async ({ page }) => {
  await visit(page, '/')
})

test('typing into search reaches the URL', async ({ page }) => {
  await page.getByTestId('q').fill('shoes')

  await expectQuery(page, 'q', 'shoes')
  expect((await state(page)).q).toBe('shoes')
})

test('a value equal to its default leaves the URL', async ({ page }) => {
  await page.getByTestId('q').fill('shoes')
  await expectQuery(page, 'q', 'shoes')

  await page.getByTestId('q').fill('')
  await expectQuery(page, 'q', null)
})

test('the multi-select round-trips through one param', async ({ page }) => {
  await page.getByTestId('tag-react').check()
  await page.getByTestId('tag-zustand').check()

  await expectQuery(page, 'tags', 'react,zustand')
  expect((await state(page)).tags).toEqual(['react', 'zustand'])
})

test('two stores share the URL without losing each other’s params', async ({ page }) => {
  await page.getByTestId('q').fill('shoes')
  await page.getByTestId('view').click()

  await expectQuery(page, 'view', 'list')
  await expectQuery(page, 'q', 'shoes')

  const seen = await state(page)
  expect(seen.q).toBe('shoes')
  expect(seen.view).toBe('list')
})

test('Back restores the previous state, Forward re-applies it', async ({ page }) => {
  // A push is what puts an entry on the stack; the default replace deliberately does not.
  await page.getByTestId('deep-write').click()
  await expectQuery(page, 'page', '2')

  await page.goBack()
  await expectQuery(page, 'page', null)
  expect((await state(page)).page).toBe(1)

  await page.goForward()
  await expectQuery(page, 'page', '2')
  expect((await state(page)).page).toBe(2)
})

test('a refresh restores the state from the URL', async ({ page }) => {
  await page.getByTestId('q').fill('shoes')
  await page.getByTestId('tag-router').check()
  await expectQuery(page, 'tags', 'router')

  await page.reload()
  await ready(page)

  const seen = await state(page)
  expect(seen.q).toBe('shoes')
  expect(seen.tags).toEqual(['router'])
})

test('a deep link renders its params on first paint', async ({ page }) => {
  await visit(page, '/?q=boots&page=4&tags=react,router&view=list')

  const seen = await state(page)
  expect(seen).toMatchObject({
    q: 'boots',
    page: 4,
    tags: ['react', 'router'],
    view: 'list',
  })
})

test('a server-rendered app hydrates a deep link without a hydration warning', async ({ page }) => {
  test.skip(!caps().ssrHtml, 'no server-rendered HTML to hydrate')

  const messages: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') messages.push(msg.text())
  })
  page.on('pageerror', (error) => messages.push(error.message))

  // Query params present on first paint is exactly the case that mismatches if the server and
  // the client ever resolve the initial state differently.
  await visit(page, '/?q=boots&page=4&tags=react,router&view=list')

  expect(messages.filter((message) => /hydrat/i.test(message))).toEqual([])
})

test('a garbage param renders defaults, does not crash, and is stripped', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await visit(page, '/?q=boots&page=not-a-number&view=sideways')

  expect(await state(page)).toMatchObject({
    q: 'boots',
    page: 1,
    view: 'grid',
  })
  await expectQuery(page, 'page', null)
  await expectQuery(page, 'view', null)
  // The valid param on the same URL survives the invalid ones.
  await expectQuery(page, 'q', 'boots')
  expect(errors).toEqual([])
})

test('30 rapid keystrokes produce no SecurityError and a correct final URL', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  const input = page.getByTestId('q')
  await input.click()
  // Typed one key at a time on purpose: `fill` is a single input event, which would never reach the
  // history rate limit. This is the case fake timers cannot reproduce.
  await input.pressSequentially('abcdefghijklmnopqrstuvwxyz0123', {
    delay: 15,
  })

  await expectQuery(page, 'q', 'abcdefghijklmnopqrstuvwxyz0123')
  expect(errors.filter((message) => /SecurityError|too many|throttl/i.test(message))).toEqual([])
  expect((await state(page)).q).toBe('abcdefghijklmnopqrstuvwxyz0123')
})

test('reset returns every declared key to its default and clears the URL', async ({ page }) => {
  await visit(page, '/?q=boots&page=4&tags=react')
  await page.getByTestId('reset').click()

  await expectQuery(page, 'q', null)
  await expectQuery(page, 'page', null)
  await expectQuery(page, 'tags', null)
  expect(await state(page)).toMatchObject({ q: '', page: 1, tags: [] })
})

test('flush resolves with the params that were written', async ({ page }) => {
  await page.getByTestId('flush').click()

  await expect(page.getByTestId('flush-result')).toContainText('q=flushed')
  await expectQuery(page, 'q', 'flushed')
})

test('a deep write re-runs the server, and is a plain write where there is none', async ({
  page,
}) => {
  const stamp = page.getByTestId('server-stamp')
  const before = await stamp.textContent()

  await page.getByTestId('deep-write').click()
  await expectQuery(page, 'page', '2')

  if (caps().rerunsOnDeepWrite) {
    await expect(stamp).not.toHaveText(before ?? '')
  } else {
    // No router behind the adapter, so `shallow: false` degrades to an ordinary history write.
    // The flag must never break the app that has nothing to opt out of.
    expect(await stamp.textContent()).toBe(before)
    expect((await state(page)).page).toBe(2)
  }
})

test('a shallow write skips the server unless the router owns the History API', async ({
  page,
}) => {
  const stamp = page.getByTestId('server-stamp')
  const before = await stamp.textContent()

  await page.getByTestId('q').fill('shoes')
  await expectQuery(page, 'q', 'shoes')

  if (caps().rerunsOnDeepWrite && !caps().shallowSkipsRouter) {
    // TanStack replaces `pushState`/`replaceState` with its own, so it observes a write that asked
    // to be shallow and re-runs the loader anyway. Asserted rather than skipped, because it is the
    // behaviour anyone pairing this adapter with a loader will hit.
    await expect(stamp).not.toHaveText(before ?? '')
  } else {
    expect(await stamp.textContent()).toBe(before)
  }
})
