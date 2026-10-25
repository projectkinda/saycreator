// The "Style recreation" section of the Results screen: every slide its own card, references beside, verdicts.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/results-screen');
const STYLES = fs.readdirSync(path.join(ROOT, 'src/image-engine/styles'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1500, height: 1000 } });
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

const open = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Results' }).click();
  await expect(page.locator('#style-recreation article[aria-label^="Style"]').first()).toBeVisible();
};

test('every slide and card is its own card on the screen, with its layout, check result and four-way verdict', async ({ page }) => {
  await open(page);
  const s = page.locator('#style-recreation');
  await expect(s.locator('article[aria-label^="Style"]')).toHaveCount(STYLES.length);
  await expect(s.getByText(/Last run /)).toBeVisible();
  const cards = s.locator('.res-rec-card');
  await expect(cards).toHaveCount(STYLES.length * (4 * 7 + 3));
  const first = cards.first();
  await expect(first).toContainText('Layout:');
  await expect(first.locator('.chip')).toBeVisible();
  for (const v of ['matches', 'close', 'off', 'wrong']) await expect(first.getByRole('button', { name: v, exact: true })).toBeVisible();
  // Each picture is one slide (never a sheet): 1080 wide, 1350 or 1080 tall.
  const srcs = await cards.evaluateAll((els) => els.map((el) => (el.querySelector('img') as HTMLImageElement).src));
  const dims = await page.evaluate(async (list) => Promise.all(list.map((src) => new Promise<string>((res) => { const i = new Image(); i.onload = () => res(`${i.naturalWidth}x${i.naturalHeight}`); i.onerror = () => res('failed'); i.src = src; }))), srcs);
  expect([...new Set(dims)].sort()).toEqual(['1080x1080', '1080x1350']);
  expect(dims.filter((d) => d === '1080x1080').length).toBe(STYLES.length * 3);
  await s.locator('article').first().scrollIntoViewIfNeeded();
  await page.evaluate(() => document.getElementById('style-recreation')?.scrollIntoView());
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '07-recreation-section.png') });
  await s.locator('article').first().locator('.res-rec-card').nth(0).screenshot({ path: path.join(OUT, '06-recreation-card.png') });
});

test('Compare shows the style\'s reference sheets beside the slide; a click opens the slide full size', async ({ page }) => {
  await open(page);
  const s = page.locator('#style-recreation');
  const card = s.locator('.res-rec-card').first();
  await card.getByRole('button', { name: /Compare/ }).click();
  const dlg = page.locator('dialog.res-compare[open]');
  await expect(dlg).toBeVisible();
  expect(await dlg.locator('.res-compare-refs img').count()).toBeGreaterThanOrEqual(2);
  await expect(dlg.locator('.res-compare-ours img')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await card.locator('.res-pic').click();
  const view = page.locator('dialog.res-viewer[open]');
  await expect(view).toBeVisible();
  expect(await view.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1080);
  await page.keyboard.press('Escape');
});

test('a verdict on one slide is saved and exported with its style, layout and checker result', async ({ page }) => {
  await open(page);
  const card = page.locator('#style-recreation .res-rec-card').first();
  await card.getByRole('button', { name: 'close', exact: true }).click();
  await card.getByPlaceholder('why? (one line)').fill('right colours, type is softer');
  await page.reload();
  await expect(page.locator('#style-recreation .res-rec-card').first().getByPlaceholder('why? (one line)')).toHaveValue('right colours, type is softer');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export verdicts JSON' }).click();
  const file = path.join(OUT, 'export-recreation.json');
  await (await download).saveAs(file);
  const v = JSON.parse(fs.readFileSync(file, 'utf8')).verdicts.find((x: { kind: string }) => x.kind === 'style-slide');
  expect(v).toMatchObject({ step: 'style-recreation', verdict: 'close', reason: 'right colours, type is softer', option: expect.stringMatching(/slide 1 \(cover, cover-/), checker: { pass: expect.any(Boolean) } });
});
