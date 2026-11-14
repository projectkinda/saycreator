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
