// Step 18: the layout of "Make a carousel": a preview and four groups (one open at a time), a filmstrip, and no sideways scroll on a phone.
import { expect, test } from '@playwright/test';

// These tests run with the default: one group open at a time (the other specs run with every group open).
test.use({ storageState: { cookies: [], origins: [] } });

test('four groups, one open at a time; the preview shows an empty state, then the selected slide and a filmstrip', async ({ page }) => {
  await page.goto('/images/carousel');
  const groups = ['Content', 'Style', 'Reference', 'Edit'];
  for (const g of groups) await expect(page.getByRole('heading', { name: g, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Content', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Your text, idea or article')).toBeVisible();
  await expect(page.getByText('Match a reference', { exact: true })).toBeHidden();
  await expect(page.getByText('Your slides appear here')).toBeVisible();
  // Opening another group closes the first.
  await page.getByRole('button', { name: 'Reference', exact: true }).click();
  await expect(page.getByText('Match a reference', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Your text, idea or article')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Content', exact: true })).toHaveAttribute('aria-expanded', 'false');
  // "Open all groups" shows everything, and is remembered.
  await page.getByRole('button', { name: 'Open all groups' }).click();
  await expect(page.getByLabel('Your text, idea or article')).toBeVisible();
  await expect(page.getByText('Match a reference', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'One group at a time' })).toBeVisible();
  await page.getByRole('button', { name: 'One group at a time' }).click();
  // A script gives slides: the stage and a filmstrip with one button per slide.
  await page.getByText('Advanced: write the script yourself').click();
  await page.getByRole('button', { name: 'Try an example script' }).click();
  await expect(page.getByRole('list', { name: 'Filmstrip' }).getByRole('button')).toHaveCount(7, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Show slide 3' }).click();
  await expect(page.getByRole('button', { name: 'Show slide 3' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('3 / 7')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open the selected slide full size' })).toBeEnabled({ timeout: 30_000 });
  // Undo, redo and the primary action stay in the preview column.
  const preview = page.getByRole('complementary', { name: 'Preview' });
  await expect(preview.getByRole('button', { name: /^Undo/ })).toBeVisible();
  await expect(preview.getByRole('button', { name: /^Redo/ })).toBeVisible();
  await expect(preview.getByRole('button', { name: /Download all/ })).toBeVisible();
});

test('on a phone: the preview first, the groups under it, no sideways scroll, touch targets of 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Content', exact: true })).toBeVisible();
  const r = await page.evaluate(() => {
    const top = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().top;
    const btn = document.querySelector('.cr-group-btn')!.getBoundingClientRect();
    return { sideways: document.documentElement.scrollWidth - window.innerWidth, previewAbove: top('.cr-preview') < top('.cr-controls'), groupH: Math.round(btn.height) };
  });
  expect(r.sideways).toBeLessThanOrEqual(0);
  expect(r.previewAbove).toBe(true);
  expect(r.groupH).toBeGreaterThanOrEqual(44);
});
