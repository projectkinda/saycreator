// The layout gallery of a library slide (ZERO model calls beyond the one FAKE writer answer that makes the deck; static images).
//   - it lists exactly what the picker allows (driven by the registry: LAYOUT_IDS), the rest greyed out with a reason
//   - it sits in plain sight under the picture (no collapsed line, no old Layout dropdown)
//   - a click redraws that slide only, with no model call and as ONE undo step; a greyed-out layout cannot be applied
//   - screenshots of the gallery for slide 1 and slide 3 of the hot-flat fixture: out/picker/
import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import { deckDrawn, openEdit, toStep } from './ui';

test.setTimeout(300_000);
test.use({ viewport: { width: 1280, height: 900 } });

const fixture = JSON.parse(fs.readFileSync('tests/image-engine/fixtures/hot-flat-app-library.json', 'utf8')).library;
const SPECS = fixture.plan.specs.map((s: any) => ({ layout: s.layout, fields: s.fields, accents: s.accents }));
const WRITER = JSON.stringify({ title: fixture.plan.title ?? 'Stop storing your life in your head', slides: SPECS });
const TEXT = 'Stop storing your life in your head. Hold things in a system you trust. Three steps: capture, sort, review. Build your own. Join the waitlist today.';

async function fake(page: Page) {
  const f = { calls: 0 };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/api/reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  const write = (r: Route) => { f.calls++; return r.fulfill({ json: { text: WRITER, ms: 5, usage: { input: 10, output: 5 } } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}
const lib = (page: Page) => page.evaluate(() => {
  const d = (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as { project?: { doc?: any } }).project?.doc;
  const l = d?.designed?.library;
  return l ? { layouts: l.layouts as string[], variants: l.variants as number[], cuts: l.cuts as string[], inverts: l.inverts as string[], redraws: l.redraws as number, calls: d.designed.calls as number } : null;
});
async function deck(page: Page) {
  const f = await fake(page);
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, SPECS.length);
  // The layout gallery lives in the Edit slides view, one slide at a time.
  await openEdit(page, 1);
  await expect(page.locator('.cr-stage-pic img')).toBeVisible({ timeout: 120_000 });
  return f;
}

test('the gallery lists exactly what the picker allows: every registry layout, the rest greyed with a reason, every enabled tile draws', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ lib }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const P = await import('/src/carousel/designLibraryPick.ts');
    const L = await import('/src/carousel/layouts/index.ts');
    const PR = await import('/src/carousel/presets.ts');
    const look = { hasPhoto: false };
    const res = await D.redrawLibraryDeck({ ...lib, redraws: 0 }, { pack: PR.presetPackFor('hot-flat', false), hasPhoto: false }, '@h');
    const out: any[] = [];
    for (let i = 0; i < res.library.plan.specs.length; i++) {
      const m = P.galleryModel(res.library, look, '@h', i)!;
      const allowed = P.layoutOptions(res.library.plan.specs[i], look).map((o: any) => o.layout);
      const enabled = m.entries.filter((e: any) => e.enabled).map((e: any) => e.layout);
      const drawn: Record<string, boolean[]> = {};
      for (const e of m.entries) drawn[e.layout] = [await P.drawGalleryTile(res.library, look, '@h', i, e.layout, 0).then((s: any) => !!s), await P.drawGalleryTile(res.library, look, '@h', i, e.layout, 1).then((s: any) => !!s)];
      out.push({ i, layout: res.library.plan.specs[i].layout, ids: m.entries.map((e: any) => e.layout), registry: [...L.LAYOUT_IDS], enabled, allowed, current: m.entries.filter((e: any) => e.current).map((e: any) => e.layout), reasons: m.entries.filter((e: any) => !e.enabled).map((e: any) => [e.layout, e.reason]), drawn, sig: m.signature });
    }
    return out;
  }, { lib: fixture });
  expect(r.length).toBe(SPECS.length);
  for (const s of r) {
    expect([...s.ids].sort(), `slide ${s.i + 1}: every layout of the registry, once`).toEqual([...s.registry].sort());
    expect([...s.enabled].sort(), `slide ${s.i + 1}: the enabled ones are exactly what the picker allows`).toEqual([...s.allowed].sort());
    expect(s.current).toEqual([s.layout]);
    expect(s.enabled).toContain(s.layout);
    for (const [id, reason] of s.reasons) { expect(String(reason).length, `${id} on slide ${s.i + 1} has a reason`).toBeGreaterThan(8); expect(String(reason).length, 'one line').toBeLessThan(130); }
    for (const id of s.enabled) expect(s.drawn[id], `${id} draws in both variants on slide ${s.i + 1}`).toEqual([true, true]);
    for (const [id] of s.reasons) expect(s.drawn[id], `${id} (greyed out) is not drawn`).toEqual([false, false]);
  }
  // the thumbnails depend on the slide's own content: two slides never share a cache key
  expect(new Set(r.map((s: any) => s.sig)).size).toBe(r.length);
  // at least one slide has greyed-out layouts, and the reasons say what is missing
  expect(r.flatMap((s: any) => s.reasons).length).toBeGreaterThan(10);
});

test('in the editor: the gallery is in plain sight, a click redraws that slide with no model call and one undo step, a greyed-out layout cannot be applied', async ({ page }) => {
  const f = await deck(page);
  expect(f.calls, 'the deck itself: one writer call').toBe(1);
  // plain sight: no collapsed line, no old dropdown on library slides
  await expect(page.getByText('Redesign this slide: pick a layout')).toHaveCount(0);
  await expect(page.locator('li.cr-card').first().getByText('Layout', { exact: true }).locator('xpath=..').locator('select')).toHaveCount(0);
  const g0 = page.getByTestId('gallery-0');
  await g0.scrollIntoViewIfNeeded();
  await expect(g0).toBeVisible();
  // it holds what the registry holds
  const regCount = await page.evaluate(async () => (await import('/src/carousel/layouts/index.ts')).LAYOUT_IDS.length);
  await expect(g0.locator('[data-testid^="gal-item-"]')).toHaveCount(regCount);
  // the thumbnails are drawn lazily and are real pictures
  await expect(g0).toHaveAttribute('data-ready-ms', /\d+/, { timeout: 120_000 });
  const ms = Number(await g0.getAttribute('data-ready-ms'));
  console.log('GALLERY_READY_MS', ms, 'tiles', await g0.locator('img').count());
  expect(await g0.locator('img').count(), 'two variants of every enabled layout').toBe((await g0.locator('[data-enabled="true"]').count()) * 2);
  // the current layout is clearly marked
  await expect(g0.locator('[data-current="true"]')).toHaveCount(1);
  await expect(g0.locator('[data-state="current"]')).toHaveCount(1);
  const before = (await lib(page))!;
  const callsBefore = f.calls;
  // a greyed-out layout cannot be applied
  const off = g0.locator('[data-state="off"]').first();
  await expect(off).toBeVisible();
  await expect(off).toBeDisabled();
  await off.click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(500);
  expect(await lib(page)).toEqual(before);
  // a click on an enabled layout: this slide only, no model call
  const tile = g0.locator('[data-testid^="gal-item-"][data-enabled="true"][data-current="false"] button:not([disabled])').first();
  const id = (await tile.getAttribute('data-testid'))!;
  await tile.click();
  await expect(g0.getByText(/^Redrew slide 1/)).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await lib(page))?.layouts[0], { timeout: 30_000 }).not.toBe(before.layouts[0]);
  const after = (await lib(page))!;
  expect(after.layouts.filter((l, i) => l !== before.layouts[i]).length, `${id}: exactly one slide changed`).toBe(1);
  expect(after.layouts[0]).not.toBe(before.layouts[0]);
  expect(f.calls, 'a click makes no model call').toBe(callsBefore);
  expect(after.calls).toBe(before.calls);
  // ONE undo step
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await lib(page))?.layouts[0], { timeout: 30_000 }).toBe(before.layouts[0]);
  expect((await lib(page))!.layouts).toEqual(before.layouts);
  expect(f.calls).toBe(callsBefore);
  // the plane and colour controls sit next to the gallery: one click, no model call
  const cut = g0.locator('[data-testid^="gal-cut-"]:not([disabled])').first();
  await cut.click();
  await expect.poll(async () => (await lib(page))?.cuts[0], { timeout: 30_000 }).not.toBe(before.cuts[0]);
  expect(f.calls).toBe(callsBefore);
});

test('screenshots of the gallery for slide 1 and slide 3 of the hot-flat fixture', async ({ page }) => {
  await deck(page);
  fs.mkdirSync('out/picker', { recursive: true });
  // the time to open the gallery of every slide (cold cache): drawing + rasterising every enabled tile
  for (let i = 0; i < SPECS.length; i++) {
    await openEdit(page, i + 1);
    const g = page.getByTestId(`gallery-${i}`);
    await g.scrollIntoViewIfNeeded();
    await expect(g).toHaveAttribute('data-ready-ms', /\d+/, { timeout: 120_000 });
    console.log('GALLERY_ALL slide', i + 1, SPECS[i].layout, await g.getAttribute('data-ready-ms'), 'ms,', await g.locator('img').count(), 'thumbnails');
  }
  for (const i of [0, 2]) {
    await openEdit(page, i + 1);
    const g = page.getByTestId(`gallery-${i}`);
    await g.scrollIntoViewIfNeeded();
    await expect(g).toHaveAttribute('data-ready-ms', /\d+/, { timeout: 120_000 });
    console.log('GALLERY_MS slide', i + 1, await g.getAttribute('data-ready-ms'), 'ms,', await g.locator('img').count(), 'thumbnails');
    const card = page.locator('li.cr-card').first();
    await card.screenshot({ path: `out/picker/slide${i + 1}-card.png` });
    await g.locator('[role="list"]').evaluate((el) => { (el as HTMLElement).style.maxHeight = 'none'; });
    await g.screenshot({ path: `out/picker/slide${i + 1}-gallery.png` });
  }
});
