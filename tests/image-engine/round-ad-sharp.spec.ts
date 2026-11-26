// Round AD: small whole photos no longer look blurry. (a) A photo drawn whole that covers less than 70% of its slot is drawn sharp, whole and centred in the slot, with the style's corner radius,
// on the flat ground: no blurred mirror, no faded edge. At 70% or more it still dissolves (Round U). (b) The shape pass accepts a small whole photo only when no layout that keeps every word fits
// the photo better; pinned pictures are never touched. (c) The name box says what it is for, and a short line asks for names while no picture has one (round-18.spec checks the box).
// ZERO model calls; pictures are made in the page.
import { expect, test } from '@playwright/test';

test('AD1: a whole photo under 70% of its slot is drawn sharp with rounded corners on the ground; one at 70% or more still dissolves', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const FA: any = await import('/src/reference/faithful.ts');
    const PF: any = await import('/src/carousel/layouts/pictureFit.ts');
    const PC: any = await import('/src/carousel/photoContrast.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const pic = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; g.fillStyle = '#5a7a4a'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9b48a'; g.fillRect(w * 0.3, h * 0.3, w * 0.4, h * 0.4); return c.toDataURL('image/png'); };
    const urls: Record<string, string> = { sq: pic(1200, 1200), wide: pic(1150, 1000) };
    FA.setPictureResolver(async (ref: string) => urls[ref.slice(8).split('#')[0]] ?? urls.sq);
    const { style } = DL.styleFromPack(PR.presetPackFor('editorial-collage', false, null));
    const draw = async (layout: string, id: string, w: number, h: number, v: 0 | 1) => (await DL.drawOne({ layout, fields: { headline: 'The best part was the empty road.', ...(layout === 'title-over-photo' ? { line: 'Trees on both sides.' } : { body: 'Trees on both sides.' }), image: `picture:${id}#w=${w}&h=${h}&fx=0.5&fy=0.5&z=1&k=p` }, accents: [] }, v, style, { handle: '', index: 3, total: 7, cut: 'plain', invert: false, density: 'normal' })).built;
    const small = await draw('headline-body-image', 'sq', 1200, 1200, 1);
    // a photo of 1.15 : 1 in the same wide slot: a cover crop cuts 28% (drawn whole), and drawn whole it covers 72% of the slot
    const big = await draw('headline-body-image', 'wide', 1150, 1000, 1);
    const bigIn = PF.containRect(big.images[0], { w: 1150, h: 1000, z: 1 }, big.images[0].rx);
    const slot = small.images[0];
    const inSlot = PF.containRect(slot, { w: 1200, h: 1200, z: 1 }, slot.rx);
    return { svg: small.svg, notes: small.notes, slot, inSlot, share: (inSlot.w * inSlot.h) / (slot.w * slot.h), radius: Math.max(12, Math.min(48, style.radius ?? 28)), bigSvg: big.svg, bigNotes: big.notes, bigShare: (bigIn.w * bigIn.h) / (big.images[0].w * big.images[0].h), boxes: PC.pictureBoxesOfSvg(small.svg), threshold: PF.SHARP_WHOLE_SHARE };
  });
  expect(r.threshold).toBe(0.7);
  expect(r.share, 'the square photo covers less than 70% of the wide slot').toBeLessThan(0.7);
  const f = (n: number) => Math.round(n * 10) / 10;
  // drawn whole, centred in the slot, clipped with the style's corner radius; no mask, no mirror, no blur of its own
  expect(r.svg).toContain(`<clipPath id="pic3x0"><rect x="${r.inSlot.x}" y="${r.inSlot.y}" width="${r.inSlot.w}" height="${r.inSlot.h}" rx="${r.radius}"/></clipPath>`);
  expect(r.svg).toMatch(new RegExp(`<image href="picture:sq[^"]*" x="${f(r.inSlot.x)}" y="${f(r.inSlot.y)}" width="${f(r.inSlot.w)}" height="${f(r.inSlot.h)}" preserveAspectRatio="none" clip-path="url\\(#pic3x0\\)"/>`));
  expect(r.svg).not.toContain('pic3x0m');
  expect(r.svg).not.toContain('pic3x0s');
  expect(r.svg).not.toContain('pic3x0b');
  expect(r.svg).not.toMatch(/matrix\(-?1 0 0 -?1/);
  expect(r.notes.join(' ')).toMatch(/drawn whole and sharp on the ground, with rounded corners/);
  // the contrast check reads the photo's own box (the text beside it sits on the ground)
  expect(r.boxes.some((b: any) => Math.abs(b.w - r.inSlot.w) < 1 && Math.abs(b.h - r.inSlot.h) < 1)).toBe(true);
  // at 70% of its slot or more it still dissolves (Round U), as before
  expect(r.bigShare).toBeGreaterThanOrEqual(0.7);
  expect(r.bigSvg).toContain('mask="url(#pic3x0m)"');
  expect(r.bigSvg).toContain('<feGaussianBlur stdDeviation="32" edgeMode="duplicate"/>');
  expect(r.bigNotes.join(' ')).toMatch(/drawn whole and its edges dissolve into the slide/);
});

test('AD2: the shape pass takes a layout that fits the photo before it accepts a small whole photo; with none, the small whole photo stays; a pinned picture is never moved', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const S: any = await import('/src/carousel/photoShape.ts');
    const I: any = await import('/src/carousel/layouts/images.ts');
    const pic = { id: 'p1', width: 1200, height: 1200, content: 'photo' };
    const ref = I.makeRef({ id: 'p1', w: 1200, h: 1200, photo: true });
    const sp = { layout: 'headline-body-image', fields: { headline: 'The best part was the empty road.', body: 'Trees on both sides.', image: ref }, accents: [] };
    const deck = [{ layout: 'statement', fields: { headline: 'A start.' }, accents: [] }, sp, { layout: 'statement', fields: { headline: 'An end.' }, accents: [] }];
    // the fake drawing: the slot each layout gives the photo (a wide strip for the writer's layout: drawn whole on 63%; `fits` fills its slot with a small cut)
    const run = async (fits: string | null, deck0: any[]) => {
      const draws: string[] = [];
      const draw = async (s: any) => {
        draws.push(s.layout);
        const f = Object.values(s.fields).find((v: any) => typeof v === 'string' && v.startsWith('picture:')) as string;
        if (!f) return [];
        const box = s.layout === fits ? { w: 700, h: 760 } : s.layout === 'headline-body-image' ? { w: 1080, h: 676 } : { w: 1080, h: 600 };
        return [{ src: f, x: 0, y: 200, ...box, rx: 0 }];
      };
      const rotate = (list: any[]) => ({ variants: list.map(() => 0), repeats: new Map() });
      const out = await S.shapePass(deck0, { hasPhoto: true, images: [pic] }, draw, rotate);
      return { layout: out.specs[1].layout, rows: out.rows, swaps: out.swaps, draws };
    };
    const tried = await run(null, deck);
    // the first other layout the pass could carry the words to (the one the test makes fit)
    const other = tried.draws.find((l: string) => l !== 'headline-body-image');
    const moved = other ? await run(other, deck) : null;
    const pinned = other ? await run(other, deck.map((s, k) => (k === 1 ? { ...s, pin: { picture: 'p1' } } : s))) : null;
    return { tried, other, moved, pinned };
  });
  // no other layout fits: the small whole photo is kept (it is drawn sharp on the ground, AD1)
  expect(r.other, 'the pass tried at least one other layout that keeps every word').toBeTruthy();
  expect(r.tried.layout).toBe('headline-body-image');
  expect(r.tried.rows[0].before.whole).toBe(true);
  expect(r.tried.rows[0].before.slotShare).toBeLessThan(0.7);
  // a layout that fills its slot with the photo within the crop budget: the slide moves there, every word kept, although the old rule (55%) kept 63%
  expect(r.tried.rows[0].before.slotShare).toBeGreaterThanOrEqual(0.55);
  expect(r.moved.layout).toBe(r.other);
  expect(r.moved.rows[0].after.whole).toBe(false);
  expect(r.moved.swaps[0].why).toMatch(/^photo shape: the photo was drawn whole on 63% of its slot/);
  // the person's own pick: never measured, never moved
  expect(r.pinned.layout).toBe('headline-body-image');
  expect(r.pinned.rows).toEqual([]);
});
