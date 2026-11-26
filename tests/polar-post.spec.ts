import { expect, test, type Page } from '@playwright/test'

function tile(page: Page, x: number, y: number) {
  return page.locator('.board .row').nth(y).locator('.cell').nth(x)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('blocks illegal moves and preserves a delivery when changing languages', async ({ page }) => {
  const metrics = page.locator('.metrics')
  await expect(page.locator('.board .cell')).toHaveCount(49)
  await tile(page, 0, 0).click()
  await expect(metrics).toContainText('12 h')
  await expect(tile(page, 3, 6)).toHaveClass(/\bplayer\b/)
  await tile(page, 2, 6).click()
  await expect(tile(page, 2, 6)).toHaveClass(/\bplayer\b/)
  await expect(tile(page, 3, 6)).not.toHaveClass(/\bplayer\b/)
  await tile(page, 2, 5).click()
  await expect(metrics).toContainText('1 / 3')
  await page.getByRole('button', { name: 'Suomi' }).click()
  await expect(page.getByRole('heading', { name: 'Napaposti' })).toBeVisible()
  await expect(metrics).toContainText('1 / 3')
  await page.getByRole('button', { name: 'Deutsch' }).click()
  await expect(page.getByRole('heading', { name: 'Polarpost', exact: true })).toBeVisible()
  await expect(metrics).toContainText('1 / 3')
})

test('completes a route in 11 hours and can restart', async ({ page }) => {
  const route = [[2,6],[2,5],[2,4],[3,4],[3,3],[4,3],[4,2],[3,2],[2,2],[2,1]]
  for (const [x, y] of route) await tile(page, x, y).click()
  await expect(page.locator('.metrics')).toContainText('3 / 3')
  await expect(page.getByRole('status')).toContainText('11')
  await expect(page.locator('.reachable')).toHaveCount(0)
  await page.getByRole('button', { name: 'Restart route' }).click()
  await expect(page.locator('.metrics')).toContainText('12 h')
  await expect(page.locator('.metrics')).toContainText('0 / 3')
})

test('closes the first pass at its deadline and ends the route at zero hours', async ({ page }) => {
  for (let step = 0; step < 4; step++) await tile(page, step % 2 === 0 ? 2 : 3, 6).click()
  await expect(tile(page, 3, 5)).toHaveClass(/\bclosed\b/)
  await tile(page, 3, 5).click()
  await expect(page.locator('.metrics')).toContainText('8 h')
  for (let step = 0; step < 8; step++) await tile(page, step % 2 === 0 ? 2 : 3, 6).click()
  await expect(page.locator('.metrics')).toContainText('0 h')
  await expect(page.locator('.reachable')).toHaveCount(0)
})

test('fills a tall phone viewport and gives extra height to the map', async ({ page }) => {
  const panel = page.locator('.page')
  const board = page.locator('.board')
  await page.setViewportSize({ width: 360, height: 840 })
  await expect(panel).toHaveCSS('width', '360px')
  await expect(panel).toHaveCSS('height', '840px')
  const initial = await board.boundingBox()
  await page.setViewportSize({ width: 360, height: 940 })
  await expect(panel).toHaveCSS('height', '940px')
  const taller = await board.boundingBox()
  expect(taller!.height - initial!.height).toBeCloseTo(100, 0)
  await expect(page.locator('.reset')).toBeInViewport({ ratio: 1 })
})
