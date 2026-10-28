// One screen (14d) and layout transfer (14e): the instant draft from the detected boxes (no model), the single labelling call and the cap, live editing of
// the style and of the detected boxes with undo and redo, and saving a template that is applied to other photos with no model. A stand-in reader counts
// every call, so "no model" is checked, not assumed.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fakeReader, labelsAnswer, makeReference, openStyleFromReferences, readAnswer, refineAnswer, refInput, ROOT, storedTemplates } from './reference-helpers';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1400, height: 1000 } });
const OUT = path.join(ROOT, 'out/image-engine/live-style');
test.beforeAll(() => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
});

const mainShot = (page: Page) => page.getByRole('img', { name: /^Cover, your content in this style/ });
const srcOf = (page: Page) => mainShot(page).getAttribute('src');
const calls = (page: Page) => page.getByRole('status', { name: 'Model calls' });
const done = (page: Page) => expect(page.getByRole('heading', { name: '5. How close it got' })).toBeVisible({ timeout: 120_000 });
const labels = (kind: string, _n: number, prompt: string) => (kind === 'refine' ? refineAnswer({ patches: [{ path: 'type.headline', value: 150 }], score: 60 }) : labelsAnswer(prompt));

test('the instant draft: pictures added, and your content is drawn from the detected boxes in about two seconds with no model call, every value MEASURED', async ({ page }) => {
  const rec = await fakeReader(page, labels);
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  await expect(mainShot(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/^Instant draft: [\d.]+ s, no model\./)).toBeVisible();
  const secs = Number(/Instant draft: ([\d.]+) s/.exec(await page.getByText(/^Instant draft:/).innerText())![1]);
  expect(secs, 'the draft is on screen in under 2 s').toBeLessThan(2);
  expect(rec.reads.length + rec.refines.length, 'no model call was made').toBe(0);
  await expect(calls(page)).toContainText('Model calls: 0 of 2');
  const editor = page.getByRole('region', { name: 'Edit the style' });
  await expect(editor.getByText('MEASURED', { exact: true }).first()).toBeVisible();
  await expect(editor.getByText(/Layout boxes from your reference \(cover\)/)).toBeVisible();
  await expect(editor.getByText('READER', { exact: true })).toHaveCount(1);
  await page.screenshot({ path: path.join(OUT, '1-instant-draft.png'), fullPage: true });
  test.info().annotations.push({ type: 'instant draft seconds', description: String(secs) });
});

test('the screen has three parts side by side: the reference, your content, the result', async ({ page }) => {
  await fakeReader(page, labels);
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  await expect(mainShot(page)).toBeVisible({ timeout: 10_000 });
  const boxes = await Promise.all(['rf-refs-h', 'rf-set-h', 'rf-result-h'].map(async (id) => (await page.locator(`section[aria-labelledby="${id}"]`).boundingBox())!));
  expect(boxes[0].x).toBeLessThan(boxes[1].x);
  expect(boxes[1].x).toBeLessThan(boxes[2].x);
  expect(Math.abs(boxes[0].y - boxes[2].y)).toBeLessThan(30);
});

test('one reader call that only labels: it is sent boxes and what was detected, no rounds follow, and the answer names the roles', async ({ page }) => {
  const rec = await fakeReader(page, labels);
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  await expect(mainShot(page)).toBeVisible({ timeout: 10_000 });
  await page.getByLabel('Name the style').fill('One call');
  await page.getByRole('button', { name: 'Read references' }).click();
  await done(page);
  await expect(page.getByRole('button', { name: 'Read references' })).toBeEnabled();
  expect(rec.reads).toHaveLength(1);
  expect(rec.refines, 'no automatic rounds').toHaveLength(0);
  const prompt = rec.reads[0].prompt;
  expect(prompt).toContain('You label the parts of reference slides');
  expect(prompt).toContain('you do NOT give positions, sizes, colours or fonts');
  expect(prompt).toMatch(/r1T1 \(text\): x [\d.]+%, y [\d.]+%/);
  expect(prompt).not.toMatch(/font family|Schibsted|Instrument Sans/);
  expect(rec.reads[0].images.map((i) => i.name)).toEqual(['ref1.jpg']);
  await expect(calls(page)).toContainText('Model calls: 1 of 2');
  await expect(page.getByRole('list', { name: 'Rounds' }).getByRole('listitem')).toHaveCount(1);
  const editor = page.getByRole('region', { name: 'Edit the style' });
  await expect(editor.getByText('READER', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: path.join(OUT, '2-after-the-reader.png'), fullPage: true });
});

test('Improve is the second and last call: with the person\'s own words, then the limit says so and no further call is made', async ({ page }) => {
  const rec = await fakeReader(page, labels);
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  await page.getByLabel('Name the style').fill('Improve');
  await page.getByRole('button', { name: 'Read references' }).click();
  await done(page);
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

test('live editing, no model: style controls and the detected boxes (move, relabel, delete) redraw at once, with undo and redo', async ({ page }) => {
  const rec = await fakeReader(page, labels);
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  await page.getByLabel('Name the style').fill('Edit');
  await page.getByRole('button', { name: 'Read references' }).click();
  await done(page);
  const editor = page.getByRole('region', { name: 'Edit the style' });
  const before = rec.reads.length + rec.refines.length;
  let last = await srcOf(page);
  const changed = async () => {
    await expect.poll(() => srcOf(page), { timeout: 20_000 }).not.toBe(last);
    last = (await srcOf(page))!;
  };
  await editor.getByLabel('Colour: plain bg').fill('#223355');
  await changed();
  await expect(editor.getByText('PERSON', { exact: true }).first()).toBeVisible();
  await editor.getByLabel('Headline font').selectOption('Bebas Neue');
  await changed();
  // The detected boxes: show them, select one, move it with the keyboard, relabel it, delete another.
  await page.getByRole('button', { name: 'Show what I detected' }).click();
  const overlay = page.getByLabel('What I detected');
  const boxes = overlay.getByRole('button', { name: /^Text box/ });
  expect(await boxes.count()).toBeGreaterThanOrEqual(2);
  await boxes.first().focus();
  await boxes.first().press('ArrowDown');
  await boxes.first().press('Shift+ArrowRight');
  await changed();
  await boxes.first().click();
  await overlay.getByLabel('Role of this text box').selectOption('label');
  await changed();
  await overlay.getByLabel('Alignment of this text box').selectOption('centre');
  await changed();
  const count = await boxes.count();
  await boxes.nth(1).click();
  await overlay.getByRole('button', { name: 'Delete this box' }).click();
  await expect(boxes).toHaveCount(count - 1);
  await changed();
  // Undo and redo bring the box back and take it away again.
  await editor.getByRole('button', { name: /^Undo: Delete a box/ }).click();
  await expect(boxes).toHaveCount(count);
  await editor.getByRole('button', { name: /^Redo/ }).click();
  await expect(boxes).toHaveCount(count - 1);
  // Adding a box.
  await overlay.getByRole('button', { name: 'Add a text box' }).click();
  await expect(boxes).toHaveCount(count);
  // The title place (three buttons or a click on the picture) still works on the stored layouts.
  await editor.getByRole('slider', { name: 'Cover title size' }).fill('200');
  expect(rec.reads.length + rec.refines.length, 'editing made no model call').toBe(before);
  await page.screenshot({ path: path.join(OUT, '3-edited.png'), fullPage: true });
});

test('Save as template: the style and the free layout only (no reference picture), applied to your other photos with zero model calls', async ({ page }) => {
  const rec = await fakeReader(page, labels);
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  const a = await makeReference(page, { name: 'mine-a.jpg', kind: 'slide', bg: '#d9381e' });
  const b = await makeReference(page, { name: 'mine-b.jpg', kind: 'slide', bg: '#2b5a8a' });
  const c = await makeReference(page, { name: 'mine-c.jpg', kind: 'slide', bg: '#1d6b4f' });
  await page.getByLabel('Choose a photo for the samples').setInputFiles([a, b, c]);
  await expect(page.getByRole('list', { name: 'Your photos' }).getByRole('listitem')).toHaveCount(3);
  await page.getByLabel('Name the style').fill('Mine saved');
  await page.getByRole('button', { name: 'Read references' }).click();
  await done(page);
  const modelCalls = rec.reads.length + rec.refines.length;
  await page.getByRole('button', { name: 'Save as template' }).click();
  await expect(page.getByText(/Saved “Mine saved”/)).toBeVisible({ timeout: 30_000 });
  const applied = page.getByLabel('The template applied to your photos');
  await expect(applied).toContainText('Applied to 3 photos');
  await expect(applied).toContainText('0 model calls');
  await expect(applied.getByRole('img')).toHaveCount(3, { timeout: 30_000 });
  expect(rec.reads.length + rec.refines.length, 'saving and applying made no model call').toBe(modelCalls);
  const t = (await storedTemplates(page))[0];
  const text = JSON.stringify(t.spec);
  expect(text).not.toContain('data:image');
  expect(text).not.toContain('dark.jpg');
  const free = (t.spec as { free?: { cover?: { slots: { box: { w: number }; role: string }[]; background: { kind: string } } } }).free;
  expect(free?.cover?.slots.length, 'the free layout is in the template').toBeGreaterThan(0);
  expect(free!.cover!.slots.some((s) => s.role === 'title')).toBe(true);
  expect(t.name).toBe('Mine saved');
  const secs = await page.evaluate(() => (window as unknown as { __template: { applySeconds: number; photos: number; modelCalls: number } }).__template);
  expect(secs.modelCalls).toBe(0);
  test.info().annotations.push({ type: 'apply template seconds', description: `${secs.applySeconds} s for ${secs.photos} photos` });
  await page.screenshot({ path: path.join(OUT, '4-saved-applied.png'), fullPage: true });
});

test('the job record keeps the cost: model calls, pictures sent, tokens not reported', async ({ page }) => {
  await fakeReader(page, labels);
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  await page.getByLabel('Name the style').fill('Cost');
  await page.getByRole('button', { name: 'Read references' }).click();
  await done(page);
  const saved = await page.evaluate(async () => {
    const w = window as unknown as { __liveJobs: { saved: () => Promise<{ cost?: { calls: number; images: number; tokens: number | null } }[]> } };
    await new Promise((r) => setTimeout(r, 500));
    return w.__liveJobs.saved();
  });
  expect(saved[0].cost).toEqual({ calls: 1, images: 1, tokens: null });
});

test('Advanced is off by default; turned on it uses the full style read and lets the reader refine over rounds, and says so', async ({ page }) => {
  const rec = await fakeReader(page, (kind, n) => (kind === 'refine' ? (n === 0 ? refineAnswer({ patches: [{ path: 'type.headline', value: 140 }], score: 60 }) : refineAnswer({ stop: true, score: 55 })) : readAnswer({ seen: ['cover'] })));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  const adv = page.getByRole('checkbox', { name: /^Advanced:/ });
  await expect(adv).not.toBeChecked();
  await adv.check();
  await page.getByLabel('Name the style').fill('Adv');
  await page.getByRole('button', { name: 'Read references' }).click();
  await done(page);
  await expect.poll(() => rec.refines.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  await expect(calls(page)).toContainText(/Model calls: [2-9] of 10/, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Read references' })).toBeEnabled({ timeout: 60_000 });
});
