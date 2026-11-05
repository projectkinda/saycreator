// One door for a new style: the "New style" card in the style list opens a box inline under the list (a reference tab and a description tab). No second "add a reference" link.
// Reading a reference saves a Mine style, selects it, and closes the box. Fake reader: no model calls.
import { expect, test, type Page } from '@playwright/test';
import { fakeReader, labelsAnswer, makeReference, readAnswer, refineAnswer } from './reference-helpers';

test.setTimeout(180_000);
test.use({ viewport: { width: 1300, height: 1000 } });

const usual = (kind: string, n: number, prompt = '') => (kind === 'read' || kind === 'retry' ? (prompt.includes('describe the scene') || /r\d+T\d+/.test(prompt) ? labelsAnswer(prompt, { seen: ['cover'] }) : readAnswer({ seen: ['cover'] })) : n === 0 ? refineAnswer({ patches: [], score: 70, stop: true }) : refineAnswer({ patches: [], stop: true }));
const card = (page: Page) => page.getByRole('button', { name: /^New style/ });
const styleList = (page: Page) => page.getByRole('list', { name: 'Styles' }).first();
/** File inputs for references that are on the page outside the Advanced fold. */
const outsideAdvanced = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('input[type=file]')].filter((i) => /reference/i.test(i.getAttribute('aria-label') ?? '') && !i.closest('details.cr-advanced')).length);

test('there is one door: no "Add a reference" link, one New style card, one reference control once it is opened', async ({ page }) => {
  await fakeReader(page, usual);
  await page.goto('/images/carousel');
  await expect(styleList(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Not what you want? Add a reference.' })).toHaveCount(0);
  await expect(page.getByText('Not what you want?')).toHaveCount(0);
  await expect(card(page)).toHaveCount(1);
  expect(await outsideAdvanced(page), 'closed: no reference control outside Advanced').toBe(0);
  await card(page).click();
  await expect(page.getByTestId('new-style')).toBeVisible();
  expect(await outsideAdvanced(page), 'open: exactly one').toBe(1);
  await expect(page.getByRole('button', { name: 'Add a reference' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Read it' })).toHaveCount(1);
});

test('pressing New style opens the box inline under the style list, with a reference tab and a description tab', async ({ page }) => {
  await fakeReader(page, usual);
  await page.goto('/images/carousel');
  const url = page.url();
  await expect(styleList(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('new-style')).toHaveCount(0);
  await card(page).click();
  const box = page.getByTestId('new-style');
  await expect(box).toBeVisible();
  expect(page.url(), 'no navigation').toBe(url);
  const y = await page.evaluate(() => {
    const top = (el: Element | null) => (el ? el.getBoundingClientRect().top + window.scrollY : -1);
    const list = document.querySelector('ul[aria-label="Styles"]')!;
    return { listBottom: list.getBoundingClientRect().bottom + window.scrollY, box: top(document.querySelector('[data-testid="new-style"]')), gen: top([...document.querySelectorAll('h3')].find((h) => h.textContent?.trim() === 'Generate') ?? null) };
  });
  expect(y.box).toBeGreaterThanOrEqual(y.listBottom - 2);
  expect(y.box).toBeLessThan(y.gen);
  await expect(box.getByRole('button', { name: 'From a reference' })).toHaveAttribute('aria-pressed', 'true');
  await box.getByRole('button', { name: 'From a description' }).click();
  await expect(box.getByLabel('Describe the look')).toBeVisible();
  await expect(box.getByRole('button', { name: 'Make the style' })).toBeDisabled();
  await box.getByRole('button', { name: 'From a reference' }).click();
  await expect(box.getByLabel('Choose reference images or a PDF')).toHaveCount(1);
  await box.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('new-style')).toHaveCount(0);
});

test('reading a reference adds a Mine style to the list, selects it, and closes the box', async ({ page }) => {
  await fakeReader(page, usual);
  await page.goto('/images/carousel');
  await expect(styleList(page).getByRole('listitem').first()).toBeVisible({ timeout: 30_000 });
  await expect(styleList(page).getByRole('button').filter({ hasText: 'Mine' })).toHaveCount(0);
  await card(page).click();
  await page.getByLabel('Choose reference images or a PDF').setInputFiles(await makeReference(page, { name: 'one.jpg', kind: 'slide' }));
  const read = page.getByRole('button', { name: 'Read it' });
  await expect(read).toBeEnabled({ timeout: 60_000 });
  await read.click();
  await expect(page.getByTestId('quick-saved')).toContainText('as a Mine style and selected it', { timeout: 120_000 });
  await expect(page.getByTestId('new-style'), 'the box closes').toHaveCount(0);
  const saved = (await page.getByTestId('quick-saved').innerText()).match(/Saved “(.*)” as a Mine/)![1];
  const mine = styleList(page).getByRole('button').filter({ hasText: saved }).filter({ hasText: 'Mine' }).first();
  await expect(mine).toBeVisible();
  await expect(mine).toHaveAttribute('aria-pressed', 'true');
});
