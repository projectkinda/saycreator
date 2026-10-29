// Step 15b-1: the cutout provider. The fake provider and a stubbed dev route test the button, the storage and the client-side maths without the model;
// the real route is only asked for its status here. (The real model on real photos is in cutout-real.spec.ts, off unless REAL_CUTOUT=1.)
import { expect, test, type Page } from '@playwright/test';
import { makePic, openEditor, photoScript, useScriptInStyle } from './photos-app-helpers';

test.describe.configure({ mode: 'serial' });

async function addPhoto(page: Page, name = 'subject.jpg') {
  await openEditor(page);
  await useScriptInStyle(page, photoScript(), 'Mono photo poster');
  await page.getByLabel('Choose photos to add').setInputFiles(await makePic(page, { name, w: 1200, h: 900, hue: 30, mark: [0.5, 0.5] }));
  await expect(page.getByRole('list', { name: /photos and \d+ objects/ }).getByRole('listitem')).toHaveCount(1, { timeout: 20_000 });
}
const alphaAt = (page: Page) =>
  page.evaluate(async () => {
    const w = window as unknown as { __cutouts: { list: () => Promise<{ original: Blob; cutout: Blob; mask: Blob; provider: string; sourceId?: string }[]> } };
    const recs = await w.__cutouts.list();
    if (!recs.length) return null;
    const r = recs[0];
    const bm = await createImageBitmap(r.cutout);
    const c = new OffscreenCanvas(bm.width, bm.height);
    const g = c.getContext('2d')!;
    g.drawImage(bm, 0, 0);
    const a = (x: number, y: number) => g.getImageData(Math.floor(x * (bm.width - 1)), Math.floor(y * (bm.height - 1)), 1, 1).data[3];
    return { count: recs.length, provider: r.provider, hasSource: !!r.sourceId, originalBytes: r.original.size, cutoutType: r.cutout.type, maskBytes: r.mask.size, corner: a(0.02, 0.02), centre: a(0.5, 0.5), size: [bm.width, bm.height] };
  });

test('the fake provider: Remove background makes a cutout, keeps the original and the cutout in IndexedDB, and adds the cutout as an object', async ({ page }) => {
  await addPhoto(page);
  await page.evaluate(() => {
    const w = window as unknown as { __cutout: { set: (p: unknown) => void; Fake: new () => unknown } };
    w.__cutout.set(new w.__cutout.Fake());
  });
  await page.getByRole('button', { name: 'Remove the background of subject' }).click();
  await expect(page.getByTestId('photos-status')).toContainText(/Cutout of subject made in [\d.]+ s and added as an object/, { timeout: 30_000 });
  await expect(page.getByRole('list', { name: '1 photos and 1 objects' }).getByRole('listitem')).toHaveCount(2);
  const rec = await alphaAt(page);
  expect(rec).toMatchObject({ count: 1, provider: 'fake', hasSource: true, cutoutType: 'image/png', corner: 0, centre: 255, size: [1200, 900] });
  expect(rec!.originalBytes).toBeGreaterThan(1000);
  expect(rec!.maskBytes).toBeGreaterThan(100);
});

test('the local provider, with the dev route stubbed: the input is the normalised 1 by 3 by 1024 by 1024 tensor, and the logits become the alpha', async ({ page }) => {
  let bytes = 0;
  await page.route('**/__cutout/status', (r) => r.fulfill({ json: { available: true, model: 'stub' } }));
  await page.route('**/__cutout/infer', async (r) => {
    bytes = r.request().postDataBuffer()?.length ?? 0;
    const logits = new Float32Array(1024 * 1024);
    for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) logits[y * 1024 + x] = x > 256 && x < 768 && y > 128 && y < 896 ? 10 : -10;
    await r.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(logits.buffer) });
  });
  await addPhoto(page);
  await page.getByRole('button', { name: 'Remove the background of subject' }).click();
  await expect(page.getByTestId('photos-status')).toContainText(/Cutout of subject made/, { timeout: 30_000 });
  expect(bytes, 'the model input is 1 x 3 x 1024 x 1024 float32').toBe(3 * 1024 * 1024 * 4);
  const rec = await alphaAt(page);
  expect(rec).toMatchObject({ provider: 'local-birefnet-lite', corner: 0, centre: 255 });
});

test('no weights or no route: the button says why in plain words and nothing is added', async ({ page }) => {
  await page.route('**/__cutout/status', (r) => r.fulfill({ json: { available: false, reason: 'The background-removal weights were not found. Run "npm run fetch:models".' } }));
  await addPhoto(page);
  await page.getByRole('button', { name: 'Remove the background of subject' }).click();
  await expect(page.getByTestId('photos-status')).toContainText('weights were not found');
  await expect(page.getByRole('list', { name: '1 photos and 0 objects' }).getByRole('listitem')).toHaveCount(1);
});

test('the real dev route answers its status in plain JSON (it does not run the model here)', async ({ request }) => {
  const r = await request.get('/__cutout/status');
  expect(r.ok()).toBe(true);
  const b = (await r.json()) as { available: boolean; reason?: string; model?: string };
  expect(typeof b.available).toBe('boolean');
  if (b.available) expect(b.model).toContain('MIT');
  else expect(b.reason).toContain('weights');
  const bad = await request.post('/__cutout/infer', { data: Buffer.from('too short') });
  expect([400, 503]).toContain(bad.status());
});
