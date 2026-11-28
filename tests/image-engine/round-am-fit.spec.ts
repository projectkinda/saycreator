// Round AM part 1: "make it fit" in the layout picker. A layout that fits only with a change is a tile after the clean ones, with the change in plain words under it:
//  - a number: a numbered item on a layout with no number of its own gets "1." before the headline ("Adds '1.' before the headline"), one click;
//  - a line left out: "Leaves out: ..."; the click asks first ("Use it" / "Keep my words"); the line stays with the slide and another layout brings it back;
//  - a photo another slide shows: when every picture is on another slide, the photo layouts take one of them ("Photo also used on slide N"), one click.
// "Why not the others" keeps only what cannot work. A FAKE writer makes the deck (one answer) and a FAKE describer counts: every click is code only, ZERO model calls.
import { expect, test, type Page } from '@playwright/test';
import { deckDrawn, openTab, toStep } from './ui';

test.setTimeout(6 * 60_000);

test('AM1 the picker model: the three kinds of change, their plain words, the order of the grid, and a line left out coming back', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const P: any = await import('/src/carousel/designLibraryPick.ts');
    const LP: any = await import('/src/carousel/layoutPurpose.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const IM: any = await import('/src/carousel/layouts/images.ts');
    const pack = PR.presetPackFor('editorial-collage', false);
    const style = D.styleFromPack(pack).style;
    const pic = (id: string, w: number, h: number) => ({ id, width: w, height: h, content: 'photo' });
    const images = [pic('pA', 1000, 1500), pic('pB', 1500, 1000)];
    const look = { hasPhoto: true, images };
    const item = { numeral: '1', title: 'Shoot at golden hour', body: 'Sunrise and the hour before sunset do more than any filter.' };
    const lib0: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style, styleNotes: [], plan: { title: 'T', specs: [
      { layout: 'split-half', fields: { headline: 'Look for reflections', body: 'Puddles, windows and wet streets give you a second picture for free.', image: IM.makeRef({ id: 'pA', w: 1000, h: 1500, photo: true }) }, accents: [] },
      { layout: 'listicle-numeral', fields: item, accents: [] },
      { layout: 'photo-cover', fields: { headline: 'Get low or get high', intro: 'Eye level is what everyone else does.', image: IM.makeRef({ id: 'pB', w: 1500, h: 1000, photo: true }) }, accents: [] },
    ] } };
    const lib = (await D.redrawLibraryDeck(lib0, { pack, hasPhoto: true, images }, '@h')).library;
    const model = (l: any) => P.galleryModel(l, look, '@h', 1);
    const m = model(lib);
    const by = (mm: any) => Object.fromEntries(mm.entries.map((e: any) => [e.layout, e]));
    const e = by(m);
    const g = LP.purposeGrid(m.entries);
    const pick = (x: any) => x && { fit: x.fit, badges: x.badges ?? [], change: x.change ?? null };
    // a line left out: the slide keeps it
    const toStatement = await P.redrawLibrarySlide(lib, look, '@h', 1, { layout: 'statement', variant: 0 });
    const s1 = toStatement.spec;
    const e2 = by(model(toStatement.library));
    const back = await P.redrawLibrarySlide(toStatement.library, look, '@h', 1, { layout: 'listicle-numeral', variant: 0 });
    // through a second layout: statement -> split-text (the sentence comes back there too) -> listicle-numeral
    const viaText = await P.redrawLibrarySlide(toStatement.library, look, '@h', 1, { layout: 'split-text', variant: 0 });
    const back2 = await P.redrawLibrarySlide(viaText.library, look, '@h', 1, { layout: 'listicle-numeral', variant: 0 });
    // a photo another slide shows: only with `reuse` (the picker's click); the deck's own redraws place free pictures only, as before
    const photo = await P.redrawLibrarySlide(lib, look, '@h', 1, { layout: 'split-half', variant: 0, reuse: true });
    const noReuse = await P.redrawLibrarySlide(lib, look, '@h', 1, { layout: 'split-half', variant: 0 });
    const tile = await P.drawGalleryTile(lib, look, '@h', 1, 'split-half', 0);
    return {
      splitText: pick(e['split-text']), statement: pick(e.statement), splitHalf: pick(e['split-half']), own: pick(e['listicle-numeral']),
      tiles: g.tiles.map((t: any) => [t.purpose.id, t.fit, t.best]), off: g.off.map((o: any) => o.purpose.id),
      s1: { layout: s1.layout, fields: s1.fields, left: s1.left ? { layout: s1.left.layout, fields: s1.left.fields } : null },
      afterDrop: { own: pick(e2.statement), item: pick(e2['listicle-numeral']), cur: e2.statement.current },
      back: back.ok ? { layout: back.spec.layout, fields: back.spec.fields, left: back.spec.left ?? null } : back.reasons,
      viaText: viaText.ok ? viaText.spec.fields : viaText.reasons,
      back2: back2.ok ? back2.spec.fields : back2.reasons,
      photo: photo.ok ? IM.parseRef(photo.spec.fields.image)?.id ?? null : photo.reasons,
      noReuse: noReuse.ok ? noReuse.spec.fields.image ?? null : 'refused',
      tileHasPicture: !!tile && /<image/.test(tile),
    };
  });
  const NB = ' ';
  // a number: one click, nothing left out
  expect(r.splitText).toEqual({ fit: 'change', badges: ["Adds '1.' before the headline"], change: { number: '1' } });
  // a line left out
  expect(r.statement.fit).toBe('change');
  expect(r.statement.badges[0]).toBe("Adds '1.' before the headline");
  // Round AM part 4: cut at a word boundary within 40 letters, and "…" because something was cut
  expect(r.statement.badges[1]).toBe('Leaves out: "Sunrise and the hour before sunset do…"');
  expect(r.statement.change.drops).toEqual(['Sunrise and the hour before sunset do more than any filter.']);
  // a photo another slide shows (every picture is on slides 1 and 3)
  expect(r.splitHalf.fit).toBe('change');
  expect(r.splitHalf.badges).toEqual(["Adds '1.' before the headline", 'Photo also used on slide 1']);
  expect(r.own.fit).toBe('clean');
  // the grid: the slide's own purpose, then the clean ones, then the ones with a change; none of the three kinds is under "Why not the others"
  expect(r.tiles[0]).toEqual(['step', 'clean', 'listicle-numeral']);
  const firstChange = r.tiles.findIndex((t: any) => t[1] === 'change');
  expect(r.tiles.slice(firstChange).every((t: any) => t[1] === 'change')).toBe(true);
  expect(r.off).not.toEqual(expect.arrayContaining(['statement']));
  expect(r.off).not.toContain('paragraph');
  expect(r.off).not.toContain('photo-side');
  // "Use it": the statement shows the headline with its number; the sentence is kept with the slide
  expect(r.s1.layout).toBe('statement');
  expect(r.s1.fields.headline).toBe(`1.${NB}Shoot at golden hour`);
  expect(JSON.stringify(r.s1.fields)).not.toContain('Sunrise');
  expect(r.s1.left).toEqual({ layout: 'listicle-numeral', fields: { numeral: '1', title: 'Shoot at golden hour', body: 'Sunrise and the hour before sunset do more than any filter.' } });
  // from the statement, the numbered step fits again as it was
  expect(r.afterDrop.cur).toBe(true);
  expect(r.afterDrop.item.fit).toBe('clean');
  expect(r.back).toEqual({ layout: 'listicle-numeral', fields: { numeral: '1', title: 'Shoot at golden hour', body: 'Sunrise and the hour before sunset do more than any filter.' }, left: null });
  expect(r.viaText).toEqual({ headline: `1.${NB}Shoot at golden hour`, paragraph: 'Sunrise and the hour before sunset do more than any filter.' });
  expect(r.back2).toEqual({ numeral: '1', title: 'Shoot at golden hour', body: 'Sunrise and the hour before sunset do more than any filter.' });
  // the photo: the picker's click takes slide 1's picture; without `reuse` nothing changes from before (no picture)
  expect(r.photo).toBe('pA');
  expect(r.noReuse).toBeNull();
  expect(r.tileHasPicture, 'the tile shows the picture the click will place').toBe(true);
});

const TEXT = "5 small habits that make your photos look less like everyone else's.\n\n1. Shoot at golden hour. Sunrise and the hour before sunset do more than any filter.\n2. Look for reflections. Puddles, windows and wet streets give you a second picture for free.\n3. Get low or get high. Eye level is what everyone else does.\n4. Leave empty space. A small subject in a big scene feels like a story.\n5. Pick one detail. A single leaf on a table can beat a whole landscape.\n\nSave this for your next shoot, and tell me which one you'll try first.";
const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
const WRITER = JSON.stringify({ title: '5 small habits', slides: [
  S('statement', { headline: '5 small habits for your photos', caption: "Look less like everyone else's." }),
  S('listicle-numeral', { numeral: '1', title: 'Shoot at golden hour', body: 'Sunrise and the hour before sunset do more than any filter.' }),
  S('photo-cover', { headline: 'Look for reflections', intro: 'Puddles, windows and wet streets give you a second picture for free.' }),
  S('cta-pair', { headline: 'Save this for your next shoot', button1: 'Save this', button2: 'Tell me', line2: "Tell me which one you'll try first." }),
] });

/** A photo-like generated picture (gradient and small marks, no stock) as file bytes. */
async function picture(page: Page, w: number, h: number) {
  const b64 = await page.evaluate(async ({ w, h }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2471a3'); gr.addColorStop(1, '#ffe9c4'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 6000; i++) { g.fillStyle = `hsla(${Math.floor(rnd() * 360)}, 60%, ${20 + rnd() * 60}%, 0.55)`; const s = (0.004 + rnd() * 0.03) * Math.min(w, h); g.fillRect(rnd() * w, rnd() * h, s, s); }
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85));
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x);
    return btoa(s);
  }, { w, h });
  return { name: 'wide.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}

test('AM2 in the app at 390 px: a line left out asks first and "Keep my words" changes nothing; "Use it" keeps the line with the slide and the numbered step brings it back; a number and a photo another slide shows apply in one click; plain words only; zero model calls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = { calls: 0, describes: 0 };
  await page.route('**/__carousel/status', (x) => x.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (x) => x.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (x) => x.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/api/reference/status', (x) => x.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/__picture/describe', (x) => { f.describes++; return x.fulfill({ json: { captions: [], calls: 1 } }); });
  const write = (x: any) => { f.calls++; return x.fulfill({ json: { text: WRITER, ms: 5, usage: { input: 10, output: 5 } } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  await page.goto('/images/carousel');
  await page.getByLabel('Choose images for the slides').setInputFiles([await picture(page, 1500, 1000)]);
  await expect(page.getByTestId('image-0')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 4);
  expect(f.calls).toBe(1);
  const lib = () => page.evaluate(() => (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as any).project?.doc?.designed?.library);
  const l0 = await lib();
  // the one picture is on slide 3: every picture is on another slide for the numbered item
  const picOf = (s: any) => Object.values(s.fields).find((v: any) => typeof v === 'string' && v.startsWith('picture:')) as string | undefined;
  const pic3 = picOf(l0.plan.specs[2]);
  expect(pic3, 'the deck put its picture on slide 3').toBeTruthy();
  expect(l0.plan.specs[1].layout).toBe('listicle-numeral');

  const ready = async () => {
    const g = page.getByTestId('gallery-1');
    await g.scrollIntoViewIfNeeded();
    await expect(g).not.toHaveAttribute('data-ready-ms', '', { timeout: 60_000 });
    return g;
  };
  await openTab(page, 'Layout', 2);
  let g = await ready();
  // the grid: the clean tiles first, then the ones with a change, each marked in plain words
  const fits = await g.locator('[data-testid^="purpose-"]:not([data-testid^="purpose-off-"])').evaluateAll((els) => els.map((e) => e.getAttribute('data-fit')));
  expect(fits[0]).toBe('clean');
  expect(fits.indexOf('change')).toBeGreaterThan(0);
  expect(fits.slice(fits.indexOf('change')).every((x) => x === 'change')).toBe(true);
  await expect(g.getByTestId('purpose-statement')).toHaveAttribute('data-fit', 'change');
  await expect(g.getByTestId('purpose-statement').locator('.cr-lp-badge')).toHaveText(["Adds '1.' before the headline", 'Leaves out: "Sunrise and the hour before sunset do…"']);
  await expect(g.getByTestId('purpose-photo-side').locator('.cr-lp-badge').last()).toHaveText('Photo also used on slide 3');
  await expect(g.getByTestId('purpose-off-statement')).toHaveCount(0);
  await expect(g.getByTestId('purpose-off-photo-side')).toHaveCount(0);

  // plain words: no layout id, no quoted field id, no engine word in the badges and the question
  const words = await page.evaluate(async () => {
    const L: any = await import('/src/carousel/layouts/index.ts');
    const ids = (L.LAYOUT_IDS as string[]).filter((x) => x.includes('-'));
    const fields = [...new Set((L.LAYOUT_IDS as string[]).flatMap((id) => L.layoutDef(id).fields.map((f: any) => f.name as string)))];
    return { ids, fields };
  });
  const plain = (t: string, where: string) => {
    for (const id of words.ids) expect(t, `${where}: layout id ${id}`).not.toContain(id);
    for (const fid of words.fields) expect(t, `${where}: quoted field id ${fid}`).not.toMatch(new RegExp(`["'“]${fid}["'”]`));
    expect(t, `${where}: engine word`).not.toMatch(/\b(variant|cut|invert|density|plane|kicker)s?\b/i);
  };
  plain((await g.locator('.cr-lp-badge').allTextContents()).join(' | '), 'badges');

  // a line left out: the click asks first; "Keep my words" changes nothing
  await g.getByTestId('gal-statement').click();
  const ask = page.getByTestId('fit-confirm-1');
  await expect(ask).toBeVisible();
  await expect(ask).toContainText('This layout has no room for "Sunrise and the hour before sunset do…". Use it anyway?');
  await expect(ask).toContainText('Use it anyway?');
  plain(await ask.innerText(), 'question');
  await page.getByTestId('fit-keep').click();
  await expect(ask).toHaveCount(0);
  await page.waitForTimeout(500);
  const l1 = await lib();
  expect(l1.plan.specs[1]).toEqual(l0.plan.specs[1]);
  expect(l1.redraws ?? 0).toBe(l0.redraws ?? 0);

  // "Use it": the statement, the sentence kept with the slide
  await g.getByTestId('gal-statement').click();
  await page.getByTestId('fit-use').click();
  await expect(g.getByRole('status')).toHaveText(/^Slide 2 is now Big statement/, { timeout: 60_000 });
  await expect.poll(async () => (await lib()).plan.specs[1].layout, { timeout: 30_000 }).toBe('statement');
  const l2 = await lib();
  expect(l2.plan.specs[1].fields.headline).toBe('1. Shoot at golden hour');
  expect(l2.plan.specs[1].left.fields.body).toBe('Sunrise and the hour before sunset do more than any filter.');

  // switching back: the numbered step is a clean tile and brings the sentence back
  g = await ready();
  await expect(g.getByTestId('purpose-step')).toHaveAttribute('data-fit', 'clean');
  await g.getByTestId('gal-listicle-numeral').click();
  await expect(g.getByRole('status')).toHaveText(/^Slide 2 is now Numbered step/, { timeout: 60_000 });
  await expect.poll(async () => (await lib()).plan.specs[1].layout, { timeout: 30_000 }).toBe('listicle-numeral');
  const l3 = await lib();
  expect(l3.plan.specs[1].fields).toMatchObject({ numeral: '1', title: 'Shoot at golden hour', body: 'Sunrise and the hour before sunset do more than any filter.' });

  // a number: one click, no question
  g = await ready();
  await g.getByTestId('gal-split-text').click();
  await expect(page.getByTestId('fit-confirm-1')).toHaveCount(0);
  await expect(g.getByRole('status')).toHaveText(/^Slide 2 is now Headline and paragraph/, { timeout: 60_000 });
  await expect.poll(async () => (await lib()).plan.specs[1].layout, { timeout: 30_000 }).toBe('split-text');
  expect((await lib()).plan.specs[1].fields).toMatchObject({ headline: '1. Shoot at golden hour', paragraph: 'Sunrise and the hour before sunset do more than any filter.' });

  // a photo another slide shows: one click, the slide shows slide 3's picture (and slide 3 keeps it)
  g = await ready();
  await expect(g.getByTestId('purpose-photo-side').locator('.cr-lp-badge').last()).toHaveText('Photo also used on slide 3');
  await g.getByTestId('purpose-photo-side').locator('button[data-testid^="gal-"]').first().click();
  await expect(page.getByTestId('fit-confirm-1')).toHaveCount(0);
  await expect(g.getByRole('status')).toHaveText(/^Slide 2 is now Photo on the side/, { timeout: 60_000 });
  await expect.poll(async () => picOf((await lib()).plan.specs[1])?.split('#')[0], { timeout: 30_000 }).toBe(pic3!.split('#')[0]);
  expect(picOf((await lib()).plan.specs[2])).toBe(pic3);

  expect(f.calls, 'one fake writer call for the deck; every click is code only').toBe(1);
  expect(f.describes, 'no describe call').toBe(0);
});

// ----- Round AM part 2: layouts that leave out words the slide's own layout requires (a closing's buttons, a headline + sentence slide's sentence), picker only -----

test('AM3 the picker reaches the layouts that leave out required words, never the headline, a number or a list item; the deck passes\' list is unchanged; the words come back; the real reason for stacked big words', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const P: any = await import('/src/carousel/designLibraryPick.ts');
    const LM: any = await import('/src/carousel/layoutMap.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const look = { hasPhoto: false };
    const pair = { layout: 'cta-pair', fields: { headline: 'Save this for your next shoot', button1: 'Save this', button2: 'Tell me which one', line2: "Tell me which one you'll try first." }, accents: [] };
    const text = { layout: 'split-text', fields: { headline: 'Look for reflections', paragraph: 'Puddles, windows and wet streets give you a second picture for free.' }, accents: [] };
    const item = { layout: 'listicle-numeral', fields: { numeral: '1', title: 'Shoot at golden hour', body: 'Sunrise and the hour before sunset do more than any filter.' }, accents: [] };
    const list = { layout: 'checklist', fields: { title: 'Before you post', items: ['Check the light', 'Crop the edges', 'Read it aloud'] }, accents: [] };
    const near = (s: any) => LM.nearOptions(s, look);
    const pack = PR.presetPackFor('editorial-collage', false);
    const style = D.styleFromPack(pack).style;
    const lib0: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style, styleNotes: [], plan: { title: 'T', specs: [text, pair] } };
    const lib = (await D.redrawLibraryDeck(lib0, { pack, hasPhoto: false }, '@h')).library;
    const m = P.galleryModel(lib, look, '@h', 1);
    const st = m.entries.find((e: any) => e.layout === 'statement');
    const to = await P.redrawLibrarySlide(lib, look, '@h', 1, { layout: 'statement', variant: 0 });
    const m2 = P.galleryModel(to.library, look, '@h', 1);
    const back = await P.redrawLibrarySlide(to.library, look, '@h', 1, { layout: 'cta-pair', variant: 0 });
    return {
      pairNear: near(pair).map((o: any) => [o.layout, o.droppedCore]),
      pairDeck: LM.layoutOptionsFor(pair, look).map((o: any) => o.layout),
      pairPicker: LM.layoutOptions(pair, look).map((o: any) => o.layout),
      textNear: near(text).map((o: any) => [o.layout, o.droppedCore]),
      itemNear: near(item).map((o: any) => [o.layout, LM.flat(o.fields)]),
      listNear: near(list).map((o: any) => [o.layout, LM.flat(o.fields)]),
      prose: near({ layout: 'prose', fields: { p1: 'A small subject in a big scene feels like a story.' }, accents: [] }).length,
      stacked: LM.layoutRefusals(item, look)['statement-stacked'],
      st: st && { fit: st.fit, near: !!st.near, badges: st.badges, enabled: st.enabled },
      to: to.ok ? { layout: to.spec.layout, fields: to.spec.fields, left: to.spec.left?.fields } : to.reasons,
      pairClean: m2.entries.find((e: any) => e.layout === 'cta-pair')?.fit,
      back: back.ok ? { layout: back.spec.layout, fields: back.spec.fields, left: back.spec.left ?? null } : back.reasons,
    };
  });
  // the closing: Big statement and the others leave out the second button (and the line under it), never the headline
  const pn = Object.fromEntries(r.pairNear);
  expect(Object.keys(pn)).toEqual(expect.arrayContaining(['statement', 'big-question', 'quote']));
  expect(pn.statement).toEqual(['Tell me which one']);
  expect(r.pairDeck, 'the deck passes\' list is unchanged').toEqual(['cta-pair']);
  expect(r.pairPicker).not.toContain('statement');
  // the headline + sentence slide: the sentence may go
  expect(Object.fromEntries(r.textNear)['big-question']).toEqual(['Puddles, windows and wet streets give you a second picture for free.']);
  // never the number or a list item; nothing for a slide without a headline
  for (const [id, shown] of r.itemNear) expect((shown as string[]).join(' | '), `${id} keeps the number`).toMatch(/(^|\| )1(\. | |$)/);
  for (const [id, shown] of r.listNear) for (const it of ['Check the light', 'Crop the edges', 'Read it aloud']) expect((shown as string[]).join(' | '), `${id} keeps ${it}`).toContain(it);
  expect(r.prose).toBe(0);
  // the real reason (it was "Has no place for the number 1.")
  expect(r.stacked).toBe('The headline has 5 words; this layout takes 2 to 4.');
  // the tile, the move and the way back
  expect(r.st).toEqual({ fit: 'change', near: true, enabled: true, badges: ['Leaves out: "Tell me which one", "Tell me which one you\'ll try first."'] });
  expect(r.to.layout).toBe('statement');
  expect(r.to.fields).toEqual({ headline: 'Save this for your next shoot' });
  expect(r.to.left).toEqual({ headline: 'Save this for your next shoot', button1: 'Save this', button2: 'Tell me which one', line2: "Tell me which one you'll try first." });
  expect(r.pairClean).toBe('clean');
  expect(r.back).toEqual({ layout: 'cta-pair', fields: { headline: 'Save this for your next shoot', button1: 'Save this', button2: 'Tell me which one', line2: "Tell me which one you'll try first." }, left: null });
});

test('AM4 in the app at 390 px: the closing\'s Big statement asks first, "Keep my words" changes nothing, "Use it" leaves the buttons out and the closing layout brings them back; "Add a picture" never takes a layout that leaves words out; zero model calls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = { calls: 0, describes: 0 };
  await page.route('**/__carousel/status', (x) => x.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (x) => x.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (x) => x.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/api/reference/status', (x) => x.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/__picture/describe', (x) => { f.describes++; return x.fulfill({ json: { captions: [], calls: 1 } }); });
  const write = (x: any) => { f.calls++; return x.fulfill({ json: { text: WRITER, ms: 5, usage: { input: 10, output: 5 } } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  await page.goto('/images/carousel');
  await page.getByLabel('Choose images for the slides').setInputFiles([await picture(page, 1500, 1000), { ...(await picture(page, 1000, 1500)), name: 'tall.jpg' }]);
  await expect(page.getByTestId('image-1')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 4);
  const lib = () => page.evaluate(() => (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as any).project?.doc?.designed?.library);
  const l0 = await lib();
  expect(l0.plan.specs[3].layout).toBe('cta-pair');
  const own = l0.plan.specs[3].fields;

  // "Add a picture" on the closing: never a layout that leaves words out (only the Layout tab offers those, after its question). A third picture, added after the deck, is free.
  await toStep(page, 1);
  await page.getByLabel('Choose images for the slides').setInputFiles([{ ...(await picture(page, 1200, 1200)), name: 'square.jpg' }]);
  await expect(page.getByTestId('image-2')).toBeVisible({ timeout: 30_000 });
  await openTab(page, 'Pictures', 4);
  const add = page.getByTestId('add-picture');
  const addButton = add.getByRole('button', { name: 'Add a picture to this slide' });
  await addButton.click();
  await expect(add).toContainText(/No picture layout fits|Added a picture/, { timeout: 60_000 });
  expect((await lib()).plan.specs[3].fields, 'every word of the closing is still on it').toMatchObject({ headline: own.headline, button1: own.button1, button2: own.button2, line2: own.line2 });

  await openTab(page, 'Layout', 4);
  const g = page.getByTestId('gallery-3');
  const ready = async () => { await g.scrollIntoViewIfNeeded(); await expect(g).not.toHaveAttribute('data-ready-ms', '', { timeout: 60_000 }); };
  await ready();
  await expect(g.getByTestId('purpose-statement')).toHaveAttribute('data-fit', 'change');
  // (the deck's closing rule may have lengthened the second button to the text's own phrase: the words are read from the slide)
  await expect(g.getByTestId('purpose-statement').locator('.cr-lp-badge')).toHaveText([`Leaves out: "${own.button2}", "${own.line2}"`]);
  await g.getByTestId('gal-statement').click();
  const ask = page.getByTestId('fit-confirm-3');
  await expect(ask).toContainText(`This layout has no room for "${own.button2}" or "${own.line2}"`);
  await page.getByTestId('fit-keep').click();
  await expect(ask).toHaveCount(0);
  await page.waitForTimeout(500);
  expect((await lib()).plan.specs[3].fields).toEqual(own);

  await g.getByTestId('gal-statement').click();
  await page.getByTestId('fit-use').click();
  await expect(g.getByRole('status')).toHaveText(/^Slide 4 is now Big statement/, { timeout: 60_000 });
  await expect.poll(async () => (await lib()).plan.specs[3].layout, { timeout: 30_000 }).toBe('statement');
  expect((await lib()).plan.specs[3].left.fields).toEqual(own);

  await ready();
  await expect(g.getByTestId('purpose-cta')).toHaveAttribute('data-fit', 'clean');
  // (the purpose's first layout is one button; two buttons is under "More like this")
  if (!(await g.getByTestId('gal-cta-pair').count())) await g.getByTestId('more-cta').click();
  await expect(g.getByTestId('gal-item-cta-pair')).toHaveAttribute('data-fit', 'clean');
  await g.getByTestId('gal-cta-pair').click();
  await expect(g.getByRole('status')).toHaveText(/^Slide 4 is now Call to action, two buttons/, { timeout: 60_000 });
  await expect.poll(async () => (await lib()).plan.specs[3].layout, { timeout: 30_000 }).toBe('cta-pair');
  expect((await lib()).plan.specs[3].fields).toEqual(own);

  expect(f.calls, 'one fake writer call for the deck').toBe(1);
  expect(f.describes).toBe(0);
});

// ----- Round AM part 4: the cut marks and the plain reasons -----

test('AM5 a line cut short is cut at a word boundary and ends with "…"; a refusal names the slide\'s own line; a layout for its own text says what it is for', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const PW: any = await import('/src/carousel/plainWords.ts');
    const LM: any = await import('/src/carousel/layoutMap.ts');
    const look = { hasPhoto: false };
    const statement = { layout: 'statement-card', fields: { headline: "5 small habits that make your photos look less like everyone else's.", caption: 'A single leaf on a table can beat a whole landscape, really.' }, accents: [] };
    const why = LM.layoutRefusals(statement, look);
    return {
      cuts: ['Tell me which one', 'Sunrise and the hour before sunset do more than any filter.', 'Supercalifragilisticexpialidociousandmoreandmorewords here', 'Exactly forty letters long, no cut here!'].map((t) => PW.cutLine(t)),
      quote: why.quote, lead: why['lead-statement'],
      own: ['comparison', 'do-dont', 'feature-slider', 'cta-pair', 'contact-closing', 'portrait-closing', 'headline-card', 'twin-photos'].map((id) => [id, why[id]]),
      works: Object.values(why).filter((x: any) => /Works only with text written for it/.test(x)).length,
    };
  });
  expect(r.cuts[0], 'a line that fits is whole, no "…"').toBe('Tell me which one');
  expect(r.cuts[1]).toBe('Sunrise and the hour before sunset do…');
  expect(r.cuts[2], 'never inside a word: one long word is kept whole').toBe('Supercalifragilisticexpialidociousandmoreandmorewords…');
  expect(r.cuts[3]).toBe('Exactly forty letters long, no cut here!');
  expect(r.quote).toBe('The line below the headline that would become the name under the quote is 60 letters long; this layout holds 40.');
  expect(r.lead).toBe('The line below the headline that would become the small line above the headline is 60 letters long; this layout holds 40.');
  expect(r.works).toBe(0);
  for (const [id, reason] of r.own) expect(reason, id).toMatch(/^Made for .+; this slide isn't one\.$/);
});
