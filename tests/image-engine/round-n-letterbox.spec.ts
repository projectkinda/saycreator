// Round N part 3: letterbox bars. Found when a photo is added (the app's own prepare()), stored as a crop with the picture (the file is not changed), used before the fit; a "Keep the full
// picture" switch on the picture's row. Only the film still of the real photos is cropped; a generated photo with bars is; a generated dark photo-like picture without bars is not. ZERO model calls.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(4 * 60_000);
const DIR = process.env.REAL_PICTURES_DIR ?? 'out/test-pictures';
const PHOTOS = ['sky-tower.jpg', 'motorbike-street.jpg', 'sunrays-palms.jpg', 'tree-road.jpg', 'landscape-crop.jpg', 'tall-crop.jpg', 'wide-film-still.jpg'];
const POST = fs.readFileSync('tests/image-engine/script-route.spec.ts', 'utf8').match(/export const POST = `([\s\S]*?)`;/)![1];

/** A photo-like JPEG made in the page: grainy colour, with black bars of `bar` px top and bottom (0: none); `dark` makes the whole picture night-dark (noisy, never flat). */
async function makeJpeg(page: Page, w: number, h: number, bar: number, dark = false): Promise<Buffer> {
  const b64 = await page.evaluate(({ w, h, bar, dark }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(w, h);
    let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inBar = y < bar || y >= h - bar;
      const base = dark ? 4 + 30 * (x / w) * (y / h) : 60 + 120 * (y / h);
      const n = (rnd() - 0.5) * (dark ? 14 : 60);
      const v = inBar ? 0 : Math.max(0, base + n);
      img.data[i] = v; img.data[i + 1] = v * (dark ? 0.9 : 0.8); img.data[i + 2] = v * (dark ? 1.1 : 0.6); img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  }, { w, h, bar, dark });
  return Buffer.from(b64, 'base64');
}
const prepare = (page: Page, b64: string, name: string) => page.evaluate(async ({ b64, name }) => {
  const PL: any = await import('/src/carousel/photoLibrary.ts');
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const p = await PL.prepare(new File([u], name, { type: 'image/jpeg' }), 'photo');
  return { crop: p.crop ?? null, size: [p.stored.width, p.stored.height] };
}, { b64, name });

test('N3: the real photos: only the film still is cropped (its bars are baked in); the dark photos keep every row', async ({ page }) => {
  test.skip(!PHOTOS.every((f) => fs.existsSync(path.join(DIR, f))), 'the real test photos are not on this computer');
  await page.goto('/images/carousel');
  const out: Record<string, any> = {};
  for (const f of PHOTOS) out[f] = await prepare(page, fs.readFileSync(path.join(DIR, f)).toString('base64'), f);
  for (const f of PHOTOS.filter((x) => x !== 'wide-film-still.jpg')) expect(out[f].crop, f).toBeNull();
  const c = out['wide-film-still.jpg'].crop;
  expect(c, 'the film still has bars').not.toBeNull();
  expect(c.x).toBe(0);
  expect(c.w).toBe(597);
  expect(c.y).toBeGreaterThanOrEqual(35);
  expect(c.y + c.h).toBeLessThanOrEqual(335 - 35);
});

test('N3: generated pictures: a photo with bars is cropped, a dark photo-like picture without bars is not', async ({ page }) => {
  await page.goto('/images/carousel');
  const barred = await prepare(page, (await makeJpeg(page, 900, 600, 60)).toString('base64'), 'barred.jpg');
  const dark = await prepare(page, (await makeJpeg(page, 900, 600, 0, true)).toString('base64'), 'night.jpg');
  const thin = await prepare(page, (await makeJpeg(page, 900, 600, 8)).toString('base64'), 'thin.jpg');
  expect(barred.crop).not.toBeNull();
  expect(barred.crop.y).toBeGreaterThanOrEqual(58);
  expect(barred.crop.y + barred.crop.h).toBeLessThanOrEqual(600 - 58);
  expect(dark.crop, 'a dark picture with detail in every row').toBeNull();
  expect(thin.crop, 'bars under 3% of the height are not bars').toBeNull();
});

test('N3: in the app: the note and the switch on the picture row, the deck drawn without the bars, and back with the full picture (0 writer calls)', async ({ page }) => {
  let calls = 0;
  await page.route('**/__carousel/status', (x) => x.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (x) => x.fulfill({ json: { available: false } }));
  await page.route('**/__carousel/write', (x) => { calls++; return x.abort(); });
  await page.route('**/api/carousel/write', (x) => { calls++; return x.abort(); });
  await page.goto('/images/carousel');
  const buf = await makeJpeg(page, 1200, 680, 80);
  await page.getByLabel('Choose images for the slides').setInputFiles({ name: 'film-frame.jpg', mimeType: 'image/jpeg', buffer: buf });
  await page.getByTestId('image-0').waitFor({ timeout: 60_000 });
  const chip = page.getByTestId('image-0-content');
  if ((await chip.getAttribute('data-content')) === 'screenshot') await chip.click();
  const note = page.getByTestId('image-0-bars');
  await expect(note).toContainText('Black bars were cropped off.');
  const sw = page.getByTestId('image-0-full');
  await expect(sw).not.toBeChecked();
  await page.getByLabel('Your text or topic').fill(POST);
  await page.getByTestId('text-mode').getByRole('radio', { name: /Use my paragraphs as slides/ }).check();
  await page.locator('.cr-wiz-steps button').nth(2).click();
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.cr-film img').length >= 7, null, { timeout: 120_000 });
  const refs = () => page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc;
    return JSON.stringify(doc.designed.library.plan.specs.map((s: any) => s.fields)).match(/picture:[^"]+/g) ?? [];
  });
  const r1 = await refs();
  expect(r1.length, 'the picture is on a slide').toBeGreaterThan(0);
  expect(r1.every((r) => /w=1200&h=(\d+)/.exec(r) && Number(/h=(\d+)/.exec(r)![1]) <= 680 - 150), 'drawn at the size without its bars: ' + r1.join(' ')).toBe(true);
  // keep the full picture: the slides are drawn again at the full size, no writer call
  await page.locator('.cr-wiz-steps button').nth(0).click().catch(() => {});
  await page.getByTestId('image-0-full').check();
  await expect(note).toContainText('the full picture is used');
  await expect.poll(async () => (await refs()).every((r) => /w=1200&h=680/.test(r)), { timeout: 30_000 }).toBe(true);
  expect(calls).toBe(0);
});
