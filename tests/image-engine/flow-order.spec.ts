// The carousel page flow: 1 Your text, 2 Pick a style (the reference box is behind a link under the list), 3 Generate. Fake reader and fake writer: no model calls.
import { expect, test, type Page, type Route } from '@playwright/test';
import { deckDrawn, toStep } from './ui';
import { fakeReader, labelsAnswer, makeReference, readAnswer, refineAnswer, wholeSlideAnswer } from './reference-helpers';

test.setTimeout(180_000);
test.use({ viewport: { width: 1300, height: 1000 } });

const usual = (kind: string, n: number, prompt = '') => prompt.includes('[whole-slide:new]') ? wholeSlideAnswer() : (kind === 'read' || kind === 'retry' ? (prompt.includes('describe the scene') || /rd+Td+/.test(prompt) ? labelsAnswer(prompt, { seen: ['cover'] }) : readAnswer({ seen: ['cover'] })) : n === 0 ? refineAnswer({ patches: [], score: 70, stop: true }) : refineAnswer({ patches: [], stop: true }));
const TEXT = 'Small habits make a profile easier to trust. Say who you help in one clear headline. Pin one post that proves it. Keep your contact line up to date. Then ask people to follow for weekly posts.';
const LINK = /^New style/;

/** Answers the writer: the status routes say a writer is there, the write route returns the example script. */
async function fakeWriter(page: Page, script: string): Promise<{ prompt: string }[]> {
  const calls: { prompt: string }[] = [];
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const write = async (r: Route) => {
    calls.push({ prompt: (r.request().postDataJSON() as { prompt: string }).prompt });
    await r.fulfill({ json: { text: script, ms: 5 } }).catch(() => undefined);
  };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return calls;
}
const scriptJson = (page: Page) =>
  page.evaluate(async () => {
    const S = await import('/src/carousel/script.ts');
    return JSON.stringify(S.EXAMPLE);
  });
const storedStyle = (page: Page) =>
  page.evaluate(() => {
    try {
      return (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as { project?: { doc?: { style?: string } } }).project?.doc?.style ?? '';
    } catch {
      return '';
    }
  });
const styleList = (page: Page) => page.getByRole('list', { name: 'Styles' }).first();
const make = (page: Page) => page.getByRole('button', { name: 'Make carousel', exact: true });

test('the steps are in order, and the reference box is closed until New style is pressed', async ({ page }) => {
  await fakeReader(page, usual);
  await page.goto('/images/carousel');
  const names = page.locator('.cr-wiz-steps .cr-wiz-name');
  await expect(names).toHaveText(['Content', 'Format', 'Style', 'Slides'], { timeout: 30_000 });
  await expect(page.getByLabel('Your text or topic')).toBeVisible();
  await toStep(page, 3);
  // in step 3 the style list comes first, the New style card is in it, and the make button is last
  const order = await page.evaluate(() => {
    const pos = (el: Element | null) => (el ? el.getBoundingClientRect().top + window.scrollY : -1);
    const link = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('New style') && x.getBoundingClientRect().width > 0) ?? null;
    const list = document.querySelector('ul[aria-label="Styles"]');
    const btn = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Make carousel') ?? null;
    return { list: pos(list), link: pos(link), btn: pos(btn) };
  });
  expect(order.list).toBeGreaterThan(0);
  expect(order.link, 'New style is in the style list').toBeGreaterThanOrEqual(order.list);
  expect(order.link).toBeLessThan(order.btn);
  // Closed by default: no drop box, no Read it.
  await expect(page.getByLabel('Choose reference images or a PDF')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Read it' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reset page' })).toBeVisible();
  await page.getByRole('button', { name: LINK }).click();
  await expect(page.getByLabel('Choose reference images or a PDF')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Read it' })).toBeDisabled();
  await page.getByRole('button', { name: LINK }).click();
  await expect(page.getByLabel('Choose reference images or a PDF')).toHaveCount(0);
});

test('reading a reference adds a Mine style to the same list and selects it', async ({ page }) => {
  await fakeReader(page, usual);
  await page.goto('/images/carousel');
  await toStep(page, 3);
  await expect(styleList(page).getByRole('listitem').first()).toBeVisible({ timeout: 30_000 });
  await expect(styleList(page).getByRole('button').filter({ hasText: 'Mine' })).toHaveCount(0);
  const before = await styleList(page).getByRole('listitem').count();
  expect(before).toBeGreaterThan(3);
  await page.getByRole('button', { name: LINK }).click();
  await page.getByLabel('Choose reference images or a PDF').setInputFiles(await makeReference(page, { name: 'one.jpg', kind: 'slide' }));
  const read = page.getByRole('button', { name: 'Read it' });
  await expect(read).toBeEnabled({ timeout: 60_000 });
  await read.click();
  await expect(page.getByTestId('quick-saved')).toContainText('as a Mine style and selected it', { timeout: 120_000 });
  // The list grows: the saved Mine style is in it (the in-memory "Reference" entry of the reader is listed too).
  await expect.poll(() => styleList(page).getByRole('listitem').count()).toBeGreaterThan(before);
  const saved = (await page.getByTestId('quick-saved').innerText()).match(/Saved “(.*)” as a Mine/)![1];
  const mine = styleList(page).getByRole('button').filter({ hasText: saved }).filter({ hasText: 'Mine' }).first();
  await expect(mine).toBeVisible();
  await expect(mine).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => storedStyle(page), { timeout: 30_000 }).toMatch(/^mine-/);
});

test('Generate needs text and a style, and uses the selected style', async ({ page }) => {
  // these two test the template flow (a script from the writer fills the style's templates): the preset now goes to the layout library unless this flag is set
  await page.addInitScript(() => localStorage.setItem('creator.templateRoute', '1'));
  await fakeReader(page, usual);
  await page.goto('/images/carousel');
  const calls = await fakeWriter(page, await scriptJson(page));
  await page.reload();
  await toStep(page, 3);
  await expect(make(page)).toBeDisabled();
  await toStep(page, 1);
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await expect(make(page)).toBeEnabled({ timeout: 30_000 });
  // Pick a built-in style that is not the default one.
  const pick = await page.evaluate(async () => {
    const C = await import('/src/carousel/render.ts');
    const s = C.carouselStyles().filter((x) => !x.spec.name.startsWith('mine-') && x.spec.name !== 'editorial-collage')[0];
    return { name: s.spec.name, title: s.spec.title };
  });
  const card = styleList(page).getByRole('button').filter({ hasText: pick.title }).first();
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await make(page).click();
  await deckDrawn(page, 7);
  expect(calls.length).toBe(1);
  await expect.poll(() => storedStyle(page), { timeout: 30_000 }).toBe(pick.name);
  await toStep(page, 3);
  await expect(styleList(page).getByRole('button').filter({ hasText: pick.title }).first()).toHaveAttribute('aria-pressed', 'true');
});

test('Reset page still clears the text, the slides and the style', async ({ page }) => {
  // these two test the template flow (a script from the writer fills the style's templates): the preset now goes to the layout library unless this flag is set
  await page.addInitScript(() => localStorage.setItem('creator.templateRoute', '1'));
  await fakeReader(page, usual);
  await page.goto('/images/carousel');
  const calls = await fakeWriter(page, await scriptJson(page));
  await page.reload();
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await make(page).click();
  await deckDrawn(page, 7);
  expect(calls.length).toBe(1);
  await toStep(page, 3);
  await page.getByRole('button', { name: LINK }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Reset page' }).click();
  await expect(page.locator('.cr-film li')).toHaveCount(0);
  await expect(page.getByLabel('Your text or topic')).toHaveValue('');
  await expect(page.getByLabel('Choose reference images or a PDF'), 'the reference box is closed again').toHaveCount(0);
  await expect.poll(() => storedStyle(page), { timeout: 30_000 }).toBe('editorial-collage');
  await toStep(page, 3);
  await expect(make(page)).toBeDisabled();
});
