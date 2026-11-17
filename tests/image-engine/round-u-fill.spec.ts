// Round U part 3: fill the slide when it is safe. On title-over-photo, photo-full-caption and cover-art a photo that a cover crop would cut by 25% to 40% fills its slot when at least 90% of its
// saliency box (detail and colour against the photo's border, weighted to the middle and the focus point) stays inside the narrowest part a fill may keep (60% around the focus point);
// otherwise it is drawn whole and dissolves into the slide. A switch in the picture row ("Fill the slide") overrides it either way; "Keep the full picture" keeps the photo whole.
// The choice does not depend on the style, the colours, a reload or a move. Screenshots, pinned crops (a zoom the person chose) and the photo-only layouts are never filled.
// A FAKE writer: ZERO real model calls. The two photos are made in the page: a group of six people across the width, and one person in the middle.
import { expect, test, type Page, type Route } from '@playwright/test';
import { toStep } from './ui';

test.setTimeout(6 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });

/** The two photos (1280 x 960, 4:3, as the user's event photos): figures (a head and a body) on a plain wall. */
const makePeople = (page: Page) => page.evaluate(() => {
  const fig = (g: CanvasRenderingContext2D, cx: number, cy: number, s: number, shirt: string) => {
    g.fillStyle = shirt; g.beginPath(); g.ellipse(cx, cy + 2.2 * s, 1.2 * s, 1.8 * s, 0, 0, 7); g.fill();
    g.fillStyle = '#c68b62'; g.beginPath(); g.arc(cx, cy, 0.75 * s, 0, 7); g.fill();
    g.fillStyle = '#2b1d14'; g.beginPath(); g.arc(cx, cy - 0.35 * s, 0.7 * s, Math.PI, 0); g.fill();
  };
  const wall = () => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 960; const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, 960); gr.addColorStop(0, '#d9d4cc'); gr.addColorStop(1, '#bdb6aa'); g.fillStyle = gr; g.fillRect(0, 0, 1280, 960);
    return { c, g };
  };
  const group = wall(); ['#c0392b', '#2471a3', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22'].forEach((col, i) => fig(group.g, 110 + i * 212, 380, 70, col));
  const one = wall(); fig(one.g, 640, 360, 110, '#2471a3');
  return { group: group.c.toDataURL('image/jpeg', 0.92), central: one.c.toDataURL('image/jpeg', 0.92) };
});

/** Draws one slide in the page with the made photos (a fresh resolver, the overrides given). */
const DRAW = `(async ({ pics, layout, v, styleId, id, k, overrides, words }) => {
  const DL = await import('/src/carousel/designLibrary.ts'); const PR = await import('/src/carousel/presets.ts'); const FA = await import('/src/reference/faithful.ts');
  const IM = await import('/src/carousel/layouts/images.ts'); const FS = await import('/src/carousel/layouts/fillSlide.ts');
  const fonts = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
  FA.setPictureResolver(async (ref) => pics[ref.slice(8).split('#')[0]] ?? null);
  FS.setFillOverrides(overrides ?? []);
  const { style } = DL.styleFromPack(PR.presetPackFor(styleId, false, null));
  const ref = 'picture:' + id + '#w=1280&h=960&fx=0.5&fy=0.5&z=1' + (k ?? '&k=p');
  const d = await DL.drawOne({ layout, fields: { headline: words ?? 'Met some wonderful people there.', image: ref }, accents: [] }, v, style, { handle: '@saycreator', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal' });
  FS.setFillOverrides([]);
  const b = d.built;
  return b ? { svg: b.svg, fills: b.fills ?? null, notes: b.notes, words: b.layers.filter((l) => l.kind === 'text').map((l) => l.text).join(' | ') } : null;
})`;
const draw = (page: Page, a: Record<string, unknown>) => page.evaluate(`${DRAW}(${JSON.stringify(a)})`) as Promise<any>;
const mirrored = (svg: string) => svg.includes('matrix(1 0 0 -1') || svg.includes('matrix(-1 0 0 1');
const STYLES = ['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8', 'dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon'];

test('U3a the measure: the group photo would lose people, so it stays whole (the dissolve); the person in the middle fills; the same in all 15 styles; every word kept', async ({ page }) => {
  await page.goto('/images/carousel');
  const pics = await makePeople(page);
  const rows: any[] = [];
  for (const styleId of STYLES) {
    const g = await draw(page, { pics, layout: 'title-over-photo', v: 0, styleId, id: 'group' });
    const c = await draw(page, { pics, layout: 'title-over-photo', v: 0, styleId, id: 'central' });
    rows.push({ styleId, g: g.fills, c: c.fills, gm: mirrored(g.svg), cm: mirrored(c.svg), gw: g.words, cw: c.words, cn: c.notes.join(' ') });
  }
  for (const r of rows) {
    expect(r.g?.[0], r.styleId).toMatchObject({ picture: 'group', fill: false, why: 'subject-cut' });
    expect(r.g[0].inside, r.styleId).toBeLessThan(0.9);
    expect(r.gm, `${r.styleId}: the group photo is whole, on its dissolve`).toBe(true);
    expect(r.c?.[0], r.styleId).toMatchObject({ picture: 'central', fill: true, why: 'fills', sides: 'sides' });
    expect(r.c[0].inside, r.styleId).toBeGreaterThanOrEqual(0.9);
    expect(r.c[0].cut, r.styleId).toBeGreaterThan(0.25);
    expect(r.c[0].cut, r.styleId).toBeLessThanOrEqual(0.4);
    expect(r.cm, `${r.styleId}: the filled photo has no dissolve`).toBe(false);
    expect(r.cn).toMatch(/Fills the slide\. \d+% of the sides are cut off\./);
    // the words are the slide's own, filled or not
    expect(r.gw.toLowerCase()).toContain('met some wonderful people there');
    expect(r.cw).toBe(r.gw);
  }
  // the choice is the same in every style (it does not depend on the slot as drawn)
  expect(new Set(rows.map((r) => JSON.stringify([r.g[0].fill, r.c[0].fill, r.g[0].inside, r.c[0].inside]))).size).toBe(1);
  // drawn twice: the same drawing
  const a = await draw(page, { pics, layout: 'title-over-photo', v: 1, styleId: 'style-1', id: 'central' });
  const b = await draw(page, { pics, layout: 'title-over-photo', v: 1, styleId: 'style-1', id: 'central' });
  expect(a.svg).toBe(b.svg);
});

test('U3b the switch overrides: on fills the group photo (and says part of what matters may be cut); off keeps the person in the middle whole; nothing set: the measure decides', async ({ page }) => {
  await page.goto('/images/carousel');
  const pics = await makePeople(page);
  const on = await draw(page, { pics, layout: 'title-over-photo', v: 0, styleId: 'style-1', id: 'group', overrides: [['group', 'on']] });
  expect(on.fills[0]).toMatchObject({ fill: true, why: 'on' });
  expect(mirrored(on.svg)).toBe(false);
  expect(on.notes.join(' ')).toMatch(/Fills the slide, as you chose\. \d+% of the sides are cut off\. Part of what matters in the photo may be cut\./);
  const off = await draw(page, { pics, layout: 'title-over-photo', v: 0, styleId: 'style-1', id: 'central', overrides: [['central', 'off']] });
  expect(off.fills[0]).toMatchObject({ fill: false, why: 'off' });
  expect(mirrored(off.svg)).toBe(true);
  const auto = await draw(page, { pics, layout: 'title-over-photo', v: 0, styleId: 'style-1', id: 'central' });
  expect(auto.fills[0]).toMatchObject({ fill: true, why: 'fills' });
  // the words are the same either way
  expect(off.words).toBe(auto.words);
});

test('U3c never filled: a screenshot, a zoom the person chose, a photo already inside the 25% budget, a cut over 40%; photo-full is left as it was', async ({ page }) => {
  await page.goto('/images/carousel');
  const pics = await makePeople(page);
  const shot = await draw(page, { pics, layout: 'title-over-photo', v: 0, styleId: 'style-1', id: 'central', k: '' });
  expect(shot.fills).toBeNull();
  const zoomed = await draw(page, { pics, layout: 'title-over-photo', v: 0, styleId: 'style-1', id: 'central', k: '&k=p&z=1.5' });
  expect(zoomed.fills).toBeNull();
  const r = await page.evaluate(async () => {
    const FS: any = await import('/src/carousel/layouts/fillSlide.ts');
    const IM: any = await import('/src/carousel/layouts/images.ts');
    const slot = { x: 0, y: 116, w: 1080, h: 1134 };
    return {
      within: await FS.fillChoice('title-over-photo', slot, IM.parseRef('picture:p#w=960&h=1280&k=p'), 'picture:p#'),
      over: await FS.fillChoice('title-over-photo', slot, IM.parseRef('picture:p#w=2400&h=1000&k=p'), 'picture:p#'),
      full: await FS.fillChoice('photo-full', slot, IM.parseRef('picture:p#w=1280&h=960&k=p'), 'picture:p#'),
      split: await FS.fillChoice('split-half', slot, IM.parseRef('picture:p#w=1280&h=960&k=p'), 'picture:p#'),
      layouts: FS.FILL_LAYOUTS, budget: FS.FILL_BUDGET, keep: FS.SALIENT_KEEP, window: FS.keptWindow(0.5), edge: FS.keptWindow(0.95),
    };
  });
  expect(r.within).toBeNull();
  expect(r.over).toBeNull();
  expect(r.full).toBeNull();
  expect(r.split).toBeNull();
  expect(r.layouts).toEqual(['title-over-photo', 'photo-full-caption', 'cover-art']);
  expect([r.budget, r.keep]).toEqual([0.4, 0.9]);
  expect(r.window).toEqual([0.2, 0.8]);
  expect(r.edge, 'the kept part stays inside the photo: the focus point is never moved, the window is held at the edge').toEqual([0.4, 1]);
});

const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
const SLIDES = [
  S('title-over-photo', { headline: 'Had a wonderful blast at the Hyderabad event.' }),
  S('lead-statement', { lead: 'Thank you Punit Chawla', headline: 'for the crazy day man.' }),
  S('title-over-photo', { headline: 'Met some wonderful people there.' }),
  S('prose', { p1: 'And also thank you everyone for your wonderful insights and talks, those were very valuable and fun.', pull: 'Those were very valuable and fun.' }),
  S('statement-card', { headline: 'Looking forward to more of these.' }),
];
const TEXT = 'Had a wonderful blast at the Hyderabad event. Thank you Punit Chawla for the crazy day man. Met some wonderful people there. And also thank you everyone for your wonderful insights and talks, those were very valuable and fun. Looking forward to more of these.';
async function fake(page: Page) {
  const f = { calls: 0 };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const write = (r: Route) => { f.calls++; return r.fulfill({ json: { text: JSON.stringify({ title: 'Hyderabad event', slides: SLIDES }), ms: 5 } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc);
const fillsOf = (d: any) => Object.entries(d.designed.slides).flatMap(([k, s]: [string, any]) => (s.built?.fills ?? []).map((f: any) => ({ slide: Number(k) + 1, ...f, svg: s.built.svg })));
const pictureIds = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc?.photos ?? []).filter((p: any) => p.kind === 'photo').map((p: any) => p.id));

test('U3d the app: the picture row says what each photo does and its switch overrides it; a reload and a style switch keep the choice; no writer call after the build', async ({ page }) => {
  const f = await fake(page);
  await page.goto('/images/carousel');
  const pics = await makePeople(page);
  const files = [pics.group, pics.central].map((url, i) => ({ name: `event photo ${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(url.split(',')[1], 'base64') }));
  await page.getByLabel('Choose images for the slides').setInputFiles(files);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(2, { timeout: 60_000 });
  for (let i = 0; i < 2; i++) { const chip = page.getByTestId(`image-${i}-content`); if ((await chip.getAttribute('data-content')) === 'screenshot') await chip.click(); }
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 2);
  await page.getByTestId('options').getByRole('combobox').first().selectOption('5');
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Mono editorial glow/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film li').nth(4)).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(2000);
  const made = f.calls;
  const d = await stored(page);
  const ids: string[] = await pictureIds(page);
  const fl = fillsOf(d);
  const groupFill = fl.find((x: any) => x.picture === ids[0]);
  const centralFill = fl.find((x: any) => x.picture === ids[1]);
  expect(groupFill, JSON.stringify(fl.map(({ svg, ...x }: any) => x))).toBeTruthy();
  expect(centralFill).toBeTruthy();
  expect(groupFill).toMatchObject({ fill: false, why: 'subject-cut' });
  expect(centralFill).toMatchObject({ fill: true, why: 'fills' });
  expect(mirrored(groupFill.svg)).toBe(true);
  // the words of the plan are on the slides, filled or not
  const words = Object.values(d.designed.slides).map((s: any) => s.built.layers.filter((l: any) => l.kind === 'text').map((l: any) => l.text).join(' ')).join(' ');
  for (const w of ['Had a wonderful blast', 'Met some wonderful people there.']) expect(words).toContain(w.split(' ').slice(0, 2).join(' '));
  // the picture row (step 1): each photo says what it does, in plain words, with its switch
  await page.locator('.cr-wiz-steps button').nth(0).click();
  const pct = Math.round(centralFill.cut * 100);
  await expect(page.getByTestId('image-1-fill-switch')).toBeChecked();
  await expect(page.getByTestId('image-1-fill-note')).toHaveText(`Fills the slide. ${pct}% of the sides are cut off.`);
  await expect(page.getByTestId('image-0-fill-switch')).not.toBeChecked();
  await expect(page.getByTestId('image-0-fill-note')).toContainText('Shown whole: filling the slide would cut');
  await expect(page.getByTestId('image-0-fill')).toContainText('On: the photo covers the slide edge to edge');
  // the switch: the group photo fills (as the person chose), the slide is drawn again, no writer call
  await page.getByTestId('image-0-fill-switch').click();
  await expect(page.getByTestId('image-0-fill-note')).toContainText('Fills the slide, as you chose.', { timeout: 60_000 });
  const d2 = await stored(page);
  const g2 = fillsOf(d2).find((x: any) => x.picture === ids[0]);
  expect(g2).toMatchObject({ fill: true, why: 'on' });
  expect(mirrored(g2.svg)).toBe(false);
  // a reload keeps the choice and the drawing
  await page.reload();
  await expect(page.getByTestId('image-0-fill-switch')).toBeChecked({ timeout: 60_000 });
  const d3 = await stored(page);
  expect(fillsOf(d3).find((x: any) => x.picture === ids[0]).svg).toBe(g2.svg);
  // another style: the slides are drawn again; the choices stay (the person's switch and the measure)
  await page.locator('.cr-wiz-steps button').nth(2).click();
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Cream ink/ }).first().click();
  await expect.poll(async () => (await stored(page)).designed.library.source, { timeout: 60_000 }).not.toBe('style-1');
  await page.waitForTimeout(1500);
  const d4 = await stored(page);
  expect(fillsOf(d4).find((x: any) => x.picture === ids[0])).toMatchObject({ fill: true, why: 'on' });
  expect(fillsOf(d4).find((x: any) => x.picture === ids[1])).toMatchObject({ fill: true, why: 'fills' });
  // switched off again: whole, on its dissolve
  await page.locator('.cr-wiz-steps button').nth(0).click();
  await page.getByTestId('image-1-fill-switch').click();
  await expect(page.getByTestId('image-1-fill-note')).toHaveText('Shown whole; its edges melt into the slide.', { timeout: 60_000 });
  const d5 = await stored(page);
  expect(fillsOf(d5).find((x: any) => x.picture === ids[1])).toMatchObject({ fill: false, why: 'off' });
  expect(f.calls, 'no writer call after the build').toBe(made);
});
