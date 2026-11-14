// Round I part D: one brand store. A FAKE writer only: ZERO real model calls.
// The brands live in creator.brand-workspaces.v1 (the Branding page's list, now with colours) and creator.brand-workspaces.active.v1 (the active one).
// creator.brands.v1 (Round H's own list) is only read, once, and never changed or deleted.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(5 * 60_000);
const DOC_KEY = 'creator.carousel.project.v1';
const BRANDS_KEY = 'creator.brands.v1';
const WS = 'creator.brand-workspaces.v1';
const ACTIVE = 'creator.brand-workspaces.active.v1';
const MARK = 'creator.brands.migrated.v1';
const OLD_DOC = fs.readFileSync('tests/image-engine/fixtures/old-doc-no-scheme.json', 'utf8');

const OLD_STORE = { brands: [{ id: 'bold1', name: 'Navy and orange', colours: ['#14213d', '#fca311'], createdAt: 11 }, { id: 'bold2', name: 'Plum and gold', colours: ['#8E1B4F', '#e9b44c', 'zzz'], styleId: 'style-3', createdAt: 22 }], activeId: 'bold2' };
const WS_ONLY = [
  { id: 'brand-w1', name: 'Studio One', websiteName: 'Studio One', websiteUrl: 'https://one.example', colours: ['#0f9b8e'], products: [{ id: 'p', name: 'Thing', description: '', link: '' }], competitors: [] },
  { id: 'brand-w2', name: 'No colours yet' },
];

/** A counting fake writer (any call is a failure of the "0 writer calls" rule). */
async function fake(page: Page) {
  let calls = 0;
  await page.route('**/api/carousel/status', (x) => x.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__carousel/status', (x) => x.fulfill({ json: { available: true } }));
  const w = (x: any) => { calls++; return x.fulfill({ json: { text: '{}', ms: 5 } }); };
  await page.route('**/__carousel/write', w);
  await page.route('**/api/carousel/write', w);
  return () => calls;
}
const docOf = (page: Page) => page.evaluate((k) => { const t = localStorage.getItem(k); return t ? JSON.parse(t).project.doc : null; }, DOC_KEY);
async function openOld(page: Page, brands?: unknown) {
  const calls = await fake(page);
  await page.addInitScript(([k, v, bk, bv]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k as string, v as string); if (bv) localStorage.setItem(bk as string, bv as string); sessionStorage.setItem('seeded', '1'); } }, [DOC_KEY, OLD_DOC, BRANDS_KEY, brands ? JSON.stringify(brands) : ''] as const);
  await page.goto('/images/carousel');
  await expect(page.locator('.cr-film img')).toHaveCount(4, { timeout: 60_000 });
  await page.waitForTimeout(500);
  return calls;
}
const goStep3 = async (page: Page) => { await page.locator('.cr-wiz-steps button').nth(2).click(); await expect(page.getByTestId('colours-row')).toBeVisible(); };
const hex = (page: Page, i: number) => page.getByTestId(`brand-hex-${i}`);
const setHex = async (page: Page, i: number, v: string) => { await hex(page, i).fill(v); await hex(page, i).blur(); };
const storedWs = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]') as any[], WS);
const raw = (page: Page, k: string) => page.evaluate((key) => localStorage.getItem(key), k);
async function addBrandUi(page: Page, name: string, colours: string[]) {
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

/** A page at the carousel (no document), storage cleared, then `seed` written before the code under test runs. */
async function bare(page: Page, seed: Record<string, string> = {}) {
  await fake(page);
  await page.goto('/images/carousel');
  await page.evaluate((s) => { localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, seed);
}
/** Runs `code` in the page with B (brandStore), W (workspace) and C (colourSchemes). */
const mod = (page: Page, code: string): Promise<any> => page.evaluate(async (src) => {
  const B: any = await import('/src/carousel/brandStore.ts');
  const W: any = await import('/src/pages/branding/workspace.ts');
  const C: any = await import('/src/carousel/colourSchemes.ts');
  // eslint-disable-next-line no-new-func
  return await new Function('B', 'W', 'C', `return (async () => { ${src} })()`)(B, W, C);
}, code);

test('D: migration from old data: only creator.brands.v1, only the Branding list, and both', async ({ page }) => {
  // 1. only the old list
  await bare(page, { [BRANDS_KEY]: JSON.stringify(OLD_STORE) });
  const a = await mod(page, 'return B.loadBrands();');
  expect(a.brands.map((b: any) => [b.id, b.name, b.colours, b.createdAt, b.styleId])).toEqual([['bold1', 'Navy and orange', ['#14213d', '#fca311'], 11, undefined], ['bold2', 'Plum and gold', ['#8e1b4f', '#e9b44c'], 22, 'style-3']]);
  expect(a.activeId, 'the old active brand is still active').toBe('bold2');
  const list = JSON.parse((await raw(page, WS))!);
  expect(list.map((w: any) => w.id)).toEqual(['bold1', 'bold2']);
  expect(list[0].products, 'a migrated brand has the empty profile').toEqual([]);
  expect(await raw(page, MARK)).toBe('1');
  expect(await raw(page, BRANDS_KEY), 'the old key is never changed or deleted').toBe(JSON.stringify(OLD_STORE));
  // 2. only the Branding list (with and without colours, one with damaged colours)
  await bare(page, { [WS]: JSON.stringify([...WS_ONLY, { id: 'brand-w3', name: 'Damaged', colours: ['#12', 'red'] }]) });
  const b = await mod(page, 'return B.loadBrands();');
  expect(b.brands.map((x: any) => [x.id, x.colours])).toEqual([['brand-w1', ['#0f9b8e']], ['brand-w2', []], ['brand-w3', []]]);
  expect(b.activeId).toBeNull();
  expect(await raw(page, MARK), 'nothing to migrate, nothing marked').toBeNull();
  const w = await mod(page, 'return W.readWorkspaces();');
  expect(w[0].products, 'the profile of a brand is kept').toHaveLength(1);
  expect(w[1].websiteUrl, 'missing fields are repaired').toBe('');
  // 3. both: the Branding list wins, the old brands are added, a brand that is in both is not doubled
  await bare(page, { [WS]: JSON.stringify([{ id: 'bold1', name: 'Navy and orange', colours: ['#14213d', '#fca311'] }, ...WS_ONLY]), [BRANDS_KEY]: JSON.stringify(OLD_STORE), [ACTIVE]: 'brand-w1' });
  const c = await mod(page, 'return B.loadBrands();');
  expect(c.brands.map((x: any) => x.id)).toEqual(['bold1', 'brand-w1', 'brand-w2', 'bold2']);
  expect(c.activeId, 'the Branding page active brand is kept').toBe('brand-w1');
  // 4. a hand-made id that another brand already has: the old brand comes in under a new id, nothing is lost
  await bare(page, { [WS]: JSON.stringify([{ id: 'b1', name: 'Maya Rao' }]), [BRANDS_KEY]: JSON.stringify({ brands: [{ id: 'b1', name: 'Navy', colours: ['#14213d'], createdAt: 1 }], activeId: 'b1' }) });
  const d = await mod(page, 'return B.loadBrands();');
  expect(d.brands.map((x: any) => [x.name, x.colours])).toEqual([['Maya Rao', []], ['Navy', ['#14213d']]]);
  expect(d.brands[1].id).not.toBe('b1');
  expect(d.activeId).toBe(d.brands[1].id);
});

test('D: the migration is idempotent, never brings a deleted brand back, and survives broken storage', async ({ page }) => {
  await bare(page, { [BRANDS_KEY]: JSON.stringify(OLD_STORE) });
  await mod(page, 'return W.migrateOldBrands();');
  const once = await raw(page, WS);
  expect(await mod(page, 'return W.migrateOldBrands();'), 'the second run adds nothing').toBe(false);
  expect(await raw(page, WS), 'and changes nothing').toBe(once);
  // even with the marker gone the content is not doubled
  await page.evaluate((k) => localStorage.removeItem(k), MARK);
  await mod(page, 'return W.migrateOldBrands();');
  expect(await raw(page, WS)).toBe(once);
  // a brand deleted afterwards does not come back from the old key
  await mod(page, 'return B.deleteBrand("bold1");');
  expect(await mod(page, 'return B.loadBrands().brands.map((b) => b.id);')).toEqual(['bold2']);
  // damaged storage: never a crash
  for (const bad of ['{not json', '42', 'null', '{"a":1}', '[1,"x",null,{"id":3},{"id":"ok","name":"Fine","colours":["#abc"]}]']) {
    await bare(page, { [WS]: bad });
    const r = await mod(page, 'return B.loadBrands();');
    expect(Array.isArray(r.brands), bad).toBe(true);
    if (bad.startsWith('[1')) expect(r.brands.map((b: any) => [b.id, b.colours])).toEqual([['ok', ['#aabbcc']]]);
    else expect(r.brands, bad).toEqual([]);
  }
  // storage that throws: reads are empty, writes say no, and the old brands come in once storage works again
  await bare(page, { [BRANDS_KEY]: JSON.stringify(OLD_STORE) });
  const blocked = await mod(page, `
    const proto = Object.getPrototypeOf(localStorage); const g = proto.getItem; const s = proto.setItem;
    proto.getItem = () => { throw new Error('blocked'); }; proto.setItem = () => { throw new Error('blocked'); };
    try { return { load: B.loadBrands(), save: B.saveBrands({ brands: [], activeId: null }), upsert: B.upsertBrand({ name: 'X', colours: ['#123456'] }).saved, migrate: W.migrateOldBrands(), active: B.setActiveBrand('x').activeId }; }
    finally { proto.getItem = g; proto.setItem = s; }`);
  expect(blocked).toEqual({ load: { brands: [], activeId: null }, save: false, upsert: false, migrate: false, active: null });
  expect(await raw(page, MARK), 'a failed migration is not marked as done').toBeNull();
  expect((await mod(page, 'return B.loadBrands();')).brands).toHaveLength(2);
  // only the write fails: not marked, the old key is still there to try again
  await bare(page, { [BRANDS_KEY]: JSON.stringify(OLD_STORE) });
  const half = await mod(page, `
    const proto = Object.getPrototypeOf(localStorage); const s = proto.setItem;
    proto.setItem = () => { throw new Error('full'); };
    try { return W.migrateOldBrands(); } finally { proto.setItem = s; }`);
  expect(half).toBe(false);
  expect(await raw(page, MARK)).toBeNull();
  expect(await raw(page, BRANDS_KEY)).toBe(JSON.stringify(OLD_STORE));
  expect((await mod(page, 'return B.loadBrands();')).brands).toHaveLength(2);
});

test('D: a carousel keeps its colours after its brand is deleted, and a deleted brand stays gone', async ({ page }) => {
  const calls = await openOld(page, OLD_STORE);
  await goStep3(page);
  await page.getByTestId('brand-opt-bold1').click();
  await page.waitForTimeout(1500);
  const before = (await docOf(page)).designed.slides;
  expect((await docOf(page)).scheme).toMatchObject({ kind: 'brand', id: 'bold1', colours: ['#14213d', '#fca311'] });
  await page.getByTestId('brand-edit').click();
  await page.getByTestId('brand-delete').click();
  await page.getByTestId('brand-delete-yes').click();
  await expect(page.getByTestId('brand-editor')).toHaveCount(0);
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('brand-opt-bold1')).toHaveCount(0);
  await expect(page.getByTestId('brand-opt-removed')).toBeVisible();
  const after = await docOf(page);
  expect(after.scheme, 'the carousel keeps its colours').toMatchObject({ kind: 'brand', id: 'bold1', colours: ['#14213d', '#fca311'] });
  expect(JSON.stringify(after.designed.slides), 'and its drawing').toBe(JSON.stringify(before));
  await page.reload();
  await expect(page.locator('.cr-film img')).toHaveCount(4, { timeout: 60_000 });
  expect(await mod(page, 'return B.loadBrands().brands.map((b) => b.id);'), 'still gone after a reload (the old key does not bring it back)').toEqual(['bold2']);
  expect((await docOf(page)).scheme.colours).toEqual(['#14213d', '#fca311']);
  expect(calls()).toBe(0);
});

test('D: the Style step and the Branding page show the same brands and the same active brand; colours edited on one appear on the other and survive a reload', async ({ page }) => {
  const calls = await openOld(page, OLD_STORE);
  await goStep3(page);
  await expect(page.getByTestId('brand-opt-bold1')).toBeVisible();
  await expect(page.getByTestId('brand-opt-bold2')).toBeVisible();
  // a brand added on the Style step is on the Branding page too, and it is the active one there
  await addBrandUi(page, 'Teal studio', ['#0f9b8e', '#ff6b5b']);
  await page.goto('/branding?tab=kit');
  const lib = page.getByRole('region', { name: 'Brand kits' });
  await expect(lib.getByRole('button', { name: /Navy and orange/ })).toBeVisible();
  await expect(lib.getByRole('button', { name: /Plum and gold/ })).toBeVisible();
  await expect(lib.getByRole('button', { name: /Teal studio/ })).toHaveAttribute('aria-pressed', 'true');
  const card = page.getByTestId('brand-colours-card');
  await expect(page.getByTestId('bc-hex-0')).toHaveValue('#0f9b8e');
  await expect(page.getByTestId('bc-hex-1')).toHaveValue('#ff6b5b');
  // edit the colours on the Branding page (a short hex is accepted, a wrong one says so), reload, they are still there
  await page.getByTestId('bc-hex-0').fill('#abc');
  await page.getByTestId('bc-hex-0').blur();
  await page.getByTestId('bc-hex-2').fill('nope');
  await page.getByTestId('bc-hex-2').blur();
  await expect(card.getByRole('alert')).toHaveText('That is not a colour. Try something like #14213D.');
  await page.getByTestId('bc-hex-2').fill('#112233');
  await page.getByTestId('bc-hex-2').blur();
  await expect(card.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('bc-hex-0')).toHaveValue('#aabbcc');
  await expect(page.getByTestId('bc-hex-2')).toHaveValue('#112233');
  expect((await storedWs(page)).find((w: any) => w.name === 'Teal studio').colours).toEqual(['#aabbcc', '#ff6b5b', '#112233']);
  // pick the other brand on the Branding page: it is the active brand for the Style step
  await lib.getByRole('button', { name: /Plum and gold/ }).click();
  expect(await raw(page, ACTIVE)).toBe('bold2');
  // the Style step shows the colours from the Branding page
  await page.goto('/images/carousel');
  await expect(page.locator('.cr-film img')).toHaveCount(4, { timeout: 60_000 });
  await goStep3(page);
  const sw = await page.getByTestId('colours-row').getByRole('radio', { name: /Teal studio/ }).locator('.cr-sw').evaluateAll((a) => a.map((e) => getComputedStyle(e).backgroundColor));
  expect(sw).toEqual(['rgb(170, 187, 204)', 'rgb(255, 107, 91)', 'rgb(17, 34, 51)']);
  // edit on the Style step; the Branding page shows it
  await page.getByTestId('brand-opt-bold2').click();
  await page.waitForTimeout(1200);
  await page.getByTestId('brand-edit').click();
  await setHex(page, 0, '#2f6bff');
  await page.getByTestId('brand-save').click();
  await expect(page.getByTestId('brand-editor')).toHaveCount(0);
  await page.waitForTimeout(900);
  await page.goto('/branding?tab=kit');
  await expect(page.getByRole('region', { name: 'Brand kits' }).getByRole('button', { name: /Plum and gold/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('bc-hex-0')).toHaveValue('#2f6bff');
  expect(calls()).toBe(0);
});

test('D: a brand made on the Branding page has no colours yet: the Style step offers it, a click opens the editor, and the colours it is given are used', async ({ page }) => {
  const calls = await openOld(page);
  await page.evaluate(([k]) => localStorage.setItem(k, JSON.stringify([{ id: 'brand-x', name: 'From Branding' }])), [WS]);
  await page.reload();
  await expect(page.locator('.cr-film img')).toHaveCount(4, { timeout: 60_000 });
  await goStep3(page);
  const opt = page.getByTestId('brand-opt-brand-x');
  await expect(opt).toContainText('From Branding (add colours)');
  await opt.click();
  await expect(page.getByTestId('brand-editor')).toBeVisible();
  await setHex(page, 0, '#0f9b8e');
  await page.getByTestId('brand-save').click();
  await expect(page.getByTestId('brand-editor')).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect((await docOf(page)).scheme).toMatchObject({ kind: 'brand', id: 'brand-x', name: 'From Branding', colours: ['#0f9b8e'] });
  expect((await storedWs(page))[0].id, 'the same workspace, not a new one').toBe('brand-x');
  expect(calls()).toBe(0);
});

test('D: a new carousel starts with the brand that is active on the Branding page', async ({ page }) => {
  await fake(page);
  await page.addInitScript(([k, v, a]) => { if (!sessionStorage.getItem('s')) { localStorage.setItem(k as string, v as string); localStorage.setItem(a as string, 'brand-w1'); sessionStorage.setItem('s', '1'); } }, [WS, JSON.stringify(WS_ONLY), ACTIVE] as const);
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill('A first line');
  await page.waitForTimeout(800);
  expect((await docOf(page)).scheme).toEqual({ kind: 'brand', id: 'brand-w1', name: 'Studio One', colours: ['#0f9b8e'] });
});

test('D: an old-format carousel (no scheme) loads and draws with 0 differing pixels', async ({ page }) => {
  const calls = await openOld(page);
  const stored = JSON.parse(OLD_DOC).project.doc;
  const r = await page.evaluate(async (doc) => {
    const SP: any = await import('/src/reference/faithful.ts');
    const diffs: number[] = [];
    const imgs = Array.from(document.querySelectorAll('.cr-film img')) as HTMLImageElement[];
    const px = (b: ImageBitmap) => { const t = document.createElement('canvas'); t.width = 270; t.height = 338; const x = t.getContext('2d')!; x.drawImage(b, 0, 0, 270, 338); return x.getImageData(0, 0, 270, 338).data; };
    for (const [n, k] of Object.keys(doc.designed.slides).entries()) {
      const a = px(await createImageBitmap(await SP.svgToPng(doc.designed.slides[k].built.svg, 1080)));
      const b = px(await createImageBitmap(await (await fetch(imgs[n].src)).blob()));
      let d = 0; for (let j = 0; j < a.length; j += 4) if (Math.abs(a[j] - b[j]) > 8 || Math.abs(a[j + 1] - b[j + 1]) > 8 || Math.abs(a[j + 2] - b[j + 2]) > 8) d++;
      diffs.push(d);
    }
    return diffs;
  }, stored);
  expect(r, 'differing pixels per slide').toEqual([0, 0, 0, 0]);
  expect((await docOf(page)).scheme).toBeUndefined();
  expect(calls()).toBe(0);
});
