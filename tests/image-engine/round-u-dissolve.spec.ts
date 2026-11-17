// Round U part 2: a photo drawn whole (its cover crop would cut more than 25%) no longer sits on a blurred, darkened copy of itself (a box with a dark band). It dissolves into the slide: its own
// picture mirrored across each edge with room, blurred, fading out over up to 300 px into what lies under the slot; the photo itself is drawn whole on top with a long feather (about 1% visible at
// its edge). Nothing is darkened. A side that is the edge of the slide is not faded or feathered. A screenshot keeps its flat edge-colour panel. ZERO model calls; pictures generated in the page.
// (Replaces the Round N seam spec: the matched veil it tested is gone with the darkened copy.)
import { expect, test } from '@playwright/test';

test('U2a: the fade profile: smooth, up to 300 px, all the room there is when there is less; the slide edge stays filled; a thin inner room fades over 40 px', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const D: any = await import('/src/carousel/layouts/dissolve.ts');
    const slot = { x: 0, y: 116, w: 1080, h: 1134 };
    const rect = { x: 0, y: 278, w: 1080, h: 810 }; // a 4:3 photo drawn whole in title-over-photo's picture zone
    const card = { x: 48, y: 625, w: 978, h: 550 }; // a portrait photo in a card slot, 4 px off its rounded corners
    const inCard = { x: 334, y: 629, w: 407, h: 542 };
    const big = { x: 0, y: 116, w: 1080, h: 1134 }; const small = { x: 0, y: 500, w: 1080, h: 300 }; // a very wide photo: 417 px of room on each side
    return {
      fades: D.sideFades(slot, rect), card: D.sideFades(card, inCard), long: D.sideFades(big, small),
      v: D.axisStops(slot.y, slot.y + slot.h, rect.y, rect.y + rect.h, D.sideFades(slot, rect).top, D.sideFades(slot, rect).bottom),
      ease: [0, 0.25, 0.5, 0.75, 1].map((t: number) => D.fadeAt(t)),
      consts: { blur: D.DISSOLVE_BLUR, max: D.DISSOLVE_FADE_MAX, minGap: D.DISSOLVE_MIN_GAP, soft: D.DISSOLVE_EDGE_SOFT, fb: D.FEATHER_BLUR, fi: D.FEATHER_INSET },
    };
  });
  // title-over-photo: 162 px of room above and below, faded over all of it; the left and right sides are the slide's edges (no fade)
  expect(r.fades.top).toEqual({ kind: 'fade', room: 162, len: 162 });
  expect(r.fades.bottom).toEqual({ kind: 'fade', room: 162, len: 162 });
  expect(r.fades.left.kind).toBe('bleed');
  expect(r.fades.right.kind).toBe('bleed');
  // the card: 4 px of room at the top and bottom (thin, an inner edge: a soft 40 px edge), 286 px left and right (faded over all of it)
  expect(r.card.top).toEqual({ kind: 'soft', room: 4, len: 40 });
  expect(r.card.left.kind).toBe('fade');
  expect(r.card.left.len).toBe(286);
  // more room than 300 px: the fade stops at 300 and the rest is the ground
  expect(r.long.top.len).toBe(300);
  // the profile: 0 at the slot's top edge, 1 at the photo's edge, 1 across the photo, 0 again at the slot's bottom edge, never going back
  expect(r.v[0]).toEqual({ o: 0, a: 0 });
  expect(r.v[r.v.length - 1]).toEqual({ o: 1, a: 0 });
  expect(Math.max(...r.v.map((s: any) => s.a))).toBe(1);
  for (let i = 1; i < r.v.length; i++) expect(r.v[i].o).toBeGreaterThanOrEqual(r.v[i - 1].o);
  // a smooth ease (no line at either end)
  expect(r.ease).toEqual([1, 0.84375, 0.5, 0.15625, 0]);
  expect(r.consts).toEqual({ blur: 32, max: 300, minGap: 24, soft: 40, fb: 32, fi: 75 });
});

test('U2b: drawn: the photo whole on top of its mirrored, blurred, faded edge; no black veil; the slot clip the contrast check reads; a screenshot keeps its flat panel', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const FA: any = await import('/src/reference/faithful.ts');
    const PC: any = await import('/src/carousel/photoContrast.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    // a 4:3 photo: a mid-grey field with a darker band near its top and bottom edges (what the mirror must continue)
    const c = document.createElement('canvas'); c.width = 1280; c.height = 960;
    const g = c.getContext('2d')!; g.fillStyle = '#8c8c8c'; g.fillRect(0, 0, 1280, 960); g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, 1280, 120); g.fillRect(0, 840, 1280, 120);
    const url = c.toDataURL('image/png');
    FA.setPictureResolver(async () => url);
    const { style } = DL.styleFromPack(PR.presetPackFor('style-3', false, null));
    const draw = async (layout: string, k: string, v = 0) => (await DL.drawOne({ layout, fields: { headline: 'A short headline', ...(layout === 'title-over-photo' ? { line: 'A line.' } : { body: 'A line of body text.' }), image: `picture:p1#w=1280&h=960&fx=0.5&fy=0.5&z=1${k}` }, accents: [] }, v, style, { handle: '@x', index: 1, total: 5, cut: 'plain', invert: false, density: 'normal' })).built;
    const top = await draw('title-over-photo', '&k=p');
    const shot = await draw('headline-body-image', '', 1);
    // the pixels of the slide with no text: the fill above the photo, row by row (mean luminance), and the ground at the slot's top edge
    const bare = top.svg.replace(/<text\b[\s\S]*?<\/text>/g, '');
    const bm = await createImageBitmap(await FA.svgToPng(bare, 1080));
    const cv = new OffscreenCanvas(bm.width, bm.height); const gg = cv.getContext('2d', { willReadFrequently: true })!; gg.drawImage(bm, 0, 0);
    const row = (y: number) => { const d = gg.getImageData(100, y, 880, 1).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return s / (d.length / 4); };
    const rows: number[] = []; for (let y = 4; y <= 290; y += 2) rows.push(Math.round(row(y) * 10) / 10);
    const ground = Math.round((([r0, g0, b0]) => 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0)([1, 3, 5].map((i) => parseInt(top.fieldBg.slice(i, i + 2), 16))));
    return { svg: top.svg, notes: top.notes, shot: shot.svg, boxes: PC.pictureBoxesOfSvg(top.svg), rows, ground: Math.round(ground) };
  });
  // Round V: title-over-photo is drawn over the whole slide: the photo whole (4:3 in 1080 x 1350: 1080 x 810 at y 270), on top, feathered; under it the continuation: the picture and its two
  // mirrors, blurred, in the slot's clip (the whole slide), at full strength to the slide's edges
  expect(r.svg).toContain('<image href="picture:p1#w=1280&amp;h=960&amp;fx=0.5&amp;fy=0.5&amp;z=1&amp;k=p" x="0" y="270" width="1080" height="810" preserveAspectRatio="none" mask="url(#pic1x0m)"/>');
  expect(r.svg).toContain('transform="matrix(1 0 0 -1 0 540)"');
  expect(r.svg).toContain('transform="matrix(1 0 0 -1 0 2160)"');
  expect(r.svg).toContain('<feGaussianBlur stdDeviation="32" edgeMode="duplicate"/>');
  expect(r.svg).toMatch(/<clipPath id="pic1x0s"><rect x="0" y="0" width="1080" height="1350"/);
  expect(r.svg, 'nothing is darkened').not.toMatch(/fill="#000000" fill-opacity="[\d.]+"\/><\/g>/);
  expect(r.notes.join(' ')).toMatch(/drawn whole and its edges dissolve into the slide/);
  // the contrast check still sees the whole slot as the picture (text over the dissolve is measured)
  expect(r.boxes.some((b: any) => b.y === 0 && b.h === 1350)).toBe(true);
  // the fill above the photo, from the slide's top edge: never darker than the photo's own darkest edge band (no dark band), the photo's colours to the very top (not the ground), smoothly
  expect(Math.min(...r.rows)).toBeGreaterThanOrEqual(0.2126 * 0x5a + 0.7152 * 0x5a + 0.0722 * 0x5a - 4);
  expect(Math.abs(r.rows[0] - r.ground), `top row ${r.rows[0]} against the ground ${r.ground}`).toBeGreaterThan(30);
  for (let i = 1; i < r.rows.length; i++) expect(Math.abs(r.rows[i] - r.rows[i - 1]), `row ${4 + 2 * i}`).toBeLessThanOrEqual(6);
  // a screenshot drawn whole: its flat edge-colour panel and a hard clip, as before (no dissolve, no mirror)
  expect(r.shot).not.toContain('matrix(1 0 0 -1');
  expect(r.shot).not.toContain('edgeMode="duplicate"');
});
