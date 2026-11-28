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

test('AL7 in the app: the numbered item offers more purposes (only those that keep every word) and becomes Headline and paragraph with "1." on the slide; the closing offers one button under "More like this"; one fake writer call', async ({ page }) => {
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
  expect(tiles, 'more than the Numbered step purpose (this deck has no picture: the photo purposes are not offered)').toBeGreaterThanOrEqual(2);
  // only what keeps the whole slide is a tile: Big statement would leave the item's sentence out, so it is under "Why not the others" with that reason
  await expect(g.getByTestId('purpose-statement')).toHaveCount(0);
  await expect(g.getByTestId('purpose-off-statement')).toContainText('Leaves out');
  await expect(g.locator('.cr-lp-leaves')).toHaveCount(0);
  await g.getByTestId('purpose-paragraph').locator('button[data-testid^="gal-"]').first().click();
  await expect(g.getByRole('status')).toHaveText(/^Slide 2 is now Headline and paragraph/, { timeout: 60_000 });
  await expect.poll(async () => (await lib()).plan.specs[1].layout, { timeout: 30_000 }).toBe('split-text');
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

test('AL8 the grid keeps the whole slide: a picture purpose whose layouts would get no picture (every picture is on another slide) and a purpose whose layouts leave a line out are under "Why not the others" with that reason; a free picture brings the photo purposes back', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const P: any = await import('/src/carousel/designLibraryPick.ts');
    const LP: any = await import('/src/carousel/layoutPurpose.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const IM: any = await import('/src/carousel/layouts/images.ts');
    const style = D.styleFromPack(PR.presetPackFor('editorial-collage', false)).style;
    const pic = (id: string, w: number, h: number) => ({ id, width: w, height: h, content: 'photo' });
    const two = [pic('pA', 1000, 1500), pic('pB', 1500, 1000)];
    const lib: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style, styleNotes: [], plan: { title: 'T', specs: [
      { layout: 'split-half', fields: { headline: 'Look for reflections', body: 'Puddles, windows and wet streets give you a second picture for free.', image: IM.makeRef({ id: 'pA', w: 1000, h: 1500, photo: true }) }, accents: [] },
      { layout: 'listicle-numeral', fields: { numeral: '1', title: 'Shoot at golden hour', body: 'Sunrise and the hour before sunset do more than any filter.' }, accents: [] },
      { layout: 'photo-cover', fields: { headline: 'Get low or get high', intro: 'Eye level is what everyone else does.', image: IM.makeRef({ id: 'pB', w: 1500, h: 1000, photo: true }) }, accents: [] },
    ] } };
    const res = await D.redrawLibraryDeck(lib, { pack: PR.presetPackFor('editorial-collage', false), hasPhoto: true, images: two }, '@h');
    const grid = (images: any[]) => {
      const m = P.galleryModel(res.library, { hasPhoto: true, images }, '@h', 1);
      const g = LP.purposeGrid(m.entries);
      const by = new Map(m.entries.map((e: any) => [e.layout, e]));
      return { tiles: g.tiles.map((t: any) => t.purpose.id), shown: g.tiles.flatMap((t: any) => [t.best, ...t.more]).map((l: string) => by.get(l)), off: Object.fromEntries(g.off.map((o: any) => [o.purpose.id, o.reason])) };
    };
    return { used: grid(two), free: grid([...two, pic('pC', 1500, 1000)]) };
  });
  for (const k of ['photo-side', 'photo-stack']) {
    expect(r.used.tiles, `${k}: every picture is on another slide`).not.toContain(k);
    expect(r.used.off[k]).toBe('All your pictures are on other slides: this layout would show no picture.');
  }
  expect(r.used.off.statement, 'Big statement would leave the item\'s sentence out').toMatch(/^Leaves out: "Sunrise/);
  for (const e of [...r.used.shown, ...r.free.shown]) {
    if (e.current) continue;
    expect(e.drops, `${e.layout} leaves nothing out`).toBeFalsy();
    expect(e.noPicture, `${e.layout} gets a picture`).toBeFalsy();
  }
  expect(r.used.tiles).toEqual(expect.arrayContaining(['step', 'paragraph']));
  expect(r.free.tiles, 'a free picture brings the photo purposes back').toEqual(expect.arrayContaining(['photo-side', 'photo-stack']));
});
