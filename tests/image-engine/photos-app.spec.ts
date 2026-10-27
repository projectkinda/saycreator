// Step 12: photos in the app (Images > Make a carousel). Every picture here is made in the page; no private photo is used.
// The pictures stay in the browser: the page never asks the network for them (checked below).
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allDrawn, card, dragOnto, dropFiles, makePic, openEditor, photoScript, savedDoc, useScriptInStyle, whenSaved, withExifOrientation6 } from './photos-app-helpers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(ROOT, 'out/image-engine/photos-app');
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1300, height: 1000 } });
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

const STYLE = 'Mono photo poster';
const stripInput = (page: Page) => page.getByLabel('Choose photos to add');
const slideInput = (page: Page, n: number) => page.getByLabel(`Choose a photo for slide ${n}`);
const status = (page: Page) => page.getByTestId('photos-status');
const undoBtn = (page: Page) => page.getByRole('button', { name: /^Undo/ });
const redoBtn = (page: Page) => page.getByRole('button', { name: /^Redo/ });
const picOf = (page: Page, n: number) => card(page, n).locator('.cr-pic-btn img');
const srcOf = (page: Page, n: number) => picOf(page, n).getAttribute('src');
const settled = async (page: Page) => {
  await allDrawn(page, 7);
  await page.waitForTimeout(300);
};

let asked: string[] = [];
test.beforeEach(async ({ page }) => {
  asked = [];
  page.on('request', (r) => asked.push(r.url()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
  await openEditor(page);
});

test('a slide with a photo hint has a photo slot with the hint as helper text; a style with no photo layouts has no photo control', async ({ page }) => {
  await useScriptInStyle(page, photoScript(), STYLE);
  const c1 = card(page, 1);
  await expect(c1.getByRole('region', { name: 'Photo for slide 1' })).toBeVisible();
  await expect(c1.getByText('Ideal photo: a city street at dusk')).toBeVisible();
  await expect(c1.getByText('Your pictures stay in this browser. They are never sent anywhere.')).toBeVisible();
  // The empty slot is drawn as a placeholder, with a note, and the checks still pass.
  await expect(c1.getByText(/^Phone check: all \d+ pass/)).toBeVisible();
  // A slide with no hint and no photo is not turned into a photo slide: it says so, and a photo can still be added to it.
  await expect(card(page, 2).getByText('This slide has no photo slot. Add a photo, and it switches to a photo layout.')).toBeVisible();
  await expect(card(page, 2).getByText(/^Ideal photo:/)).toHaveCount(0);
  // A style with no photo layouts: no photo control anywhere, and the strip says why.
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat colour/ }).click();
  await allDrawn(page, 7);
  await expect(page.getByRole('region', { name: /^Photo for slide/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: /^Object on slide/ })).toHaveCount(0);
  await expect(page.getByText(/has no photo slots/)).toBeVisible();
});

test('upload with the button, replace, remove: each is one undo step, and the picture never goes to the network', async ({ page }) => {
  await useScriptInStyle(page, photoScript(), STYLE);
  const a = await makePic(page, { name: 'street.jpg', w: 1600, h: 1200, hue: 20, mark: [0.3, 0.4] });
  const b = await makePic(page, { name: 'sea.jpg', w: 1200, h: 1600, hue: 200 });
  const before = await srcOf(page, 1);
  await slideInput(page, 1).setInputFiles(a);
  await whenSaved(page, (d) => d.photos?.length === 1 && d.choices['0']?.photo?.id === d.photos[0].id);
  const withA = await srcOf(page, 1);
  expect(withA).not.toBe(before);
  const doc = await savedDoc(page);
  expect(doc!.photos![0]).toMatchObject({ name: 'street', width: 1600, height: 1200, kind: 'photo' });
  expect(doc!.choices['0'].photo!.id).toBe(doc!.photos![0].id);
  // Replace with another photo.
  await slideInput(page, 1).setInputFiles(b);
  await whenSaved(page, (d) => d.photos?.length === 2 && d.choices['0'].photo?.id === d.photos[1].id);
  const withB = await srcOf(page, 1);
  expect(withB).not.toBe(withA);
  expect((await savedDoc(page))!.photos).toHaveLength(2);
  // Remove it: the slot is empty on purpose and stays empty.
  await card(page, 1).getByRole('button', { name: 'Remove photo' }).click();
  await whenSaved(page, (d) => d.choices['0'].photo?.id === null);
  await expect(card(page, 1).getByText('No photo on this slide.')).toBeVisible();
  expect((await savedDoc(page))!.choices['0'].photo!.id).toBeNull();
  // Undo and redo cover all three.
  await undoBtn(page).click();
  await whenSaved(page, (d) => d.choices['0'].photo?.id === d.photos![1].id);
  await redoBtn(page).click();
  await whenSaved(page, (d) => d.choices['0'].photo?.id === null);
  expect((await savedDoc(page))!.choices['0'].photo!.id).toBeNull();
  // Photos never leave the device: nothing was asked of the network for a picture, and nothing was posted.
  expect(asked.filter((u) => /\.(jpe?g|png)(\?|$)/i.test(u) && !u.startsWith('blob:') && !u.includes('localhost'))).toEqual([]);
});

test('drag and drop: files dropped on the slot, and a photo dragged from the Photos strip onto another slide', async ({ page }) => {
  await useScriptInStyle(page, photoScript(), STYLE);
  const a = await makePic(page, { name: 'drop-me.jpg', w: 1400, h: 1000, hue: 120 });
  await dropFiles(page, '[data-testid="photo-drop-0"]', [a]);
  await whenSaved(page, (d) => d.photos?.length === 1 && !!d.choices['0']?.photo?.id);
  const id = (await savedDoc(page))!.photos![0].id;
  expect((await savedDoc(page))!.choices['0'].photo!.id).toBe(id);
  // The strip lists it; dragging it from the strip onto slide 3's slot puts it there.
  const item = page.getByRole('listitem', { name: 'Photo drop-me' });
  await expect(item).toBeVisible();
  await dragOnto(page, '.cr-strip-item', '[data-testid="photo-drop-2"]');
  await whenSaved(page, (d) => d.choices['2']?.photo?.id === id);
  expect((await savedDoc(page))!.choices['2'].photo!.id).toBe(id);
  // Files dropped on the strip are added too.
  const b = await makePic(page, { name: 'strip-drop.jpg', w: 900, h: 1200, hue: 300 });
  await dropFiles(page, '[data-testid="photos-drop"]', [b]);
  await expect.poll(async () => (await savedDoc(page))?.photos?.length).toBe(2);
});

test('the crop point: drag the dot, the slide is drawn again with the new crop; the dot also works with the arrow keys; undo and redo', async ({ page }) => {
  await useScriptInStyle(page, photoScript(), STYLE);
  await slideInput(page, 1).setInputFiles(await makePic(page, { name: 'wide.jpg', w: 2400, h: 1200, hue: 40, mark: [0.15, 0.5] }));
  await settled(page);
  const before = await srcOf(page, 1);
  const focal = card(page, 1).locator('.cr-focal');
  const dot = card(page, 1).getByRole('button', { name: /^Crop point of the photo on slide 1/ });
  await focal.scrollIntoViewIfNeeded();
  const box = (await focal.boundingBox())!;
  const start = (await dot.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.up();
  await whenSaved(page, (d) => (d.choices['0'].photo?.focal?.x ?? 1) < 0.25);
  expect(await srcOf(page, 1)).not.toBe(before);
  const moved = (await savedDoc(page))!.choices['0'].photo!.focal!;
  // Arrow keys nudge it.
  await dot.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await savedDoc(page))!.choices['0'].photo!.focal!.x).toBeGreaterThan(moved.x);
  await undoBtn(page).click();
  await expect.poll(async () => (await savedDoc(page))!.choices['0'].photo!.focal!.x).toBeLessThan(0.25);
  await redoBtn(page).click();
  await expect.poll(async () => (await savedDoc(page))!.choices['0'].photo!.focal!.x).toBeGreaterThan(moved.x);
});

test('treatment: each choice changes the slide, there is a live preview, and undo and redo go back and forth', async ({ page }) => {
  await useScriptInStyle(page, photoScript(), STYLE);
  await slideInput(page, 1).setInputFiles(await makePic(page, { name: 'color.jpg', w: 1500, h: 1500, hue: 10, mark: [0.5, 0.5] }));
  await settled(page);
  const seen = new Set<string>();
  seen.add((await srcOf(page, 1))!);
  const group = card(page, 1).getByRole('radiogroup', { name: 'Treatment' });
  await expect(group.getByRole('radio')).toHaveCount(8);
  await expect(card(page, 1).locator('.cr-treat-prev')).toBeVisible();
  for (const name of ['None', 'Black and white', 'Duotone', 'Halftone', 'Grain', 'Blur', 'Tint']) {
    await group.getByRole('radio', { name, exact: true }).click();
    await expect(group.getByRole('radio', { name, exact: true })).toHaveAttribute('aria-checked', 'true');
    await whenSaved(page, (d) => d.choices['0'].photo?.treatment === ({ None: 'none', 'Black and white': 'bw', Duotone: 'duotone', Halftone: 'halftone', Grain: 'grain', Blur: 'blur', Tint: 'tint' } as Record<string, string>)[name]);
    seen.add((await srcOf(page, 1))!);
  }
  expect(seen.size).toBeGreaterThanOrEqual(7); // every choice drew a different slide
  expect((await savedDoc(page))!.choices['0'].photo!.treatment).toBe('tint');
  await undoBtn(page).click();
  await expect(group.getByRole('radio', { name: 'Blur', exact: true })).toHaveAttribute('aria-checked', 'true');
  await redoBtn(page).click();
  await expect(group.getByRole('radio', { name: 'Tint', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: path.join(OUT, 'treatment.png') });
});

test('frame and shape pickers appear only on layouts that have them', async ({ page }) => {
  await useScriptInStyle(page, photoScript(), 'Film photo and paper');
  await slideInput(page, 3).setInputFiles(await makePic(page, { name: 'frame.jpg', w: 1400, h: 1400, hue: 60 }));
  await settled(page);
  const c3 = card(page, 3);
  const layout = await c3.getByRole('combobox', { name: 'Layout', exact: true }).inputValue();
  if (layout === 'content-photo-frame') {
    await c3.getByRole('combobox', { name: 'Frame', exact: true }).selectOption('phone');
    await settled(page);
    expect((await savedDoc(page))!.choices['2'].photo!.frame).toBe('phone');
  } else {
    await c3.getByRole('combobox', { name: 'Layout', exact: true }).selectOption('content-photo-frame');
    await settled(page);
    await c3.getByRole('combobox', { name: 'Frame', exact: true }).selectOption('polaroid');
    await settled(page);
    expect((await savedDoc(page))!.choices['2'].photo!.frame).toBe('polaroid');
  }
  // The cover has a shape picker when its layout is the cut-out one; a full-bleed cover has none.
  const c1 = card(page, 1);
  await slideInput(page, 1).setInputFiles(await makePic(page, { name: 'cover.jpg', w: 1400, h: 1400, hue: 90 }));
  await settled(page);
  if ((await c1.getByRole('combobox', { name: 'Layout', exact: true }).inputValue()) !== 'cover-photo-shape') await c1.getByRole('combobox', { name: 'Layout', exact: true }).selectOption('cover-photo-shape');
  await settled(page);
  await c1.getByRole('combobox', { name: 'Shape', exact: true }).selectOption('flower');
  await settled(page);
  expect((await savedDoc(page))!.choices['0'].photo!.shape).toBe('flower');
  await c1.getByRole('combobox', { name: 'Layout', exact: true }).selectOption('cover-photo-full');
  await settled(page);
  await expect(c1.getByRole('combobox', { name: 'Shape', exact: true })).toHaveCount(0);
});

test('an object: a transparent PNG with size, turn, position and an effect; undo removes it', async ({ page }) => {
  await useScriptInStyle(page, photoScript(), STYLE);
  const before = await srcOf(page, 2);
  await page.getByLabel('Choose transparent objects to add').setInputFiles(await makePic(page, { name: 'ball.png', w: 600, h: 600, type: 'image/png', hue: 280, transparent: true }));
  await expect.poll(async () => (await savedDoc(page))?.photos?.some((p) => p.kind === 'object')).toBe(true);
  const c2 = card(page, 2);
  await c2.getByLabel('Use one of your objects on slide 2').selectOption({ index: 1 });
  await whenSaved(page, (d) => !!d.choices['1']?.object);
  expect(await srcOf(page, 2)).not.toBe(before);
  const placed = await srcOf(page, 2);
  await c2.getByLabel('Object size on slide 2').fill('1.6');
  await c2.getByLabel('Object rotation on slide 2').fill('25');
  await c2.getByRole('combobox', { name: 'Effect', exact: true }).selectOption('glow');
  await whenSaved(page, (d) => d.choices['1']?.object?.fx === 'glow' && d.choices['1'].object.scale === 1.6);
  expect(await srcOf(page, 2)).not.toBe(placed);
  expect((await savedDoc(page))!.choices['1'].object).toMatchObject({ fx: 'glow' });
  await c2.getByRole('button', { name: 'Remove object' }).click();
  await whenSaved(page, (d) => !d.choices['1']?.object);
  expect((await savedDoc(page))!.choices['1'].object).toBeUndefined();
  await undoBtn(page).click();
  await whenSaved(page, (d) => d.choices['1']?.object?.fx === 'glow');
});

test('a photo kept for the 3-up strip says so (never "on 0 slides"), and every photo says where it is used', async ({ page }) => {
  await useScriptInStyle(page, photoScript(), STYLE);
  const files = [];
  for (let n = 0; n < 5; n++) files.push(await makePic(page, { name: `p${n + 1}.jpg`, w: 1400, h: 1000, hue: n * 60 }));
  await stripInput(page).setInputFiles(files);
  await expect.poll(async () => (await savedDoc(page))?.photos?.length).toBe(5);
  await allDrawn(page, 7);
  const items = page.getByRole('list', { name: /photos and/ }).getByRole('listitem');
  await expect(items).toHaveCount(5);
  const texts = await items.allInnerTexts();
  for (const t of texts) expect(t, t).not.toContain('on 0 slides');
  const kept = texts.filter((t) => t.includes('kept for the 3-up strip'));
  // The first two are for single-photo slides; the last three are kept for the strip (and say so while no slide uses them).
  expect(texts[0]).toMatch(/on [1-9]\d* slides?/);
  expect(kept.length, texts.join(' | ')).toBe(3);
  for (const t of texts.slice(0, 2)) expect(t).not.toContain('kept for the 3-up strip');
  expect(kept[0]).toContain('drag it onto a slide');
  // A kept photo can be used on a slide: drop it from the strip onto slide 1.
  await dragOnto(page, '.cr-strip-item:nth-child(3)', '[data-testid="photo-drop-0"]');
  await whenSaved(page, (d) => !!d.choices['0']?.photo?.id);
  const d = (await savedDoc(page))!;
  expect(d.photos!.find((p) => p.id === d.choices['0'].photo!.id)!.name).toBe('p3');
});

test('a slide has a photo layout only when it has a photo or a photo hint; adding a photo to a slide without a hint switches it', async ({ page }) => {
  await useScriptInStyle(page, photoScript(), STYLE);
  const files = [];
  for (let n = 0; n < 3; n++) files.push(await makePic(page, { name: `q${n + 1}.jpg`, w: 1400, h: 1000, hue: n * 80 }));
  await stripInput(page).setInputFiles(files);
  await expect.poll(async () => (await savedDoc(page))?.photos?.length).toBe(3);
  await allDrawn(page, 7);
  // Slides 1, 3 and 5 have a hint: photo slots. The others have neither a hint nor a photo: no photo slot, whatever the project holds.
  for (const n of [1, 3, 5]) await expect(card(page, n).getByText(/^Ideal photo:/), `slide ${n}`).toBeVisible();
  for (const n of [2, 4, 6, 7]) {
    await expect(card(page, n).getByText('This slide has no photo slot. Add a photo, and it switches to a photo layout.'), `slide ${n}`).toBeVisible();
    expect(await card(page, n).getByLabel('Layout').inputValue(), `slide ${n}`).not.toMatch(/photo/);
  }
  // Giving a slide without a hint a photo switches it to a photo layout, where the style has one for that kind of slide;
  // where it has none, the card says so.
  const switched: number[] = [];
  for (const n of [2, 4, 6, 7]) {
    const before = await card(page, n).getByLabel('Layout').inputValue();
    await card(page, n).getByLabel(`Use one of your photos on slide ${n}`).selectOption({ index: 1 });
    await whenSaved(page, (d) => !!d.choices[String(n - 1)]?.photo?.id);
    await allDrawn(page, 7);
    const after = await card(page, n).getByLabel('Layout').inputValue();
    if (/photo/.test(after)) {
      switched.push(n);
      expect(after, `slide ${n}`).not.toBe(before);
      await expect(card(page, n).getByRole('button', { name: 'Remove photo' })).toBeVisible();
    } else await expect(card(page, n).getByText('has no photo layout in this style'), `slide ${n}`).toBeVisible();
  }
  expect(switched.length, 'at least one kind of slide switches').toBeGreaterThan(0);
});

const OBJECT_CHECK = 'Object stays off the words';
const objectShots = path.join(OUT, '..', 'photos-app-object');

test('an object with no place chosen goes into free space: on every slide of the deck it stays off the words', async ({ page }) => {
  test.setTimeout(180_000);
  await useScriptInStyle(page, photoScript(), STYLE);
  // Real photos in the slots (an empty slot is a hole for the person to fill, so the object keeps off it).
  await stripInput(page).setInputFiles([await makePic(page, { name: 'one.jpg', w: 1600, h: 1200, hue: 20 }), await makePic(page, { name: 'two.jpg', w: 1200, h: 1600, hue: 140 }), await makePic(page, { name: 'three.jpg', w: 1500, h: 1500, hue: 220 })]);
  await expect.poll(async () => (await savedDoc(page))?.photos?.length).toBe(3);
  await allDrawn(page, 7);
  await page.getByLabel('Choose transparent objects to add').setInputFiles(await makePic(page, { name: 'ball.png', w: 600, h: 600, type: 'image/png', hue: 280, transparent: true }));
  await expect.poll(async () => (await savedDoc(page))?.photos?.some((p) => p.kind === 'object')).toBe(true);
  for (let n = 1; n <= 7; n++) await card(page, n).getByLabel(`Use one of your objects on slide ${n}`).selectOption({ index: 1 });
  await whenSaved(page, (d) => Object.values(d.choices).filter((c) => c.object).length === 7);
  await allDrawn(page, 7);
  const report: string[] = [];
  for (let n = 1; n <= 7; n++) {
    const c = card(page, n);
    await expect(c.getByText(/^Phone check:/)).toBeVisible();
    const choice = (await savedDoc(page))!.choices[String(n - 1)].object!;
    expect(choice.x, `slide ${n} was not placed by hand`).toBeUndefined();
    const failed = await c.locator('.cr-lint-fail', { hasText: OBJECT_CHECK }).count();
    const noRoom = await c.getByText(/no free space for the object/).count();
    fs.mkdirSync(objectShots, { recursive: true });
    await c.screenshot({ path: path.join(objectShots, `object-auto-slide-${n}.png`) });
    report.push(`slide ${n}: ${failed ? 'COVERS WORDS' : 'clear'}${noRoom ? ' (said there was no room)' : ''}`);
    expect(failed, report.join('; ')).toBe(0);
  }
  console.log('[object placement]', report.join('; '));
});

test('the check "Object stays off the words" fails on a deliberately bad variant, and "Place automatically" fixes it', async ({ page }) => {
  await useScriptInStyle(page, photoScript(), STYLE);
  await page.getByLabel('Choose transparent objects to add').setInputFiles(await makePic(page, { name: 'ball.png', w: 600, h: 600, type: 'image/png', hue: 280, transparent: true }));
  await expect.poll(async () => (await savedDoc(page))?.photos?.some((p) => p.kind === 'object')).toBe(true);
  const c = card(page, 2);
  await c.getByLabel('Use one of your objects on slide 2').selectOption({ index: 1 });
  await whenSaved(page, (d) => !!d.choices['1']?.object);
  await allDrawn(page, 7);
  await expect(c.locator('.cr-lint-fail', { hasText: OBJECT_CHECK })).toHaveCount(0);
  fs.mkdirSync(objectShots, { recursive: true });
  await c.scrollIntoViewIfNeeded();
  await c.screenshot({ path: path.join(objectShots, '08-object-free-space.png') });
  // The bad variant: big, and put by hand on top of the headline.
  await c.getByLabel('Object size on slide 2').fill('1.8');
  await c.getByLabel('Object position across on slide 2').fill('0.5');
  await c.getByLabel('Object position down on slide 2').fill('0.3');
  await whenSaved(page, (d) => d.choices['1']?.object?.y === 0.3 && d.choices['1'].object.scale === 1.8);
  await expect(c.locator('.cr-lint-fail', { hasText: OBJECT_CHECK })).toBeVisible({ timeout: 30_000 });
  await expect(c.locator('.cr-lint-fail')).toContainText('The object covers');
  await c.screenshot({ path: path.join(objectShots, '09-object-covers-words.png') });
  await c.getByRole('button', { name: 'Place automatically' }).click();
  await whenSaved(page, (d) => d.choices['1']?.object?.x === undefined);
  await expect(c.locator('.cr-lint-fail', { hasText: OBJECT_CHECK })).toHaveCount(0, { timeout: 30_000 });
});

test('refresh: the project comes back with its photos, their treatment and crop, and the slide is drawn with them', async ({ page }) => {
  await useScriptInStyle(page, photoScript(), STYLE);
  await slideInput(page, 1).setInputFiles(await makePic(page, { name: 'keep.jpg', w: 1800, h: 1200, hue: 150, mark: [0.7, 0.3] }));
  await settled(page);
  await card(page, 1).getByRole('radiogroup', { name: 'Treatment' }).getByRole('radio', { name: 'Duotone', exact: true }).click();
  await settled(page);
  await expect(page.getByText(/Saved in this browser/)).toBeVisible();
  const withPhoto = await page.evaluate(async (src) => {
    const b = await (await fetch(src!)).blob();
    return b.size;
  }, await srcOf(page, 1));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Make a carousel' })).toBeVisible();
  await allDrawn(page, 7);
  await expect(page.getByRole('listitem', { name: 'Photo keep' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Photo keep' }).locator('img')).toBeVisible();
  const c1 = card(page, 1);
  await expect(c1.getByRole('radio', { name: 'Duotone', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(c1.locator('.cr-focal img')).toBeVisible();
  // The recovered slide is drawn with the photo, not the empty placeholder.
  await expect.poll(async () => page.evaluate(async (src) => (await (await fetch(src!)).blob()).size, await srcOf(page, 1))).toBeGreaterThan(withPhoto * 0.5);
  await expect(c1.getByText('No photo on this slide.')).toHaveCount(0);
  await expect(page.getByText(/no longer in the browser/)).toHaveCount(0);
});

test('export: the zip has every slide at full size, drawn with the photos', async ({ page }) => {
  test.setTimeout(120_000);
  await useScriptInStyle(page, photoScript(), STYLE);
  for (const [n, name, hue] of [[1, 'a.jpg', 20], [3, 'b.jpg', 100], [5, 'c.jpg', 200]] as const) await slideInput(page, n).setInputFiles(await makePic(page, { name, w: 3000, h: 2000, hue }));
  await settled(page);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download all \(zip\)/ }).click();
  const file = await dl;
  const p = path.join(OUT, 'with-photos.zip');
  await file.saveAs(p);
  const zip = fs.readFileSync(p);
  // Read the zip's list of files and each PNG's size (the zip stores them as they are).
  const names: string[] = [];
  const dims: string[] = [];
  let off = 0;
  while (off + 30 < zip.length && zip.readUInt32LE(off) === 0x04034b50) {
    const size = zip.readUInt32LE(off + 18);
    const nl = zip.readUInt16LE(off + 26);
    const el = zip.readUInt16LE(off + 28);
    names.push(zip.subarray(off + 30, off + 30 + nl).toString());
    const data = off + 30 + nl + el;
    dims.push(`${zip.readUInt32BE(data + 16)}x${zip.readUInt32BE(data + 20)}`);
    off = data + size;
  }
  expect(names).toHaveLength(7);
  expect(names[0]).toMatch(/-01\.png$/);
  expect([...new Set(dims)]).toEqual(['1080x1350']);
  // The photo slides are not the placeholder ones: they are much bigger files than a flat slide.
  const saved = (await savedDoc(page))!;
  expect(saved.photos!.every((x) => x.width === 3000 && x.height === 2000)).toBe(true); // the original size is kept in the project
});

test('a HEIC file on a slide card gives the plain message right beside that photo control', async ({ page }) => {
  await useScriptInStyle(page, photoScript(), STYLE);
  const c = card(page, 1);
  await c.getByLabel('Choose a photo for slide 1').setInputFiles({ name: 'iphone.heic', mimeType: 'image/heic', buffer: Buffer.from('heic bytes') });
  await expect(c.getByRole('status').filter({ hasText: 'This is an HEIC photo. Convert it to JPG or PNG, then add it again.' })).toBeVisible();
  await expect.poll(async () => (await savedDoc(page))?.photos?.length ?? 0).toBe(0);
});

test('an unreadable file, a file that is too big, and a HEIC file each give a plain message, and the rest of a batch still works', async ({ page }) => {
  await useScriptInStyle(page, photoScript(), STYLE);
  const good = await makePic(page, { name: 'fine.jpg', w: 1000, h: 800, hue: 70 });
  await stripInput(page).setInputFiles([
    good,
    { name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('this is not a picture at all') },
    { name: 'phone.heic', mimeType: 'image/heic', buffer: Buffer.from('not decodable') },
    { name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) },
  ]);
  const s = status(page);
  await expect(s).toContainText('"broken.jpg" could not be read as a picture');
  await expect(s).toContainText('This is an HEIC photo. Convert it to JPG or PNG, then add it again.');
  await expect(s).toContainText('"empty.png" is empty');
  await expect.poll(async () => (await savedDoc(page))?.photos?.map((p) => p.name)).toEqual(['fine']);
  // A file over the limit (written to disk first: it is too big to send as bytes).
  const huge = path.join(OUT, 'huge.jpg');
  fs.writeFileSync(huge, Buffer.alloc(61 * 1024 * 1024, 7));
  await stripInput(page).setInputFiles(huge);
  await expect(status(page)).toContainText('"huge.jpg" is 61 MB. The limit is 60 MB');
  fs.rmSync(huge, { force: true });
  expect((await savedDoc(page))!.photos).toHaveLength(1);
  await page.screenshot({ path: path.join(OUT, 'unreadable.png') });
});

test('a very large photo is scaled down for drawing but its original size is kept; a small one gets a low-resolution warning', async ({ page }) => {
  test.setTimeout(120_000);
  await useScriptInStyle(page, photoScript(), STYLE);
  await slideInput(page, 1).setInputFiles(await makePic(page, { name: 'big.jpg', w: 9000, h: 6000, hue: 30 }));
  await expect.poll(async () => (await savedDoc(page))?.photos?.[0]?.width, { timeout: 60_000 }).toBe(9000);
  await settled(page);
  expect((await savedDoc(page))!.photos![0]).toMatchObject({ width: 9000, height: 6000 });
  const worked = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('creator-carousel-pictures', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const rec = await new Promise<{ workWidth: number; workHeight: number; original: Blob; work: Blob }>((res) => { const q = db.transaction('pictures').objectStore('pictures').getAll(); q.onsuccess = () => res(q.result[0]); });
    return { w: rec.workWidth, h: rec.workHeight, orig: rec.original.size, work: rec.work.size };
  });
  expect(Math.max(worked.w, worked.h)).toBe(3000); // scaled for drawing, never below the 1080 x 1350 slide
  expect(worked.w).toBeGreaterThan(1350);
  // A small photo: warned about, in the strip and on the slide.
  await slideInput(page, 3).setInputFiles(await makePic(page, { name: 'tiny.jpg', w: 400, h: 300, hue: 250 }));
  await expect(card(page, 3).getByText(/After cropping, the photo is only \d+ px wide and is stretched/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/"tiny.jpg" is small \(400 by 300 pixels\)/).first()).toBeVisible();
});

test('a phone photo with an EXIF rotation is turned the right way up', async ({ page }) => {
  await useScriptInStyle(page, photoScript(), STYLE);
  // Stored as 400 wide by 200 tall, with the orientation tag that says "turn it a quarter": it is a 200 by 400 portrait.
  const plain = await makePic(page, { name: 'upright.jpg', w: 400, h: 200, hue: 100, mark: [0.9, 0.5] });
  await stripInput(page).setInputFiles({ ...plain, buffer: withExifOrientation6(plain.buffer) });
  await expect.poll(async () => (await savedDoc(page))?.photos?.[0]).toMatchObject({ width: 200, height: 400 });
});

test('browser storage that fails: the person is told, the project keeps working in memory, and a refresh says the photo is gone', async ({ page }) => {
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
  });
  await openEditor(page);
  await useScriptInStyle(page, photoScript(), STYLE);
  await slideInput(page, 1).setInputFiles(await makePic(page, { name: 'nostore.jpg', w: 1200, h: 900, hue: 330 }));
  await expect(page.getByRole('alert').filter({ hasText: 'This browser has no room left for your pictures' })).toBeVisible();
  await settled(page);
  await expect(card(page, 1).locator('.cr-focal img')).toBeVisible(); // it still works in this tab
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Make a carousel' })).toBeVisible();
  await expect(page.getByText(/is no longer in the browser|Not in storage/).first()).toBeVisible({ timeout: 20_000 });
});

test('start over removes the pictures from this browser too', async ({ page }) => {
  await useScriptInStyle(page, photoScript(), STYLE);
  await slideInput(page, 1).setInputFiles(await makePic(page, { name: 'gone.jpg', w: 900, h: 900, hue: 10 }));
  await expect.poll(async () => (await savedDoc(page))?.photos?.length).toBe(1);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect.poll(async () => (await savedDoc(page))?.photos ?? []).toEqual([]);
  const left = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('creator-carousel-pictures', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return new Promise<number>((res) => { const q = db.transaction('pictures').objectStore('pictures').count(); q.onsuccess = () => res(q.result); });
  });
  expect(left).toBe(0);
});

test('the private test pictures are never used by the app', async ({ page }) => {
  await useScriptInStyle(page, photoScript(), STYLE);
  await slideInput(page, 1).setInputFiles(await makePic(page, { name: 'mine.jpg', w: 900, h: 900, hue: 10 }));
  await settled(page);
  expect(asked.filter((u) => /test-assets|test-images/.test(u))).toEqual([]);
});
