// The Pick-a-style cards show a thumbnail drawn by the layout library for every built-in preset (ZERO model calls; static). Screenshot: out/presets-v7/picker.png
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(120_000);
test.use({ viewport: { width: 1280, height: 900 } });

test('every built-in preset card shows a library-drawn thumbnail', async ({ page }) => {
  let calls = 0;
  await page.route('**/*carousel/write', (r) => { calls++; return r.abort(); });
  await page.goto('/images/carousel');
  const list = page.getByRole('list', { name: 'Styles' });
  await expect(list).toBeVisible();
  const imgs = list.locator('img[alt^="Preview of the"]');
  await expect(imgs).toHaveCount(15, { timeout: 90_000 });
  // each is a blob picture from the library route (not 'Drawing…')
  await expect(list.getByText('Drawing…')).toHaveCount(0);
  for (const n of ['Mono editorial glow', 'Bold orange', 'Cream ink', 'Electric blue play', 'Green elegant serif', 'Cream social profile', 'Pink serif stickers', 'Black holographic']) await expect(list.getByRole('button', { name: new RegExp(n) })).toBeVisible();
  fs.mkdirSync('out/presets-v7', { recursive: true });
  await list.screenshot({ path: 'out/presets-v7/picker.png' });
  expect(calls).toBe(0);
});
