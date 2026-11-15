// Round O part 1: a slide count you can trust. The "Keep every sentence of my text" switch (Format step, on by default): on, the picked N is the target and the writer may use up to N + 2;
// off, exactly N and whole sentences may be left out (never the hook or the closing line). A plain line when the deck has more slides than picked; report.json and the job line say the real
// numbers; the line and the "not on any slide" notice are neutral, a real phone warning stays red. A FAKE writer that counts every call: ZERO real model calls.
import { expect, test, type Page, type Route } from '@playwright/test';
import { toStep } from './ui';

test.setTimeout(4 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });

const TEXT = "Most creators don't have a design problem. They have a time problem. You write a good post. Then the evening goes to dragging text boxes. The idea took ten minutes. The slides took the rest of the night. Paste your text and pick a look. Nothing reruns when you edit. Try it on your next post.";
const S = (layout: string, fields: Record<string, unknown>) => ({ layout, fields, accents: [] });
// 7 slides: every sentence on a slide
const SEVEN = { title: 'Design problem', slides: [
  S('statement', { headline: "Most creators don't have a design problem.", caption: 'They have a time problem.' }),
  S('split-text', { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging text boxes.' }),
  S('prose', { p1: 'The idea took ten minutes.' }),
  S('split-text', { headline: 'The slides took the rest', paragraph: 'The slides took the rest of the night.' }),
  S('statement', { headline: 'Paste your text and pick a look.' }),
  S('prose', { p1: 'Nothing reruns when you edit.' }),
  S('cta-button', { headline: 'Try it on your next post.', button: 'Follow for more' }),
] };
// 5 slides that keep every sentence
const FIVE_ALL = { title: 'Design problem', slides: [
  S('statement', { headline: "Most creators don't have a design problem.", caption: 'They have a time problem.' }),
  S('split-text', { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging text boxes.' }),
  S('prose', { p1: 'The idea took ten minutes. The slides took the rest of the night.' }),
  S('split-text', { headline: 'Paste your text and pick a look.', paragraph: 'Nothing reruns when you edit.' }),
  S('cta-button', { headline: 'Try it on your next post.', button: 'Follow for more' }),
] };
// 5 slides that leave out two sentences from the middle ("The idea took ten minutes." and "Nothing reruns when you edit.")
const FIVE_DROP = { title: 'Design problem', slides: [
  S('statement', { headline: "Most creators don't have a design problem.", caption: 'They have a time problem.' }),
  S('split-text', { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging text boxes.' }),
  S('prose', { p1: 'The slides took the rest of the night.' }),
  S('statement', { headline: 'Paste your text and pick a look.' }),
  S('cta-button', { headline: 'Try it on your next post.', button: 'Follow for more' }),
] };

async function fake(page: Page, plan: unknown) {
  const f = { calls: 0, prompts: [] as string[] };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const write = (r: Route) => { f.calls++; f.prompts.push(String(JSON.parse(r.request().postData() ?? '{}').prompt ?? '')); return r.fulfill({ json: { text: JSON.stringify(plan), ms: 5 } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}
const doc = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc);
const report = (page: Page) => page.evaluate(async () => {
  const RP: any = await import('/src/reference/report.ts');
  const d = JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc;
  return JSON.parse((await RP.buildReport({ doc: d, includeRefs: false, verdicts: {}, note: '' })).json);
});
/** Text, 5 slides picked, the switch as asked, Warm editorial collage, Make. */
async function make(page: Page, keep: boolean | null, count: number) {
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 2);
  await page.getByTestId('options').getByRole('combobox').first().selectOption(String(5));
  const sw = page.getByTestId('keep-sentences-switch');
  if (keep !== null && (await sw.isChecked()) !== keep) await sw.click();
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film img')).toHaveCount(count, { timeout: 90_000 });
  await page.waitForTimeout(1500);
}

test('O1: the prompt: on, "Write 5 slides ... up to 7"; on at 9, up to 10 (the app maximum); off, "exactly 5" with the hook and closing rule and no keep-every-sentence rule', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const pack = PR.presetPackFor('style-6', false);
    const style = D.styleFromPack(pack).style;
    const p = (slides: number, keep?: boolean) => D.buildLibraryPrompt({ text: 'A text. '.repeat(30), slides, tone: 'clear', format: 'carousel', ...(keep === undefined ? {} : { keepEverySentence: keep }) }, { pack }, style, 'a look', slides);
    return { on5: p(5), unset5: p(5, undefined), on9: p(9, true), off5: p(5, false) };
  });
  expect(r.on5).toContain("Write 5 slides; when the person's text needs more room to keep every sentence, use up to 7 slides (never more than 7)");
  expect(r.unset5, 'an old request (no switch) is on').toContain('use up to 7 slides (never more than 7)');
  expect(r.on5).toMatch(/EVERY sentence of the person's text must appear on a slide\. Never drop a sentence\./);
  expect(r.on9).toContain('use up to 10 slides (never more than 10)');
  expect(r.off5).toContain('Write exactly 5 slides.');
  expect(r.off5).toContain('Exactly 5 slides: the person asked for exactly 5 slides, never more.');
  expect(r.off5).toContain('never leave out the opening hook (the first sentence) or the closing line (the last sentence)');
  expect(r.off5).not.toMatch(/Keep every sentence:/);
  expect(r.off5).not.toMatch(/use up to \d+ slides/);
});

test('O1: on, the writer returns 7 for 5: the plain line, the report and the job line say 5 asked and 7 made; a style and a colour switch make no call', async ({ page }) => {
  const f = await fake(page, SEVEN);
  await page.goto('/images/carousel');
  await make(page, null, 7);
  expect(f.calls).toBe(1);
  expect(f.prompts[0]).toContain('use up to 7 slides (never more than 7)');
  const line = page.getByTestId('slide-count-line');
  await expect(line).toHaveText('Your text needed 7 slides instead of 5 so no sentence is lost.');
  await expect(page.getByTestId('not-on-slides')).toHaveCount(0);
  const rp = await report(page);
  expect({ slidesRequested: rp.slidesRequested, slidesMade: rp.slidesMade, keepEverySentence: rp.keepEverySentence }).toEqual({ slidesRequested: 5, slidesMade: 7, keepEverySentence: true });
  expect(rp.model?.job ?? '', 'the job line').toMatch(/5 slides asked, 7 made/);
  // the line is neutral, not the red of a phone warning
  const colours = await page.evaluate(() => {
    const probe = document.createElement('span'); probe.className = 'cr-problem'; document.body.appendChild(probe);
    const red = getComputedStyle(probe).color; probe.remove();
    return { red, line: getComputedStyle(document.querySelector('[data-testid="slide-count-line"]')!).color };
  });
  expect(colours.line).not.toBe(colours.red);
  // a style switch and a colour switch: no call, the line stays
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Cream ink/ }).first().click();
  await page.waitForTimeout(2500);
  await page.getByTestId('combo-teal-coral').click();
  await page.waitForTimeout(2500);
  await expect(page.getByTestId('slide-count-line')).toHaveText('Your text needed 7 slides instead of 5 so no sentence is lost.');
  expect(f.calls, 'the style and colour switches made no writer call').toBe(1);
});

test('O1: on, the writer returns 5 for 5: no line', async ({ page }) => {
  const f = await fake(page, FIVE_ALL);
  await page.goto('/images/carousel');
  await make(page, null, 5);
  expect(f.calls).toBe(1);
  await expect(page.getByTestId('slide-count-line')).toHaveCount(0);
  const rp = await report(page);
  expect([rp.slidesRequested, rp.slidesMade]).toEqual([5, 5]);
});

test('O1: off, the writer returns exactly 5 and leaves out two sentences: the neutral notice lists them, no slide-count line, "exactly 5" asked; a real phone warning stays red', async ({ page }) => {
  const f = await fake(page, FIVE_DROP);
  await page.goto('/images/carousel');
  await make(page, false, 5);
  expect(f.calls).toBe(1);
  expect(f.prompts[0]).toContain('Write exactly 5 slides.');
  await expect(page.getByTestId('slide-count-line')).toHaveCount(0);
  const notice = page.getByTestId('not-on-slides');
  await expect(notice).toContainText('2 of 9 sentences from your text are not on any slide.');
  await notice.locator('summary').click();
  await expect(notice.getByTestId('not-on-slides-list').locator('li')).toHaveText(['The idea took ten minutes.', 'Nothing reruns when you edit.']);
  const rp = await report(page);
  expect([rp.slidesRequested, rp.slidesMade, rp.keepEverySentence]).toEqual([5, 5, false]);
  const c = await page.evaluate(() => {
    const probe = document.createElement('span'); probe.className = 'cr-problem'; probe.setAttribute('data-testid', 'phone-warning'); probe.textContent = 'Slide 2: text under 32 px at phone size.'; document.body.appendChild(probe);
    const red = getComputedStyle(probe).color; probe.remove();
    return { red, notice: getComputedStyle(document.querySelector('[data-testid="not-on-slides"] p')!).color };
  });
  expect(c.red).toBe('rgb(198, 40, 40)');
  expect(c.notice, 'the notice is not red').not.toBe(c.red);
});

test('O1: the switch is on by default, an old saved page (no switch saved) loads on, and switching it makes no call', async ({ page }) => {
  const f = await fake(page, FIVE_ALL);
  await page.goto('/images/carousel');
  await toStep(page, 2);
  await expect(page.getByTestId('keep-sentences-switch')).toBeChecked();
  await expect(page.getByTestId('keep-sentences-help')).toHaveText('On: if your text needs more slides than you picked, I may add up to 2 so nothing is lost. Off: exactly your number of slides; some sentences may be left out and I will list them.');
  // an old saved page: options without keepEverySentence
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}');
    if (raw.project?.doc?.options) delete raw.project.doc.options.keepEverySentence;
    localStorage.setItem('creator.carousel.project.v1', JSON.stringify(raw));
  });
  await page.reload();
  await toStep(page, 2);
  await expect(page.getByTestId('keep-sentences-switch')).toBeChecked();
  await page.getByTestId('keep-sentences-switch').click();
  await expect(page.getByTestId('keep-sentences-switch')).not.toBeChecked();
  await page.waitForTimeout(800);
  expect((await doc(page)).options.keepEverySentence).toBe(false);
  await page.reload();
  await toStep(page, 2);
  await expect(page.getByTestId('keep-sentences-switch'), 'saved with the page').not.toBeChecked();
  expect(f.calls, 'the switch makes no writer call').toBe(0);
});
