// Round I: brand polish. A FAKE writer only: ZERO real model calls. Pictures and files: out/round-i/.
// Part A: the "What we adjusted" list in plain words, the numbers under "Details". Part B: one "Add brand" control, a two-column grid of ready-made colours, a readable preview at 390 px.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(5 * 60_000);
const OUT = 'out/round-i';
fs.mkdirSync(OUT, { recursive: true });
const DOC_KEY = 'creator.carousel.project.v1';
const BRANDS_KEY = 'creator.brands.v1';
const OLD_DOC = fs.readFileSync('tests/image-engine/fixtures/old-doc-no-scheme.json', 'utf8');

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
const styleTitle = (page: Page, id: string) => page.evaluate(async (n) => (await import('/src/carousel/render.ts')).styleByName(n)?.spec.title as string, id);
async function pickStyle(page: Page, id: string) {
  const t = await styleTitle(page, id);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
  await page.waitForTimeout(1200);
}
const NAVY = { brands: [{ id: 'b1', name: 'Navy and orange', colours: ['#14213d', '#fca311'], createdAt: 1 }, { id: 'b2', name: 'Plum and gold', colours: ['#8e1b4f', '#e9b44c'], createdAt: 2 }], activeId: null };

/** Two PNG buffers side by side in one picture. */
async function sideBySide(page: Page, a: Buffer, b: Buffer, file: string) {
  const png = await page.evaluate(async ([x, y]) => {
    const load = async (s: string) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; };
    const [ia, ib] = [await load(x), await load(y)];
    const c = document.createElement('canvas'); c.width = ia.width + ib.width + 24; c.height = Math.max(ia.height, ib.height);
    const g = c.getContext('2d')!; g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height); g.drawImage(ia, 0, 0); g.drawImage(ib, ia.width + 24, 0);
    return c.toDataURL('image/png').split(',')[1];
  }, [a.toString('base64'), b.toString('base64')]);
  fs.writeFileSync(file, Buffer.from(png, 'base64'));
}

test.describe('at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('A: the adjusted list says it in plain words (no colour codes, no ratios) and keeps the numbers under a closed Details', async ({ page }) => {
    const calls = await openOld(page);
    await goStep3(page);
    await page.getByTestId('brand-add').click();
    const ed = page.getByTestId('brand-editor');
    await page.getByTestId('brand-name').fill('Neon and white');
    await setHex(page, 0, '#39FF14');
    await page.getByTestId('brand-add-colour').click();
    await setHex(page, 1, '#FFFFFF');
    const adj = page.getByTestId('brand-adjusted');
    await expect(adj).toContainText('too bright for text on light slides', { timeout: 20_000 });
    await expect(page.locator('[data-testid=brand-preview] img')).toHaveCount(3, { timeout: 20_000 });
    // 1. the sentences
    const lines = await adj.locator('li > span.small').allTextContents();
    expect(lines.length, 'neon with white has at least two reasons').toBeGreaterThanOrEqual(2);
    for (const t of lines) {
      expect(t, `no colour code in: ${t}`).not.toMatch(/#[0-9a-f]{3,6}/i);
      expect(t, `no ratio in: ${t}`).not.toMatch(/\d(\.\d)?\s*:\s*1\b/);
      expect(t, `one short sentence: ${t}`).toMatch(/^[A-Z][^.]*\.$/);
      expect(t.length, 'short').toBeLessThan(170);
    }
    expect(lines.some((t) => /Your main colour is too bright for text on light slides, so highlighted words sit on a bar of it with black text\./.test(t))).toBe(true);
    // 2. the numbers are under "Details", closed by default
    expect(await adj.locator('details[open]').count(), 'Details are closed').toBe(0);
    await adj.evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => { const d = document.querySelector('[data-testid=brand-editor]') as HTMLElement; d.scrollTop = Math.max(0, d.scrollTop - 40); });
    await page.waitForTimeout(200);
    const closed = await page.screenshot();
    // Round J: ONE Details fold for the whole list
    await expect(adj.locator('details')).toHaveCount(1);
    const first = adj.locator('details').first();
    await first.locator('summary').click();
    await expect(first.locator('.cr-be-detail').first()).toBeVisible();
    await expect(first.locator('.cr-be-detail').first()).toContainText(/#[0-9A-F]{6}/i);
    await expect(first.locator('.cr-be-detail').first()).toContainText(/\d:1/);
    const open = await page.screenshot();
    for (const sm of await adj.locator('summary').all()) if (!(await sm.evaluate((e) => (e.parentElement as HTMLDetailsElement).open))) await sm.click();
    await expect(adj.locator('.cr-be-pair').first(), 'a line that changed a colour shows from and to swatches').toBeVisible();
    await sideBySide(page, closed, open, `${OUT}/adjusted-390.png`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    // every summary is a tap target of at least 40 px
    const sm = await adj.locator('summary').evaluateAll((a) => a.map((s) => s.getBoundingClientRect().height));
    for (const h of sm) expect(h).toBeGreaterThanOrEqual(40);
    // 3. the empty state and the "two colours are close" message stay, in the same tone
    // a pair that needs nothing (style 6 keeps these two as they are) says so
    await page.getByTestId('brand-cancel').click();
    await pickStyle(page, 'style-6');
    await page.getByTestId('brand-add').click();
    await setHex(page, 0, '#c0392b');
    await page.getByTestId('brand-add-colour').click();
    await setHex(page, 1, '#2c3e50');
    await expect(adj).toContainText('Your colours work as they are.', { timeout: 20_000 });
    await expect(adj.locator('details')).toHaveCount(0);
    await setHex(page, 0, '#2f6bff');
    await setHex(page, 1, '#3c78ff');
    await expect(adj).toContainText('Your two colours are very close, so we used your main colour on its own.', { timeout: 20_000 });
    expect(await ed.getByText(/Details/).count()).toBeGreaterThan(0);
    await page.getByTestId('brand-cancel').click();
    expect(calls()).toBe(0);
  });

  test('B: one Add brand control, Edit brand only while a brand is in use, a two-column grid of ready-made colours, a readable preview; pictures', async ({ page }) => {
    const calls = await openOld(page, NAVY);
    await goStep3(page);
    const row = page.getByTestId('colours-row');
    // one "Add brand" control (the chip and the button were one thing twice)
    await expect(row.getByRole('button', { name: /^Add brand/ })).toHaveCount(1);
    await expect(row.getByRole('radio', { name: /Add brand/ })).toHaveCount(0);
    // "Edit brand" only while a brand is in use
    await expect(page.getByTestId('brand-edit')).toHaveCount(0);
    await page.getByTestId('brand-opt-b1').click();
    await page.waitForTimeout(1200);
    await expect(page.getByTestId('brand-edit')).toBeVisible();
    await page.getByTestId('brand-opt-own').click();
    await page.waitForTimeout(1200);
    await expect(page.getByTestId('brand-edit')).toHaveCount(0);
    await page.getByTestId('brand-opt-b1').click();
    await page.waitForTimeout(1200);
    // ready-made colours: two columns, 40 px tall at least, nothing sideways
    await row.scrollIntoViewIfNeeded();
    const boxes = await page.getByTestId('combo-list').getByRole('radio').evaluateAll((a) => a.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }));
    expect(boxes.length).toBeGreaterThanOrEqual(9);
    expect(new Set(boxes.map((b) => b.x)).size, 'two columns').toBe(2);
    expect(boxes[0].y, 'the first two sit side by side').toBe(boxes[1].y);
    for (const b of boxes) expect(b.h).toBeGreaterThanOrEqual(40);
    expect(Math.max(...boxes.map((b) => b.x + b.w)), 'inside the screen').toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${OUT}/style-step-colours-390.png`, fullPage: false });
    await page.getByTestId('combo-list').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/style-step-combos-390.png` });
    // the editor: preview slides at least 150 px wide, the strip scrolls sideways inside itself
    await page.getByTestId('brand-edit').click();
    await expect(page.locator('[data-testid=brand-preview] img')).toHaveCount(3, { timeout: 20_000 });
    await page.waitForTimeout(600);
    const prev = await page.evaluate(() => {
      const ul = document.querySelector('[data-testid=brand-preview]') as HTMLElement;
      const lis = [...ul.querySelectorAll('li')].map((l) => Math.round(l.getBoundingClientRect().width));
      return { lis, scrolls: ul.scrollWidth > ul.clientWidth, page: document.documentElement.scrollWidth - window.innerWidth };
    });
    for (const w of prev.lis) expect(w, 'a preview slide is at least 150 px wide').toBeGreaterThanOrEqual(150);
    expect(prev.scrolls, 'the third slide is reached by scrolling the strip sideways').toBe(true);
    expect(prev.page).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${OUT}/brand-editor-390.png` });
    await page.getByTestId('brand-cancel').click();
    expect(calls()).toBe(0);
  });
});
