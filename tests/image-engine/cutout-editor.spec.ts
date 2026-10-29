// Step 15b-2: the cutout editor and the thumbnail button. The dev route is stubbed (a fixed rectangle is the subject), so nothing here runs the model.
import { expect, test, type Page } from '@playwright/test';
import { makePic } from './photos-app-helpers';
import { allDrawn, openThumb, optionCards, photoInput, srcs, titleInput } from './thumbnail-app-helpers';

test.describe.configure({ mode: 'serial' });

async function stub(page: Page) {
  await page.route('**/__cutout/status', (r) => r.fulfill({ json: { available: true, model: 'stub' } }));
  await page.route('**/__cutout/infer', async (r) => {
    const logits = new Float32Array(1024 * 1024);
    for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) logits[y * 1024 + x] = x > 256 && x < 768 && y > 128 && y < 896 ? 10 : -10;
    await r.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(logits.buffer) });
  });
}
const status = (page: Page) => page.getByTestId('cutout-status');
async function withCutout(page: Page) {
  await stub(page);
  await openThumb(page);
  await photoInput(page).setInputFiles(await makePic(page, { name: 'subject.jpg', w: 1280, h: 720, hue: 30, mark: [0.5, 0.5] }));
  await titleInput(page).fill('Ride before sunrise');
  await allDrawn(page, 3);
  await page.getByRole('button', { name: 'Remove background' }).click();
  await expect(status(page)).toContainText(/Cutout of subject made in [\d.]+ s and added as an object/, { timeout: 30_000 });
}
const lastRecord = (page: Page) =>
  page.evaluate(async () => {
    const w = window as unknown as { __cutouts: { list: () => Promise<{ mask: Blob; cutout: Blob; pictureId?: string; look?: unknown }[]> } };
    const r = (await w.__cutouts.list())[0];
    const bm = await createImageBitmap(r.mask);
    const c = new OffscreenCanvas(bm.width, bm.height);
    const g = c.getContext('2d')!;
    g.drawImage(bm, 0, 0);
    const at = (x: number, y: number) => g.getImageData(Math.floor(x * (bm.width - 1)), Math.floor(y * (bm.height - 1)), 1, 1).data[0];
    return { picture: r.pictureId ?? null, look: r.look ?? null, size: [bm.width, bm.height], centre: at(0.5, 0.5), edgeLeft: at(0.26, 0.5), outside: at(0.05, 0.05) };
  });

test('the thumbnail screen has Remove background: the cutout becomes the object and three ready combinations appear', async ({ page }) => {
  await withCutout(page);
  await allDrawn(page, 4);
  for (const name of ['Subject with outline and glow', 'Subject over big text', 'Subject on a colour block']) await expect(page.getByRole('listitem', { name: new RegExp(`^Option \\d+: ${name}`) })).toBeVisible();
  expect(await optionCards(page).count()).toBeGreaterThanOrEqual(5);
  const rec = await lastRecord(page);
  expect(rec.picture, 'the record knows which object holds the cutout').toBeTruthy();
  expect(rec.centre).toBeGreaterThan(250);
  expect(rec.outside).toBeLessThan(5);
});

test('a picture that is already a cutout is not cut out again', async ({ page }) => {
  await stub(page);
  await openThumb(page);
  await photoInput(page).setInputFiles(await makePic(page, { name: 'already.png', w: 900, h: 900, type: 'image/png', hue: 90, transparent: true, mark: [0.5, 0.5] }));
  await titleInput(page).fill('Ride before sunrise');
  await allDrawn(page, 3);
  await page.getByRole('button', { name: 'Remove background' }).click();
  await expect(status(page)).toContainText('already has a transparent background');
  await expect(page.getByRole('button', { name: 'Remove background' })).toBeEnabled();
});

test('cutout controls: position, size, flip, tilt, outline, glow, title behind redraw at once with no model, and Undo takes them back', async ({ page }) => {
  await withCutout(page);
  await allDrawn(page, 4);
  await page.getByText('Also add an object, or a second photo for before and after').click();
  const group = page.getByRole('group', { name: 'Cutout controls' });
  await expect(group).toBeVisible();
  let before = await srcs(page);
  const changed = async (what: string) => {
    await expect.poll(async () => JSON.stringify(await srcs(page)), { message: what, timeout: 30_000 }).not.toBe(JSON.stringify(before));
    before = await srcs(page);
  };
  await group.getByRole('slider', { name: 'Cutout size' }).fill('1.6');
  await changed('size');
  await group.getByRole('slider', { name: 'Cutout position across' }).fill('0.3');
  await changed('position');
  await group.getByRole('slider', { name: 'Cutout tilt' }).fill('12');
  await changed('tilt');
  await group.getByLabel('Flip left to right').check();
  await changed('flip');
  await group.getByLabel('Outline', { exact: true }).check();
  await changed('outline');
  await group.getByLabel('Cutout outline thickness').fill('30');
  await changed('outline thickness');
  await group.getByLabel('Cutout glow or shadow').selectOption('glow');
  await changed('glow');
  await group.getByLabel('Title behind the subject').check();
  await changed('title behind');
  // Undo (the project's own history) takes the last change back.
  await expect(page.getByRole('button', { name: /^Undo/ }).first()).toContainText('Put the title behind the cutout');
  await page.getByRole('button', { name: /^Undo/ }).first().click();
  await expect(group.getByLabel('Title behind the subject')).not.toBeChecked();
  // (The options are redrawn from the cache after an undo, so the check is on the control, not on the picture addresses.)
  await expect(group.getByLabel('Title behind the subject')).not.toBeChecked();
});

test('the editor: grow or shrink and soften the edge, erase and restore with the brush on the stored mask, undo, redo, save', async ({ page }) => {
  await withCutout(page);
  await allDrawn(page, 4);
  await page.getByText('Also add an object, or a second photo for before and after').click();
  const before = await lastRecord(page);
  await page.getByRole('button', { name: 'Edit cutout (edge and brush)' }).click();
  const dlg = page.getByRole('dialog', { name: /^Cutout editor:/ });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByLabel('The subject and its edge')).toBeVisible();
  await dlg.getByRole('slider', { name: 'Grow or shrink the edge' }).fill('6');
  await dlg.getByRole('slider', { name: 'Soften the edge' }).fill('4');
  await expect(dlg.getByRole('button', { name: /^Undo: Change soften the edge/ })).toBeVisible();
  // Erase in the middle of the subject with the brush.
  await dlg.getByRole('radio', { name: 'Erase' }).click();
  await dlg.getByRole('slider', { name: 'Brush size' }).fill('60');
  const canvas = dlg.getByLabel('The subject and its edge');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.up();
  await expect(dlg.getByRole('button', { name: /^Undo: Erase with the brush/ })).toBeVisible();
  // Undo and redo.
  await dlg.getByRole('button', { name: /^Undo: Erase/ }).click();
  await expect(dlg.getByRole('button', { name: /^Redo: Erase/ })).toBeVisible();
  await dlg.getByRole('button', { name: /^Redo/ }).click();
  await dlg.getByRole('checkbox', { name: 'Flip left to right' }).check();
  await dlg.getByLabel('Outline', { exact: true }).check();
  await dlg.getByLabel('Glow or shadow').selectOption('glow');
  await dlg.getByLabel('Title behind the subject').check();
  await dlg.getByRole('button', { name: 'Save the cutout' }).click();
  await expect(dlg).toHaveCount(0, { timeout: 60_000 });
  await expect(status(page)).toContainText('Saved the edited cutout');
  const after = await lastRecord(page);
  expect(after.centre, 'the brush took the middle of the subject away in the stored mask').toBeLessThan(40);
  expect(before.centre).toBeGreaterThan(250);
  expect(after.look).toMatchObject({ fx: 'glow', textBehind: true });
  expect(after.picture).not.toBe(before.picture);
});
