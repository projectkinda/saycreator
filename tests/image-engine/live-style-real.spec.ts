// Step 14d, REAL: one real run per target (carousel, thumbnail) with the real reader (off unless REAL_LIVE=1). One reference slide and three photos of the
// person's own go in; it records the real seconds for the instant draft, the one reader call, a live edit, and applying the saved template to the
// photos, and the model calls made. The photos are test photos from the private test-images folder (tests only, never in the app).
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { loopDone, openStyleFromReferences, refInput, ROOT } from './reference-helpers';

const OUT = path.join(ROOT, 'out/image-engine/live-style-real');
const REF = path.join(ROOT, 'Reference carousels likes', '1503c1de8dded2a7cbe333f061c7131a.jpg');
const PHOTOS = ['baruk-granda-FKf0FU7OuPM-unsplash.jpg', 'bruno-bd-6sRXFQszA74-unsplash.jpg', 'emanuel-haas-aatG4lqAeGQ-unsplash.jpg'].map((f) => path.join(ROOT, 'test-images', f));
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1500, height: 1000 } });
test.skip(process.env.REAL_LIVE !== '1', 'Real runs are opt-in (REAL_LIVE=1): they use model time.');
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

const main = (page: Page, target: string) => page.getByRole('img', { name: target === 'Carousels' ? /^Cover, your content in this style/ : /^Thumbnail, .*your content in this style/ }).first();

for (const target of ['Carousels', 'Thumbnails']) {
  test(`real run, target ${target}`, async ({ page }) => {
    test.setTimeout(600_000);
    await openStyleFromReferences(page);
    await expect(page.getByText('Reader: Claude Code on this computer')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('radio', { name: target, exact: true }).click();
    await page.getByLabel('Choose a photo for the samples').setInputFiles(PHOTOS);
    await expect(page.getByRole('list', { name: 'Your photos' }).getByRole('listitem')).toHaveCount(3);
    await page.getByLabel('Your title (drawn on the cover and the thumbnail)').fill('Ride before sunrise');
    // The reference goes in last, so the instant draft is the first thing drawn for it.
    await refInput(page).setInputFiles(REF);
    const card = page.locator('.rf-upload').first();
    await expect(card).toBeVisible();
    await expect(card.getByRole('checkbox').first()).toBeVisible();
    const total = await card.getByRole('checkbox').count();
    for (let i = 2; i <= total; i++) await card.getByRole('checkbox', { name: new RegExp(`^Use slide ${i} of `) }).uncheck();
    await expect(main(page, target)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^Instant draft: [\d.]+ s, no model\./)).toBeVisible();
    const draft = Number(/Instant draft: ([\d.]+) s/.exec(await page.getByText(/^Instant draft:/).innerText())![1]);
    await page.screenshot({ path: path.join(OUT, `${target}-1-instant-draft.png`), fullPage: true });
    const callsBefore = await page.getByRole('status', { name: 'Model calls' }).innerText();

    await page.getByLabel('Name the style').fill(`Real ${target}`);
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Read references' }).click();
    await loopDone(page);
    const readSeconds = Math.round((Date.now() - t0) / 100) / 10;
    const callsAfter = await page.getByRole('status', { name: 'Model calls' }).innerText();
    const job = await page.evaluate(() => {
      const j = (window as unknown as { __liveJobs: { now: () => { stages: { label: string; seconds?: number }[] } } }).__liveJobs.now();
      return j.stages.map((s) => ({ label: s.label, seconds: s.seconds }));
    });
    await page.screenshot({ path: path.join(OUT, `${target}-2-after-reader.png`), fullPage: true });

    // A live edit: how long until the picture has changed.
    const before = await main(page, target).getAttribute('src');
    const e0 = Date.now();
    await page.getByRole('region', { name: 'Edit the style' }).getByLabel('Colour: plain bg').fill('#1d2b4a');
    await expect.poll(() => main(page, target).getAttribute('src'), { timeout: 30_000 }).not.toBe(before);
    const editMs = Date.now() - e0;
    await page.screenshot({ path: path.join(OUT, `${target}-3-edited.png`), fullPage: true });

    await page.getByRole('button', { name: 'Save as template' }).click();
    await expect(page.getByText(/^Saved “/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel('The template applied to your photos')).toContainText('Applied to 3 photos', { timeout: 60_000 });
    const applied = await page.evaluate(() => (window as unknown as { __template: { applySeconds: number; photos: number; modelCalls: number } }).__template);
    await page.screenshot({ path: path.join(OUT, `${target}-4-saved-applied.png`), fullPage: true });
    fs.writeFileSync(path.join(OUT, `${target}.json`), JSON.stringify({ target, instantDraftSeconds: draft, callsBeforeRead: callsBefore, readSeconds, callsAfterRead: callsAfter, stages: job, liveEditMs: editMs, applyTemplate: applied }, null, 2));
    expect(applied.modelCalls).toBe(0);
  });
}
