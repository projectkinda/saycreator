// Round AL part 4: two moves only the PERSON makes in the layout picker (pickerCanon): a numbered item goes to a layout with no number field with "1." and a no-break space in front of
// its headline; two buttons go to one button when the second button's words are in the line under the headline. Every word stays, nothing is made up. The deck passes (flavour, pictures,
// rescue) do not get these moves: their list is unchanged. A FAKE writer for the app test: ZERO model calls.
import { expect, test } from '@playwright/test';
import { deckDrawn, openTab, toStep } from './ui';

test.setTimeout(6 * 60_000);

test('AL6 the picker\'s list: a numbered item reaches the layouts without a number field with "1." in front of its headline; two buttons reach one button only when no word is lost; the deck passes\' list is unchanged', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const LM: any = await import('/src/carousel/layoutMap.ts');
    const SC: any = await import('/src/carousel/sourceCheck.ts');
    const look = { hasPhoto: false };
    const item = { layout: 'listicle-numeral', fields: { numeral: '1', title: 'Shoot at golden hour', body: 'Sunrise and the hour before sunset do more than any filter.' }, accents: [] };
    const step = { layout: 'step-numeral', fields: { step: '3', title: 'Get low or get high', body: 'Eye level is what everyone else does.' }, accents: [] };
    const pair = { layout: 'cta-pair', fields: { headline: 'Save this for your next shoot', button1: 'Save this', button2: 'Tell me which one', line2: "Tell me which one you'll try first." }, accents: [] };
    const pairLost = { layout: 'cta-pair', fields: { headline: 'Save this for your next shoot', button1: 'Save this', button2: 'Tell me', line2: 'Share it with a friend.' }, accents: [] };
    const prose = { layout: 'prose', fields: { p1: 'So when I design a post, I place the text around the face, never on top of it.', p2: 'If the face is in the way, the words move.' }, accents: [] };
    const ids = (s: any, picker: boolean) => (picker ? LM.layoutOptions(s, look) : LM.layoutOptionsFor(s, look)).map((o: any) => o.layout);
    const words = (s: any) => new Set(SC.wordsOfText(Object.values(s.fields).flat().join(' ')));
    const invented = (s: any) => LM.layoutOptions(s, look).flatMap((o: any) => SC.wordsOfText(LM.flat(o.fields).join(' ')).filter((w: string) => !words(s).has(w)).map((w: string) => `${o.layout}:${w}`));
    const opt = (s: any, id: string) => LM.layoutOptions(s, look).find((o: any) => o.layout === id);
    return {
      item: { picker: ids(item, true), deck: ids(item, false), statement: opt(item, 'statement')?.fields, invented: invented(item) },
      step: { picker: ids(step, true).length, deck: ids(step, false).length, splitText: opt(step, 'split-text')?.fields },
      pair: { picker: ids(pair, true), deck: ids(pair, false), button: opt(pair, 'cta-button')?.fields, invented: invented(pair) },
      pairLost: ids(pairLost, true),
      prose: { picker: ids(prose, true), deck: ids(prose, false) },
    };
  });
  expect(r.item.deck, 'the deck passes\' list is unchanged').toEqual(['listicle-numeral', 'step-numeral']);
  expect(r.item.picker.length, JSON.stringify(r.item.picker)).toBeGreaterThanOrEqual(8);
  expect(r.item.picker).toEqual(expect.arrayContaining(['statement', 'split-text', 'big-question']));
  expect(r.item.statement.headline).toBe('1. Shoot at golden hour');
  expect(r.item.invented, 'no word that is not on the slide').toEqual([]);
  expect(r.step.picker).toBeGreaterThan(r.step.deck);
  expect(r.step.splitText).toEqual({ headline: '3. Get low or get high', paragraph: 'Eye level is what everyone else does.' });
  expect(r.pair.deck).toEqual(['cta-pair']);
  expect(r.pair.picker).toContain('cta-button');
  expect(r.pair.button).toEqual({ headline: 'Save this for your next shoot', button: 'Save this', sub: "Tell me which one you'll try first." });
  expect(r.pair.invented).toEqual([]);
  expect(r.pairLost, 'the second button\'s words are not in the line: one button would leave them out').not.toContain('cta-button');
  expect(r.prose.picker, 'a prose slide without a headline is unchanged').toEqual(r.prose.deck);
});

const TEXT = "5 small habits that make your photos look less like everyone else's.\n\n1. Shoot at golden hour. Sunrise and the hour before sunset do more than any filter.\n2. Look for reflections. Puddles, windows and wet streets give you a second picture for free.\n3. Get low or get high. Eye level is what everyone else does.\n4. Leave empty space. A small subject in a big scene feels like a story.\n5. Pick one detail. A single leaf on a table can beat a whole landscape.\n\nSave this for your next shoot, and tell me which one you'll try first.";
const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
const WRITER = JSON.stringify({ title: '5 small habits', slides: [
  S('statement', { headline: '5 small habits for your photos', caption: "Look less like everyone else's." }),
  S('listicle-numeral', { numeral: '1', title: 'Shoot at golden hour', body: 'Sunrise and the hour before sunset do more than any filter.' }),
  S('split-text', { headline: 'Look for reflections', paragraph: 'Puddles, windows and wet streets give you a second picture for free.' }),
  S('cta-pair', { headline: 'Save this for your next shoot', button1: 'Save this', button2: 'Tell me', line2: "Tell me which one you'll try first." }),
] });

test('AL7 in the app: the numbered item offers more purposes and becomes a Big statement with "1." on the slide; the closing offers one button under "More like this"; one fake writer call', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let calls = 0;
  await page.route('**/__carousel/status', (x) => x.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (x) => x.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (x) => x.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/api/reference/status', (x) => x.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  const write = (x: any) => { calls++; return x.fulfill({ json: { text: WRITER, ms: 5, usage: { input: 10, output: 5 } } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 4);
  const lib = () => page.evaluate(() => (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as any).project?.doc?.designed?.library);

  // the numbered item
  await openTab(page, 'Layout', 2);
  const g = page.getByTestId('gallery-1');
  await g.scrollIntoViewIfNeeded();
  await expect(g).not.toHaveAttribute('data-ready-ms', '', { timeout: 60_000 });
  const tiles = await g.locator('[data-testid^="purpose-"]:not([data-testid^="purpose-off-"])').count();
  expect(tiles, 'more than the Numbered step purpose').toBeGreaterThanOrEqual(3);
  await g.getByTestId('purpose-statement').locator('button[data-testid^="gal-"]').first().click();
  await expect(g.getByRole('status')).toHaveText(/^Slide 2 is now Big statement/, { timeout: 60_000 });
  await expect.poll(async () => (await lib()).plan.specs[1].layout, { timeout: 30_000 }).toMatch(/^statement/);
  const l1 = await lib();
  expect(l1.plan.specs[1].fields.headline).toMatch(/^1\. Shoot at golden hour/);
  const drawn = await page.evaluate(() => { const d = (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as any).project.doc.designed.slides['1'].built; return d.layers.filter((x: any) => x.kind === 'text').map((x: any) => x.text).join(' | '); });
  expect(drawn, 'the number is on the drawn slide').toMatch(/1\. /);

  // the closing
  await openTab(page, 'Layout', 4);
  const c = page.getByTestId('gallery-3');
  await c.scrollIntoViewIfNeeded();
  await expect(c).not.toHaveAttribute('data-ready-ms', '', { timeout: 60_000 });
  await c.getByTestId('more-cta').click();
  await c.getByTestId('gal-cta-button').click();
  await expect(c.getByRole('status')).toHaveText(/^Slide 4 is now Call to action, one button/, { timeout: 60_000 });
  await expect.poll(async () => (await lib()).plan.specs[3].layout, { timeout: 30_000 }).toBe('cta-button');
  const l2 = await lib();
  expect(l2.plan.specs[3].fields.button).toBe('Save this');
  expect(calls, 'one fake writer call; the picker costs nothing').toBe(1);
});
