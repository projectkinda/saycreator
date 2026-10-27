// Slides on the Results screen (they used to be the "Style recreation" section): every slide and quote card is its own card,
// each style and script is reached from the two lists, and a verdict is saved and exported with its style, layout and checker result.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openResults, scriptList, styleList } from './lab-nav';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/results-screen');
const STYLES = fs.readdirSync(path.join(ROOT, 'src/image-engine/styles'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1500, height: 1000 } });
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

test('every slide and card is its own card, with its layout, check result and four-way verdict (all styles, all scripts)', async ({ page }) => {
  test.setTimeout(180_000);
  await openResults(page, 'Slides');
  const style = styleList(page);
  const script = scriptList(page);
  await expect(style.locator('option')).toHaveCount(STYLES.length);
  const cards = page.locator('.res-pane:not([hidden]) .res-rec-card');
  const srcs: string[] = [];
  let total = 0;
  let quoteCards = 0;
  for (const s of STYLES) {
    await style.selectOption(s);
    const values = (await script.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).filter((v) => !v.startsWith('photo:'));
    expect(values, `${s} has the four decks and the quote cards`).toHaveLength(5);
    for (const v of values) {
      await script.selectOption(v);
      const n = await cards.count();
      expect(n).toBe(v === 'quote-cards' ? 3 : 7);
      total += n;
      if (v === 'quote-cards') quoteCards += n;
      if (s === STYLES[0] && v === values[0]) {
        const first = cards.first();
        await expect(first).toContainText('Layout');
        await expect(first.locator('.chip').first()).toBeVisible();
        for (const w of ['matches', 'close', 'off', 'wrong']) await expect(first.getByRole('button', { name: w, exact: true })).toBeVisible();
      }
      srcs.push(...(await cards.evaluateAll((els) => els.map((el) => (el.querySelector('img') as HTMLImageElement).src))));
    }
  }
  expect(total).toBe(STYLES.length * (4 * 7 + 3));
  // Each picture is one slide (never a sheet): 1080 wide, 1350 or 1080 tall.
  const dims = await page.evaluate(async (list) => Promise.all(list.map((src) => new Promise<string>((res) => { const i = new Image(); i.onload = () => res(`${i.naturalWidth}x${i.naturalHeight}`); i.onerror = () => res('failed'); i.src = src; }))), srcs);
  expect([...new Set(dims)].sort()).toEqual(['1080x1080', '1080x1350']);
  expect(dims.filter((d) => d === '1080x1080').length).toBe(quoteCards);
});

test('a verdict on one slide is saved and exported with its style, layout and checker result', async ({ page }) => {
  await openResults(page, 'Slides');
  const card = page.locator('.res-pane:not([hidden]) .res-rec-card').first();
  await card.getByRole('button', { name: 'close', exact: true }).click();
  await card.getByPlaceholder('why? (one line)').fill('right colours, type is softer');
  await page.reload();
  await expect(page.locator('.res-pane:not([hidden]) .res-rec-card').first().getByPlaceholder('why? (one line)')).toHaveValue('right colours, type is softer');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export verdicts JSON' }).click();
  const file = path.join(OUT, 'export-recreation.json');
  await (await download).saveAs(file);
  const v = JSON.parse(fs.readFileSync(file, 'utf8')).verdicts.find((x: { kind: string }) => x.kind === 'style-slide');
  expect(v).toMatchObject({ step: 'style-recreation', verdict: 'close', reason: 'right colours, type is softer', option: expect.stringMatching(/slide 1 \(cover, cover-/), checker: { pass: expect.any(Boolean) } });
});
