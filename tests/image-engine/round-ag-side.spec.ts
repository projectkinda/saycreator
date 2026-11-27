// Round AG: (a cover keeps its full-bleed form: cover-art on the first slide takes no picture half) a portrait photo beside the words in a picture half that narrows until the words fit (images.sideSplit), instead of whole and small in a wide band.
//   - split-half: the 655 px half first; when the headline and the body do not fit its column, 20 px narrower at a time down to 486 px, so long as filling the half cuts at most 40%;
//   - headline-body-image (both variants) and cover-art: a portrait PHOTO the narrow panel cannot take uses the same half (picture right for variant 1, left for variant 2);
//   - a screenshot keeps the 655 px half only (then the band); a landscape photo is unchanged; every word is kept; the same drawing twice.
// Pictures are made in the page: ZERO model calls.
import { expect, test, type Page } from '@playwright/test';

test.setTimeout(4 * 60_000);

const DRAW = `(async ({ layout, v, w, h, photo, fields }) => {
  const DL = await import('/src/carousel/designLibrary.ts'); const PR = await import('/src/carousel/presets.ts'); const FA = await import('/src/reference/faithful.ts');
  const fonts = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
  const pic = (W, H) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#c9d1db'; g.fillRect(0, 0, W, H); g.fillStyle = '#2471a3'; g.beginPath(); g.ellipse(W / 2, H / 2, W * 0.12, H * 0.18, 0, 0, 7); g.fill(); return c.toDataURL('image/jpeg', 0.9); };
  const url = pic(w, h);
  FA.setPictureResolver(async () => url);
  const { style } = DL.styleFromPack(PR.presetPackFor('editorial-collage', false, null));
  const ref = 'picture:p' + w + 'x' + h + (photo ? 'p' : 's') + '#w=' + w + '&h=' + h + '&fx=0.5&fy=0.5&z=1' + (photo ? '&k=p' : '');
  const d = await DL.drawOne({ layout, fields: { ...fields, image: ref }, accents: [] }, v, style, { handle: '@saycreator', index: 3, total: 7, cut: 'plain', invert: false, density: 'normal' });
  const b = d.built;
  if (!b) return { problems: d.problems };
  return { svg: b.svg, slot: (b.images ?? [])[0], text: b.layers.filter((l) => l.kind === 'text').map((l) => l.text).join(' ').toLowerCase().replace(/\\s+/g, ' ') };
})`;
const draw = (page: Page, a: Record<string, unknown>) => page.evaluate(`${DRAW}(${JSON.stringify(a)})`) as Promise<any>;
const SHORT = { headline: 'Why we built it', body: 'We sewed the bag into the hood.' };
const LONG = { headline: 'Look for reflections', body: 'Puddles, windows and wet streets give you a second picture for free.' };
const ROAD = { headline: 'The best part was the empty road in the afternoon.', body: 'No plan, no playlist, just trees on both sides.' };
/** The share of a photo of aspect a that filling a W x H slot cuts. */
const cutOf = (a: number, W: number, H: number) => (a > W / H ? 1 - W / H / a : 1 - a / (W / H));
const words = (t: string) => t.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

test('AG1 split-half: short words keep the 655 px half; words too long for it take a narrower half (20 px steps, at most 40% cut); a screenshot falls to the band; every word kept; the same twice', async ({ page }) => {
  await page.goto('/images/carousel');
  const short = await draw(page, { layout: 'split-half', v: 0, w: 1600, h: 2400, photo: true, fields: SHORT });
  expect(short.slot).toMatchObject({ x: 1080 - 655, w: 655, h: 1114 });
  const long = await draw(page, { layout: 'split-half', v: 0, w: 1600, h: 2400, photo: true, fields: LONG });
  expect(long.slot.h).toBe(1114);
  expect(long.slot.w).toBeLessThan(655);
  expect(long.slot.w).toBeGreaterThanOrEqual(486);
  expect((655 - long.slot.w) % 20 === 0 || long.slot.w === 486).toBe(true);
  expect(long.slot.x, 'variant 1: the picture on the right').toBe(1080 - long.slot.w);
  expect(cutOf(1600 / 2400, long.slot.w, long.slot.h)).toBeLessThanOrEqual(0.4);
  for (const x of words(LONG.headline + ' ' + LONG.body)) expect(long.text).toContain(x);
  const left = await draw(page, { layout: 'split-half', v: 1, w: 1600, h: 2400, photo: true, fields: LONG });
  expect(left.slot).toMatchObject({ x: 0, w: long.slot.w });
  // a screenshot keeps the 655 px half only: these words fall to the band, as before
  const shot = await draw(page, { layout: 'split-half', v: 0, w: 1600, h: 2400, photo: false, fields: LONG });
  expect(shot.slot).toMatchObject({ x: 0, w: 1080, h: 675 });
  const again = await draw(page, { layout: 'split-half', v: 0, w: 1600, h: 2400, photo: true, fields: LONG });
  expect(again.svg).toBe(long.svg);
});

test('AG2 headline-body-image (both variants) and cover-art: a portrait photo beside the words in a half; a landscape photo and a short panel headline are unchanged', async ({ page }) => {
  await page.goto('/images/carousel');
  for (const v of [0, 1]) {
    const r = await draw(page, { layout: 'headline-body-image', v, w: 1800, h: 2400, photo: true, fields: ROAD });
    expect(r.slot.h, `variant ${v + 1}`).toBe(1114);
    expect(r.slot.w).toBeGreaterThanOrEqual(486);
    expect(r.slot.w).toBeLessThanOrEqual(655);
    expect(r.slot.x, `variant ${v + 1}`).toBe(v === 0 ? 1080 - r.slot.w : 0);
    expect(cutOf(0.75, r.slot.w, r.slot.h)).toBeLessThanOrEqual(0.4);
    for (const x of words(ROAD.headline + ' ' + ROAD.body)) expect(r.text).toContain(x);
  }
  // a short headline in variant 1 keeps the narrow panel (486 x 1114) as before
  const panel = await draw(page, { layout: 'headline-body-image', v: 0, w: 1800, h: 2400, photo: true, fields: { headline: 'Go', body: 'Trees on both sides.' } });
  expect(panel.slot).toMatchObject({ w: 486, h: 1114 });
  // a landscape photo: the wide picture as before
  const wide = await draw(page, { layout: 'headline-body-image', v: 1, w: 2400, h: 1600, photo: true, fields: ROAD });
  expect(wide.slot.w).toBe(1080);
  // cover-art hands its portrait photo to the same half
  const cover = await draw(page, { layout: 'cover-art', v: 1, w: 1694, h: 2400, photo: true, fields: { headline: "A calm look from someone who knows something you don't.", subtitle: '' } });
  expect(cover.slot.h).toBe(1114);
  expect(cover.slot.x).toBe(0);
  expect(cutOf(1694 / 2400, cover.slot.w, cover.slot.h)).toBeLessThanOrEqual(0.4);
  for (const x of words("A calm look from someone who knows something you don't.")) expect(cover.text).toContain(x);
});

test('AG3 the cover: cover-art on the first slide keeps a portrait photo out of the picture half (a cover, not a content slide); on any other slide it takes the half', async ({ page }) => {
  await page.goto('/images/carousel');
  const at = (index: number) => page.evaluate(async (index) => {
    const DL: any = await import('/src/carousel/designLibrary.ts'); const PR: any = await import('/src/carousel/presets.ts'); const FA: any = await import('/src/reference/faithful.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const c = document.createElement('canvas'); c.width = 1694; c.height = 2400; const g = c.getContext('2d')!; g.fillStyle = '#c9d1db'; g.fillRect(0, 0, 1694, 2400); g.fillStyle = '#2471a3'; g.fillRect(600, 700, 500, 900);
    const u = c.toDataURL('image/jpeg', 0.9); FA.setPictureResolver(async () => u);
    const { style } = DL.styleFromPack(PR.presetPackFor('editorial-collage', false, null));
    const d = await DL.drawOne({ layout: 'cover-art', fields: { headline: "I didn't plan this road trip.", subtitle: 'I just had a free weekend and a full tank.', image: 'picture:pc#w=1694&h=2400&fx=0.5&fy=0.5&z=1&k=p' }, accents: [] }, 1, style, { handle: '', index, total: 7, cut: 'plain', invert: false, density: 'normal' });
    return d.built.images[0];
  }, index);
  const cover = await at(0);
  expect(cover.h, 'slide 1: not the 1114 px picture half').not.toBe(1114);
  expect(cover.w).toBe(1080);
  const inside = await at(4);
  expect(inside.h, 'slide 5: the picture half').toBe(1114);
  expect(inside.w).toBeLessThanOrEqual(655);
});
