// Round S part 2: the messages stay truthful after a remove or a move in Edit slides. The sentences notice says when sentences are on no slide because the person removed a slide
// ("1 of 6 sentences from your text is not on any slide (you removed slide 3)."), Undo makes it go; the pictures line is recomputed; the slide-count line (what the app made) is hidden once a
// slide was removed (a move changes no count, so it stays); the order stays phone line, slide-count line, sentences notice, pictures notice. A FAKE writer: ZERO real model calls.
import { expect, test, type Page, type Route } from '@playwright/test';
import { toStep } from './ui';

test.setTimeout(6 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });
const TEXT = "Had a wonderful blast at the Hyderabad event. Thank you Punit Chawla for the crazy day man. Met some wonderful people there. And also thank you Sujit Kumar Pradhan Samruddhi Kelkar Yogesh Gurera for your wonderful insights and talks, those were very valuable and fun. Looking forward for some more of these going forward. And also don't you forget man Punit Chawla";
const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
const SLIDES5 = [
  S('photo-full-caption', { headline: 'Had a wonderful blast at the Hyderabad event.' }),
  S('lead-statement', { lead: 'Thank you Punit Chawla', headline: 'for the crazy day man.' }),
  S('title-over-photo', { headline: 'Met some wonderful people there.' }),
  S('prose', { p1: 'And also thank you Sujit Kumar Pradhan Samruddhi Kelkar Yogesh Gurera for your wonderful insights and talks, those were very valuable and fun.', pull: "And also don't you forget man Punit Chawla." }),
  S('statement-card', { headline: 'Looking forward for some more of these going forward.' }),
];
// one sentence already on no slide ("Met some wonderful people there.")
const SLIDES4 = [SLIDES5[0], SLIDES5[1], SLIDES5[3], SLIDES5[4]];

async function fake(page: Page, slides: unknown[]) {
  const f = { calls: 0 };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const write = (r: Route) => { f.calls++; return r.fulfill({ json: { text: JSON.stringify({ title: 'Hyderabad event', slides }), ms: 5 } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}
async function addPhotos(page: Page, n: number) {
  const files: { name: string; mimeType: string; buffer: Buffer }[] = [];
  for (let i = 0; i < n; i++) {
    const b64 = await page.evaluate(async (i) => {
      const c = document.createElement('canvas'); c.width = 1280; c.height = 960; const g = c.getContext('2d')!;
      const img = g.createImageData(1280, 960); let seed = 3 + i;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let k = 0; k < img.data.length; k += 4) { const y = Math.floor(k / 4 / 1280); const v = 50 + 140 * (y / 960) + (rnd() - 0.5) * 60; img.data[k] = v * (0.5 + 0.08 * i); img.data[k + 1] = v * 0.85; img.data[k + 2] = v; img.data[k + 3] = 255; }
      g.putImageData(img, 0, 0);
      return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    }, i);
    files.push({ name: `event photo ${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  }
  await page.getByLabel('Choose images for the slides').setInputFiles(files);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(n, { timeout: 60_000 });
  for (let i = 0; i < n; i++) { const chip = page.getByTestId(`image-${i}-content`); if ((await chip.getAttribute('data-content')) === 'screenshot') await chip.click(); }
}
async function make(page: Page, asked: number) {
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 2);
  await page.getByTestId('options').getByRole('combobox').first().selectOption(String(asked));
  const sw = page.getByRole('switch', { name: /Keep every sentence/ });
  if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click();
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Cream ink/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film li').nth(asked - 1)).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(2000);
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc);
const order = (page: Page) => page.evaluate(() => {
  const ids = ['slide-count-line', 'not-on-slides', 'pictures-unused'];
  const status = [...document.querySelectorAll('p[role=status]')].find((p) => /phone-size check|pass, /.test(p.textContent ?? ''))!;
  const els = [status, ...ids.map((id) => document.querySelector(`[data-testid="${id}"]`))].filter(Boolean) as Element[];
  return els.every((e, i) => i === 0 || !!(els[i - 1].compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
});
const slideOf = async (page: Page, words: string) => (await stored(page)).designed.library.plan.specs.findIndex((s: any) => JSON.stringify(s.fields).includes(words)) + 1;
async function act(page: Page, name: string, n: number) {
  if (!(await page.getByTestId('arrange-box').isVisible().catch(() => false))) await page.getByTestId('edit-slides').click();
  const slide = Number(/(\d+)/.exec(name)![1]);
  await page.getByRole('button', { name: `Show slide ${slide}`, exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByTestId('arrange-status')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.cr-film li')).toHaveCount(n);
  await page.waitForTimeout(1500);
}

test('S2 the wording of the sentences notice in every case (sentencesLine)', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const E: any = await import('/src/carousel/slideEdit.ts');
    const one = { removed: [{ slide: 4, layout: 'prose', sentences: ['a', 'b'] }], moved: [] };
    const two = { removed: [{ slide: 4, layout: 'prose', sentences: ['a'] }, { slide: 6, layout: 'statement', sentences: ['b'] }], moved: [] };
    const none = { removed: [{ slide: 2, layout: 'photo-pair', sentences: [] }], moved: [] };
    return {
      plain: E.sentencesLine(1, 6, ['x'], undefined),
      removed: E.sentencesLine(2, 9, ['a', 'b'], one),
      twoSlides: E.sentencesLine(2, 9, ['a', 'b'], two),
      some: E.sentencesLine(3, 9, ['a', 'b', 'x'], one),
      photoRemoved: E.sentencesLine(1, 9, ['x'], none),
      textBack: E.sentencesLine(1, 9, ['b'], one),
    };
  });
  expect(r.plain).toBe('1 of 6 sentences from your text is not on any slide.');
  expect(r.removed).toBe('2 of 9 sentences from your text are not on any slide (you removed slide 4).');
  expect(r.twoSlides).toBe('2 of 9 sentences from your text are not on any slide (you removed slides 4 and 6).');
  expect(r.some).toBe('3 of 9 sentences from your text are not on any slide (2 of them because you removed slide 4).');
  expect(r.photoRemoved, 'a removed photo slide took no sentence').toBe('1 of 9 sentences from your text is not on any slide.');
  expect(r.textBack, 'only the sentences still missing count').toBe('1 of 9 sentences from your text is not on any slide (you removed slide 4).');
});

test('S2 remove a text slide: the notice says the person removed it and lists the sentence; the slide-count line is hidden; order kept; Undo brings everything back', async ({ page }) => {
  const f = await fake(page, SLIDES5);
  await page.goto('/images/carousel');
  await addPhotos(page, 6);
  await make(page, 7);
  const line = 'You asked for 7 slides. Your text needed 5, so 2 photo slides were added for your pictures.';
  await expect(page.getByTestId('slide-count-line')).toHaveText(line);
  await expect(page.getByTestId('not-on-slides')).toHaveCount(0);
  const k = await slideOf(page, 'for the crazy day man.');
  await act(page, `Remove slide ${k}`, 6);
  await expect(page.getByTestId('sentences-line')).toHaveText(`1 of 6 sentences from your text is not on any slide (you removed slide ${k}).`);
  await expect(page.getByTestId('not-on-slides-list')).toContainText('Thank you Punit Chawla for the crazy day man.');
  await expect(page.getByTestId('slide-count-line')).toHaveCount(0);
  expect(await order(page)).toBe(true);
  await page.getByTestId('arrange-undo').click();
  await expect(page.locator('.cr-film li')).toHaveCount(7, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('not-on-slides')).toHaveCount(0);
  await expect(page.getByTestId('slide-count-line')).toHaveText(line);
  await expect(page.getByTestId('arrange-status')).toHaveCount(0);
  expect(f.calls).toBe(1);
});

test('S2 a sentence already missing, then a slide removed: the notice says how many went with the slide; the pictures line follows a removed photo slide; order kept', async ({ page }) => {
  const f = await fake(page, SLIDES4);
  await page.goto('/images/carousel');
  await addPhotos(page, 6);
  await make(page, 7);
  await expect(page.getByTestId('sentences-line')).toHaveText('1 of 6 sentences from your text is not on any slide.');
  const k = await slideOf(page, 'for the crazy day man.');
  await act(page, `Remove slide ${k}`, 6);
  await expect(page.getByTestId('sentences-line')).toHaveText(`2 of 6 sentences from your text are not on any slide (1 of them because you removed slide ${k}).`);
  // a photo slide removed: its pictures are named in the pictures line, no sentence changes
  const d = await stored(page);
  const p = d.designed.library.plan.specs.findIndex((s: any) => s.photoSlide) + 1;
  expect(p).toBeGreaterThan(0);
  await act(page, `Remove slide ${p}`, 5);
  await expect(page.getByTestId('sentences-line')).toHaveText(`2 of 6 sentences from your text are not on any slide (1 of them because you removed slide ${k}).`);
  await expect(page.getByTestId('pictures-unused')).toContainText('of your 6 pictures');
  await expect(page.getByTestId('slide-count-line')).toHaveCount(0);
  expect(await order(page)).toBe(true);
  expect(f.calls).toBe(1);
});

test('S2 a move: no sentence or picture changes, the slide-count line stays as it was', async ({ page }) => {
  const f = await fake(page, SLIDES5);
  await page.goto('/images/carousel');
  await addPhotos(page, 6);
  await make(page, 7);
  const line = 'You asked for 7 slides. Your text needed 5, so 2 photo slides were added for your pictures.';
  await act(page, 'Move slide 3 up', 7);
  await expect(page.getByTestId('slide-count-line')).toHaveText(line);
  await expect(page.getByTestId('not-on-slides')).toHaveCount(0);
  await expect(page.getByTestId('pictures-unused')).toHaveCount(0);
  await expect(page.getByTestId('arrange-status')).toContainText('Moved slide 3 up: it is slide 2 now.');
  expect(await order(page)).toBe(true);
  expect(f.calls).toBe(1);
});
