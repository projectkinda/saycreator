// Round N part 2: a photo drawn whole fades into its blurred copy over 64 px (blur 25, inset 32), and the copy is darkened only as far as the photo's own edge: never lighter than any edge,
// never darker than today (0.42). Today's darkening stays when the copy is blown up more than 3x (a tall photo in a wide band). ZERO model calls; pictures generated in the page.
import { expect, test } from '@playwright/test';

test('N2: the fade is 64 px and the veil matches the photo edge within 0 to 0.42', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    await import('/src/carousel/designLibrary.ts'); // the layout registry first, as the app loads it
    const B: any = await import('/src/carousel/layouts/build.ts');
    const PF: any = await import('/src/carousel/layouts/pictureFit.ts');
    const FA: any = await import('/src/reference/faithful.ts');
    // a picture: `edge` luminance on its outer 60 px, `mid` inside (grey levels)
    const pic = (w: number, h: number, edge: number, mid: number) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d')!;
      g.fillStyle = `rgb(${edge},${edge},${edge})`; g.fillRect(0, 0, w, h);
      g.fillStyle = `rgb(${mid},${mid},${mid})`; g.fillRect(60, 60, w - 120, h - 120);
      return c.toDataURL('image/png');
    };
    const data: Record<string, string> = { even: pic(960, 1280, 200, 200), darkEdge: pic(960, 1280, 90, 200), black: pic(960, 1280, 0, 255) };
    FA.setPictureResolver(async (ref: string) => data[ref.slice(8).split('#')[0]] ?? null);
    // a portrait photo in a wide slot (drawn whole: bars left and right)
    const slot = { x: 0, y: 100, w: 1080, h: 675 };
    const ref = (id: string) => ({ w: 960, h: 1280 });
    const rect = PF.containRect(slot, { ...ref('x'), fx: 0.5, fy: 0.5, z: 1 }, 0);
    const cover = { x: 0, y: 100 - 0.06 * 1440, w: 1080 * 1.12, h: 1440 * 1.12 }; // the copy covers the slot, 12% larger
    const even = await PF.matchedVeil('picture:even#w=960&h=1280', slot, rect, { ...cover, x: -0.06 * 1080 });
    const darkEdge = await PF.matchedVeil('picture:darkEdge#w=960&h=1280', slot, rect, { ...cover, x: -0.06 * 1080 });
    const black = await PF.matchedVeil('picture:black#w=960&h=1280', slot, rect, { ...cover, x: -0.06 * 1080 });
    // a copy blown up 4x the photo: today's darkening
    const zoomed = await PF.matchedVeil('picture:even#w=960&h=1280', slot, { ...rect, w: cover.w / 1.12 / 4 }, { ...cover, x: -0.06 * 1080 });
    return { blur: B.FEATHER_BLUR, inset: B.FEATHER_INSET, max: PF.BACKDROP_VEIL, even, darkEdge, black, zoomed };
  });
  expect([r.blur, r.inset]).toEqual([25, 32]);
  expect(r.max).toBe(0.42);
  // an even photo: its copy is as light as its edge, no darkening at all
  expect(r.even.veil).toBe(0);
  // a darker edge: the copy is darkened down towards it, never past today's 0.42
  expect(r.darkEdge.veil).toBeGreaterThan(0);
  expect(r.darkEdge.veil).toBeLessThanOrEqual(0.42);
  expect(r.darkEdge.fill * (1 - r.darkEdge.veil)).toBeGreaterThanOrEqual(r.darkEdge.edge - 0.5);
  // a black edge on a bright photo: capped at today's darkening
  expect(r.black.veil).toBe(0.42);
  expect(r.zoomed.veil).toBe(0.42);
  expect(r.zoomed.zoom).toBeGreaterThan(3);
});

test('N2: a photo drawn whole is drawn with the 64 px fade and its matched veil; a screenshot keeps its flat panel', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const FA: any = await import('/src/reference/faithful.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const c = document.createElement('canvas'); c.width = 960; c.height = 1280;
    const g = c.getContext('2d')!; g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 960, 1280);
    const url = c.toDataURL('image/png');
    FA.setPictureResolver(async () => url);
    const { style } = DL.styleFromPack(PR.presetPackFor('style-3', false, null));
    const draw = async (k: string) => (await DL.drawOne({ layout: 'headline-body-image', fields: { headline: 'A short headline', body: 'A line of body text.', image: `picture:p1#w=960&h=1280&fx=0.5&fy=0.5&z=1${k}` }, accents: [] }, 1, style, { handle: '@x', index: 1, total: 5, cut: 'plain', invert: false, density: 'normal' })).built.svg as string;
    return { photo: await draw('&k=p'), shot: await draw('') };
  });
  const veil = /fill="#000000" fill-opacity="([\d.]+)"\/><\/g>/.exec(r.photo);
  expect(r.photo).toMatch(/<feGaussianBlur stdDeviation="25"\/><\/filter><mask/);
  expect(veil, 'the blurred copy has a veil').not.toBeNull();
  expect(Number(veil![1])).toBeLessThanOrEqual(0.42);
  expect(Number(veil![1]), 'an even grey photo: the copy is not darkened').toBe(0);
  expect(r.shot).not.toMatch(/fill-opacity="[\d.]+"\/><\/g>/);
});
