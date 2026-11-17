// Round V part 1: title-over-photo is edge to edge. The photo (filled, or shown whole with its continuation) covers the whole slide, top to bottom and side to side; the page chrome sits over it
// and the Round T repair (a plate, or the other ink) keeps it readable. Shown whole, the continuation is the photo's own edge, mirrored and blurred, at full strength to the slide's edges (no
// fade to the ground, no veil); the only darkening is the scrim behind the headline. photo-full-caption's photo runs on to the slide's edge on the side away from its caption panel. The text
// does not move, and the slide still reports the picture zone as its picture (the layout placement does not change). ZERO model calls; pictures made in the page.
import { expect, test, type Page } from '@playwright/test';

/** A 4:3 photo (1280 x 960) with a coloured top band and a dark bottom band, and a near-white one. */
const makePics = (page: Page) => page.evaluate(() => {
  const mk = (top: string, mid: string, bottom: string) => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 960; const g = c.getContext('2d')!;
    g.fillStyle = mid; g.fillRect(0, 0, 1280, 960); g.fillStyle = top; g.fillRect(0, 0, 1280, 200); g.fillStyle = bottom; g.fillRect(0, 760, 1280, 200);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${0.05 + (i % 5) * 0.02})`; g.fillRect((i * 211) % 1280, 220 + ((i * 97) % 520), 60, 30); }
    return c.toDataURL('image/png');
  };
  return { warm: mk('#d9822b', '#6d8a5a', '#2c3a2a'), white: mk('#f7f7f5', '#f2f2f0', '#ececea') };
});

const DRAW = `(async ({ pics, layout, v, styleId }) => {
  const DL = await import('/src/carousel/designLibrary.ts'); const PR = await import('/src/carousel/presets.ts'); const FA = await import('/src/reference/faithful.ts');
  const PC = await import('/src/carousel/photoContrast.ts');
  const fonts = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
  FA.setPictureResolver(async (ref) => pics[ref.slice(8).split('#')[0]] ?? null);
  const { style } = DL.styleFromPack(PR.presetPackFor(styleId, false, null));
  const out = {};
  for (const id of Object.keys(pics)) {
    const f = { headline: 'Met some wonderful people there.', image: 'picture:' + id + '#w=1280&h=960&fx=0.5&fy=0.5&z=1&k=p' };
    const d = await DL.drawOne({ layout, fields: f, accents: [] }, v, style, { handle: '@saycreator', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal', ground: 0 });
    const st = await DL.settlePhotoContrast([d], [layout]);
    const b = st.drawn[0].built;
    // the slide drawn without its text: the mean colour of the top 40 rows, the left and right 30 columns, and the ground colour of the style
    const bare = b.svg.replace(/<text\\b[\\s\\S]*?<\\/text>/g, '').replace(/<rect data-role="(chrome|side-label)-plate"[^>]*\\/>/g, '');
    const bm = await createImageBitmap(await FA.svgToPng(bare, 540));
    const c = new OffscreenCanvas(bm.width, bm.height); const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0);
    const mean = (x, y, w, h) => { const p = g.getImageData(x, y, w, h).data; let r = 0, gg = 0, bb = 0; for (let i = 0; i < p.length; i += 4) { r += p[i]; gg += p[i + 1]; bb += p[i + 2]; } const n = p.length / 4; return [r / n, gg / n, bb / n].map(Math.round); };
    out[id] = {
      svg: b.svg, images: b.images, layers: b.layers.filter((l) => l.kind === 'text' && (l.name === 'title' || l.name === 'body')).map((l) => ({ name: l.name, x: l.x, y: l.y, w: l.width, h: l.height, size: l.style.size })),
      top: mean(0, 0, 540, 20), left: mean(0, 200, 15, 200), right: mean(525, 200, 15, 200), ground: b.fieldBg, row: st.rows[0], fills: b.fills ?? null,
      boxes: PC.pictureBoxesOfSvg(b.svg),
    };
  }
  return out;
})`;
const draw = (page: Page, a: Record<string, unknown>) => page.evaluate(`${DRAW}(${JSON.stringify(a)})`) as Promise<any>;
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

for (const styleId of ['style-1', 'style-3']) {
  test(`V1a ${styleId}: title-over-photo covers the whole slide (no strip of ground above the photo), in both variants, and every text over it reads`, async ({ page }) => {
    await page.goto('/images/carousel');
    const pics = await makePics(page);
    for (const v of [0, 1]) {
      const r = await draw(page, { pics, layout: 'title-over-photo', v, styleId });
      for (const id of ['warm', 'white']) {
        const x = r[id];
        const tag = `${styleId} v${v} ${id}`;
        // the picture reaches every edge of the slide
        expect(x.boxes.some((b: any) => b.x === 0 && b.y === 0 && b.w === 1080 && b.h === 1350), tag).toBe(true);
        // the top rows and the side columns come from the photo, not from the ground (variant 0: no scrim at the top)
        const ground = hexRgb(x.ground);
        // (a near-white photo is close to a cream ground by colour, so the ground test is on the warm photo; the own-colour test below holds for both)
        if (v === 0 && id === 'warm') expect(dist(x.top, ground), `${tag}: top rows ${x.top} vs ground ${x.ground}`).toBeGreaterThan(40);
        // the top rows are the photo's own colours (its edge mirrored, blurred: the top band and the field under it), not the ground
        const own = id === 'warm' ? [[0xd9, 0x82, 0x2b], [0x6d, 0x8a, 0x5a]] : [[0xf7, 0xf7, 0xf5], [0xf2, 0xf2, 0xf0]];
        if (v === 0) expect(Math.min(...own.map((c) => dist(x.top, c))), `${tag}: top rows ${x.top} are the photo's own colours`).toBeLessThan(60);
        if (id === 'warm') expect(dist(x.left, ground), `${tag}: left columns`).toBeGreaterThan(40);
        if (id === 'warm') expect(dist(x.right, ground), `${tag}: right columns`).toBeGreaterThan(40);
        // nothing darkens the continuation (no veil); the only dark layer is the headline's scrim
        expect(x.svg, tag).not.toMatch(/fill="#000000" fill-opacity="[\d.]+"\/><\/g>/);
        // every text over the photo reads (the headline, its line, the page chrome, the side label), after the Round T repairs
        expect(x.row?.pass, `${tag}: ${JSON.stringify(x.row?.roles?.filter((q: any) => !q.pass))}`).toBe(true);
        expect(x.row.roles.some((q: any) => q.role === 'title' && q.pass)).toBe(true);
        // the slide still reports the picture zone as its picture (the layout placement measures it), the text sits where it did
        expect(x.images[0].y, tag).toBeGreaterThanOrEqual(116);
        expect(x.images[0].y + x.images[0].h, tag).toBeLessThanOrEqual(1250);
        const title = x.layers.find((l: any) => l.name === 'title');
        expect(title.y, tag).toBeGreaterThanOrEqual(x.images[0].y);
        expect(title.y + title.h, tag).toBeLessThanOrEqual(x.images[0].y + x.images[0].h);
      }
      // the same photo, the same text: the text layers are the same in both photos (the picture does not move the text)
      expect(r.warm.layers).toEqual(r.white.layers);
    }
  });
}

test('V1b photo-full-caption: the photo runs on to the slide edge on the side away from the caption panel (no strip of ground there); the panel and the text stay', async ({ page }) => {
  await page.goto('/images/carousel');
  const pics = await makePics(page);
  const below = await draw(page, { pics: { warm: pics.warm }, layout: 'photo-full-caption', v: 0, styleId: 'style-1' });
  const above = await draw(page, { pics: { warm: pics.warm }, layout: 'photo-full-caption', v: 1, styleId: 'style-1' });
  expect(below.warm.boxes.some((b: any) => b.y === 0 && b.w === 1080), JSON.stringify(below.warm.boxes)).toBe(true);
  expect(dist(below.warm.top, hexRgb(below.warm.ground))).toBeGreaterThan(40);
  expect(above.warm.boxes.some((b: any) => b.y + b.h === 1350 && b.w === 1080), JSON.stringify(above.warm.boxes)).toBe(true);
  for (const x of [below.warm, above.warm]) expect(x.row?.pass ?? true, JSON.stringify(x.row?.roles)).toBe(true);
});
