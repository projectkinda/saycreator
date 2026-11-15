// Round N part 4b: screens that CONTAIN photos (the carousel page with a photo deck, the picture picker, the Style step, a mock social feed; each a PNG and a JPEG at quality 0.8, made by
// out/round-n/swp.cjs) are screenshots for the app's own prepare(), and the 7 real photos stay photos. The classifier is unchanged (no picture crossed the photo line); this spec keeps it so.
// Skipped when the pictures are not on this computer (they are under out/, never in git).
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SCREENS = process.env.ROUND_N_SCREENS_DIR ?? 'out/round-n/swp';
const PHOTOS_DIR = process.env.REAL_PICTURES_DIR ?? 'out/test-pictures';
const NAMES = ['app-deck-desktop', 'app-deck-phone', 'app-picker', 'app-style-step', 'mock-feed-phone', 'mock-feed-desktop'];
const PHOTOS = ['sky-tower.jpg', 'motorbike-street.jpg', 'sunrays-palms.jpg', 'tree-road.jpg', 'landscape-crop.jpg', 'tall-crop.jpg', 'wide-film-still.jpg'];

const read = (page: Page, file: string) => page.evaluate(async ({ b64, name }) => {
  const PL: any = await import('/src/carousel/photoLibrary.ts');
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const p = await PL.prepare(new File([u], name, { type: /png$/.test(name) ? 'image/png' : 'image/jpeg' }), 'photo');
  return { content: p.reading?.content, grain: p.reading?.grain, top16: p.reading?.top16, why: p.reading?.why };
}, { b64: fs.readFileSync(file).toString('base64'), name: path.basename(file) });

test('N4b: the 12 screens with photos in them are screenshots; the 7 real photos are photos', async ({ page }) => {
  const screens = NAMES.flatMap((n) => [`${n}.png`, `${n}.jpg`]).map((f) => path.join(SCREENS, f));
  test.skip(!screens.every((f) => fs.existsSync(f)) || !PHOTOS.every((f) => fs.existsSync(path.join(PHOTOS_DIR, f))), 'the Round N screens or the real photos are not on this computer');
  await page.goto('/images/carousel');
  for (const f of screens) {
    const r = await read(page, f);
    expect(r.content, `${path.basename(f)}: grain ${r.grain}, top16 ${r.top16} (${r.why})`).toBe('screenshot');
  }
  for (const f of PHOTOS) {
    const r = await read(page, path.join(PHOTOS_DIR, f));
    expect(r.content, `${f}: grain ${r.grain}, top16 ${r.top16} (${r.why})`).toBe('photo');
  }
});
