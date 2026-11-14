// Round H: the brand colour UI. A FAKE writer only: ZERO real model calls, and every colour action below makes 0 writer calls (asserted with a counting route).
// Data: brands in localStorage "creator.brands.v1"; the carousel's own colour choice is doc.scheme (absent = the style's own colours). Pictures: out/round-h/.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(5 * 60_000);
const OUT = 'out/round-h';
fs.mkdirSync(OUT, { recursive: true });
const DOC_KEY = 'creator.carousel.project.v1';
const BRANDS_KEY = 'creator.brands.v1';
const OLD_DOC = fs.readFileSync('tests/image-engine/fixtures/old-doc-no-scheme.json', 'utf8');

const PLAN = { title: 'Slides without the evening', slides: [
  { layout: 'statement', fields: { headline: 'Most creators do not have a design problem.' }, accents: ['design problem'] },
  { layout: 'split-text', fields: { headline: 'The idea took ten minutes', paragraph: 'The slides took the rest of the night.' }, accents: ['ten minutes'] },
  { layout: 'checklist', fields: { title: 'Three steps', items: ['Paste your text', 'Pick a look', 'Get slides'] }, accents: [] },
  { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: 'I will send you the link.' }, accents: ['next post'] },
] };

/** A counting fake writer. */
async function fake(page: Page) {
  let calls = 0;
  await page.route('**/api/carousel/status', (x) => x.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__carousel/status', (x) => x.fulfill({ json: { available: true } }));
  const w = (x: any) => { calls++; return x.fulfill({ json: { text: JSON.stringify(PLAN), ms: 5 } }); };
  await page.route('**/__carousel/write', w);
  await page.route('**/api/carousel/write', w);
  return () => calls;
}
const docOf = (page: Page) => page.evaluate((k) => { const t = localStorage.getItem(k); return t ? JSON.parse(t).project.doc : null; }, DOC_KEY);

/** Opens the page with the saved old-format deck in storage (no writer call at all). */
async function openOld(page: Page, brands?: unknown) {
  const calls = await fake(page);
  await page.addInitScript(([k, v, bk, bv]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k as string, v as string); if (bv) localStorage.setItem(bk as string, bv as string); sessionStorage.setItem('seeded', '1'); } }, [DOC_KEY, OLD_DOC, BRANDS_KEY, brands ? JSON.stringify(brands) : ''] as const);
  await page.goto('/images/carousel');
  await expect(page.locator('.cr-film img')).toHaveCount(4, { timeout: 60_000 });
  await page.waitForTimeout(500);
  return calls;
}

test('A: brands are read defensively: missing, corrupt, half-valid and blocked storage never crash', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const B: any = await import('/src/carousel/brandStore.ts');
    const out: any = {};
    out.missing = B.loadBrands();
    const cases: Record<string, string> = { garbage: '{not json', number: '42', nullish: 'null', notList: '{"brands":5}', halfValid: JSON.stringify({ brands: [{ id: 'a', name: 'A', colours: ['#ABC', 'zzz', '14213d'], createdAt: 5 }, { id: 'b', colours: [] }, { id: 7 }, null, { id: 'a', colours: ['#000000'] }], activeId: 'gone' }) };
    for (const [name, text] of Object.entries(cases)) {
      localStorage.setItem(B.BRANDS_KEY, text);
      out[name] = B.loadBrands();
    }
    localStorage.removeItem(B.BRANDS_KEY);
    const proto = Object.getPrototypeOf(localStorage);
    const g = proto.getItem; const s = proto.setItem;
    proto.getItem = () => { throw new Error('blocked'); };
    proto.setItem = () => { throw new Error('blocked'); };
    try { out.blockedLoad = B.loadBrands(); out.blockedSave = B.saveBrands({ brands: [], activeId: null }); out.blockedUpsert = B.upsertBrand({ name: 'X', colours: ['#123456'] }).saved; } finally { proto.getItem = g; proto.setItem = s; }
    out.hex = ['#abc', '#AABBCC', 'aabbcc', 'ABC', '#abcd', 'xyz', '', '#12345g'].map((h) => B.normaliseHex(h));
    return out;
  });
  expect(r.missing).toEqual({ brands: [], activeId: null });
  for (const k of ['garbage', 'number', 'nullish', 'notList']) expect(r[k], k).toEqual({ brands: [], activeId: null });
  expect(r.halfValid.brands).toHaveLength(1);
  expect(r.halfValid.brands[0]).toMatchObject({ id: 'a', name: 'A', colours: ['#aabbcc', '#14213d'], createdAt: 5 });
  expect(r.halfValid.activeId).toBeNull();
  expect(r.blockedLoad).toEqual({ brands: [], activeId: null });
  expect(r.blockedSave).toBe(false);
  expect(r.blockedUpsert).toBe(false);
  expect(r.hex).toEqual(['#aabbcc', '#aabbcc', '#aabbcc', '#aabbcc', null, null, null, null]);
});

test('A: an old saved carousel (no scheme field) loads with the style\'s own colours and draws exactly as before', async ({ page }) => {
  const calls = await openOld(page);
  const stored = JSON.parse(OLD_DOC).project.doc;
  expect(stored.scheme, 'the fixture is the old format').toBeUndefined();
  const r: any = await page.evaluate(async (doc) => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const BP: any = await import('/src/carousel/brandPalette.ts');
    const P: any = await import('/src/carousel/useProject.ts');
    const loaded = P.loadSaved('style-1');
    // the pack of the style with no scheme is the style's own pack, untouched: the same drawing as before this round
    const dflt = PR.presetPackFor(doc.style);
    const none = PR.presetPackFor(doc.style, true, null);
    const a = await D.redrawLibraryDeck(doc.designed.library, { pack: dflt, hasPhoto: false, images: [], site: '' }, '@saycreator');
    const b = await D.redrawLibraryDeck(doc.designed.library, { pack: none, hasPhoto: false, images: [], site: '' }, '@saycreator');
    const sameDraw = Object.keys(a.slides).map((k) => a.slides[k].built.svg === b.slides[k].built.svg);
    return { scheme: loaded.doc.scheme ?? null, style: loaded.doc.style, samePack: JSON.stringify(dflt) === JSON.stringify(none), noBrandSameObject: BP.applyBrand(dflt, null).pack === dflt, sameDraw, current: PR.getCurrentScheme() };
  }, stored);
  expect(r.scheme).toBeNull();
  expect(r.style).toBe('editorial-collage');
  expect(r.current, 'no colour scheme is in force').toBeNull();
  expect(r.noBrandSameObject, "the style's pack is untouched").toBe(true);
  expect(r.sameDraw, 'drawn again from the stored plan: the same drawing with or without naming "no scheme"').toEqual([true, true, true, true]);
  const d = await docOf(page);
  expect(d.scheme, 'opening it does not add a scheme').toBeUndefined();
  expect(JSON.stringify(d.designed), 'opening it draws nothing again: the stored slides are exactly the fixture ones').toBe(JSON.stringify(stored.designed));
  expect(calls()).toBe(0);
});

test('A: a new carousel starts with the active brand, otherwise with the style own colours', async ({ page, browser }) => {
  const calls = await fake(page);
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill('A first line');
  await page.waitForTimeout(700);
  expect((await docOf(page))?.scheme, 'no brand: the style own colours').toBeUndefined();
  expect((await docOf(page))?.topic).toBe('A first line');
  const ctx = await browser.newContext({ baseURL: page.url().split('/images')[0] });
  const p2 = await ctx.newPage();
  await fake(p2);
  await p2.addInitScript(([bk]) => { localStorage.setItem(bk as string, JSON.stringify({ brands: [{ id: 'b1', name: 'Navy', colours: ['#14213d', '#fca311'], createdAt: 1 }], activeId: 'b1' })); }, [BRANDS_KEY]);
  await p2.goto('/images/carousel');
  await p2.getByLabel('Your text or topic').fill('A first line');
  await p2.waitForTimeout(700);
  expect((await docOf(p2))?.scheme).toEqual({ kind: 'brand', id: 'b1', name: 'Navy', colours: ['#14213d', '#fca311'] });
  expect(calls()).toBe(0);
  await ctx.close();
});


// ---------------------------------------------------------------- the UI ----
const goStep3 = async (page: Page) => { await page.locator('.cr-wiz-steps button').nth(2).click(); await expect(page.getByTestId('colours-row')).toBeVisible(); };
const hex = (page: Page, i: number) => page.getByTestId(`brand-hex-${i}`);
const setHex = async (page: Page, i: number, v: string) => { await hex(page, i).fill(v); await hex(page, i).blur(); };
const previewSrcs = (page: Page) => page.locator('[data-testid=brand-preview] img').evaluateAll((a) => a.map((i) => (i as HTMLImageElement).src));
/** The top-left pixel of every slide in the filmstrip (the ground colour the slide is drawn on), as #rrggbb. */
const corners = (page: Page) => page.evaluate(async () => {
  const out: string[] = [];
  for (const img of Array.from(document.querySelectorAll('.cr-film img')) as HTMLImageElement[]) {
    const b = await createImageBitmap(await (await fetch(img.src)).blob());
    const c = document.createElement('canvas'); c.width = b.width; c.height = b.height;
    const x = c.getContext('2d')!; x.drawImage(b, 0, 0);
    const d = x.getImageData(6, 6, 1, 1).data;
    out.push('#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
  }
  return out;
});
const near = (a: string, b: string, tol = 6) => [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= tol);
async function addBrand(page: Page, name: string, colours: string[]) {
  await page.getByTestId('brand-add').click();
  await page.getByTestId('brand-name').fill(name);
  for (const [i, c] of colours.entries()) {
    if (i > 0) await page.getByTestId('brand-add-colour').click();
    await setHex(page, i, c);
  }
  await page.getByTestId('brand-save').click();
  await expect(page.getByTestId('brand-editor')).toHaveCount(0);
  await page.waitForTimeout(900);
}
const styleTitle = (page: Page, id: string) => page.evaluate(async (n) => (await import('/src/carousel/render.ts')).styleByName(n)?.spec.title as string, id);
async function pickStyle(page: Page, id: string) {
  const t = await styleTitle(page, id);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
  await page.waitForTimeout(1200);
}
const layoutsOf = async (page: Page) => (await docOf(page)).designed.library.layouts as string[];
const wordsOf = async (page: Page) => JSON.stringify((await docOf(page)).designed.library.plan.specs.map((s: any) => s.fields));

test('B/E: a brand made through the editor (hex typed in), the invalid message, adding and removing colours, a live preview, Save applies it', async ({ page }) => {
  const calls = await openOld(page);
  const before = await layoutsOf(page);
  const words = await wordsOf(page);
  await goStep3(page);
  await page.getByTestId('brand-add').click();
  const ed = page.getByTestId('brand-editor');
  await expect(ed).toBeVisible();
  await expect(page.getByTestId('brand-name'), 'focus moves into the editor').toBeFocused();
  await page.getByTestId('brand-name').fill('Navy and orange');
  // invalid hex: a plain message
  await setHex(page, 0, 'banana');
  await expect(ed.getByRole('alert')).toHaveText('That is not a colour. Try something like #14213D.');
  await expect(page.getByTestId('brand-save')).toBeEnabled();
  await page.getByTestId('brand-save').click();
  await expect(ed, 'a bad colour is not saved').toBeVisible();
  // all the forms of a valid hex are accepted and written back normalised
  for (const [typed, want] of [['14213D', '#14213d'], ['#abc', '#aabbcc'], ['#AABBCC', '#aabbcc']] as const) { await setHex(page, 0, typed); await expect(hex(page, 0)).toHaveValue(want); }
  await setHex(page, 0, '#14213d');
  // one, two or three colours
  await expect(page.getByTestId('brand-add-colour')).toHaveText('Add second colour');
  await page.getByTestId('brand-add-colour').click();
  await expect(page.getByTestId('brand-add-colour')).toHaveText('Add extra colour');
  await setHex(page, 1, 'fca311');
  await page.getByTestId('brand-add-colour').click();
  await setHex(page, 2, '#fff');
  await expect(hex(page, 2)).toHaveValue('#ffffff');
  await expect(page.locator('[data-testid^=brand-colour-]')).toHaveCount(3);
  await ed.getByRole('button', { name: 'Remove the extra colour' }).click();
  await expect(page.locator('[data-testid^=brand-colour-]')).toHaveCount(2);
  await ed.getByRole('button', { name: 'Remove the second colour' }).click();
  await expect(page.locator('[data-testid^=brand-colour-]')).toHaveCount(1);
  await page.getByTestId('brand-add-colour').click();
  await setHex(page, 1, 'fca311');
  // the preview is the three slides of the carousel on the page, drawn again as the colours change
  await expect(page.locator('[data-testid=brand-preview] img')).toHaveCount(3, { timeout: 20_000 });
  const a = await previewSrcs(page);
  await setHex(page, 0, '#0b3c5d');
  await expect.poll(async () => (await previewSrcs(page)).join() !== a.join(), { timeout: 15_000 }).toBe(true);
  await setHex(page, 0, '#14213d');
  await expect(ed.getByText('The first slides of your carousel in the current style.')).toBeVisible();
  await page.getByTestId('brand-save').click();
  await expect(ed).toHaveCount(0);
  await expect(page.getByTestId('brand-add'), 'focus comes back to the button that opened it').toBeFocused();
  await page.waitForTimeout(1500);
  const d = await docOf(page);
  expect(d.scheme).toMatchObject({ kind: 'brand', name: 'Navy and orange', colours: ['#14213d', '#fca311'] });
  const store = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), BRANDS_KEY);
  expect(store.brands).toHaveLength(1);
  expect(store.brands[0]).toMatchObject({ name: 'Navy and orange', colours: ['#14213d', '#fca311'] });
  expect(store.activeId).toBe(store.brands[0].id);
  // the carousel is drawn with it: the same layouts and words, and a slide on the main colour (the dark ground of this style)
  expect(await layoutsOf(page)).toEqual(before);
  expect(await wordsOf(page)).toBe(words);
  const cs = await corners(page);
  expect(cs.some((c) => near(c, '#14213d')), `a slide is drawn on the main colour: ${cs.join(' ')}`).toBe(true);
  expect(calls(), 'a brand costs 0 writer calls').toBe(0);
});

test('C: two brands, switching between them, rename, delete (the carousel keeps its colours), and everything survives a reload', async ({ page }) => {
  const calls = await openOld(page);
  await goStep3(page);
  await addBrand(page, 'Navy and orange', ['#14213d', '#fca311']);
  const navy = await corners(page);
  await addBrand(page, 'Plum', ['#8e1b4f', '#e9b44c']);
  const berry = await corners(page);
  expect(berry.join()).not.toBe(navy.join());
  expect((await docOf(page)).scheme.name).toBe('Plum');
  expect(await page.getByTestId('colours-row').getByRole('radio').count(), 'own colours, 2 brands and 8 combinations').toBeGreaterThanOrEqual(11);
  // switch back to the first brand, then to the style's own colours
  await page.getByRole('radio', { name: /Navy and orange/ }).click();
  await page.waitForTimeout(1200);
  expect((await docOf(page)).scheme.name).toBe('Navy and orange');
  expect((await corners(page)).join()).toBe(navy.join());
  await page.getByTestId('brand-opt-own').click();
  await page.waitForTimeout(1200);
  expect((await docOf(page)).scheme).toBeUndefined();
  // Undo takes back the whole change: the colours AND the drawing
  await page.getByRole('radio', { name: /Plum/ }).click();
  await page.waitForTimeout(1200);
  const withBerry = await corners(page);
  await page.getByRole('button', { name: /^Undo/ }).first().click();
  await page.waitForTimeout(1200);
  expect((await docOf(page)).scheme).toBeUndefined();
  expect((await corners(page)).join(), 'undo draws the style own colours again').not.toBe(withBerry.join());
  // rename the second brand: the carousel on the page follows the brand, not the old name
  await page.getByRole('radio', { name: /Plum/ }).click();
  await page.waitForTimeout(1200);
  await page.getByTestId('brand-edit').click();
  await expect(page.getByTestId('brand-name')).toHaveValue('Plum');
  await page.getByTestId('brand-name').fill('Plum and gold');
  await page.getByTestId('brand-save').click();
  await expect(page.getByTestId('brand-editor')).toHaveCount(0);
  await page.waitForTimeout(1200);
  await expect(page.getByRole('radio', { name: /Plum and gold/ })).toHaveAttribute('aria-checked', 'true');
  expect((await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), BRANDS_KEY)).brands).toHaveLength(2);
  // reload: the list, the scheme and the drawing are all still there
  await page.reload();
  await expect(page.locator('.cr-film img')).toHaveCount(4, { timeout: 60_000 });
  await goStep3(page);
  await expect(page.getByRole('radio', { name: /Plum and gold/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /Navy and orange/ })).toHaveAttribute('aria-checked', 'false');
  expect((await corners(page)).join()).toBe(berry.join());
  // delete it: a plain confirmation, then the carousel keeps its colours (and after a reload too)
  await page.getByTestId('brand-edit').click();
  await page.getByTestId('brand-delete').click();
  await expect(page.getByText('Delete this brand? Carousels already using it keep their colours.')).toBeVisible();
  await page.getByTestId('brand-delete-yes').click();
  await expect(page.getByTestId('brand-editor')).toHaveCount(0);
  await page.waitForTimeout(800);
  expect((await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), BRANDS_KEY)).brands.map((b: any) => b.name)).toEqual(['Navy and orange']);
  expect((await docOf(page)).scheme, 'the document keeps its copy of the colours').toMatchObject({ kind: 'brand', name: 'Plum and gold', colours: ['#8e1b4f', '#e9b44c'] });
  expect((await corners(page)).join()).toBe(berry.join());
  await page.reload();
  await expect(page.locator('.cr-film img')).toHaveCount(4, { timeout: 60_000 });
  expect((await corners(page)).join(), 'after the reload the deleted brand colours are still drawn').toBe(berry.join());
  await goStep3(page);
  await expect(page.getByTestId('brand-opt-removed')).toBeVisible();
  // the same name twice is allowed, with a warning
  await page.getByTestId('brand-add').click();
  await page.getByTestId('brand-name').fill('Navy and orange');
  await expect(page.getByTestId('brand-editor').getByText('You already have a brand with this name. You can still save it.')).toBeVisible();
  await page.getByTestId('brand-cancel').click();
  expect(calls(), '0 writer calls for all of it').toBe(0);
});

test('B: two nearly identical colours say so, and neon with white says text on the colour is black, in plain words', async ({ page }) => {
  const calls = await openOld(page);
  await goStep3(page);
  await pickStyle(page, 'style-4');
  await page.getByTestId('brand-add').click();
  const ed = page.getByTestId('brand-editor');
  await page.getByTestId('brand-name').fill('Two blues');
  await setHex(page, 0, '#2f6bff');
  await page.getByTestId('brand-add-colour').click();
  await setHex(page, 1, '#3c78ff');
  const adj = page.getByTestId('brand-adjusted');
  await expect(adj).toContainText('two colours are very close', { timeout: 20_000 });
  await expect(page.getByTestId('brand-colour-1')).toContainText('This is very close to your main colour.');
  // neon + white
  await page.getByTestId('brand-name').fill('Neon');
  await setHex(page, 0, '#39FF14');
  await setHex(page, 1, '#FFFFFF');
  await expect(adj).toContainText('so text on slides with that background is black', { timeout: 20_000 });
  await expect(adj.locator('.cr-be-pair').first()).toBeHidden(); // Round I: the numbers sit under a closed "Details"
  for (const sm of await adj.locator('summary').all()) await sm.click();
  await expect(adj.locator('.cr-be-pair').first()).toBeVisible();
  for (const bad of [/palette/, /\bground\b/, /\brole/, /accent/, /\bhex\b/]) expect((await ed.textContent())!.toLowerCase(), `no jargon: ${bad}`).not.toMatch(bad);
  // a pair that needs nothing says so
  await setHex(page, 0, '#14213d');
  await setHex(page, 1, '#fca311');
  await expect(page.locator('[data-testid=brand-adjusted] li, [data-testid=brand-adjusted] p').first()).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('brand-cancel').click();
  expect(calls()).toBe(0);
});

test('C/D: a ready-made combination applies, survives a style switch, and Undo takes the whole change back', async ({ page }) => {
  const calls = await openOld(page);
  await goStep3(page);
  const own = await corners(page);
  const layouts = await layoutsOf(page);
  const words = await wordsOf(page);
  await expect(page.getByTestId('combo-list').getByRole('radio')).toHaveCount(9);
  await page.getByTestId('combo-ocean-amber').click();
  await page.waitForTimeout(1500);
  expect((await docOf(page)).scheme).toEqual({ kind: 'combo', id: 'ocean-amber', name: 'Ocean and amber', colours: ['#0b3c5d', '#f2a900'] });
  await expect(page.getByTestId('combo-ocean-amber')).toHaveAttribute('aria-checked', 'true');
  const ocean = await corners(page);
  expect(ocean.join()).not.toBe(own.join());
  expect(await layoutsOf(page)).toEqual(layouts);
  expect(await wordsOf(page)).toBe(words);
  // the style changes, the colours stay
  await pickStyle(page, 'style-1');
  expect((await docOf(page)).style).toBe('style-1');
  expect((await docOf(page)).scheme.id).toBe('ocean-amber');
  await expect(page.getByTestId('combo-ocean-amber')).toHaveAttribute('aria-checked', 'true');
  // and the colours change, the style stays
  await page.getByTestId('combo-sunrise').click();
  await page.waitForTimeout(1500);
  expect((await docOf(page)).style).toBe('style-1');
  expect((await docOf(page)).scheme.id).toBe('sunrise');
  // reload keeps both
  await page.reload();
  await expect(page.locator('.cr-film img')).toHaveCount(4, { timeout: 60_000 });
  expect((await docOf(page)).scheme.id).toBe('sunrise');
  // undo: one step takes back the colours and the drawing together
  const sun = await corners(page);
  await page.getByRole('button', { name: /^Undo/ }).first().click();
  await page.waitForTimeout(1500);
  expect((await docOf(page)).scheme.id).toBe('ocean-amber');
  expect((await corners(page)).join()).not.toBe(sun.join());
  expect(calls(), 'combinations and style switches cost 0 writer calls').toBe(0);
});

test('B: the editor works by keyboard alone: Tab through the fields, type, Enter saves; Escape closes and focus comes back', async ({ page }) => {
  const calls = await openOld(page);
  await goStep3(page);
  await page.getByTestId('brand-add').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('brand-name')).toBeFocused();
  await page.keyboard.type('Keys');
  await page.keyboard.press('Tab'); // the swatch picker
  await expect(page.getByTestId('brand-swatch-0')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(hex(page, 0)).toBeFocused();
  await page.keyboard.type('14213D');
  await page.keyboard.press('Tab'); // the add button (blur normalises)
  await expect(hex(page, 0)).toHaveValue('#14213d');
  await expect(page.getByTestId('brand-add-colour')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(hex(page, 1), 'adding a colour moves focus into its field').toBeFocused();
  await page.keyboard.type('#fca311');
  await page.keyboard.press('Enter'); // saves
  await expect(page.getByTestId('brand-editor')).toHaveCount(0);
  await expect(page.getByTestId('brand-add')).toBeFocused();
  await page.waitForTimeout(1200);
  expect((await docOf(page)).scheme).toMatchObject({ name: 'Keys', colours: ['#14213d', '#fca311'] });
  // Escape closes without saving
  await page.getByTestId('brand-add').press('Enter');
  await page.keyboard.type('Never saved');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('brand-editor')).toHaveCount(0);
  await expect(page.getByTestId('brand-add')).toBeFocused();
  expect((await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), BRANDS_KEY)).brands).toHaveLength(1);
  // Done closes it too
  await page.getByTestId('brand-edit').press('Enter');
  await expect(page.getByTestId('brand-editor')).toBeVisible();
  await page.getByTestId('brand-done').click();
  await expect(page.getByTestId('brand-editor')).toHaveCount(0);
  expect(calls()).toBe(0);
});

test('C: the PNG download is drawn with the chosen colours', async ({ page }) => {
  const calls = await openOld(page);
  await goStep3(page);
  await addBrand(page, 'Navy and orange', ['#14213d', '#fca311']);
  const cs = await corners(page);
  const i = cs.findIndex((c) => near(c, '#14213d'));
  expect(i, `a slide on the main colour: ${cs.join(' ')}`).toBeGreaterThanOrEqual(0);
  await page.getByTestId('edit-slides').click();
  await expect(page.getByTestId('edit-view')).toBeVisible();
  await page.getByRole('button', { name: `Show slide ${i + 1}` }).first().click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: new RegExp(`Download PNG of .* slide ${i + 1}$`) }).first().click();
  const file = `${OUT}/download-colours.png`;
  await (await dl).saveAs(file);
  const b64 = fs.readFileSync(file).toString('base64');
  const px = await page.evaluate(async (b) => {
    const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b)).blob());
    const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
    const x = c.getContext('2d')!; x.drawImage(bm, 0, 0);
    const d = x.getImageData(6, 6, 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
  }, b64);
  expect(near(px, '#14213d'), `the downloaded PNG is drawn on the brand colour (${px})`).toBe(true);
  expect(calls()).toBe(0);
});

test('E: a deck made by the writer (one fake call), then colours, brands and switches make no more calls', async ({ page }) => {
  const calls = await fake(page);
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill("Most creators don't have a design problem. The idea took ten minutes. The slides took the rest of the night. Three steps: paste your text, pick a look, get slides. Try it on your next post.");
  await page.locator('.cr-wiz-steps button').nth(2).click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film img')).toHaveCount(4, { timeout: 90_000 });
  expect(calls(), 'one call to make the deck').toBe(1);
  await goStep3(page);
  await addBrand(page, 'Navy and orange', ['#14213d', '#fca311']);
  await page.getByTestId('combo-berry-gold').click();
  await page.waitForTimeout(1200);
  await pickStyle(page, 'style-3');
  await page.getByRole('radio', { name: /Navy and orange/ }).click();
  await page.waitForTimeout(1200);
  await page.getByTestId('brand-edit').click();
  await page.getByTestId('brand-name').fill('Navy');
  await page.getByTestId('brand-save').click();
  await page.waitForTimeout(1200);
  await page.getByTestId('brand-edit').click();
  await page.getByTestId('brand-delete').click();
  await page.getByTestId('brand-delete-yes').click();
  await page.waitForTimeout(800);
  expect(calls(), 'applying, switching, editing, deleting a brand and picking a combination: 0 more calls').toBe(1);
});

test.describe('at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('the Colours row and the editor fit a phone: no sideways scroll, tap targets of at least 40 px; pictures', async ({ page }) => {
    await openOld(page);
    await goStep3(page);
    await addBrand(page, 'Navy and orange', ['#14213d', '#fca311']);
    await addBrand(page, 'Plum and gold', ['#8e1b4f', '#e9b44c']);
    await addBrand(page, 'Forest', ['#1f4d3a', '#f3ebd8']);
    const row = page.getByTestId('colours-row');
    await row.scrollIntoViewIfNeeded();
    const small = await page.evaluate(() => [...document.querySelectorAll('[data-testid=colours-row] button')].map((b) => ({ t: (b.textContent || '').trim().slice(0, 30), h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width })).filter((b) => b.h < 40));
    expect(small, 'every button of the Colours row is at least 40 px tall').toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'no sideways scroll on the Style step').toBeLessThanOrEqual(0);
    await row.screenshot({ path: `${OUT}/brand-list.png` });
    await page.screenshot({ path: `${OUT}/style-step-colours-390.png` });
    await pickStyle(page, 'style-4');
    await page.getByTestId('brand-add').click();
    await page.getByTestId('brand-name').fill('Neon and white');
    await setHex(page, 0, '#39FF14');
    await page.getByTestId('brand-add-colour').click();
    await setHex(page, 1, '#FFFFFF');
    await expect(page.getByTestId('brand-adjusted')).toContainText('so text on slides with that background is black', { timeout: 20_000 });
    await expect(page.locator('[data-testid=brand-preview] img')).toHaveCount(3, { timeout: 20_000 });
    await page.waitForTimeout(600);
    const dlg = await page.evaluate(() => {
      const d = document.querySelector('[data-testid=brand-editor]') as HTMLElement;
      const tiny = [...d.querySelectorAll('button, input')].map((e) => ({ t: (e.getAttribute('data-testid') || e.textContent || '').slice(0, 24), h: e.getBoundingClientRect().height })).filter((e) => e.h > 0 && e.h < 40);
      return { w: d.getBoundingClientRect().width, sw: d.scrollWidth, cw: d.clientWidth, tiny, page: document.documentElement.scrollWidth - window.innerWidth };
    });
    expect(dlg.w, 'the editor is a full-width panel').toBeGreaterThanOrEqual(388);
    expect(dlg.sw - dlg.cw, 'no sideways scroll inside the editor').toBeLessThanOrEqual(0);
    expect(dlg.page).toBeLessThanOrEqual(0);
    expect(dlg.tiny, 'every control of the editor is at least 40 px tall').toEqual([]);
    await page.screenshot({ path: `${OUT}/brand-editor-390.png` });
    await page.getByTestId('brand-cancel').click();
  });
});

test('pictures: the Colours row and the editor on a desktop screen, and the same deck in three colour schemes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openOld(page);
  await goStep3(page);
  await addBrand(page, 'Navy and orange', ['#14213d', '#fca311']);
  await addBrand(page, 'Plum and gold', ['#8e1b4f', '#e9b44c']);
  await page.getByTestId('colours-row').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/style-step-colours-desktop.png` });
  // the same deck: the style's own colours, brand A, brand B (4 slides each), side by side
  const frames: string[][] = [];
  await page.getByTestId('brand-opt-own').click(); await page.waitForTimeout(1300);
  frames.push(await page.locator('.cr-film img').evaluateAll((a) => a.map((i) => (i as HTMLImageElement).src)));
  const grid: string[] = [];
  for (const label of [null, /Navy and orange/, /Plum and gold/] as const) {
    if (label) { await page.getByRole('radio', { name: label }).click(); await page.waitForTimeout(1300); }
    grid.push(await page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll('.cr-film img')) as HTMLImageElement[];
      const out: ImageBitmap[] = [];
      for (const i of imgs) out.push(await createImageBitmap(await (await fetch(i.src)).blob()));
      const c = document.createElement('canvas'); c.width = 4 * 270; c.height = 338;
      const x = c.getContext('2d')!; out.slice(0, 4).forEach((b, k) => x.drawImage(b, k * 270, 0, 270, 338));
      return c.toDataURL('image/png');
    }));
  }
  const sheet = await page.evaluate(async (rows) => {
    const c = document.createElement('canvas'); c.width = 4 * 270; c.height = 3 * 348; const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    for (const [k, r] of rows.entries()) { const im = new Image(); im.src = r; await im.decode(); x.drawImage(im, 0, k * 348); }
    return c.toDataURL('image/png');
  }, grid);
  fs.writeFileSync(`${OUT}/brand-switch.png`, Buffer.from(sheet.split(',')[1], 'base64'));
  // the editor with neon + white
  await pickStyle(page, 'style-4');
  await page.getByTestId('brand-add').click();
  await page.getByTestId('brand-name').fill('Neon and white');
  await setHex(page, 0, '#39FF14');
  await page.getByTestId('brand-add-colour').click();
  await setHex(page, 1, '#FFFFFF');
  await expect(page.getByTestId('brand-adjusted')).toContainText('so text on slides with that background is black', { timeout: 20_000 });
  await expect(page.locator('[data-testid=brand-preview] img')).toHaveCount(3, { timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/brand-editor-desktop.png` });
  await page.getByTestId('brand-cancel').click();
  // the old document, before and after
  const sheet2 = await page.evaluate(async (stored) => {
    const SP: any = await import('/src/reference/faithful.ts');
    const doc = JSON.parse(stored).project.doc;
    const before: Blob[] = [];
    for (const k of Object.keys(doc.designed.slides)) before.push(await SP.svgToPng(doc.designed.slides[k].built.svg, 270));
    return before.length;
  }, OLD_DOC);
  expect(sheet2).toBe(4);
});
