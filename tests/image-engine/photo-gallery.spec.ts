// Step 11: the treatment gallery. One of the user's photos (TEST ASSETS, not shippable) under every treatment, mask, frame,
// background and object effect, each as its own plan and PNG. The Results screen shows these first.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGallery } from './photo-gallery';
import { GALLERY_PHOTO, photoUrl } from './photo-sets';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const GALLERY_DIR = path.join(ROOT, 'out/image-engine/step11/gallery');
const OBJECT_FILE = path.join(ROOT, 'out/image-engine/step11/synthetic-object.png');
const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

test.describe.configure({ mode: 'serial' });

test('treatment gallery: every treatment, mask, frame, background and object effect renders, each as its own plan and picture', async ({ page }) => {
  test.skip(!fs.existsSync(path.join(ROOT, 'test-assets', GALLERY_PHOTO)), 'The gallery photo is not in test-assets/.');
  test.setTimeout(240_000);
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto('/tests/image-engine/harness/index.html');
  await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
  await call(page, 'loadFonts');
  fs.rmSync(GALLERY_DIR, { recursive: true, force: true });
  fs.mkdirSync(GALLERY_DIR, { recursive: true });
  const obj = await call<{ b64: string }>(page, 'syntheticObject');
  fs.writeFileSync(OBJECT_FILE, Buffer.from(obj.b64, 'base64'));
  const items = buildGallery(photoUrl(GALLERY_PHOTO), '/out/image-engine/step11/synthetic-object.png');
  const index: unknown[] = [];
  for (const it of items) {
    const problems = await call<string[]>(page, 'validate', it.plan);
    expect(problems, `${it.id} is a valid plan`).toEqual([]);
    const r = await call<{ b64: string; width: number; height: number; report: { warnings: { code: string; message?: string }[] } }>(page, 'renderPlan', it.plan, 0.5);
    expect(r.report.warnings.filter((w) => w.code !== 'font-fallback'), `${it.id} renders without warnings`).toEqual([]);
    fs.writeFileSync(path.join(GALLERY_DIR, `${it.id}.png`), Buffer.from(r.b64, 'base64'));
    fs.writeFileSync(path.join(GALLERY_DIR, `${it.id}.plan.json`), JSON.stringify(it.plan, null, 2));
    index.push({ id: it.id, group: it.group, title: it.title, note: it.note, synthetic: !!it.synthetic, width: r.width, height: r.height });
  }
  fs.writeFileSync(path.join(GALLERY_DIR, 'index.json'), JSON.stringify({ photo: GALLERY_PHOTO, items: index }, null, 2));
  expect(index.length).toBeGreaterThanOrEqual(30);
});
