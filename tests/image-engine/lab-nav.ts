// Shared by the Results screen specs: go to /lab through the left menu, then to one part of the screen through its own list.
import { expect, type Page } from '@playwright/test';

export type ResultsView = 'Overview' | 'Styles' | 'Style from references' | 'Slides' | 'Photo tools' | 'Thumbnails (v2)' | 'Cutouts' | 'Elements' | 'Coverage' | 'Checks and tests';

export async function openResults(page: Page, view: ResultsView = 'Overview', o: { details?: boolean } = {}) {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Results' }).click();
  await expect(page).toHaveURL(/\/lab/);
  await expect(page.getByRole('heading', { level: 1, name: 'Results' })).toBeVisible();
  await goView(page, view, o);
}

/** Opens a part of the screen from the list on the left (or the strip on a phone). `details` also opens its "technical details" fold. */
export async function goView(page: Page, view: ResultsView, o: { details?: boolean } = {}) {
  await page.getByRole('navigation', { name: 'Sections of this page' }).getByRole('link', { name: new RegExp(`^${view.replace(/[()]/g, '\\$&')}`) }).click();
  await expect(page.locator('.res-pane:not([hidden]) h2').first()).toHaveText(view);
  if (o.details) {
    const d = page.locator('.res-pane:not([hidden]) details.res-older').first();
    if (!(await d.evaluate((el: HTMLDetailsElement) => el.open))) await d.locator('summary').first().click();
  }
}

/** The two lists on the Slides part of the screen. */
export const styleList = (page: Page) => page.locator('.res-pane:not([hidden]) select[aria-label="Style"]');
export const scriptList = (page: Page) => page.locator('.res-pane:not([hidden]) select[aria-label="Script"]');
