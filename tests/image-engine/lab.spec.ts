// The dev-only /lab page, driven like a person would.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/step4');
const IMAGES = fs.readdirSync(path.join(ROOT, 'test-images')).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1500, height: 1000 } });

test('lab: loads, blocks ISNet, runs the self-test, takes verdicts, keeps them, exports them', async ({ page }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/lab');
  await expect(page.getByRole('heading', { level: 1, name: /Lab/ })).toBeVisible();

  // Every test picture is listed, and every Step 2 option is shown with the checker's answer.
  await expect(page.locator('section[aria-label^="Cutouts for"]')).toHaveCount(IMAGES.length);
  const thumbs = page.locator('.lab-thumb');
  await expect(thumbs.first()).toBeVisible();
  expect(await thumbs.count()).toBeGreaterThanOrEqual(24);
  expect(await page.locator('.lab-thumb .chk-pass, .lab-thumb .chk-fail').count()).toBe(await thumbs.count());

  // ISNet is blocked with its reason; BiRefNet is offered; no download was started for ISNet.
  const isnet = page.locator('.lab-model', { hasText: 'ISNet' });
  await expect(isnet).toContainText('Blocked');
  await expect(isnet).toContainText('Unclear');
  await expect(isnet.getByRole('button')).toHaveCount(0);
  await expect(page.locator('.lab-model', { hasText: 'BiRefNet' }).getByRole('button', { name: /Load and run/ })).toBeVisible();

  // The toy self-test model is hidden until asked for, and runs end to end.
  await expect(page.locator('.lab-model.is-test')).toHaveCount(0);
  await page.getByLabel(/show the pipeline self-test/).check();
  const toy = page.locator('.lab-model.is-test');
  await toy.getByRole('button', { name: /Load and run/ }).click();
  await expect(toy.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.lab-cut-row')).toHaveCount(IMAGES.length);
  await expect(page.locator('.lab-tile')).toHaveCount(IMAGES.length * 5); // checker, dark, light, colour, mask
  await expect(toy).toContainText('Backend');
  await expect(page.locator('section[aria-label^="Cutouts for"]').first()).toContainText('TEST ONLY');
  await expect(page.locator('.lab-pick').first()).toContainText('appears once a real model has run');

  // Verdicts on a cutout and on thumbnails.
  const firstCut = page.locator('.lab-cut-row').first();
  await firstCut.getByRole('button', { name: 'good' }).click();
  await firstCut.getByPlaceholder('why? (one line)').fill('edges are clean');
  const firstThumb = thumbs.first();
  const checkerFailed = (await firstThumb.locator('.chk-fail').count()) > 0;
  await firstThumb.getByRole('button', { name: checkerFailed ? 'good' : 'bad' }).click(); // deliberately against the checker
  await firstThumb.getByPlaceholder('why? (one line)').fill('I disagree on purpose');
  await expect(firstThumb.locator('.lab-disagree')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /verdicts/ })).toContainText('2 verdicts');

  // A refresh does not lose them.
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: /verdicts/ })).toContainText('2 verdicts');
  await expect(thumbs.first().getByPlaceholder('why? (one line)')).toHaveValue('I disagree on purpose');

  // Export.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export verdicts JSON' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^lab-verdicts-\d{4}-\d{2}-\d{2}\.json$/);
  const saved = path.join(OUT, 'lab-export-example.json');
  await file.saveAs(saved);
  const data = JSON.parse(fs.readFileSync(saved, 'utf8'));
  expect(data.verdicts).toHaveLength(2);
  const thumb = data.verdicts.find((v: { kind: string }) => v.kind === 'thumbnail');
  expect(thumb).toMatchObject({ image: expect.any(String), option: expect.stringMatching(/\d+:\d+ \w+/), verdict: checkerFailed ? 'good' : 'bad', reason: 'I disagree on purpose' });
  expect(thumb.checker).toMatchObject({ pass: !checkerFailed, failed: expect.any(Array) });
  expect(data.models.map((m: { id: string }) => m.id)).toContain('isnet-general-use');
  expect(data.machine).toHaveProperty('webgpu');

  expect(errors, 'no page errors').toEqual([]);
  await page.screenshot({ path: path.join(OUT, 'lab-top.png'), clip: { x: 0, y: 0, width: 1500, height: 1000 } });
});

test('lab: BiRefNet_lite that cannot run shows the reason in the page and the lab stays usable', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/lab');
  const card = page.locator('.lab-model', { hasText: 'BiRefNet' });
  await card.getByRole('button', { name: /Load and run/ }).click();
  await expect(card.locator('.lab-err, .lab-dim', { hasText: /Backend|Cannot run/ }).first()).toBeVisible({ timeout: 200_000 });
  const failed = (await card.locator('.lab-err', { hasText: 'Cannot run' }).count()) > 0;
  if (failed) {
    await expect(card).toContainText(/could not run|stopped|memory|WebGPU/i);
    await card.screenshot({ path: path.join(OUT, 'lab-birefnet-cannot-run.png') });
  }
  await expect(page.getByRole('button', { name: 'Export verdicts JSON' })).toBeEnabled();
});
