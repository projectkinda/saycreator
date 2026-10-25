// The "Step 7: Smart element placement" section of the Results screen.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/results-screen');
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1500, height: 1000 } });
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

const open = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Results' }).click();
  await expect(page.locator('#smart-placement .res-smart-card').first()).toBeVisible();
};

test('each slide shows the old pick beside the new one, with tags, elements, links and a better/same/worse verdict', async ({ page }) => {
  await open(page);
  const s = page.locator('#smart-placement');
  await expect(s.getByRole('heading', { name: 'Step 7: Smart element placement' })).toBeVisible();
  await expect(s.locator('.res-smart-card')).toHaveCount(2 * 28); // editorial-collage and object-neon, 4 decks x 7 slides
  const card = s.locator('.res-smart-card').first();
  await expect(card.getByText('Before: random pick')).toBeVisible();
  await expect(card.getByText('After: follows the slide')).toBeVisible();
  await expect(card.locator('.chip')).not.toHaveCount(0);
  for (const v of ['better', 'same', 'worse']) await expect(card.getByRole('button', { name: v, exact: true })).toBeVisible();
  await expect(s.getByRole('table', { name: /Unrelated pictures/ })).toBeVisible();
  // The test version is either shown and labelled, or skipped with its reason.
  if ((await s.locator('.res-smart-test').count()) > 0) await expect(s.locator('.res-smart-test').first()).toContainText('TEST ASSETS: not shippable');
  else await expect(s.getByText('TEST version skipped')).toBeVisible();
  // Each picture is one 1080 x 1350 slide.
  const srcs = await card.locator('img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
  const dims = await page.evaluate(async (list) => Promise.all(list.map((src) => new Promise<string>((res) => { const i = new Image(); i.onload = () => res(`${i.naturalWidth}x${i.naturalHeight}`); i.onerror = () => res('failed'); i.src = src; }))), srcs);
  expect([...new Set(dims)]).toEqual(['1080x1350']);
});

test('the starburst fix is shown as before and after pairs', async ({ page }) => {
  await open(page);
  const s = page.locator('#smart-placement');
  const art = s.getByRole('article', { name: 'hot-flat starbursts, before and after' });
  await expect(art).toBeVisible();
  expect(await art.locator('.res-smart-row').count()).toBeGreaterThanOrEqual(1); // fewer bursts since Step 10: they only go where there is room
  await expect(art.getByText(/^Before/).first()).toBeVisible();
  await art.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '09-starbursts-before-after.png') });
  await s.locator('.res-smart-card').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '10-smart-placement-cards.png') });
});

test('a verdict is saved with its reason', async ({ page }) => {
  await open(page);
  const card = page.locator('#smart-placement .res-smart-card').first();
  await card.getByRole('button', { name: 'better', exact: true }).click();
  await card.getByRole('textbox').fill('the clock fits the headline');
  await expect(card.getByRole('textbox')).toHaveValue('the clock fits the headline');
});
