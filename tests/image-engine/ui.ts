// Helpers for the stepped carousel page (UI Round 1): Step 1 Your content, Step 2 Format, Step 3 Style, Step 4 Your slides, and the Edit slides view opened from step 4.
// Every step stays mounted but hidden, so a test must go to the step that holds the control it uses.
import { expect, type Page } from '@playwright/test';

/** Jump to a step with the progress bar at the top of the controls. */
export const toStep = async (page: Page, n: 1 | 2 | 3 | 4) => {
  const b = page.locator('.cr-wiz-steps button').nth(n - 1);
  await b.click();
  await expect(b).toHaveAttribute('aria-current', 'step');
};

/** Open the Edit slides view on slide `n` (1-based). It needs slides, so call it after the deck is drawn. */
export const openEdit = async (page: Page, n = 1) => {
  const view = page.getByTestId('edit-view');
  if (!(await view.isVisible())) await page.getByTestId('edit-slides').click();
  await expect(view).toBeVisible();
  const shown = page.locator('.cr-edit-bar h2');
  if (!(await shown.textContent())?.startsWith(`Edit slide ${n} `)) await page.getByRole('button', { name: `Show slide ${n}`, exact: true }).click();
  await expect(shown).toHaveText(new RegExp(`^Edit slide ${n} of`));
};

/** Leave the Edit slides view (Done). */
export const doneEditing = async (page: Page) => {
  await page.getByRole('button', { name: 'Done', exact: true }).first().click();
  await expect(page.getByTestId('edit-view')).toHaveCount(0);
};

/** Every slide of the deck has a thumbnail in the strip (the page goes to step 4 by itself while it draws). */
export const deckDrawn = async (page: Page, n = 7) => {
  await expect(page.locator('.cr-film li')).toHaveCount(n, { timeout: 60_000 });
  await expect(page.locator('.cr-film img')).toHaveCount(n, { timeout: 60_000 });
};

/** Open the Edit slides view and the Fine-tune fold (the Detected-style toggles live there). */
export const openFineTune = async (page: Page, n = 1) => {
  await openEdit(page, n);
  const fold = page.locator('details.cr-fine');
  if (!(await fold.evaluate((el) => (el as HTMLDetailsElement).open))) await fold.locator('summary').click();
  await expect(page.getByTestId('detected-style')).toBeVisible();
};
