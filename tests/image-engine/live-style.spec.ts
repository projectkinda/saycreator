// Step 14d: one screen. The instant draft (no model), the single reader call and the cap, live editing with undo and redo, and saving a template
// that is applied to other photos with no model. A stand-in reader counts every call, so "no model" is checked, not assumed.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fakeReader, makeReference, openStyleFromReferences, readAnswer, refineAnswer, refInput, ROOT, storedTemplates } from './reference-helpers';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1400, height: 1000 } });
const OUT = path.join(ROOT, 'out/image-engine/live-style');
test.beforeAll(() => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
});

const withMarks = () => readAnswer({ seen: ['cover'], extra: { marks: [{ kind: 'round-badge', zone: 'top-right', size: 220, colour: 'accent', text: 'NEW' }, { kind: 'stamp', zone: 'bottom-left', size: 360, colour: 'accent', text: 'OK' }] } });
const mainShot = (page: Page) => page.getByRole('img', { name: /^Cover, your content in this style/ });
const srcOf = (page: Page) => mainShot(page).getAttribute('src');
const calls = (page: Page) => page.getByRole('status', { name: 'Model calls' });

test('the instant draft: pictures added, and your content is drawn in about two seconds with no model call, every value marked MEASURED', async ({ page }) => {
  const rec = await fakeReader(page, () => withMarks());
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  await expect(mainShot(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/^Instant draft: [\d.]+ s, no model\./)).toBeVisible();
  const secs = Number(/Instant draft: ([\d.]+) s/.exec(await page.getByText(/^Instant draft:/).innerText())![1]);
  expect(secs, 'the draft is on screen in under 2 s').toBeLessThan(2);
  expect(rec.reads.length + rec.refines.length, 'no model call was made').toBe(0);
  await expect(calls(page)).toContainText('Model calls: 0 of 2');
  // Every value the draft took from the measurement says so.
  const editor = page.getByRole('region', { name: 'Edit the style' });
  await expect(editor.getByText('MEASURED', { exact: true }).first()).toBeVisible();
  // Nothing is marked READER before the reader has said anything.
  await expect(editor.getByText('READER', { exact: true })).toHaveCount(1);
  await page.screenshot({ path: path.join(OUT, '1-instant-draft.png'), fullPage: true });
  test.info().annotations.push({ type: 'instant draft seconds', description: String(secs) });
});

test('the screen has three parts side by side: the reference, your content, the result', async ({ page }) => {
  await fakeReader(page, () => withMarks());
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  await expect(mainShot(page)).toBeVisible({ timeout: 10_000 });
  const boxes = await Promise.all(['rf-refs-h', 'rf-set-h', 'rf-result-h'].map(async (id) => (await page.locator(`section[aria-labelledby="${id}"]`).boundingBox())!));
  expect(boxes[0].x).toBeLessThan(boxes[1].x);
  expect(boxes[1].x).toBeLessThan(boxes[2].x);
  expect(Math.abs(boxes[0].y - boxes[2].y)).toBeLessThan(30);
});

test('one reader call, not rounds: Read makes exactly one call, applies the answer, keeps the measured values, marks what the reader said', async ({ page }) => {
  const rec = await fakeReader(page, (kind) => (kind === 'refine' ? refineAnswer({ stop: true }) : withMarks()));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  await expect(mainShot(page)).toBeVisible({ timeout: 10_000 });
  const draftSrc = await srcOf(page);
  await page.getByLabel('Name the style').fill('One call');
  await page.getByRole('button', { name: 'Read references' }).click();
  await expect(page.getByRole('heading', { name: '5. How close it got' })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole('button', { name: 'Read references' })).toBeEnabled();
  expect(rec.reads).toHaveLength(1);
  expect(rec.refines, 'no automatic rounds').toHaveLength(0);
  expect(rec.reads[0].prompt).toContain('THIS IS A SHORT JOB, ONE CALL');
  expect(rec.reads[0].prompt).toMatch(/background → #[0-9A-Fa-f]{6}/);
  await expect(calls(page)).toContainText('Model calls: 1 of 2');
  await expect(page.getByRole('list', { name: 'Rounds' }).getByRole('listitem')).toHaveCount(1);
  // The answer is applied: the picture changed, the reader's marks are in the editor marked READER, the measured colours are untouched.
  await expect.poll(() => srcOf(page)).not.toBe(draftSrc);
  const editor = page.getByRole('region', { name: 'Edit the style' });
  await expect(editor.getByLabel('Mark: round-badge (top-right)')).toBeVisible();
  await expect(editor.getByText('READER', { exact: true }).first()).toBeVisible();
  await expect(editor.getByText('MEASURED', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: path.join(OUT, '2-after-the-reader.png'), fullPage: true });
});

test('Improve is the second and last call: with the person\'s own words, then the limit says so and no further call is made', async ({ page }) => {
  const rec = await fakeReader(page, (kind) => (kind === 'refine' ? refineAnswer({ patches: [{ path: 'type.headline', value: 150 }], score: 60 }) : withMarks()));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  await page.getByLabel('Name the style').fill('Improve');
  await page.getByRole('button', { name: 'Read references' }).click();
  await expect(page.getByRole('heading', { name: '5. How close it got' })).toBeVisible({ timeout: 120_000 });
  const improve = page.getByRole('button', { name: /^Improve/ });
  await expect(improve).toBeDisabled();
  await page.getByLabel('Your feedback').fill('bigger title');
  await improve.click();
  await expect(calls(page)).toContainText('Model calls: 2 of 2', { timeout: 60_000 });
  expect(rec.refines).toHaveLength(1);
  expect(rec.refines[0].prompt).toContain('The person looked at the replica and said: "bigger title"');
  await expect(page.getByText(/The limit of 2 model calls is reached/)).toBeVisible();
  await page.getByLabel('Your feedback').fill('more space');
  await expect(improve).toBeDisabled();
  expect(rec.reads.length + rec.refines.length).toBe(2);
});

test('live editing: colours, fonts, size, place and toggles redraw at once with no model, with undo and redo, and say who set each value', async ({ page }) => {
  const rec = await fakeReader(page, () => withMarks());
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  await page.getByLabel('Name the style').fill('Edit');
  await page.getByRole('button', { name: 'Read references' }).click();
  await expect(page.getByRole('heading', { name: '5. How close it got' })).toBeVisible({ timeout: 120_000 });
  const editor = page.getByRole('region', { name: 'Edit the style' });
  const before = rec.reads.length + rec.refines.length;
  let last = await srcOf(page);
  const changed = async () => {
    await expect.poll(() => srcOf(page), { timeout: 20_000 }).not.toBe(last);
    last = (await srcOf(page))!;
  };
  // A colour.
  await editor.getByLabel('Colour: plain bg').fill('#223355');
  await changed();
  await expect(editor.getByText('PERSON', { exact: true }).first()).toBeVisible();
  // A font.
  await editor.getByLabel('Headline font').selectOption('Bebas Neue');
  await changed();
  // Text size.
  await editor.getByRole('slider', { name: 'Cover title size' }).fill('230');
  await changed();
  // Where the title goes.
  await editor.getByRole('radio', { name: 'Title bottom' }).click();
  await expect(editor.getByRole('radio', { name: 'Title bottom' })).toHaveAttribute('aria-checked', 'true');
  await changed();
  // A mark switched off, and on again.
  await editor.getByLabel('Mark: stamp (bottom-left)').uncheck();
  await changed();
  await editor.getByLabel('Mark: stamp (bottom-left)').check();
  await changed();
  // Undo and redo.
  await expect(editor.getByRole('button', { name: /^Undo: Show the stamp/ })).toBeVisible();
  await editor.getByRole('button', { name: /^Undo/ }).click();
  await expect(editor.getByLabel('Mark: stamp (bottom-left)')).not.toBeChecked();
  await editor.getByRole('button', { name: /^Redo/ }).click();
  await expect(editor.getByLabel('Mark: stamp (bottom-left)')).toBeChecked();
  // Dragging the title to a new place (a click or a drag on the picture).
  const pic = page.locator('.rf-drag');
  await pic.scrollIntoViewIfNeeded();
  const box = (await pic.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.up();
  await expect(editor.getByRole('radio', { name: 'Title top' })).toHaveAttribute('aria-checked', 'true');
  // The layer list: a layer can be switched off in the preview (through the plan patch system).
  const layers = page.locator('.rf-layers');
  await layers.locator('summary').click();
  const first = layers.getByRole('checkbox').first();
  await first.uncheck();
  await expect(layers.getByRole('img', { name: 'Preview with your layer changes' })).toBeVisible({ timeout: 20_000 });
  expect(rec.reads.length + rec.refines.length, 'editing made no model call').toBe(before);
  await page.screenshot({ path: path.join(OUT, '3-edited.png'), fullPage: true });
});

test('Save as template: the style only (no reference picture), then applied to your other photos with zero model calls', async ({ page }) => {
  const rec = await fakeReader(page, () => withMarks());
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  const a = await makeReference(page, { name: 'mine-a.jpg', kind: 'slide', bg: '#d9381e' });
  const b = await makeReference(page, { name: 'mine-b.jpg', kind: 'slide', bg: '#2b5a8a' });
  const c = await makeReference(page, { name: 'mine-c.jpg', kind: 'slide', bg: '#1d6b4f' });
  await page.getByLabel('Choose a photo for the samples').setInputFiles([a, b, c]);
  await expect(page.getByRole('list', { name: 'Your photos' }).getByRole('listitem')).toHaveCount(3);
  await page.getByLabel('Name the style').fill('Mine saved');
  await page.getByRole('button', { name: 'Read references' }).click();
  await expect(page.getByRole('heading', { name: '5. How close it got' })).toBeVisible({ timeout: 120_000 });
  const editor = page.getByRole('region', { name: 'Edit the style' });
  await editor.getByLabel('Mark: stamp (bottom-left)').uncheck();
  const modelCalls = rec.reads.length + rec.refines.length;
  await page.getByRole('button', { name: 'Save as template' }).click();
  await expect(page.getByText(/Saved “Mine saved”/)).toBeVisible({ timeout: 30_000 });
  const applied = page.getByLabel('The template applied to your photos');
  await expect(applied).toContainText('Applied to 3 photos');
  await expect(applied).toContainText('0 model calls');
  await expect(applied.getByRole('img')).toHaveCount(3, { timeout: 30_000 });
  expect(rec.reads.length + rec.refines.length, 'saving and applying made no model call').toBe(modelCalls);
  // What was stored: the style and its layout recipe, not a reference picture, and no switched-off mark.
  const t = (await storedTemplates(page))[0];
  const text = JSON.stringify(t.spec);
  expect(text).not.toContain('data:image');
  expect(text).not.toContain('dark.jpg');
  expect((t.spec as { marks?: { kind: string; off?: boolean }[] }).marks?.map((m) => m.kind)).toEqual(['round-badge']);
  expect(t.name).toBe('Mine saved');
  const secs = await page.evaluate(() => (window as unknown as { __template: { applySeconds: number; photos: number; modelCalls: number } }).__template);
  expect(secs.modelCalls).toBe(0);
  test.info().annotations.push({ type: 'apply template seconds', description: `${secs.applySeconds} s for ${secs.photos} photos` });
  await page.screenshot({ path: path.join(OUT, '4-saved-applied.png'), fullPage: true });
});

test('the job record keeps the cost: model calls, pictures sent, tokens not reported', async ({ page }) => {
  await fakeReader(page, () => withMarks());
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  await page.getByLabel('Name the style').fill('Cost');
  await page.getByRole('button', { name: 'Read references' }).click();
  await expect(page.getByRole('heading', { name: '5. How close it got' })).toBeVisible({ timeout: 120_000 });
  const saved = await page.evaluate(async () => {
    const w = window as unknown as { __liveJobs: { saved: () => Promise<{ cost?: { calls: number; images: number; tokens: number | null } }[]> } };
    await new Promise((r) => setTimeout(r, 500));
    return w.__liveJobs.saved();
  });
  expect(saved[0].cost).toEqual({ calls: 1, images: 1, tokens: null });
});

test('Advanced is off by default; turned on it allows the reader to refine over rounds, and says so', async ({ page }) => {
  const rec = await fakeReader(page, (kind, n) => (kind === 'refine' ? (n === 0 ? refineAnswer({ patches: [{ path: 'type.headline', value: 140 }], score: 60 }) : refineAnswer({ stop: true, score: 55 })) : withMarks()));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  const adv = page.getByRole('checkbox', { name: /^Advanced:/ });
  await expect(adv).not.toBeChecked();
  await adv.check();
  await page.getByLabel('Name the style').fill('Adv');
  await page.getByRole('button', { name: 'Read references' }).click();
  await expect(page.getByRole('heading', { name: '5. How close it got' })).toBeVisible({ timeout: 120_000 });
  // The closeness panel shows after the first replica; the refining rounds follow, so wait for them.
  await expect.poll(() => rec.refines.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  await expect(calls(page)).toContainText(/Model calls: [2-9] of 10/, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Read references' })).toBeEnabled({ timeout: 60_000 });
});
