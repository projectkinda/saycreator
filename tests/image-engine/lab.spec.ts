// The Results screen (/lab), driven like a person would: through the left menu, in real Chrome.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESULTS_DIR, writeStepResults } from './results';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/results-screen');
const IMAGES = fs.readdirSync(path.join(ROOT, 'test-images')).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1500, height: 1000 } });
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

const open = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Results' }).click();
  await expect(page).toHaveURL(/\/lab$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Results' })).toBeVisible();
};
const verdictsText = (page: Page) => page.getByRole('status').filter({ hasText: /verdicts/ });

test('Results is in the left menu in the dev server, looks like the app, and lists every step newest first', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  // It is inside the app shell (menu still there) and uses the app's page header.
  await expect(page.locator('aside#sidebar')).toBeVisible();
  await expect(page.locator('.page-header .page-title')).toHaveText('Results');
  const titles = await page.locator('section.res-section h2').allTextContents();
  expect(titles).toEqual(['Step 5: Style recreation', 'Step 5: Style reading', 'Step 3: Carousels', 'Step 4: Cutouts', 'Step 2: Thumbnails and checks', 'Step 1: Plan and patch proof']);
  // Every section says when it was last run and has a refresh button.
  for (const s of await page.locator('section.res-section').all()) {
    await expect(s.getByText(/Last run /)).toBeVisible();
    await expect(s.getByRole('button', { name: /^Refresh/ })).toBeVisible();
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: path.join(OUT, '01-top.png') });
});

test('Step 1: carousel slide, quote card and the patch test as before, after, undone', async ({ page }) => {
  await open(page);
  const s = page.locator('#step1');
  await expect(s.getByRole('heading', { name: 'Carousel slide proof' })).toBeVisible();
  await expect(s.getByRole('heading', { name: 'Quote card proof' })).toBeVisible();
  const patch = s.locator('.res-item', { hasText: 'Patch test' });
  for (const label of ['before', 'after', 'undone', 'redone']) await expect(patch.getByText(label, { exact: true })).toBeVisible();
  await expect(patch).toContainText('Undo gives back the same pixels: yes');
  await s.scrollIntoViewIfNeeded();
  await s.screenshot({ path: path.join(OUT, '02-step1.png') });
});

test('Step 2: each picture shows the original and every option at phone size, full size on click, with reasons', async ({ page }) => {
  await open(page);
  const s = page.locator('#step2');
  await expect(s.locator('.res-source[aria-label^="Source picture"]')).toHaveCount(8);
  const first = s.locator('.res-aspect').first();
  await expect(first.getByRole('img', { name: /^Original / })).toBeVisible();
  await expect(first.locator('.res-opt')).toHaveCount(3);
  // Phone size: the option picture is the 320 px copy.
  const img = first.locator('.res-opt img').first();
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(320);
  expect(await first.locator('.res-opt .chip').count()).toBeGreaterThanOrEqual(3);
  // A failing option shows plain reasons.
  const failing = s.locator('.res-opt', { has: page.locator('.chip-error') }).first();
  await expect(failing.locator('.lab-fails li').first()).not.toBeEmpty();
  // Click for full size.
  await first.locator('.res-opt .res-pic').first().click();
  const dlg = page.locator('dialog.res-viewer[open]');
  await expect(dlg).toBeVisible();
  const full = await dlg.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth);
  expect(full).toBeGreaterThan(320);
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await s.scrollIntoViewIfNeeded();
  await s.locator('.res-source').first().screenshot({ path: path.join(OUT, '03-step2.png') });
});

test('Step 4: toy results are labelled TOY, real ones REAL, failures are shown, four backgrounds per cutout', async ({ page }) => {
  await open(page);
  const s = page.locator('#step4');
  await expect(s.locator('section[aria-label^="Cutouts for"]')).toHaveCount(IMAGES.length);
  await expect(s.getByText('TOY: plumbing test only').first()).toBeVisible();
  await expect(s.getByText('REAL').first()).toBeVisible();
  await expect(s.locator('.lab-model', { hasText: 'ISNet' }).first()).toContainText('Blocked');
  await expect(s.locator('.lab-model', { hasText: 'BiRefNet' }).first()).toContainText(/Failed|Worked|Not run/);
  const row = s.locator('.lab-cut-row').first();
  for (const bg of ['checker', 'dark', 'light', 'colour', 'mask']) await expect(row.locator('.lab-tile', { hasText: bg })).toBeVisible();
  await expect(row).toContainText('webgpu');
  await expect(row).toContainText(/total \d/);
  await s.locator('section[aria-label^="Cutouts for"]').first().scrollIntoViewIfNeeded();
  await s.locator('section[aria-label^="Cutouts for"]').first().screenshot({ path: path.join(OUT, '04-step4.png') });
});

test('verdicts: autosave, survive a reload, export, and the checker disagreement flag', async ({ page }) => {
  await open(page);
  // A thumbnail option (Step 2), a carousel slide (Step 3), a cutout (Step 4), a proof (Step 1).
  const opt = page.locator('#step2 .res-opt').first();
  const failed = (await opt.locator('.chip-error').count()) > 0;
  await opt.getByRole('button', { name: failed ? 'good' : 'bad' }).click(); // against the checker on purpose
  await opt.getByPlaceholder('why? (one line)').fill('I disagree on purpose');
  await expect(opt.locator('.lab-disagree')).toBeVisible();
  const slide = page.locator('#step3 .lab-slide').first();
  await slide.getByRole('button', { name: 'meh' }).click();
  await slide.getByPlaceholder('why? (one line)').fill('a bit plain');
  const cut = page.locator('#step4 .lab-cut-row').first();
  await cut.getByRole('button', { name: 'bad' }).click();
  await cut.getByPlaceholder('why? (one line)').fill('toy, not a cutout');
  const proof = page.locator('#step1 .res-item').first();
  await proof.getByRole('button', { name: 'good' }).click();
  await expect(verdictsText(page)).toContainText('4 verdicts');
  await page.reload();
  await expect(verdictsText(page)).toContainText('4 verdicts');
  await expect(page.locator('#step2 .res-opt').first().getByPlaceholder('why? (one line)')).toHaveValue('I disagree on purpose');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export verdicts JSON' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^lab-verdicts-\d{4}-\d{2}-\d{2}\.json$/);
  const saved = path.join(OUT, 'export-example.json');
  await file.saveAs(saved);
  const data = JSON.parse(fs.readFileSync(saved, 'utf8'));
  expect(data.verdicts).toHaveLength(4);
  expect(data.verdicts.map((v: { step: string }) => v.step).sort()).toEqual(['step1', 'step2', 'step3', 'step4']);
  const th = data.verdicts.find((v: { kind: string }) => v.kind === 'thumbnail');
  expect(th).toMatchObject({ reason: 'I disagree on purpose', option: expect.stringMatching(/\d+:\d+ \w+/), checker: { pass: !failed, failed: expect.any(Array) } });
  const cutv = data.verdicts.find((v: { kind: string }) => v.kind === 'cutout');
  expect(cutv.timings).toBeTruthy();
  expect(data.cutouts.models.map((m: { id: string }) => m.id)).toContain('isnet-general-use');
});

test('refresh: each section re-reads its results and keeps a last-run time', async ({ page }) => {
  await open(page);
  const s = page.locator('#step3');
  await expect(s.locator('.res-last .muted')).toHaveText(/Last run/);
  await s.getByRole('button', { name: /^Refresh/ }).click();
  await expect(s.locator('.lab-slide').first()).toBeVisible();
  await expect(s.locator('.res-last .muted')).toHaveText(/Last run/);
});

test('upload: your own picture can be cut out and made into thumbnails in the browser', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await page.getByLabel('Add pictures to try').setInputFiles(path.join(ROOT, 'test-images', IMAGES[0]));
  await expect(page.getByText('Your pictures (kept only while this tab is open)')).toContainText(IMAGES[0]);
  // Step 4 lists it as added by you.
  await expect(page.locator('#step4 section[aria-label^="Cutouts for"]', { hasText: 'added by you' })).toHaveCount(1);
  // Step 2 makes thumbnails from it and checks them.
  const s = page.locator('#step2 .res-try');
  await s.getByRole('button', { name: 'Make thumbnails' }).click();
  await expect(s.locator('.res-opt')).toHaveCount(3, { timeout: 60_000 });
  await expect(s.locator('.res-opt .chip').first()).toBeVisible();
});

test('a later step shows up on the screen by itself when it writes its results file', async ({ page }) => {
  writeStepResults({
    id: 'step99-selfcheck',
    title: 'Step 99: Self check',
    order: 99,
    intro: 'Written by a test to prove that new steps appear without page changes.',
    groups: [{ title: 'Sample group', items: [{ id: 'a', title: 'Sample item', tag: 'TOY: plumbing test only', images: [{ url: '/out/image-engine/step1-quote-card.png', label: 'sample' }], checker: { pass: false, reasons: ['Sample reason.'] }, facts: ['model: none', 'total 1 ms'] }] }],
  });
  try {
    await open(page);
    await expect(page.locator('section.res-section h2').first()).toHaveText('Step 99: Self check'); // newest first
    const item = page.locator('#step99-selfcheck .res-item');
    await expect(item).toContainText('Sample reason.');
    await expect(item).toContainText('TOY: plumbing test only');
    await item.getByRole('button', { name: 'good' }).click();
    await expect(verdictsText(page)).toContainText('1 verdicts');
  } finally {
    fs.rmSync(path.join(RESULTS_DIR, 'step99-selfcheck.json'), { force: true });
  }
});
