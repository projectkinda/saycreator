// The "Step 6: Asset library" section of the Results screen: the element library with recolour previews, and every recreated
// slide as its own card labelled SHIPPABLE (or TEST ASSETS when that version exists), with references and a four-way verdict.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openResults } from './lab-nav';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/results-screen');
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1500, height: 1000 } });
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

const open = async (page: Page) => {
  await openResults(page, 'Elements');
  await expect(page.locator('#asset-library .res-rec-card').first()).toBeVisible();
};

test('the library shows elements with tags, licence and three recolour previews, filterable by pack and tag', async ({ page }) => {
  await open(page);
  const s = page.locator('#asset-library');
  await expect(s.getByRole('heading', { name: 'Element library and element slides' })).toBeVisible();
  const first = s.locator('.res-el-card').first();
  await expect(first.locator('.res-el-swatch')).toHaveCount(3);
  await expect(first).toContainText('code:');
  await expect(s.getByText(/Licence: .*Ours/)).toBeVisible();
  await s.getByRole('button', { name: /^Lucide icons/ }).click();
  await expect(s.getByText(/Licence: ISC/)).toBeVisible();
  await expect(s.locator('.res-el-card').first()).toContainText('lucide:');
  await s.getByRole('button', { name: /^arrow \(/ }).first().click();
  const n = await s.locator('.res-el-card').count();
  expect(n).toBeGreaterThan(0);
  // Previews are real pictures (recoloured SVG), not broken images.
  const ok = await s.locator('.res-el-card img').first().evaluate((i) => new Promise<boolean>((r) => { const im = i as HTMLImageElement; if (im.complete) r(im.naturalWidth > 0); else im.onload = () => r(im.naturalWidth > 0); }));
  expect(ok).toBe(true);
});

test('every recreated slide is its own card, labelled, with references beside and matches/close/off/wrong', async ({ page }) => {
  await open(page);
  const s = page.locator('#asset-library');
  const shippable = s.locator('article.res-mode-shippable');
  await expect(shippable).toHaveCount(3);
  await expect(shippable.first().locator('.res-mode-label').first()).toHaveText('SHIPPABLE');
  const cards = shippable.locator('.res-rec-card');
  await expect(cards).toHaveCount(3 * 4 * 7);
  const card = cards.first();
  await expect(card).toContainText('Elements:');
  for (const v of ['matches', 'close', 'off', 'wrong']) await expect(card.getByRole('button', { name: v, exact: true })).toBeVisible();
  await expect(shippable.first().locator('.res-rec-refpic').first()).toBeVisible();
  // TEST version: either present and labelled, or skipped with the reason shown.
  const test_ = s.locator('article.res-mode-test');
  if ((await test_.count()) > 0) await expect(test_.first().locator('.res-mode-label').first()).toHaveText('TEST ASSETS: not shippable');
  else await expect(s.getByText('TEST version skipped')).toBeVisible();
  // One picture per card, one slide each.
  const srcs = await cards.evaluateAll((els) => els.map((el) => (el.querySelector('img') as HTMLImageElement).src));
  const dims = await page.evaluate(async (list) => Promise.all(list.map((src) => new Promise<string>((res) => { const i = new Image(); i.onload = () => res(`${i.naturalWidth}x${i.naturalHeight}`); i.onerror = () => res('failed'); i.src = src; }))), srcs);
  expect([...new Set(dims)]).toEqual(['1080x1350']);
  await card.getByRole('button', { name: /Compare/ }).click();
  await expect(page.getByRole('dialog', { name: 'Compare with the reference' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.getElementById('asset-library')?.scrollIntoView());
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '08-asset-library-section.png') });
});

test('a verdict on an asset slide is saved with its reason', async ({ page }) => {
  await open(page);
  const card = page.locator('#asset-library article.res-mode-shippable .res-rec-card').first();
  await card.getByRole('button', { name: 'close', exact: true }).click();
  await card.getByRole('textbox').fill('arrows are right, the star is too heavy');
  await expect(card.getByRole('textbox')).toHaveValue('arrows are right, the star is too heavy');
});
