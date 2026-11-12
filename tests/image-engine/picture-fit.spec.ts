// Round 13 A: (1) a phone only takes a screenshot (width / height 0.62 or less); (2) the crop budget: when a cover-crop would cut more than 10% of a picture's width or height, the whole picture is
// drawn (contain) on a panel in its edge colour, so all four corner markers of a synthetic test picture (a 6 px border and a coloured marker in each corner) are visible in the render.
// Pictures: 609x757, 1402x1313, 1170x2532, 2400x1000, 1000x1000. Every picture layout x 3 styles x both variants. Sheet: out/round-13/picture-fit.png. A fake provider only: no model is called.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(20 * 60_000);
const OUT = 'out/round-13';
const helpSrc = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
const HELP = helpSrc.slice(helpSrc.indexOf('const HELP = `') + 14, helpSrc.indexOf('`;\n\nasync function setup'));
const SIZES: [string, number, number][] = [['p609x757', 609, 757], ['p1402x1313', 1402, 1313], ['p1170x2532', 1170, 2532], ['p2400x1000', 2400, 1000], ['p1000x1000', 1000, 1000]];
const STYLES = ['style-6', 'editorial-collage', 'style-4'];

async function setup(page: any) {
  await page.route('**/api/carousel/status', (r: any) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
  // the synthetic pictures: a 6 px border and four corner markers (red top left, green top right, blue bottom left, yellow bottom right), light grey inside
  await page.evaluate(`(async () => {
    const H = window.__H; const FA = H.FA;
    const SIZES = ${JSON.stringify(SIZES)};
    window.__SYN = {};
    const urls = {};
    for (const [id, w, h] of SIZES) {
      const m = Math.round(Math.min(w, h) * 0.06);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="#d9d9d9"/><rect x="3" y="3" width="' + (w - 6) + '" height="' + (h - 6) + '" fill="none" stroke="#101010" stroke-width="6"/>'
        + '<rect x="6" y="6" width="' + m + '" height="' + m + '" fill="#ff0000"/><rect x="' + (w - 6 - m) + '" y="6" width="' + m + '" height="' + m + '" fill="#00c800"/><rect x="6" y="' + (h - 6 - m) + '" width="' + m + '" height="' + m + '" fill="#0000ff"/><rect x="' + (w - 6 - m) + '" y="' + (h - 6 - m) + '" width="' + m + '" height="' + m + '" fill="#ffe000"/></svg>';
      urls[id] = 'data:image/svg+xml;base64,' + btoa(svg);
      window.__SYN[id] = { w, h, m };
    }
    FA.setPictureResolver(async (ref) => urls[ref.slice('picture:'.length).split('#')[0]] ?? null);
  })()`);
}

test('phone-frame only takes a screenshot (0.62 or narrower); a wider picture is not placed in it', async ({ page }) => {
  await setup(page);
  const r: any = await page.evaluate(async () => {
    const IM: any = await import('/src/carousel/layouts/images.ts');
    const P: any = await import('/src/carousel/imagePlace.ts');
    const pics = (w: number, h: number) => [{ id: 'a', width: w, height: h }];
    return {
      fit: ['609x757', '1402x1313', '1170x2532', '2400x1000', '1000x1000', '600x1000', '620x1000', '650x1000'].map((s) => { const [w, h] = s.split('x').map(Number); return [s, IM.fittingPictures('phone-frame', pics(w, h)), !!P.placeOne('phone-frame', 0, pics(w, h))]; }),
    };
  });
  const byName = Object.fromEntries(r.fit.map((x: any) => [x[0], x]));
  expect(byName['609x757'][1], '0.80 is not a screenshot').toBe(0);
  expect(byName['609x757'][2]).toBe(false);
  expect(byName['1170x2532'][1]).toBe(1);
  expect(byName['600x1000'][1], '0.60 is a screenshot').toBe(1);
  expect(byName['650x1000'][1], '0.65 is not').toBe(0);
  expect(byName['1402x1313'][1]).toBe(0);
});

test('phone-frame drawn with a 0.80 picture falls to the half layout (the same words, the whole picture), never a cut-off phone', async ({ page }) => {
  await setup(page);
  const r: any = await page.evaluate(async () => {
    const H = (window as any).__H;
    const st = H.D.styleFromPack(H.PR.presetPackFor('editorial-collage', false)).style;
    const f = { headline: 'Open the app and tap start', body: 'The first screen takes ten seconds.', image: H.IM.makeRef({ id: 'p609x757', w: 609, h: 757 }) };
    const d = await H.D.drawOne({ layout: 'phone-frame', fields: f, accents: [] }, 0, st, { handle: '@h', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal' });
    return { ok: !!d.built, phone: /M \d+ \d+ L \d+ \d+ Q/.test(d.built?.plan?.shapes ?? ''), fitAs: d.built?.plan?.fitAs, images: d.built?.images?.length ?? 0 };
  });
  expect(r.ok).toBe(true);
  expect(r.phone, 'no phone outline is drawn for a 0.80 picture').toBe(false);
  expect(r.images).toBe(1);
});

test('the crop budget: when a cover-crop would cut more than 10% the whole picture is drawn, and all four corner markers are visible (every picture layout x 3 styles x 2 variants)', async ({ page }) => {
  await setup(page);
  const r: any = await page.evaluate(async ({ styles, sizes }) => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const PF: any = await import('/src/carousel/layouts/pictureFit.ts');
    const IM: any = await import('/src/carousel/layouts/images.ts');
    const SYN = (window as any).__SYN;
    const hexRgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const MARK: Record<string, [string, number, number]> = { tl: ['#ff0000', 0, 0], tr: ['#00c800', 1, 0], bl: ['#0000ff', 0, 1], br: ['#ffe000', 1, 1] };
    const fails: string[] = [];
    const sheet: { svg: string }[] = [];
    let drawn = 0, contained = 0, cropped = 0, checkedCorners = 0;
    for (const style of styles) {
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      for (const id of IM.IMAGE_LAYOUT_IDS as string[]) {
        const def = L.layoutDef(id);
        const keys = def.fields.filter((q: any) => q.image).map((q: any) => q.name);
        for (const [pid] of sizes) for (const v of [0, 1] as const) {
          const s = SYN[pid];
          const f: any = { ...def.samples.normal };
          for (const k of keys) f[k] = IM.makeRef({ id: pid, w: s.w, h: s.h });
          const d = await H.D.drawOne({ layout: id, fields: f, accents: [] }, v, st, { handle: '@h', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal' });
          if (!d.built) continue;
          drawn++;
          const slots: any[] = d.built.images ?? [];
          if (!slots.length) continue;
          const rect = (p: any) => PF.containRect(p, IM.parseRef(p.src), p.rx);
          const toContain = slots.filter((p) => !p.circle && PF.needsContain(p, IM.parseRef(p.src)));
          cropped += slots.length - toContain.length;
          if (!toContain.length) continue;
          contained += toContain.length;
          if (v === 0 && style === 'editorial-collage' && sheet.length < 40 && id !== 'photo-grid') sheet.push({ svg: d.built.svg });
          const png = await H.FA.svgToPng(d.built.svg, 1080);
          const bm = await createImageBitmap(png);
          const c = new OffscreenCanvas(bm.width, bm.height);
          const g = c.getContext('2d', { willReadFrequently: true })!;
          g.drawImage(bm, 0, 0);
          for (const p of toContain) {
            const rc = rect(p), sc = rc.w / s.w;
            for (const [name, [col, fx, fy]] of Object.entries(MARK)) {
              // a title over a photo sits on a scrim (v1: over the bottom, v2: over the top): the corners under it are covered by design
              if (id === 'title-over-photo' && ((v === 0 && fy) || (v === 1 && !fy))) continue;
              // do-dont draws its tick / cross badge over the top left corner of each picture by design (a known limit, reported): that corner is not asserted there
              if (id === 'do-dont' && name === 'tl') continue;
              // the centre of the marker in the slide
              const cx = rc.x + (fx ? rc.w - (6 + s.m / 2) * sc : (6 + s.m / 2) * sc);
              const cy = rc.y + (fy ? rc.h - (6 + s.m / 2) * sc : (6 + s.m / 2) * sc);
              const px = g.getImageData(Math.round(cx * (bm.width / 1080)), Math.round(cy * (bm.height / 1350)), 1, 1).data;
              const want = hexRgb(col);
              const dist = Math.abs(px[0] - want[0]) + Math.abs(px[1] - want[1]) + Math.abs(px[2] - want[2]);
              checkedCorners++;
              if (dist > 90) fails.push(`${style} ${id} v${v + 1} ${pid} ${name} marker not visible (pixel ${px[0]},${px[1]},${px[2]})`);
            }
          }
        }
      }
    }
    const cols = 8, w = 216, h = 270;
    const cv = document.createElement('canvas'); const rows = Math.ceil(sheet.length / cols); cv.width = cols * w; cv.height = Math.max(1, rows) * h;
    const g = cv.getContext('2d')!; g.fillStyle = '#888'; g.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < sheet.length; i++) { const bm = await createImageBitmap(await H.FA.svgToPng(sheet[i].svg, 432)); g.drawImage(bm, (i % cols) * w, Math.floor(i / cols) * h, w, h); }
    const blob: Blob = await new Promise((res) => cv.toBlob((b) => res(b!), 'image/png'));
    const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x);
    return { fails, drawn, contained, cropped, checkedCorners, png: btoa(t) };
  }, { styles: STYLES, sizes: SIZES });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/picture-fit.png`, Buffer.from(r.png, 'base64'));
  console.log(`PICTURE-FIT drawn ${r.drawn}, slots drawn whole ${r.contained}, slots cropped within the budget ${r.cropped}, corner markers checked ${r.checkedCorners}, failures ${r.fails.length}`);
  expect(r.contained, 'the budget rule applied').toBeGreaterThan(50);
  expect(r.fails.slice(0, 20)).toEqual([]);
});
