// Round M part 2: the sentences of the person's text that are on no slide, in report.json (sourceNotOnSlides) and as a plain notice under the phone-size line with a closed "Show them" fold.
// Both routes: the writer route (a FAKE writer that leaves two sentences out) and the pasted route (every paragraph is a slide: no notice). Recomputed after a text edit, a style switch and
// a colour switch with 0 more writer calls.
import { expect, test, type Page, type Route } from '@playwright/test';
import { openTab, toStep } from './ui';

test.setTimeout(4 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });

const TEXT = "Most creators don't have a design problem. They have a time problem. The idea took ten minutes. The slides took the rest of the night. Paste your text and pick a look. Nothing reruns when you edit. Try it on your next post.";
// the writer keeps 5 of the 7 sentences: "Paste your text and pick a look." and "Nothing reruns when you edit." are on no slide
const PLAN = { title: 'Design problem', slides: [
  { layout: 'statement', fields: { headline: "Most creators don't have a design problem.", caption: 'They have a time problem.' }, accents: [] },
  { layout: 'split-text', fields: { headline: 'The idea took ten minutes', paragraph: 'The slides took the rest of the night.' }, accents: [] },
  { layout: 'statement', fields: { headline: 'Try it on your next post.' }, accents: [] },
] };

async function counting(page: Page) {
  const f = { calls: 0 };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const write = (r: Route) => { f.calls++; return r.fulfill({ json: { text: JSON.stringify(PLAN), ms: 5 } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}
const report = (page: Page) => page.evaluate(async () => {
  const RP: any = await import('/src/reference/report.ts');
  const doc = JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc;
  return JSON.parse((await RP.buildReport({ doc, includeRefs: false, verdicts: {}, note: '' })).json).sourceNotOnSlides;
});

test('M2: the sentence rule: a sentence is on a slide when 80% of its words are on ONE slide, in order', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const S: any = await import('/src/carousel/sourceCheck.ts');
    return {
      split: S.sentencesOf("One two three. Here's how it works:\n1. Paste your text\n2. Pick a look\nDone!"),
      all: S.sourceNotOnSlidesOf('The idea took ten minutes. The slides took the rest of the night.', ['the idea took ten minutes', 'the slides took the rest of the night']),
      // 8 of 10 words in order on one slide: on the slide; 7 of 10: not
      eight: S.sourceNotOnSlidesOf('a b c d e f g h i j.', ['a b c d e f g h']).count,
      seven: S.sourceNotOnSlidesOf('a b c d e f g h i j.', ['a b c d e f g']).count,
      // the words of one sentence spread over two slides do not count: it must be on ONE slide
      spread: S.sourceNotOnSlidesOf('a b c d e f g h i j.', ['a b c d e', 'f g h i j']).count,
      // out of order does not count
      shuffled: S.sourceNotOnSlidesOf('one two three four five.', ['five four three two one']).count,
    };
  });
  expect(r.split).toEqual(['One two three.', "Here's how it works:", 'Paste your text', 'Pick a look', 'Done!']);
  expect(r.all).toEqual({ count: 0, total: 2, percentOfSentences: 0, sentences: [], emojis: [] });
  expect([r.eight, r.seven, r.spread, r.shuffled]).toEqual([0, 1, 1, 1]);
});

test('M2: writer route: "2 of 7 sentences from your text are not on any slide." with a closed fold, in report.json, and recomputed after a text edit, a style switch and a colour switch with 0 more calls', async ({ page }) => {
  const f = await counting(page);
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film img')).toHaveCount(3, { timeout: 90_000 });
  await page.waitForTimeout(1500);
  const made = f.calls;
  const notice = page.getByTestId('not-on-slides');
  await expect(notice).toContainText('2 of 7 sentences from your text are not on any slide.');
  await expect(notice.locator('details')).not.toHaveAttribute('open', '');
  await expect(notice.getByTestId('not-on-slides-list')).toBeHidden();
  await notice.locator('summary').click();
  await expect(notice.getByTestId('not-on-slides-list').locator('li')).toHaveText(['Paste your text and pick a look.', 'Nothing reruns when you edit.']);
  await notice.scrollIntoViewIfNeeded();
  (await import('node:fs')).mkdirSync('out/round-m', { recursive: true });
  await page.locator('p[role=status]').filter({ hasText: /Saved in this browser/ }).first().locator('xpath=..').screenshot({ path: 'out/round-m/not-on-slides-notice.png' });
  expect(await report(page)).toEqual({ count: 2, percentOfSentences: 28.6, sentences: ['Paste your text and pick a look.', 'Nothing reruns when you edit.'], emojis: [] });
  // a text edit puts one of them on a slide: 1 left
  await openTab(page, 'Text', 1);
  const fields = page.getByTestId('text-tab-0').locator('input, textarea');
  const labels = await page.getByTestId('text-tab-0').locator('label').allTextContents();
  const capIdx = labels.findIndex((l) => /^\s*Line below/i.test(l));
  expect(capIdx, 'the cover has a caption field: ' + labels.join(', ')).toBeGreaterThanOrEqual(0);
  const cap = fields.nth(capIdx);
  await cap.fill('They have a time problem. Paste your text and pick a look.');
  await cap.blur();
  await expect(page.getByTestId('text-tab-0').getByRole('alert')).toHaveCount(0);
  await expect.poll(async () => JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc?.designed?.library?.plan?.specs?.[0]?.fields)), { timeout: 30_000 }).toContain('Paste your text');
  await expect(notice).toContainText('1 of 7 sentences from your text is not on any slide.', { timeout: 30_000 });
  // a style switch and a colour switch keep the count
  await page.getByTestId('edit-view').getByRole('button', { name: /^Done/ }).first().click().catch(() => {});
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Cream ink/ }).first().click();
  await page.waitForTimeout(2500);
  await expect(notice).toContainText('1 of 7 sentences');
  await page.getByTestId('combo-teal-coral').click();
  await page.waitForTimeout(2500);
  await expect(notice).toContainText('1 of 7 sentences');
  expect((await report(page)).sentences).toEqual(['Nothing reruns when you edit.']);
  expect(f.calls, 'the text edit, the style switch and the colour switch made no writer call').toBe(made);
});

test('M2: pasted route (every paragraph a slide): every sentence is on a slide, no notice, and report.json says 0', async ({ page }) => {
  const f = await counting(page);
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(TEXT.replace(/\. /g, '.\n\n'));
  await page.getByTestId('text-mode').getByRole('radio', { name: /Use my paragraphs as slides/ }).check();
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film img').first()).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(2500);
  await expect(page.getByTestId('not-on-slides')).toHaveCount(0);
  expect(await report(page)).toEqual({ count: 0, percentOfSentences: 0, sentences: [], emojis: [] });
  expect(f.calls).toBe(0);
});
