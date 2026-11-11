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
  // the small slides come after each cover
  await expect(list.locator('.cr-style-small img')).toHaveCount(30, { timeout: 60_000 });
};

test('card pairs: only body layouts the style likes, no two styles alike, no layout on more than 3 styles, a dark style shows a dark slide and a light style a light one, same sample words as the panel', async ({ page }) => {
  const f = await counting(page);
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const S: any = await import('/src/carousel/stylePreview.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const D: any = await import('/src/carousel/designLibrary.ts');
    const F: any = await import('/src/reference/faithful.ts');
    const names: string[] = S.presetNames();
    const tone = async (svg: string) => {
      const bm = await createImageBitmap(await F.svgToPng(svg, 60));
      const c = new OffscreenCanvas(bm.width, bm.height); const g = c.getContext('2d')!; g.drawImage(bm, 0, 0);
      const px = g.getImageData(0, 0, bm.width, bm.height).data; let t = 0; for (let i = 0; i < px.length; i += 4) t += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      return Math.round(t / (px.length / 4));
    };
    const out: any[] = [];
    for (const n of names) {
      const { style } = D.styleFromPack(PR.presetPackFor(n, false));
      const picks = S.cardPicks(n);
      const svgs: (string | null)[] = await S.cardSlides(n);
      out.push({
        n, picks, prefer: style.flavour?.prefer ?? [], avoid: style.flavour?.avoid ?? [],
        cover: await tone((await PR.presetThumbSvg(n)) as string),
        tones: await Promise.all(svgs.map(async (x) => (x ? await tone(x) : null))),
        fast: svgs.map((x) => (x ? S.slideTone(x) : null)),
        words: svgs.map((x) => (x ? (x.match(/>([^<]+)</g) ?? []).join(' ') : '')),
      });
    }
    return { names, out, body: [...S.BODY_LAYOUTS], habit: Object.keys(S.HABIT_FIELDS) };
  });
  expect(r.names.length, 'every built-in style').toBe(15);
  expect(r.habit.sort(), 'the sample words exist for every body layout').toEqual([...r.body].sort());
  const keys = new Map<string, string>();
  const usage: Record<string, string[]> = {};
  const report: Record<string, unknown> = {};
  // style 5 likes only two body layouts, the same two as style 1; its second slide is the one allowed layout that is not on its likes list
  const NOT_LIKED_OK: Record<string, string[]> = { 'style-5': ['headline-card'] };
  for (const o of r.out) {
    const layouts = o.picks.map((x: any) => x.layout);
    expect(o.picks, `${o.n} has two slides`).toHaveLength(2);
    expect(layouts[0]).not.toBe(layouts[1]);
    for (const l of layouts) {
      expect(r.body, `${o.n}: ${l} is a body layout`).toContain(l);
      expect(/^(prose|cta-|contact-closing|statement|lead-statement|big-question|photo|cover-art)/.test(l), `${o.n}: ${l} is never a card layout`).toBe(false);
      expect(o.prefer.includes(l) || (NOT_LIKED_OK[o.n] ?? []).includes(l), `${o.n} likes ${l}`).toBe(true);
      expect(o.avoid, `${o.n} does not avoid ${l}`).not.toContain(l);
      (usage[l] ??= []).push(o.n);
    }
    const k = [...layouts].sort().join('+');
    expect(keys.has(k), `${o.n} repeats the pair ${k} of ${keys.get(k)}`).toBe(false);
    keys.set(k, o.n);
    // light and dark: the drawn slides, measured
    expect(o.tones.every((t: number | null) => t !== null), `${o.n}: both slides drawn`).toBe(true);
    if (o.cover < 100) expect(o.tones.some((t: number) => t < 110), `${o.n} is a dark style (cover ${o.cover}) and shows a dark slide: ${o.tones}`).toBe(true);
    if (o.cover > 160) expect(o.tones.some((t: number) => t > 160), `${o.n} is a light style (cover ${o.cover}) and shows a light slide: ${o.tones}`).toBe(true);
    // the quick tone read from the svg agrees with the real picture (so the app and this check cannot drift)
    o.fast.forEach((t: number | null, i: number) => { if (t !== null) expect(Math.abs(t - o.tones[i]), `${o.n}: slideTone ${t} vs picture ${o.tones[i]}`).toBeLessThan(60); });
    // the same sample words as the panel's script
    const words = o.words.join(' ').toLowerCase();
    expect(/habit|tiny|myth|willpower|step|repeatedly|66|friend|streak|time/.test(words), `${o.n}: the cards use the habit sample words`).toBe(true);
    report[o.n] = { pair: layouts, tones: o.tones, cover: o.cover };
  }
  for (const [l, who] of Object.entries(usage)) expect(who.length, `${l} is on ${who.length} styles: ${who.join(', ')}`).toBeLessThanOrEqual(3);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/pairs.json`, JSON.stringify(report, null, 2));
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
    const pk = S.cardPicks(n0)[0];
    const direct = await D.drawOne({ layout: pk.layout, fields: S.HABIT_FIELDS[pk.layout], accents: [] }, ((style.flavour?.variants ?? {})[pk.layout] === 1 ? 1 : 0), style, { handle: '', index: 1, total: 7, cut: 'plain', invert: pk.invert ?? false, density: 'normal' });
    const viaCard = (await S.cardSlides(n0))[0];
    const script = Sc.validateScriptText(JSON.stringify(S.PREVIEW_SCRIPT), 'carousel').script;
    // (a sample deck takes the style's signature cover: Round 6b)
    const made = await FS.libraryDeckFromScript(script, { pack, brief: '', hasPhoto: false, images: [], site: '', signatureCover: true }, '');
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
  // scrolled so the cards (with their small slides) fill the screen: at least six are fully visible
  await page.setViewportSize({ width: 1280, height: 1100 });
  await list.locator('li').first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -20));
  await page.waitForTimeout(400);
  const seen = await list.locator('li:has(.cr-style-smalls)').evaluateAll((els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }).length);
  expect(seen, 'six or more cards with small slides fully on screen').toBeGreaterThanOrEqual(6);
  await page.screenshot({ path: `${OUT}/desktop-step3.png` });
  await page.setViewportSize({ width: 1280, height: 900 });
  // the panel of three clearly different styles
  for (const [title, file] of [['Bold orange', 'orange'], ['Pink serif stickers', 'pink'], ['Black holographic', 'holographic']] as const) {
    const c = card(page, title);
    await c.getByRole('button', { name: 'Preview', exact: true }).click();
    const panel = page.getByTestId('style-preview');
    await expect(panel).toBeVisible();
    await expect(panel.locator('img')).toHaveCount(7, { timeout: 60_000 });
    expect(await panel.locator('img').evaluateAll((els) => els.every((e) => (e as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await expect(panel.getByTestId('style-preview-count')).toHaveText('1 of 7');
    await panel.getByRole('list', { name: 'Sample slides in this style' }).evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await expect(panel.getByTestId('style-preview-count')).toHaveText('7 of 7');
    await panel.getByRole('list', { name: 'Sample slides in this style' }).evaluate((el) => { el.scrollLeft = 0; });
    await expect(panel.getByTestId('style-preview-count')).toHaveText('1 of 7');
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
