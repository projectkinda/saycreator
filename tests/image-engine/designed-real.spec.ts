// REAL model runs of Designed mode (skipped unless REAL_DESIGNED=1): the writer endpoints are the dev server's real ones. Saves a sheet of all slides side by side for
// each run, plus the same script in Quick mode (the designs removed from the saved project, no second model call) for comparison.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exampleScript } from '../../src/carousel/script';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/designed');
test.skip(!process.env.REAL_DESIGNED, 'real model runs only when REAL_DESIGNED=1');
test.describe.configure({ mode: 'serial' });
test.setTimeout(20 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });

const ex = JSON.parse(exampleScript('carousel')) as { slides: Record<string, unknown>[] };
const FROM_EXAMPLE = ex.slides.map((s) => [s.headline, s.sub, s.body, ...(Array.isArray(s.items) ? (s.items as string[]) : []), s.quote, s.label, s.note, s.cta].filter((x) => typeof x === 'string' && x).join('. ')).join('\n');
const PARAGRAPH = 'I film five videos in one afternoon once a week. The night before I write the five titles. I keep one setup so I never rebuild the lights. Then I edit all five back to back the next day. Batching saved me about six hours a week, and the videos feel more alike, which my viewers like.';

async function sheet(page: Page, file: string) {
  const data = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll<HTMLImageElement>('.cr-pic img')];
    const w = 300;
    const h = Math.round(w * 1.25);
    const c = document.createElement('canvas');
    c.width = imgs.length * (w + 10) + 10;
    c.height = h + 20;
    const g = c.getContext('2d')!;
    g.fillStyle = '#888';
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < imgs.length; i++) {
      const im = new Image();
      im.src = imgs[i].src;
      await im.decode();
      g.drawImage(im, 10 + i * (w + 10), 10, w, h);
    }
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
}

for (const [name, text] of [['example', FROM_EXAMPLE], ['paragraph', PARAGRAPH]] as const) {
  test(`real Designed run: ${name}`, async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await page.goto('/images/carousel');
    await page.getByLabel('Your text, idea or article').fill(text);
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByTestId('designed-card')).toBeVisible({ timeout: 15 * 60_000 });
    await expect(page.locator('.cr-card').getByText(/^Phone check:/).first()).toBeVisible({ timeout: 120_000 });
    await page.waitForTimeout(8000);
    const seconds = Math.round((Date.now() - t0) / 1000);
    const card = (await page.getByTestId('designed-card').innerText()).replace(/\n+/g, ' | ');
    fs.writeFileSync(path.join(OUT, `${name}.txt`), `seconds (click to drawn): ${seconds}\n${card}\n`);
    await sheet(page, path.join(OUT, `designed-${name}.png`));
    // the same script in Quick mode: take the designs out of the saved project, reload, no model call
    const key = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        try {
          const v = JSON.parse(localStorage.getItem(k)!);
          if (v?.doc?.designed) {
            delete v.doc.designed;
            localStorage.setItem(k, JSON.stringify(v));
            return k;
          }
        } catch { /* not a project */ }
      }
      return null;
    });
    if (key) {
      await page.reload();
      await expect(page.locator('.cr-card').getByText(/^Phone check:/).first()).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(6000);
      await sheet(page, path.join(OUT, `quick-${name}.png`));
    }
    fs.appendFileSync(path.join(OUT, `${name}.txt`), `quick comparison saved: ${!!key}\n`);
  });
}
