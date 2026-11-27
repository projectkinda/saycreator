// Round AH part 2: photo-full-caption with its caption panel below the photo: the panel (the card colour) runs on to the slide's bottom edge, so the band and the strip under it are one colour
// (dark-quiet's light ground drew a grey band over a near-white strip). The page chrome on it still reads; the text keeps its place; the panel above the photo is unchanged.
// A picture made in the page: ZERO model calls.
import { expect, test } from '@playwright/test';

test('AH2 the caption panel below the photo reaches the bottom edge in the card colour; the chrome reads; the panel above is unchanged; the words are the same', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const DL: any = await import('/src/carousel/designLibrary.ts'); const PR: any = await import('/src/carousel/presets.ts'); const FA: any = await import('/src/reference/faithful.ts');
    const RC: any = await import('/src/reference/recreate.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const c = document.createElement('canvas'); c.width = 1500; c.height = 844; const g = c.getContext('2d')!; g.fillStyle = '#6fb3e8'; g.fillRect(0, 0, 1500, 844); g.fillStyle = '#f2d2b0'; g.beginPath(); g.arc(750, 420, 260, 0, 7); g.fill();
    const u = c.toDataURL('image/jpeg', 0.9); FA.setPictureResolver(async () => u);
    const { style } = DL.styleFromPack(PR.presetPackFor('dark-quiet', false, null));
    const fields = { headline: 'A smile in the middle of a blue sky.', image: 'picture:ps#w=1500&h=844&fx=0.5&fy=0.5&z=1&k=p' };
    const draw = async (v: 0 | 1) => (await DL.drawOne({ layout: 'photo-full-caption', fields, accents: [] }, v, style, { handle: '', index: 3, total: 7, cut: 'plain', invert: false, density: 'normal', ground: 3 })).built;
    const below = await draw(0), above = await draw(1);
    const ground = style.rhythm[3];
    const rects = (svg: string) => [...svg.matchAll(/<rect x="0" y="([\d.]+)" width="1080" height="([\d.]+)"[^>]*fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => ({ y: +m[1], h: +m[2], fill: m[3].toUpperCase() }));
    const chrome = below.layers.filter((l: any) => l.kind === 'text' && /\d+ \/ \d+|swipe/.test(l.text ?? '')).map((l: any) => l.style?.color);
    const words = (b: any) => b.layers.filter((l: any) => l.kind === 'text' && ['title', 'body'].includes(l.name)).map((l: any) => l.text).join(' | ');
    return { ground, below: rects(below.svg), above: rects(above.svg), chrome, ratio: chrome.map((ink: string) => RC.contrastOf(ink, ground.surface)), wb: words(below), wa: words(above) };
  });
  const surf = r.ground.surface.toUpperCase();
  const band = r.below.find((x: any) => x.fill === surf);
  expect(band, 'the caption panel in the card colour').toBeTruthy();
  expect(band.y + band.h, 'it reaches the bottom edge').toBe(1350);
  const top = r.above.find((x: any) => x.fill === surf);
  expect(top.y + top.h, 'the panel above the photo stays as it was').toBeLessThan(1350);
  expect(r.chrome.length).toBeGreaterThan(0);
  for (const x of r.ratio) expect(x, 'the page chrome reads on the band').toBeGreaterThanOrEqual(4.5);
  expect(r.wb.toLowerCase()).toContain('blue sky');
  expect(r.wb).toBe(r.wa);
});
