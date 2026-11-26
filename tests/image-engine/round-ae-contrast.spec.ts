// Round AE part 3: the text-over-picture measure (Round T) reads a line in runs of the words between marker bars. A highlighted word reads on its own bar in its own ink; one box spanning the bar
// read the bar's colour against the line's ink, so "get low or get high" with "low" and "high" on dark-red bars measured 1.77:1 at every scrim level and was never repaired. Dark ink that
// really sits on a dark photo still fails. Pictures are made in the page: ZERO model calls.
import { expect, test } from '@playwright/test';

test('AE3: a title with marker words over a bright photo is measured on the photo between the bars (it reads); dark ink over a dark photo still fails', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const FA: any = await import('/src/reference/faithful.ts');
    const PC: any = await import('/src/carousel/photoContrast.ts');
    const BD: any = await import('/src/carousel/layouts/build.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const pic = (top: string, bottom: string) => { const c = document.createElement('canvas'); c.width = 900; c.height = 1200; const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 1200); gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, 900, 1200); return c.toDataURL('image/jpeg', 0.9); };
    const urls: Record<string, string> = { sunset: pic('#ffb347', '#ff7a1a'), night: pic('#202326', '#0b0c0d') };
    FA.setPictureResolver(async (ref: string) => urls[ref.slice(8).split('#')[0]]);
    const { style } = DL.styleFromPack(PR.presetPackFor('editorial-collage', false, null));
    const spec = (id: string) => ({ layout: 'title-over-photo', fields: { headline: 'Get low or get high', line: 'Eye level is what everyone else does.', image: `picture:${id}#w=1800&h=2400&fx=0.5&fy=0.5&z=1&k=p` }, accents: ['low', 'high'] });
    const o = { handle: '', index: 3, total: 7, cut: 'plain', invert: false, density: 'normal', ground: 3 };
    const d = await DL.drawOne(spec('sunset'), 0, style, o);
    const m = await PC.measurePhotoContrast(d.built);
    const runs = PC.linesOverPictures(d.built).filter((x: any) => x.role === 'title').map((x: any) => Math.round(x.box.w));
    const bars = (d.built.layers as any[]).filter((l) => l.kind === 'text' && l.name === 'title').length;
    // the same drawing (dark ink) with its scrim taken out and a near-black photo under it: the runs read the photo, so the title fails
    const raw = await BD.buildSlide('title-over-photo', 0, spec('sunset').fields, style, { ...o, scrim: 0 });
    const noScrim = raw.svg.replace(/<rect [^>]*fill="url\(#scrim\w*\)"\/>/g, '');
    urls.sunset = urls.night;
    const dark = await PC.measurePhotoContrast({ ...raw, svg: noScrim });
    return { title: m.roles.find((x: any) => x.role === 'title'), runs, bars, dark: dark.roles.find((x: any) => x.role === 'title'), darkInk: raw.layers.find((l: any) => l.kind === 'text' && l.name === 'title')?.style?.color };
  });
  expect(r.bars).toBe(1);
  // two lines of the title ("get low or" / "get high"): the runs between the bars ("get", "or", "get"), never one box across a bar
  expect(r.runs.length).toBeGreaterThanOrEqual(2);
  expect(r.title.pass, `title ${r.title.ratio}:1`).toBe(true);
  expect(r.title.ratio).toBeGreaterThanOrEqual(3);
  expect(r.title.ratio).not.toBe(1.77);
  // a real failure is still found: dark ink over a near-black photo between the bars
  expect(r.darkInk).toBe('#1B1914');
  expect(r.dark.pass, `dark photo under dark ink: ${r.dark.ratio}:1`).toBe(false);
});
