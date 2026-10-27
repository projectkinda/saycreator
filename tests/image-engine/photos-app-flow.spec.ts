// Step 12: the flow of a person using photos in the app, with ten pictures of mixed size and orientation, made in the page.
// It takes the screenshots and the timings (on this machine, one run: not a benchmark) that the Results screen shows.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allDrawn, card, makePic, openEditor, photoScript, savedDoc, useScriptInStyle, whenSaved, type Pic } from './photos-app-helpers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FLOW = path.join(ROOT, 'out/image-engine/photos-app-flow');
test.use({ viewport: { width: 1300, height: 1000 } });

const SIZES: [string, number, number, number][] = [
  ['landscape-small', 1200, 800, 10],
  ['portrait-small', 800, 1200, 40],
  ['landscape-4000', 4000, 3000, 80],
  ['portrait-3000', 3000, 4000, 120],
  ['slide-shaped', 1080, 1350, 160],
  ['tiny', 600, 400, 200],
  ['square', 2000, 2000, 240],
  ['panorama', 5000, 1000, 280],
  ['landscape-1500', 1500, 1000, 320],
  ['landscape-2400', 2400, 1600, 350],
];

/** Starts timing every redraw: from the first card that says it is drawing to the moment none does. */
const watchDrawing = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __draw: { start: number | null; end: number | null } };
    w.__draw = { start: null, end: null };
    new MutationObserver(() => {
      const drawing = document.querySelectorAll('.cr-card[data-status="drawing"]').length;
      if (drawing > 0 && w.__draw.start === null) w.__draw.start = performance.now();
      if (drawing === 0 && w.__draw.start !== null && w.__draw.end === null) w.__draw.end = performance.now();
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-status'] });
  });
const drawMs = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => (window as unknown as { __draw: { end: number | null } }).__draw.end !== null), { timeout: 60_000 }).toBe(true);
  return page.evaluate(() => {
    const d = (window as unknown as { __draw: { start: number; end: number } }).__draw;
    const r = Math.round(d.end - d.start);
    (window as unknown as { __draw: unknown }).__draw = { start: null, end: null };
    return r;
  });
};

test('using the app with ten photos: screenshots and timings', async ({ page }) => {
  test.setTimeout(300_000);
  fs.rmSync(FLOW, { recursive: true, force: true });
  fs.mkdirSync(FLOW, { recursive: true });
  const shot = (name: string) => page.screenshot({ path: path.join(FLOW, `${name}.png`) });
  const times: Record<string, number | string> = {};
  const pics: Pic[] = [];
  for (const [name, w, h, hue] of SIZES) pics.push(await makePic(page, { name: `${name}.jpg`, w, h, hue, mark: [0.3, 0.4], busy: true }));
  times['bytesOfTenPhotos'] = pics.reduce((n, p) => n + p.buffer.length, 0);

  await openEditor(page);
  await useScriptInStyle(page, photoScript(), 'Mono photo poster');
  await shot('01-photo-slots-empty');

  // Add all ten at once.
  const t0 = Date.now();
  await page.getByLabel('Choose photos to add').setInputFiles(pics);
  await expect(page.getByTestId('photos-status')).toContainText(/"tiny\.jpg" is small|Added 10 photos/, { timeout: 120_000 });
  await expect.poll(async () => (await savedDoc(page))?.photos?.length, { timeout: 120_000 }).toBe(10);
  times['addTenPhotosMs'] = Date.now() - t0;
  await allDrawn(page, 7);
  await page.getByRole('region', { name: 'Photos' }).scrollIntoViewIfNeeded();
  await shot('02-photos-strip');

  // The slides now fill their photo slots (and the other slides of this style use photo layouts too).
  await card(page, 1).scrollIntoViewIfNeeded();
  await shot('03-slide-with-photo');

  // Redraw timing: a treatment change on slide 1.
  await watchDrawing(page);
  await card(page, 1).getByRole('radiogroup', { name: 'Treatment' }).getByRole('radio', { name: 'Duotone', exact: true }).click();
  await whenSaved(page, (d) => d.choices['0'].photo?.treatment === 'duotone');
  times['redrawAfterTreatmentChangeMs'] = await drawMs(page);
  await shot('04-treatment');

  // The crop point.
  const focal = card(page, 1).locator('.cr-focal');
  await focal.scrollIntoViewIfNeeded();
  const box = (await focal.boundingBox())!;
  const dot = (await card(page, 1).getByRole('button', { name: /^Crop point/ }).boundingBox())!;
  await watchDrawing(page);
  await page.mouse.move(dot.x + 11, dot.y + 11);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3, { steps: 5 });
  await page.mouse.up();
  await whenSaved(page, (d) => (d.choices['0'].photo?.focal?.x ?? 1) < 0.3);
  times['redrawAfterCropMoveMs'] = await drawMs(page);
  await shot('05-crop-point');

  // An object on slide 2.
  await page.getByLabel('Choose transparent objects to add').setInputFiles(await makePic(page, { name: 'sticker.png', w: 800, h: 800, type: 'image/png', hue: 300, transparent: true }));
  await card(page, 2).getByLabel('Use one of your objects on slide 2').selectOption({ index: 1 });
  await whenSaved(page, (d) => !!d.choices['1']?.object);
  await card(page, 2).scrollIntoViewIfNeeded();
  await shot('06-object');

  // The whole deck redrawn from nothing (a refresh), then the export.
  await page.reload();
  const r0 = Date.now();
  await allDrawn(page, 7);
  times['refreshToAllSlidesDrawnMs'] = Date.now() - r0;
  const e0 = Date.now();
  const dl = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: /Download all \(zip\)/ }).click();
  const file = await dl;
  times['exportZipMs'] = Date.now() - e0;
  const zip = path.join(FLOW, 'deck.zip');
  await file.saveAs(zip);
  times['zipBytes'] = fs.statSync(zip).size;
  await shot('07-after-refresh');
  fs.writeFileSync(path.join(FLOW, 'timings.json'), JSON.stringify({ machine: 'this computer, Chrome, one run', times, photos: SIZES.map(([n, w, h]) => `${n} ${w}x${h}`) }, null, 2));
});
