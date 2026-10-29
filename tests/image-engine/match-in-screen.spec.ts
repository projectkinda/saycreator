// Step 15c-2: "Match a reference" inside the thumbnail screen. No reader is connected here, so no model call is made; the instant draft is what is tested.
import { expect, test } from '@playwright/test';
import { makePic } from './photos-app-helpers';
import { makeReference } from './reference-helpers';
import { allDrawn, openThumb, photoInput, titleInput } from './thumbnail-app-helpers';

test.setTimeout(180_000);

test('a reference dropped on the thumbnail screen restyles the person\'s own title and photo at once; the chip shows it and the X goes back', async ({ page }) => {
  await openThumb(page);
  await photoInput(page).setInputFiles(await makePic(page, { name: 'subject.jpg', w: 1280, h: 720, hue: 30, mark: [0.5, 0.5] }));
  await titleInput(page).fill('Ride before sunrise');
  await allDrawn(page, 3);
  await expect(page.getByRole('group', { name: 'Reference' })).toHaveCount(0);
  await page.getByText('Match a reference', { exact: true }).click();
  const ref = await makeReference(page, { name: 'loud.jpg', kind: 'slide' });
  await page.getByLabel('Choose reference images').setInputFiles(ref);
  const chip = page.getByRole('group', { name: 'Reference' });
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await expect(chip).toContainText('learning from');
  // The options are drawn in the reference's style, on the person's own title.
  await expect(page.getByRole('img', { name: /Ride before sunrise.*Reference/ }).first()).toBeVisible({ timeout: 60_000 });
  await expect(chip.getByRole('button', { name: 'Show what I detected' })).toBeVisible();
  // Remove it: the chip goes and the normal looks come back.
  await chip.getByRole('button', { name: 'Remove the reference' }).click();
  await expect(chip).toHaveCount(0);
  await expect(page.getByRole('img', { name: /Ride before sunrise.*Reference/ })).toHaveCount(0, { timeout: 60_000 });
});
