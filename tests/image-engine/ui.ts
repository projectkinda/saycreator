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

/** The style cards draw when they come into view: scroll through the list, then wait until none says Drawing. */
export const stylesDrawn = async (page: Page) => {
  const list = page.getByRole('list', { name: 'Styles' });
  await list.scrollIntoViewIfNeeded();
  for (let y = 0; y < 10; y++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(250); }
  await expect(list.getByText('Drawing…')).toHaveCount(0, { timeout: 60_000 });
  await list.scrollIntoViewIfNeeded();
};

/** Open a tab of the Edit slides view: Layout | Text | Pictures | Fine-tune (slide n, 1-based). */
export type EditTabName = 'Layout' | 'Text' | 'Pictures' | 'Fine-tune';
export const openTab = async (page: Page, tab: EditTabName, n = 1) => {
  await openEdit(page, n);
  const t = page.getByRole('tab', { name: tab, exact: true });
  if ((await t.getAttribute('aria-selected')) !== 'true') await t.click();
  await expect(t).toHaveAttribute('aria-selected', 'true');
};

/** The Edit slides view on the Fine-tune tab (the Detected-style toggles live there). */
export const openFineTune = async (page: Page, n = 1) => {
  await openTab(page, 'Fine-tune', n);
  await expect(page.getByTestId('detected-style')).toBeVisible();
};

/**
 * Round C: the developer tools (Match a reference, Recreate, packs, the Live view chip, the report, Replay) sit behind the "Developer tools" checkbox of the carousel page since UI Round 1.
 * Call this BEFORE the page loads (it sets the localStorage key `creator.devtools` on every load of the page), as pack-fixes.spec.ts always did.
 */
export const enableDevTools = async (page: Page) => {
  await page.addInitScript(() => { try { localStorage.setItem('creator.devtools', '1'); } catch { /* storage blocked */ } });
};

/**
 * Round C: enters a script the way the current Content step takes one. The old "Advanced: write the script yourself" fold is gone: a style is chosen on step 3, then on step 1 the button
 * "I already have a script" opens the box "Paste the script Claude wrote (JSON)" and "Use this script" loads it (0 model calls). `script` is the JSON text or an object.
 * With `goto: false` the page is already open. Returns once the script is loaded; drawing is left to the caller.
 */
export const useOwnScript = async (page: Page, script: unknown, style: string | RegExp = /Hot flat/, o: { goto?: boolean } = {}) => {
  if (o.goto !== false) await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: style instanceof RegExp ? style : new RegExp(style) }).first().click();
  await toStep(page, 1);
  const own = page.getByRole('button', { name: 'I already have a script' });
  if ((await own.getAttribute('aria-pressed')) !== 'true') await own.click();
  await page.getByLabel('Paste the script Claude wrote (JSON)').fill(typeof script === 'string' ? script : JSON.stringify(script));
  await page.getByRole('button', { name: 'Use this script' }).click();
};
