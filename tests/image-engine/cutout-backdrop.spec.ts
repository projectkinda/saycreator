// Step 15c-1: backgrounds behind a cutout, More looks, saving a look as a template, dropping a background photo. The dev route is stubbed; no model runs.
import { expect, test, type Page } from '@playwright/test';
import { makePic } from './photos-app-helpers';
import { allDrawn, openThumb, photoInput, titleInput } from './thumbnail-app-helpers';

// The pictures of the cutout options only: the others do not depend on the background.
const srcs = (page: Page) => page.locator('li.tn-card[data-layout^="cutout-"] img, li.tn-card[data-layout="object-title"] img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

async function withCutout(page: Page) {
  await page.route('**/__cutout/status', (r) => r.fulfill({ json: { available: true, model: 'stub' } }));
  await page.route('**/__cutout/infer', async (r) => {
    const logits = new Float32Array(1024 * 1024);
    for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) logits[y * 1024 + x] = x > 256 && x < 768 && y > 128 && y < 896 ? 10 : -10;
    await r.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(logits.buffer) });
  });
  await openThumb(page);
  await photoInput(page).setInputFiles(await makePic(page, { name: 'subject.jpg', w: 1280, h: 720, hue: 30, mark: [0.5, 0.5] }));
  await titleInput(page).fill('Ride before sunrise');
  await allDrawn(page, 3);
  await page.getByRole('button', { name: 'Remove background' }).click();
  await expect(page.getByTestId('cutout-status')).toContainText(/Cutout of subject made in/, { timeout: 30_000 });
  await allDrawn(page, 4);
}
const panel = (page: Page) => page.getByRole('region', { name: 'Background behind the cutout' });

test('the background picker: each kind redraws the cutout options at once, no model', async ({ page }) => {
  await withCutout(page);
  await expect(panel(page)).toBeVisible();
  const settled = async () => {
    await expect.poll(async () => (await page.locator('li.tn-card[data-status="drawing"]').count()) + (await srcs(page)).length === 0 ? -1 : await page.locator('li.tn-card[data-status="drawing"]').count(), { timeout: 60_000 }).toBe(0);
    return JSON.stringify(await srcs(page));
  };
  let before = await settled();
  const next = async (what: string) => {
    await expect.poll(settled, { message: what, timeout: 60_000 }).not.toBe(before);
    before = await settled();
  };
  const kind = panel(page).getByLabel('Background kind');
  await kind.selectOption('colour');
  await next('colour');
  await panel(page).getByLabel('Background colour').fill('#cc2244');
  await next('colour changed');
  await kind.selectOption('gradient');
  await next('gradient');
  await panel(page).getByRole('slider', { name: 'Background gradient angle' }).fill('90');
  await next('angle');
  await kind.selectOption('pattern');
  await next('pattern');
  await panel(page).getByLabel('Background pattern').selectOption('stripes');
  await next('stripes');
  await kind.selectOption('block');
  await next('block');
  await kind.selectOption('blur');
  await panel(page).getByRole('group', { name: 'Background treatments' }).getByLabel('Duotone').check();
  await next('duotone');
  await panel(page).getByLabel(/Match the subject to the background/).check();
  await next('match');
  await allDrawn(page, 4);
  // Undo takes the last background change back.
  await expect(page.getByRole('button', { name: /^Undo/ }).first()).toContainText('Match the subject to the background');
});

test('More looks: 12 looks, no two alike, no kind more than a third (rounded up); star, use, save as a template with no photo in it', async ({ page }) => {
  await withCutout(page);
  await panel(page).getByRole('button', { name: 'More looks' }).click();
  const list = page.getByRole('list', { name: '12 more looks' });
  await expect(list.getByRole('listitem')).toHaveCount(12);
  await expect(list.locator('[data-status="ready"]')).toHaveCount(12, { timeout: 120_000 });
  const kinds = await list.getByRole('listitem').evaluateAll((els) => els.map((e) => e.getAttribute('data-backdrop')));
  const counts = kinds.reduce<Record<string, number>>((m, k) => ((m[String(k)] = (m[String(k)] ?? 0) + 1), m), {});
  expect(Math.max(...Object.values(counts)), JSON.stringify(counts)).toBeLessThanOrEqual(4);
  expect(Object.keys(counts).length).toBeGreaterThanOrEqual(3);
  const pics = await list.locator('img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
  expect(new Set(pics).size).toBe(12);
  await list.getByRole('button', { name: 'Star look 2' }).click();
  await expect(list.getByRole('button', { name: 'Star look 2' })).toHaveAttribute('aria-pressed', 'true');
  await list.getByRole('button', { name: 'Save look 2 as a template' }).click();
  await expect(panel(page).getByRole('status').filter({ hasText: 'as a template (style only, no photos)' })).toBeVisible({ timeout: 15_000 });
  const saved = await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    return dbs.map((d) => d.name);
  });
  expect(saved.length).toBeGreaterThan(0);
  const before = JSON.stringify(await srcs(page));
  await list.getByRole('button', { name: 'Use look 3' }).click();
  await expect.poll(async () => JSON.stringify(await srcs(page)), { timeout: 30_000 }).not.toBe(before);
});

test('a photo dropped on the thumbnail canvas becomes the background', async ({ page }) => {
  await withCutout(page);
  await page.getByTestId('thumb-options').evaluate(async (el) => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 360;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2a7';
    g.fillRect(0, 0, 640, 360);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'backdrop.jpg', { type: 'image/jpeg' }));
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(panel(page).getByLabel('Background kind')).toHaveValue('photo', { timeout: 30_000 });
  await expect(panel(page).getByRole('button', { name: 'Replace background photo' })).toBeVisible();
  await allDrawn(page, 4);
});
