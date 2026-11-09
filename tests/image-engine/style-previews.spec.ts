// Round 5: the style cards of step 3 show what a style really does. Each built-in style has its cover and, under it, two small slides in the two layouts it likes (no two styles show the same
// pair); a Preview button opens seven sample slides in that style, drawn as a deck by the layout library from one fixed script. ZERO model calls. Screenshots: out/style-preview/
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { toStep } from './ui';

test.setTimeout(240_000);
const OUT = 'out/style-preview';

async function counting(page: Page) {
  const f = { calls: 0 };
  for (const url of ['**/__carousel/write', '**/api/carousel/write', '**/__reference/read', '**/api/reference/read']) await page.route(url, (r) => { f.calls++; return r.fulfill({ json: { text: '{}', ms: 1 } }); });
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  return f;
}
const card = (page: Page, title: string) => page.getByRole('list', { name: 'Styles' }).getByRole('listitem').filter({ has: page.getByText(title, { exact: true }) });
const allDrawn = async (page: Page) => {
  const list = page.getByRole('list', { name: 'Styles' });
  await list.scrollIntoViewIfNeeded();
  for (let y = 0; y < 10; y++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(250); }
  await expect(list.getByText('Drawing…')).toHaveCount(0, { timeout: 60_000 });
};

test('no two styles show the same pair of small slides; the layouts are ones the style likes, none of them a cover layout; the list covers all 15', async ({ page }) => {
  const f = await counting(page);
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const S: any = await import('/src/carousel/stylePreview.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const D: any = await import('/src/carousel/designLibrary.ts');
    const names: string[] = S.presetNames();
    const pairs: Record<string, [string, string]> = S.cardPairs(names);
    const prefer = Object.fromEntries(names.map((n) => [n, (D.styleFromPack(PR.presetPackFor(n, false)).style.flavour?.prefer ?? []) as string[]]));
    return { names, pairs, prefer };
  });
  expect(r.names.length, 'every built-in style').toBe(15);
  const keys = new Set<string>();
  const covers = new Set(['statement', 'statement-stacked', 'statement-card', 'statement-pill', 'lead-statement', 'big-question', 'statement-question', 'photo-led', 'photo-cover', 'cover-art']);
  for (const n of r.names) {
    const p = r.pairs[n];
    expect(p, `${n} has a pair`).toHaveLength(2);
    expect(p[0]).not.toBe(p[1]);
    for (const l of p) {
      expect(r.prefer[n], `${n} likes ${l}`).toContain(l);
      expect(covers.has(l), `${l} is not a cover layout`).toBe(false);
    }
    const k = [...p].sort().join('+');
    expect(keys.has(k), `${n} repeats the pair ${k}`).toBe(false);
    keys.add(k);
  }
  // variety: the 15 pairs use many different layouts
  expect(new Set(Object.values(r.pairs).flat()).size).toBeGreaterThanOrEqual(12);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/pairs.json`, JSON.stringify(r.pairs, null, 2));
  expect(f.calls).toBe(0);
});

test('the preview slides use the same code as a real deck: small slides are drawOne output, the strip is a deck from libraryDeckFromScript; seven slides for every style, zero model calls', async ({ page }) => {
  const f = await counting(page);
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const S: any = await import('/src/carousel/stylePreview.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const D: any = await import('/src/carousel/designLibrary.ts');
    const FS: any = await import('/src/carousel/libraryFromScript.ts');
    const L: any = await import('/src/carousel/layouts/index.ts');
    const Sc: any = await import('/src/carousel/script.ts');
    const names: string[] = S.presetNames();
    const out: any[] = [];
    for (const n of names) {
      const small = await S.cardSlides(n);
      const deck = await S.previewDeck(n);
      out.push({ n, small: small.map((x: string | null) => !!x), deck: deck.map((d: any) => ({ ok: !!d.svg, layout: d.layout })) });
    }
    // identity with the real code, for one style: the first small slide equals a direct drawOne with the same arguments; the strip equals a deck made from the same script
    const n0 = names[0];
    const pack = PR.presetPackFor(n0, false);
    const { style } = D.styleFromPack(pack);
    const pair = S.cardPairs()[n0];
    const direct = await D.drawOne({ layout: pair[0], fields: L.layoutDef(pair[0]).samples.normal, accents: [] }, ((style.flavour?.variants ?? {})[pair[0]] === 1 ? 1 : 0), style, { handle: '', index: 1, total: 7, cut: 'plain', invert: false, density: 'normal' });
    const viaCard = (await S.cardSlides(n0))[0];
    const script = Sc.validateScriptText(JSON.stringify(S.PREVIEW_SCRIPT), 'carousel').script;
    const made = await FS.libraryDeckFromScript(script, { pack, brief: '', hasPhoto: false, images: [], site: '' }, '');
    const viaPanel = await S.previewDeck(n0);
    return { out, sameSmall: direct.built?.svg === viaCard, sameDeck: made.ok && script.slides.every((_: any, i: number) => made.designed.slides[String(i)]?.built?.svg === viaPanel[i].svg), calls: made.designed?.calls ?? -1 };
  });
  expect(r.out.length).toBe(15);
  for (const o of r.out) {
    expect(o.small, `${o.n}: two small slides`).toEqual([true, true]);
    expect(o.deck.length, `${o.n}: seven slides`).toBe(7);
    expect(o.deck.every((d: any) => d.ok), `${o.n}: every sample slide drew`).toBe(true);
  }
  expect(r.sameSmall, 'a small slide is exactly what drawOne draws').toBe(true);
  expect(r.sameDeck, 'the strip is exactly the deck the library makes from the same script').toBe(true);
  expect(r.calls, 'no model call').toBe(0);
  expect(f.calls).toBe(0);
  // which layouts each style shows in the strip (for the report)
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/strip-layouts.json`, JSON.stringify(Object.fromEntries(r.out.map((o: any) => [o.n, o.deck.map((d: any) => d.layout)])), null, 2));
});

test('step 3 on a desktop: every built-in card has a cover, two small slides and a Preview button; the panel shows seven slides, Use this style selects it, Close closes it, and a second open is instant', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const f = await counting(page);
  await page.goto('/images/carousel');
  await toStep(page, 3);
  await allDrawn(page);
  const list = page.getByRole('list', { name: 'Styles' });
  const presetCards = list.locator('li:has(.cr-style-smalls)');
  expect(await presetCards.count()).toBe(15);
  expect(await list.locator('.cr-style-small img').count(), 'two small slides on each of the 15 cards').toBe(30);
  expect(await list.getByRole('button', { name: 'Preview', exact: true }).count()).toBe(15);
  fs.mkdirSync(OUT, { recursive: true });
  await list.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await toStep(page, 3);
  await page.screenshot({ path: `${OUT}/desktop-step3.png` });
  // the panel of three clearly different styles
  for (const [title, file] of [['Bold orange', 'orange'], ['Pink serif stickers', 'pink'], ['Black holographic', 'holographic']] as const) {
    const c = card(page, title);
    await c.getByRole('button', { name: 'Preview', exact: true }).click();
    const panel = page.getByTestId('style-preview');
    await expect(panel).toBeVisible();
    await expect(panel.locator('img')).toHaveCount(7, { timeout: 60_000 });
    expect(await panel.locator('img').evaluateAll((els) => els.every((e) => (e as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/desktop-panel-${file}.png` });
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toBeHidden();
  }
  // open again: the slides are kept, nothing says Drawing
  await card(page, 'Bold orange').getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByTestId('style-preview').getByText('Drawing…')).toHaveCount(0);
  // Use this style selects the style and closes the panel
  await page.getByTestId('style-preview').getByRole('button', { name: 'Use this style' }).click();
  await expect(page.getByTestId('style-preview')).toBeHidden();
  await expect(card(page, 'Bold orange').getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
  expect(f.calls, 'previews never call a model').toBe(0);
});

test('step 3 on a phone: two cards per row, the two small slides in one row under the cover, and the panel scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await counting(page);
  await page.goto('/images/carousel');
  await toStep(page, 3);
  await allDrawn(page);
  const r = await page.evaluate(() => {
    const li = document.querySelector('ul[aria-label="Styles"] li:has(.cr-style-smalls)')!;
    const smalls = [...li.querySelectorAll('.cr-style-small')].map((e) => e.getBoundingClientRect());
    const cover = li.querySelector('.cr-style-pic')!.getBoundingClientRect();
    return { rowY: Math.abs(smalls[0].top - smalls[1].top), under: smalls[0].top >= cover.bottom - 1, smallW: smalls[0].width, coverW: cover.width, sideways: document.documentElement.scrollWidth - innerWidth };
  });
  expect(r.rowY).toBeLessThan(2);
  expect(r.under).toBe(true);
  expect(r.smallW / r.coverW, 'about half the cover width each (two in a row)').toBeGreaterThan(0.4);
  expect(r.sideways).toBeLessThanOrEqual(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/phone-step3.png` });
  await card(page, 'Bold orange').getByRole('button', { name: 'Preview', exact: true }).click();
  const panel = page.getByTestId('style-preview');
  await expect(panel.locator('img')).toHaveCount(7, { timeout: 60_000 });
  const scroll = await panel.getByRole('list', { name: 'Sample slides in this style' }).evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  expect(scroll.sw, 'the strip is wider than the screen: swipe or scroll').toBeGreaterThan(scroll.cw);
  await page.screenshot({ path: `${OUT}/phone-panel-orange.png` });
});

test('a slide that fails to draw shows "No preview" for that slide only', async ({ page }) => {
  await counting(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/images/carousel');
  await toStep(page, 3);
  await allDrawn(page);
  // from now on exactly one picture fails to be made
  await page.evaluate(() => {
    const orig = OffscreenCanvas.prototype.convertToBlob;
    let failed = false;
    OffscreenCanvas.prototype.convertToBlob = function (this: OffscreenCanvas, o?: ImageEncodeOptions) {
      if (!failed) { failed = true; return Promise.reject(new Error('boom')); }
      return orig.call(this, o);
    };
  });
  // a style whose panel was never opened, so nothing is cached
  await card(page, 'Pink serif stickers').getByRole('button', { name: 'Preview', exact: true }).click();
  const panel = page.getByTestId('style-preview');
  await expect(panel.getByText('No preview')).toHaveCount(1, { timeout: 60_000 });
  await expect(panel.locator('img')).toHaveCount(6, { timeout: 60_000 });
  await expect(panel.getByText('Drawing…')).toHaveCount(0);
});
