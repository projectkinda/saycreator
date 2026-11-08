// Cleanup round (v13), code only, zero model calls: portrait-closing as a full page, cover-art rebalanced, body text under pictures as large as it fits (picture never under its slot
// minimum, title >= body), style-5 closing on a green card, style-1 prose scaled up (fill >= 65% with short text).
import { expect, test } from '@playwright/test';

test.setTimeout(10 * 60_000);

test('portrait-closing is a full page: the portrait is the hero (>= 40% of the page), text below, no band; with no picture the fallback fills the page', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const out: any[] = [];
    const styles: Record<string, any> = { 'style-5': D.styleFromPack(PR.presetPackFor('style-5', false)).style, 'style-7': D.styleFromPack(PR.presetPackFor('style-7', false)).style, 'style-4': D.styleFromPack(PR.presetPackFor('style-4', false)).style };
    const def = L.layoutDef('portrait-closing')!;
    for (const [sn, st] of Object.entries<any>(styles)) for (const v of [0, 1] as const) for (const len of ['short', 'normal', 'long'] as const) for (const pic of [true, false]) {
      const f: any = { ...(def.samples as any)[len] };
      if (pic) f.image = L.placeholderImage('portrait');
      const b = await L.buildSlide('portrait-closing', v, f, st, { handle: '@quick.flip', index: 7, total: 8, cut: 'plain' });
      if (!b.ok) { out.push({ tag: `${sn}/v${v + 1}/${len}/${pic}`, err: b.errors[0] }); continue; }
      const texts = (b.layers as any[]).filter((l) => l.kind === 'text' && l.text && !String(l.name).startsWith('recurring'));
      const shapes = (b.layers as any[]).filter((l) => l.kind === 'shape' && l.y > 100 && l.y < 1260 && l.height < 1000);
      const imgs = (b.images ?? []) as any[];
      const boxes = [...texts.map((l) => [l.y, l.y + l.height]), ...shapes.map((l) => [l.y, l.y + l.height]), ...imgs.map((p) => [p.y, p.y + p.h])];
      const top = Math.min(...boxes.map((q) => q[0])), bottom = Math.max(...boxes.map((q) => q[1]));
      // a full-width accent band (the old band) above the portrait
      const band = shapes.some((l) => l.width > 900 && l.height > 250 && l.height < 450 && pic);
      out.push({ tag: `${sn}/v${v + 1}/${len}/${pic ? 'with' : 'without'}`, pic, imgH: imgs[0]?.h ?? 0, imgW: imgs[0]?.w ?? 0, imgY: imgs[0]?.y ?? 0, top, bottom, fill: (bottom - top) / 1000, band, minBody: Math.min(...texts.filter((l) => l.name === 'body').map((l) => l.style.size)) });
    }
    return out;
  });
  for (const x of r) {
    expect(x.err, x.tag).toBeUndefined();
    if (x.pic) {
      expect(x.imgH, `${x.tag}: the portrait is at least 40% of the page (1350 px)`).toBeGreaterThanOrEqual(0.4 * 1350 - 1);
      expect(x.imgW, `${x.tag}: and it is wide enough to be the hero`).toBeGreaterThanOrEqual(400);
      expect(x.band, `${x.tag}: no band`).toBe(false);
    }
    expect(x.fill, `${x.tag}: fills the page`).toBeGreaterThanOrEqual(pickFill(x.pic));
    expect(x.minBody, `${x.tag}: body text at least 44`).toBeGreaterThanOrEqual(44);
  }
  function pickFill(pic: boolean) { return pic ? 0.72 : 0.8; }
});

test('cover-art (circle): the art and the headline fill the page evenly, no empty half', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const st = D.styleFromPack(PR.presetPackFor('style-7', false)).style;
    const def = L.layoutDef('cover-art')!;
    const out: any[] = [];
    for (const v of [0, 1] as const) for (const len of ['short', 'normal', 'long'] as const) {
      const f: any = { ...(def.samples as any)[len], image: L.placeholderImage('art') };
      const b = await L.buildSlide('cover-art', v, f, st, { handle: '@quick.flip', index: 0, total: 8, cut: 'plain' });
      const texts = (b.layers as any[]).filter((l) => l.kind === 'text' && l.text && !String(l.name).startsWith('recurring'));
      const imgs = (b.images ?? []) as any[];
      const ys = [...texts.map((l) => [l.y, l.y + l.height]), ...imgs.map((p) => [p.y, p.y + p.h])];
      out.push({ tag: `v${v + 1}/${len}`, v, d: imgs[0]?.w ?? 0, h: imgs[0]?.h ?? 0, top: Math.min(...ys.map((q) => q[0])), bottom: Math.max(...ys.map((q) => q[1])), titleY: Math.min(...texts.filter((l) => l.name === 'title').map((l) => l.y)), imgY: imgs[0]?.y ?? 0 });
    }
    return out;
  });
  for (const x of r) {
    expect((x.bottom - x.top) / 1000, `${x.tag}: the block fills the page`).toBeGreaterThanOrEqual(0.78);
    // the headline is above the art and both are in the page's own halves: the art starts in the middle band of the page, not at the bottom
    expect(x.imgY, `${x.tag}: the art starts before 62% of the page`).toBeLessThanOrEqual(0.62 * 1350);
    if (x.v === 0) expect(x.d, `${x.tag}: the circle is large`).toBeGreaterThanOrEqual(520);
  }
});

test('body text under pictures is as large as it fits: above the old minimum when there is room, never below 44, title >= body, picture above its slot minimum', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const L = await import('/src/carousel/layouts/index.ts');
    const I = await import('/src/carousel/layouts/images.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const light: any = { palette: { bg: '#FFFFFF', text: '#0A0A0A', muted: '#5C5C5C', accent: '#1B5E20', surface: '#F0F0F0', onAccent: '#FFFFFF' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, background: 'flat', devices: { marker: false, profileHeader: false, underline: false }, accentStyle: 'text' };
    const styles: Record<string, any> = { light, 'style-7': D.styleFromPack(PR.presetPackFor('style-7', false)).style };
    const out: any[] = [];
    const MINPIC: Record<string, number[]> = { 'headline-body-image': [400, 400], 'image-row': [360, 460], 'do-dont': [320, 220] };
    for (const id of ['headline-body-image', 'image-row', 'do-dont']) {
      const def = L.layoutDef(id)!;
      const keys = def.fields.filter((q: any) => q.image).map((q: any) => q.name as string);
      for (const [sn, st] of Object.entries<any>(styles)) for (const v of [0, 1] as const) for (const len of ['short', 'normal', 'long'] as const) {
        const f: any = { ...(def.samples as any)[len] };
        keys.forEach((k: string) => { f[k] = L.placeholderImage('photo'); });
        const b = await L.buildSlide(id, v, f, st, { handle: '@quick.flip', index: 2, total: 8, cut: 'plain' });
        if (!b.ok) { out.push({ tag: `${id}/${sn}/v${v + 1}/${len}`, err: b.errors[0] }); continue; }
        const texts = (b.layers as any[]).filter((l) => l.kind === 'text' && l.text && !String(l.name).startsWith('recurring'));
        const imgs = (b.images ?? []) as any[];
        const body = texts.filter((l) => l.name === 'body').map((l) => l.style.size);
        const title = texts.filter((l) => l.name === 'title').map((l) => l.style.size);
        out.push({ tag: `${id}/${sn}/v${v + 1}/${len}`, id, v, len, body, title, minImgH: Math.min(...imgs.map((p) => p.h)), floor: MINPIC[id][v] });
      }
    }
    void I;
    return out;
  });
  for (const x of r) {
    expect(x.err, x.tag).toBeUndefined();
    expect(Math.min(...x.body), `${x.tag}: body never below 44`).toBeGreaterThanOrEqual(44);
    expect(Math.max(...x.title), `${x.tag}: title >= body`).toBeGreaterThanOrEqual(Math.max(...x.body));
    expect(x.minImgH, `${x.tag}: picture not below its slot minimum`).toBeGreaterThanOrEqual(x.floor - 1);
  }
  // with short and normal text there is room: the main body text is raised above the old 48 px
  for (const id of ['headline-body-image', 'image-row', 'do-dont']) {
    const normal = r.filter((x: any) => x.id === id && x.len !== 'long');
    expect(Math.max(...normal.flatMap((x: any) => x.body)), `${id}: body raised above 48 where it fits`).toBeGreaterThan(48);
  }
});

test('style-5 closing: a headline on a green card with white text (heavy), readable on the rendered pixels', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const C = await import('/src/image-engine/lint/color.ts');
    const pack = PR.presetPackFor('style-5', false);
    const style = D.styleFromPack(pack).style;
    const L = await import('/src/carousel/layouts/index.ts');
    // slide 8 of 8: the closing slide, the accent card variant, on the style's own closing ground
    const b: any = await L.buildSlide('statement-card', 1, { kicker: 'Back it now', headline: 'Back Quick Flip today', caption: 'Early backers save 30%.' }, style, { handle: '@quick.flip', index: 7, total: 8, cut: 'plain', invert: false, ground: -1 });
    const res: any = { library: { variants: [1] } };
    const card = (b.layers as any[]).filter((l) => l.kind === 'shape' && l.width > 800 && l.height > 600 && l.width * l.height < 1080 * 1350 * 0.9).sort((p, q) => q.width * q.height - p.width * p.height)[0];
    const t = (b.layers as any[]).find((l) => l.kind === 'text' && l.name === 'title');
    const png = await F.svgToPng(b.svg, 1080);
    const bm = await createImageBitmap(png);
    const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height;
    const g = cv.getContext('2d')!; g.drawImage(bm, 0, 0);
    const px = g.getImageData(Math.round(card.x + 30), Math.round(card.y + card.height / 2), 1, 1).data;
    // the lightest pixels of the title box: the ink
    const sc = bm.width / 1080;
    const d = g.getImageData(Math.round(t.x * sc), Math.round(t.y * sc), Math.max(1, Math.round(t.width * sc)), Math.max(1, Math.round(t.height * sc))).data;
    let best = [0, 0, 0], bl = -1;
    for (let k = 0; k < d.length; k += 4) { const l = d[k] + d[k + 1] + d[k + 2]; if (l > bl) { bl = l; best = [d[k], d[k + 1], d[k + 2]]; } }
    const ground = [px[0], px[1], px[2]];
    const lum = (c: number[]) => { const q = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * q(c[0]) + 0.7152 * q(c[1]) + 0.0722 * q(c[2]); };
    const ratio = (Math.max(lum(best), lum(ground)) + 0.05) / (Math.min(lum(best), lum(ground)) + 0.05);
    const png64 = cv.toDataURL('image/png').split(',')[1];
    return { weight: t.style.weight, size: t.style.size, ratio, ink: best, cardPx: ground, cardH: card.height, png64, variants: res.library.variants, card: [card.x, card.y, card.width, card.height, card.fill], t: [t.x, t.y, t.width, t.height, t.name, t.style.color] };
  });
  (await import('node:fs')).mkdirSync('out/presets-v13', { recursive: true });
  (await import('node:fs')).writeFileSync('out/presets-v13/style5-closing.png', Buffer.from(r.png64, 'base64'));
  console.log('S5CLOSE ' + JSON.stringify({ ...r, png64: undefined }));
  expect(r.ratio, 'the rendered ink on the green card reads 4.5:1').toBeGreaterThanOrEqual(4.5);
  expect(Math.min(...r.ink), 'the ink is white').toBeGreaterThanOrEqual(235);
  expect(r.weight, 'the heaviest weight the preset font bundles (EB Garamond: 500)').toBeGreaterThanOrEqual(500);
  expect(r.size).toBeGreaterThanOrEqual(96);
  expect(r.cardPx[1], 'a green card').toBeGreaterThan(r.cardPx[0] + 20);
  expect(r.cardH, 'a big card').toBeGreaterThanOrEqual(700);
});

test('style-1 prose slides: the text scales up to the size cap; short text fills at least 65%', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const st = D.styleFromPack(PR.presetPackFor('style-1', false)).style;
    const cases: Record<string, any> = {
      short: { p1: 'One hoodie that turns into a backpack. No more carrying two things.' },
      shortHead: { heading: 'The idea', p1: 'One hoodie that turns into a backpack.', p2: 'No more carrying two things.' },
      mid: { p1: 'We sewed a bag into the hood, so one layer does both jobs.', p2: 'It took two years of testing in the rain before we trusted it on a daily commute.' },
      long3: { p1: 'We sewed a waterproof bag into the hood and tested it for two years on trains, planes and rainy streets, so one layer does both jobs.', p2: 'Early backers told us the flip was the part they loved most, so we kept it to one zip and ten seconds.', p3: 'The shell is machine washable at thirty degrees and every seam is taped.' },
      pull: { heading: 'Built for every size', p1: 'Every size ships with the same pocket, so a small hoodie carries as much as a large one.', p2: 'Backers in forty countries have asked for a lighter fabric for summer.', pull: 'One pocket, every size.' },
    };
    const out: any = {};
    for (const [k, f] of Object.entries<any>(cases)) for (const v of [0, 1] as const) {
      const b = await L.buildSlide('prose', v, f, st, { handle: '@quick.flip', index: 2, total: 8, cut: 'plain' });
      const texts = (b.layers as any[]).filter((l) => l.kind === 'text' && l.text && !String(l.name).startsWith('recurring'));
      const top = Math.min(...texts.map((l) => l.y)), bottom = Math.max(...texts.map((l) => l.y + l.height));
      out[`${k}/v${v + 1}`] = { ok: b.ok, fill: (bottom - top) / 1000, body: Math.max(...texts.filter((l) => l.name === 'body').map((l) => l.style.size)) };
    }
    return out;
  });
  for (const [k, x] of Object.entries<any>(r)) {
    expect(x.ok, k).toBe(true);
    if (/^(short|shortHead|mid)/.test(k)) expect(x.fill, `${k}: short text fills >= 65%`).toBeGreaterThanOrEqual(0.65);
    if (/^short\//.test(k)) expect(x.body, `${k}: short text is big`).toBeGreaterThanOrEqual(72);
  }
  console.log('STYLE1 PROSE ' + JSON.stringify(r));
});
