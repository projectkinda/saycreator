// Round Q part 3: the lines under the deck never contradict each other. The slide-count line says "so no sentence is lost" only when no sentence of the text is missing; when some are, it says
// "but N sentences still did not fit; they are listed below." and the notice lists them; with the switch off it says nothing about sentences (and there is no line for exactly N). Order:
// the phone line, the slide-count line, the sentences notice, the pictures line. A FAKE writer that counts every call: ZERO real model calls.
import { expect, test, type Page, type Route } from '@playwright/test';
import { toStep } from './ui';

test.setTimeout(4 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });
const TEXT = "Most creators don't have a design problem. They have a time problem. You write a good post. Then the evening goes to dragging text boxes. The idea took ten minutes. The slides took the rest of the night. Paste your text and pick a look. Nothing reruns when you edit. Try it on your next post.";
const S = (layout: string, fields: Record<string, unknown>) => ({ layout, fields, accents: [] });
const SEVEN_ALL = [
  S('statement', { headline: "Most creators don't have a design problem.", caption: 'They have a time problem.' }),
  S('split-text', { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging text boxes.' }),
  S('prose', { p1: 'The idea took ten minutes.' }),
  S('split-text', { headline: 'The slides took the rest', paragraph: 'The slides took the rest of the night.' }),
  S('statement', { headline: 'Paste your text and pick a look.' }),
  S('prose', { p1: 'Nothing reruns when you edit.' }),
  S('cta-button', { headline: 'Try it on your next post.', button: 'Follow for more' }),
];
// 7 slides that still leave out two sentences ("The idea took ten minutes." and "Nothing reruns when you edit.")
const SEVEN_DROP = [
  S('statement', { headline: "Most creators don't have a design problem.", caption: 'They have a time problem.' }),
  S('split-text', { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging text boxes.' }),
  S('prose', { p1: 'The slides took the rest of the night.' }),
  S('split-text', { headline: 'Paste your text', paragraph: 'Paste your text and pick a look.' }),
  S('statement', { headline: 'Pick a look.' }),
  S('prose', { p1: 'Paste your text and pick a look.' }),
  S('cta-button', { headline: 'Try it on your next post.', button: 'Follow for more' }),
];
const FIVE_DROP = [
  S('statement', { headline: "Most creators don't have a design problem.", caption: 'They have a time problem.' }),
  S('split-text', { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging text boxes.' }),
  S('prose', { p1: 'The slides took the rest of the night.' }),
  S('statement', { headline: 'Paste your text and pick a look.' }),
  S('cta-button', { headline: 'Try it on your next post.', button: 'Follow for more' }),
];

async function run(page: Page, slides: unknown[], keep: boolean) {
  const f = { calls: 0 };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const write = (r: Route) => { f.calls++; return r.fulfill({ json: { text: JSON.stringify({ title: 'Design problem', slides }), ms: 5 } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 2);
  await page.getByTestId('options').getByRole('combobox').first().selectOption('5');
  const sw = page.getByTestId('keep-sentences-switch');
  if ((await sw.isChecked()) !== keep) await sw.click();
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film img')).toHaveCount(slides.length, { timeout: 90_000 });
  await page.waitForTimeout(1500);
  return f;
}
/** The test ids of the lines under the deck, in page order. */
const order = (page: Page) => page.evaluate(() => {
  const phone = [...document.querySelectorAll('p[role=status]')].find((p) => /phone-size check/.test(p.textContent ?? ''));
  const els = [['phone-line', phone], ...['slide-count-line', 'not-on-slides', 'pictures-unused'].map((id) => [id, document.querySelector(`[data-testid="${id}"]`)])].filter(([, e]) => e) as [string, Element][];
  return els.sort((a, b) => (a[1].compareDocumentPosition(b[1]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).map(([id]) => id);
});

test('Q3: 7 for 5 and every sentence on a slide: "so no sentence is lost", no notice', async ({ page }) => {
  const f = await run(page, SEVEN_ALL, true);
  await expect(page.getByTestId('slide-count-line')).toHaveText('Your text needed 7 slides instead of 5 so no sentence is lost.');
  await expect(page.getByTestId('not-on-slides')).toHaveCount(0);
  expect(f.calls).toBe(1);
});

test('Q3: 7 for 5 but two sentences left out: "but 2 sentences still did not fit; they are listed below." and the notice lists them, in that order', async ({ page }) => {
  const f = await run(page, SEVEN_DROP, true);
  await expect(page.getByTestId('slide-count-line')).toHaveText('Your text needed 7 slides instead of 5, but 2 sentences still did not fit; they are listed below.');
  const notice = page.getByTestId('not-on-slides');
  await expect(notice).toContainText('2 of 9 sentences from your text are not on any slide.');
  await notice.locator('summary').click();
  await expect(notice.getByTestId('not-on-slides-list').locator('li')).toHaveText(['The idea took ten minutes.', 'Nothing reruns when you edit.']);
  const o = await order(page);
  expect(o).toEqual(['phone-line', 'slide-count-line', 'not-on-slides']);
  // nothing says "no sentence is lost" while sentences are missing
  expect(await page.locator('body').innerText()).not.toMatch(/no sentence is lost/);
  expect(f.calls).toBe(1);
});

test('Q3: off, exactly 5 with two sentences left out: no slide-count line, the notice lists them', async ({ page }) => {
  const f = await run(page, FIVE_DROP, false);
  await expect(page.getByTestId('slide-count-line')).toHaveCount(0);
  await expect(page.getByTestId('not-on-slides')).toContainText('2 of 9 sentences from your text are not on any slide.');
  expect(await page.locator('body').innerText()).not.toMatch(/no sentence is lost/);
  expect(f.calls).toBe(1);
});
