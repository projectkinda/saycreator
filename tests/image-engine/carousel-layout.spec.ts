// The layout of "Make a carousel": a preview, four steps (one shown at a time), a filmstrip, and no sideways scroll on a phone.
// (Updated for the stepped page of UI Round 1: this spec used to check four groups with one open at a time and an "Open all groups" button. The checks are the same ones in the new words:
// one part of the controls shown at a time, the extra tools hidden until asked for and remembered, the empty preview, the filmstrip, no sideways scroll, touch targets of 44 px.)
import { expect, test } from '@playwright/test';
import { toStep } from './ui';

test.use({ storageState: { cookies: [], origins: [] } });

test('four steps, one shown at a time; the preview shows an empty state, then the selected slide and a filmstrip', async ({ page }) => {
  await page.goto('/images/carousel');
  const names = ['Content', 'Format', 'Style', 'Slides'];
  await expect(page.locator('.cr-wiz-steps .cr-wiz-name')).toHaveText(names);
  await expect(page.locator('.cr-wiz-steps button').first()).toHaveAttribute('aria-current', 'step');
  await expect(page.getByLabel('Your text or topic')).toBeVisible();
  await expect(page.getByText('Match a reference', { exact: true })).toBeHidden();
  await expect(page.getByText('Your slides appear here')).toBeVisible();
  // Opening another step closes the first.
  await toStep(page, 3);
  await expect(page.getByLabel('Your text or topic')).toBeHidden();
  await expect(page.getByRole('list', { name: 'Styles' })).toBeVisible();
  await expect(page.locator('.cr-wiz-steps button').first()).not.toHaveAttribute('aria-current', 'step');
  // The reference and developer tools are behind one toggle, and the choice is remembered.
  await page.getByRole('checkbox', { name: 'Developer tools' }).check();
  await expect(page.getByText('Match a reference', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Developer tools' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Developer tools' }).uncheck();
  // A script gives slides: the stage and a filmstrip with one button per slide.
  await toStep(page, 1);
  await page.getByRole('button', { name: 'I already have a script' }).click();
  await page.getByRole('button', { name: 'Try an example script' }).click();
  await expect(page.getByRole('list', { name: 'Filmstrip' }).getByRole('button')).toHaveCount(7, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Show slide 3' }).click();
  await expect(page.getByRole('button', { name: 'Show slide 3' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('3 / 7')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open the selected slide full size' })).toBeEnabled({ timeout: 30_000 });
  // Undo, redo and the way to edit stay in the preview column; Download all is in step 4.
  const preview = page.getByRole('complementary', { name: 'Preview' });
  await expect(preview.getByRole('button', { name: /^Undo/ })).toBeVisible();
  await expect(preview.getByRole('button', { name: /^Redo/ })).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Edit slides' })).toBeVisible();
  await toStep(page, 4);
  await expect(page.getByRole('button', { name: /Download all/ })).toBeVisible();
});

test('on a phone: the steps first, no empty preview box above them, no sideways scroll, touch targets of 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/images/carousel');
  await expect(page.getByRole('navigation', { name: 'Steps' })).toBeVisible();
  const r = await page.evaluate(() => {
    const btn = document.querySelector('.cr-wiz-step')!.getBoundingClientRect();
    const steps = document.querySelector('.cr-wiz')!.getBoundingClientRect();
    return { sideways: document.documentElement.scrollWidth - window.innerWidth, stepsTop: steps.top, stepH: Math.round(btn.height) };
  });
  expect(r.sideways).toBeLessThanOrEqual(0);
  expect(r.stepsTop, 'the steps come first, not an empty preview box').toBeLessThan(450);
  expect(r.stepH).toBeGreaterThanOrEqual(44);
  await expect(page.getByText('Your slides appear here')).toBeHidden();
  // with slides the preview comes first on a phone, the steps under it
  await page.getByRole('button', { name: 'I already have a script' }).click();
  await page.getByRole('button', { name: 'Try an example script' }).click();
  await expect(page.locator('.cr-film li')).toHaveCount(7, { timeout: 30_000 });
  const order = await page.evaluate(() => ({ previewAbove: document.querySelector('.cr-preview')!.getBoundingClientRect().top < document.querySelector('.cr-controls')!.getBoundingClientRect().top, sideways: document.documentElement.scrollWidth - window.innerWidth }));
  expect(order.previewAbove).toBe(true);
  expect(order.sideways).toBeLessThanOrEqual(0);
});
