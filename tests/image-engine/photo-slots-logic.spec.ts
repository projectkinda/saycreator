// Picture slots, the logic (ZERO model calls; flat generated test pictures, no stock): every image layout declares its slots; the code places the project's pictures by best fit (0, 1, 2,
// 3 and 5 pictures, mixed orientations, a picture used at most once, comparison with one or two pictures); the writer is told metadata only and is offered picture layouts only when enough
// pictures fit; the gallery greys the rest with the reason; the crop keeps the focus point and zoom. Sheet: out/photo-slots/sheet.png.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(10 * 60_000);
const OUT = path.resolve(process.cwd(), 'out/photo-slots');
const IMG = ['headline-body-image', 'image-row', 'thumb-rows', 'cover-art', 'photo-cover', 'portrait-closing', 'art-side-text', 'do-dont'];

test('every image layout declares its slots: how many, shape and orientations, in both variants', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (IMG) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const I = await import('/src/carousel/layouts/images.ts');
    const out: any = {};
    for (const id of IMG) out[id] = [0, 1].map((v) => ({ slots: I.imageSlotsOf(id, v), min: I.imagesNeeded(id), def: !!L.layoutDef(id)!.imageSlots }));
    return out;
  }, IMG);
  const slots: Record<string, number> = { 'headline-body-image': 1, 'image-row': 3, 'thumb-rows': 4, 'cover-art': 1, 'photo-cover': 1, 'portrait-closing': 1, 'art-side-text': 1, 'do-dont': 2 };
  const min: Record<string, number> = { 'headline-body-image': 1, 'image-row': 3, 'thumb-rows': 3, 'cover-art': 1, 'photo-cover': 1, 'portrait-closing': 1, 'art-side-text': 1, 'do-dont': 2 };
  for (const id of IMG) for (const v of [0, 1]) {
    const x = r[id][v];
    expect(x.def, `${id}: the registry has the slots`).toBe(true);
    expect(x.slots.length, `${id} v${v + 1}: slot count`).toBe(slots[id]);
    expect(x.min, `${id}: pictures needed`).toBe(min[id]);
    for (const s of x.slots) {
      expect(s.field).toMatch(/^image\d?$/);
      expect(s.aspect, `${id}: target aspect`).toBeGreaterThan(0.3);
      expect(['portrait', 'landscape', 'square']).toContain(s.orientation);
      expect(s.accepts.length, `${id}: accepted orientations`).toBeGreaterThan(0);
    }
  }
});

test('the placement: 0, 1, 2, 3 and 5 pictures, mixed orientations, each picture once; do-dont with one or two', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const P = await import('/src/carousel/imagePlace.ts');
    const I = await import('/src/carousel/layouts/images.ts');
    const pic = (id: string, w: number, h: number) => ({ id, width: w, height: h });
    const L1 = pic('L1', 3000, 2000), L2 = pic('L2', 1920, 1080), P1 = pic('P1', 1000, 1500), P2 = pic('P2', 1200, 1800), P3 = pic('P3', 1000, 1400), S1 = pic('S1', 1500, 1500);
    const specs = ['headline-body-image', 'do-dont', 'image-row', 'portrait-closing', 'thumb-rows'].map((layout) => ({ layout, fields: { headline: 'x' } as any }));
    const run = (pics: any[]) => P.placeImages(specs, [0, 0, 0, 0, 0], pics).map((s: any) => Object.fromEntries(Object.entries(s.fields).filter(([k]) => /^image/.test(k)).map(([k, v]) => [k, I.parseRef(v)!.id])));
    const out: any = { n0: run([]), n1: run([L1]), n2: run([L1, P1]), n3: run([L1, P1, P2]), n5: run([L1, P1, P2, S1, L2]) };
    // a row of three: three portraits fill it; two portraits and a landscape do not (the landscape is not accepted)
    const row = (pics: any[]) => P.placeImages([{ layout: 'image-row', fields: { headline: 'x' } as any }], [0], pics)[0].fields;
    out.rowP = Object.keys(row([P1, P2, P3])).filter((k) => /^image/.test(k)).length;
    out.rowMixed = Object.keys(row([P1, P2, L1])).filter((k) => /^image/.test(k)).length;
    // comparison: one picture is not enough for do-dont, two fill both sides
    const dd = (pics: any[]) => Object.keys(P.placeImages([{ layout: 'do-dont', fields: { title: 'x' } as any }], [0], pics)[0].fields).filter((k) => /^image/.test(k));
    out.dd1 = dd([L1]);
    out.dd2 = dd([L1, P1]);
    // thumb-rows: three pictures fill three rows, four fill four
    const tr = (pics: any[]) => Object.keys(P.placeImages([{ layout: 'thumb-rows', fields: { title: 'x' } as any }], [0], pics)[0].fields).filter((k) => /^image/.test(k)).length;
    out.tr3 = tr([L1, L2, S1]);
    out.tr4 = tr([L1, L2, S1, L1b()]);
    function L1b() { return pic('L3', 2000, 1400); }
    // the order pictures were added breaks ties: two equal landscapes, the first goes first
    out.tie = P.placeImages([{ layout: 'photo-cover', fields: {} as any }], [0], [pic('A', 1600, 900), pic('B', 1600, 900)])[0].fields.image;
    out.tieId = I.parseRef(out.tie)!.id;
    // the crop: covers the slot, keeps the focus point as near the middle as it can, zooms
    const slot = { x: 0, y: 0, w: 400, h: 300 };
    const ref = (fx: number, fy: number, z: number) => I.parseRef(I.makeRef({ id: 'p', w: 4000, h: 2000, fx, fy, z }));
    out.crop = [ref(0.5, 0.5, 1), ref(1, 0.5, 1), ref(0, 0, 1), ref(0.5, 0.5, 2)].map((rf) => I.cropRect(slot, rf));
    out.withCrop = I.withCrop(I.makeRef({ id: 'p', w: 4000, h: 2000 }), { fx: 0.2, z: 1.5 });
    return out;
  });
  const ids = (a: any[]) => a.map((x) => Object.entries(x).map(([k, v]) => `${k}=${v}`).join(','));
  expect(r.n0.every((x: any) => Object.keys(x).length === 0), '0 pictures: no slot is filled').toBe(true);
  expect(ids(r.n1), '1 landscape: only the slide that takes one picture and accepts landscape').toEqual(['image=L1', '', '', '', '']);
  expect(ids(r.n2), '2 pictures (landscape, portrait): the portrait goes to the portrait slot; do-dont needs two').toEqual(['image=L1', '', '', 'image=P1', '']);
  expect(ids(r.n3), '3 pictures: the two left fill do-dont').toEqual(['image=L1', 'image=P1,image2=P2', '', '', '']);
  expect(ids(r.n5), '5 pictures (upload order is honoured: the first goes to the first slot; the portrait pair goes to the comparison; the square is the next acceptable one for the portrait slot)').toEqual(['image=L1', 'image=P1,image2=P2', '', 'image=S1', '']);
  const all = Object.values(r).filter(Array.isArray).flatMap((a: any) => a.flatMap((x: any) => Object.values(x))) as string[];
  void all;
  for (const k of ['n1', 'n2', 'n3', 'n5']) {
    const used = r[k].flatMap((x: any) => Object.values(x)) as string[];
    expect(new Set(used).size, `${k}: each picture is used once`).toBe(used.length);
  }
  expect(r.rowP, 'three portraits fill the row').toBe(3);
  expect(r.rowMixed, 'a landscape is not accepted in the tall row: the row stays text-only').toBe(0);
  expect(r.dd1, 'comparison with one picture: the text-only form').toEqual([]);
  expect(r.dd2, 'comparison with two pictures: both sides').toEqual(['image', 'image2']);
  expect(r.tr3).toBe(3);
  expect(r.tr4).toBe(4);
  expect(r.tieId, 'upload order breaks a tie').toBe('A');
  // 4000x2000 in a 400x300 slot: the picture is 600 x 300; centred x = -100; focus right/left clamps to the edges; zoom 2 doubles it
  expect(r.crop[0]).toEqual({ x: -100, y: 0, w: 600, h: 300 });
  expect(r.crop[1]).toEqual({ x: -200, y: 0, w: 600, h: 300 });
  expect(r.crop[2]).toEqual({ x: 0, y: 0, w: 600, h: 300 });
  expect(r.crop[3].w).toBe(1200);
  expect(r.crop[3].x).toBeLessThanOrEqual(0);
  expect(r.crop[3].x + r.crop[3].w).toBeGreaterThanOrEqual(400);
  expect(r.withCrop).toContain('fx=0.2');
  expect(r.withCrop).toContain('z=1.5');
});

test('placement polish: upload order is honoured when the fit is acceptable (a); a bad crop or wrong orientation falls back to the best fit; pairs and rows prefer one orientation (c)', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const P = await import('/src/carousel/imagePlace.ts');
    const I = await import('/src/carousel/layouts/images.ts');
    const pic = (id: string, w: number, h: number) => ({ id, width: w, height: h });
    const run = (layout: string, pics: any[], v: 0 | 1 = 0) => { const f = P.placeOne(layout, v, pics); return f ? Object.entries(f).map(([k, x]) => k + '=' + I.parseRef(x as string)!.id).join(',') : ''; };
    const L1 = pic('L1', 3000, 2000), L2 = pic('L2', 1920, 1080), P1 = pic('P1', 1000, 1500), P2 = pic('P2', 1200, 1800), P3 = pic('P3', 1000, 1400), S1 = pic('S1', 1500, 1500), L3 = pic('L3', 2000, 1400), W = pic('W', 5000, 1000);
    return {
      // (a) the cover: the first picture, although the second is the nearer shape
      order: run('photo-cover', [L1, L2]),
      order2: run('photo-cover', [L2, L1]),
      // wrong orientation: the portrait is not accepted, the next picture is
      wrongOrientation: run('photo-cover', [P1, L1]),
      // a panorama would crop badly (5:1 in a 2.3:1 slot): the next picture is taken; alone it is still used (best fit, never an empty box)
      badCrop: run('headline-body-image', [W, L1]),
      aloneBad: run('headline-body-image', [W]),
      // (c) a pair of the same orientation, though the first two pictures are mixed
      pairPortrait: run('do-dont', [P1, L1, P2, S1]),
      pairLandscape: run('do-dont', [L1, P1, L2]),
      pairMixed: run('do-dont', [L1, P1]),
      // a row of three: three portraits, although a square comes earlier than the third portrait
      rowP: run('image-row', [P1, L1, P2, S1, P3]),
      rowMixed: run('image-row', [P1, S1, P2]),
      thumbs: run('thumb-rows', [L1, P1, L2, S1, L3]),
    };
  });
  expect(r.order, 'the first picture goes to the cover').toBe('image=L1');
  expect(r.order2).toBe('image=L2');
  expect(r.wrongOrientation, 'the portrait is not accepted by a wide slot: the next picture').toBe('image=L1');
  expect(r.badCrop, 'a panorama would crop badly: the next picture').toBe('image=L1');
  expect(r.aloneBad, 'a bad crop alone is still better than an empty slot').toBe('image=W');
  expect(r.pairPortrait, 'comparison prefers two pictures of one orientation').toBe('image=P1,image2=P2');
  expect(r.pairLandscape).toBe('image=L1,image2=L2');
  expect(r.pairMixed, 'no matching pair: a mixed pair still fills both sides').toBe('image=L1,image2=P1');
  expect(r.rowP, 'a row of three prefers three of one orientation').toBe('image=P1,image2=P2,image3=P3');
  expect(r.rowMixed, 'no such set: the mix in upload order').toBe('image=P1,image2=S1,image3=P2');
  expect(r.thumbs, 'thumbnails: four rows fill when four acceptable pictures exist (a set of three would leave a row empty); the portrait is not accepted').toBe('image=L1,image2=L2,image3=S1,image4=L3');
});

test('the writer is told metadata only and offered picture layouts only when enough pictures fit; the gallery greys the rest with the reason', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (IMG) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const P = await import('/src/carousel/designLibraryPick.ts');
    const PR = await import('/src/carousel/presets.ts');
    const style = D.styleFromPack(PR.presetPackFor('hot-flat', false)).style;
    const pic = (id: string, w: number, h: number) => ({ id, width: w, height: h });
    const req: any = { text: 'A launch story about a hoodie.', tone: 'clear', format: 'carousel', slides: 6, styleChoice: 'hot-flat', styles: [] };
    const menu = (images: any[]) => {
      const t = D.buildLibraryPrompt(req, { hasPhoto: images.length > 0, images, pack: PR.presetPackFor('hot-flat', false) }, style, 'a look', 6);
      return { t, ids: IMG.filter((i: string) => t.includes('- ' + i + ':')) };
    };
    const none = menu([]);
    const one = menu([pic('a', 3000, 2000)]);
    const mixed = menu([pic('a', 3000, 2000), pic('b', 1000, 1500), pic('c', 1200, 1200)]);
    const three = menu([pic('a', 1000, 1500), pic('b', 1000, 1400), pic('c', 1200, 1200)]);
    const lib: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style, styleNotes: [], plan: { title: 'T', specs: [{ layout: 'do-dont', fields: { title: 'Pack it', num: '1', wrong: 'A bag and a hoodie, both heavy.', right: 'One hoodie that becomes the bag.' }, accents: [] }] } };
    const res = await D.redrawLibraryDeck(lib, { pack: PR.presetPackFor('hot-flat', false), hasPhoto: false }, '@h');
    const gal = (images: any[]) => { const m = P.galleryModel(res.library, { hasPhoto: images.length > 0, images }, '@h', 0)!; return Object.fromEntries(m.entries.filter((e: any) => IMG.includes(e.layout)).map((e: any) => [e.layout, e.enabled ? 'on' : e.reason])); };
    return { none: none.ids, one: one.ids, mixed: mixed.ids, three: three.ids, oneText: one.t, mixedText: mixed.t, noneText: none.t, g0: gal([]), g1: gal([pic('a', 3000, 2000)]), g2: gal([pic('a', 3000, 2000), pic('b', 1000, 1500)]) };
  }, IMG);
  expect(r.none, 'no pictures: no picture layout in the menu').toEqual([]);
  expect(r.one, 'one landscape picture: the single-slot layouts that accept landscape').toEqual(['headline-body-image', 'cover-art', 'photo-cover', 'art-side-text']);
  expect(r.mixed).toEqual(expect.arrayContaining(['headline-body-image', 'cover-art', 'photo-cover', 'portrait-closing', 'do-dont', 'art-side-text']));
  expect(r.mixed, 'three pictures but only two fit the tall row and the thumbnails need three landscape or square').not.toContain('image-row');
  expect(r.three, 'three portrait/square pictures fill a row of three').toContain('image-row');
  // metadata only
  expect(r.mixedText).toContain('Pictures available (metadata only');
  expect(r.mixedText).toMatch(/image 1: landscape, 1\.50:1, 3000x2000 px/);
  expect(r.mixedText).toMatch(/image 2: portrait, 1:1\.50, 1000x1500 px/);
  expect(r.mixedText).toMatch(/image 3: square, 1\.00:1, 1200x1200 px/);
  expect(r.mixedText, 'no pixels, no data URL, no file name').not.toMatch(/data:image|base64/);
  expect(r.mixedText).toMatch(/at most once/);
  expect(r.mixedText).toMatch(/orientation matches/);
  expect(r.mixedText).toMatch(/Slots: 2 pictures/);
  expect(r.mixedText, 'two-sided content asks for two pictures').toMatch(/use "do-dont" when two pictures are available/);
  expect(r.oneText, 'with one picture, comparison is the text form').toMatch(/not enough pictures for "do-dont"|use "comparison"/);
  expect(r.noneText).not.toMatch(/Pictures available/);
  // the gallery
  // (the slide's own layout, do-dont, is always offered: its text-only form needs no picture)
  expect(Object.entries(r.g0).every(([k, v]) => k === 'do-dont' || v !== 'on'), 'no pictures: no other picture layout is offered: ' + JSON.stringify(r.g0)).toBe(true);
  expect(r.g0['cover-art'], 'the reason names the pictures it needs').toMatch(/Needs 1 picture .*this deck has 0 that fit/);
  expect(String(r.g1['cover-art']), 'one landscape picture: the picture is no longer what stops cover-art').not.toMatch(/Needs 1 picture/);
});

test('sheet: out/photo-slots/sheet.png: 0, 1, 2, 3 and 5 flat generated pictures placed into five picture layouts', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/images/carousel');
  const b64 = await page.evaluate(async () => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PL = await import('/src/carousel/photoLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const flat = async (name: string, w: number, h: number, color: string, mark: string) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d')!; g.fillStyle = color; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffffcc'; g.beginPath(); g.arc(w * 0.5, h * 0.5, Math.min(w, h) * 0.22, 0, Math.PI * 2); g.fill();
      g.fillStyle = color; g.font = `bold ${Math.round(Math.min(w, h) * 0.3)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(mark, w * 0.5, h * 0.52);
      const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.9));
      return (await PL.addPicture(new File([blob], name + '.jpg', { type: 'image/jpeg' }), 'photo')).meta;
    };
    const metas = [await flat('land1', 1500, 1000, '#c0392b', 'L1'), await flat('port1', 1000, 1500, '#2471a3', 'P1'), await flat('port2', 1000, 1500, '#1e8449', 'P2'), await flat('square', 1200, 1200, '#b7950b', 'S'), await flat('land2', 1600, 900, '#7d3c98', 'L2')];
    const info = (m: any) => ({ id: m.id, width: m.width, height: m.height });
    const sets = [[], [0], [0, 1], [0, 1, 2], [0, 1, 2, 3, 4]];
    const specs = [
      { layout: 'photo-cover', fields: { headline: 'A hoodie that flips into a backpack', intro: 'We sewed a bag into the hood, so one layer does both jobs.' }, accents: [] },
      { layout: 'do-dont', fields: { title: 'Pack it', num: '1', wrong: 'A bag and a hoodie, both heavy.', right: 'One hoodie that becomes the bag.' }, accents: [] },
      { layout: 'image-row', fields: { headline: 'Built for everyday', paragraph: 'A waterproof shell and a padded laptop sleeve.' }, accents: [] },
      { layout: 'portrait-closing', fields: { headline: 'Meet the maker', heading: 'Back Quick Flip today', p1: 'We are two friends who got tired of carrying a bag.', url: 'quickflip.com' }, accents: [] },
      { layout: 'thumb-rows', fields: { title: 'What is in the box', items: ['The Quick Flip hoodie', 'A waterproof pouch', 'A pocket guide', 'A thank-you card'] }, accents: [] },
    ];
    const pack = PR.presetPackFor('hot-flat', false);
    const w = 270, h = 338, labelW = 170;
    const cv = document.createElement('canvas'); cv.width = labelW + specs.length * (w + 10) + 10; cv.height = sets.length * (h + 10) + 10;
    const g = cv.getContext('2d')!; g.fillStyle = '#777'; g.fillRect(0, 0, cv.width, cv.height);
    for (let r = 0; r < sets.length; r++) {
      const imgs = sets[r].map((k) => info(metas[k]));
      const lib: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style: null, styleNotes: [], plan: { title: 'T', specs } };
      // the same placement the deck uses: after the layouts and variants are known
      const { placeImages } = await import('/src/carousel/imagePlace.ts');
      lib.plan.specs = placeImages(specs as any, specs.map(() => 0), imgs);
      const res = await D.redrawLibraryDeck(lib, { pack, hasPhoto: imgs.length > 0, images: imgs }, '@quick.flip');
      const slides = Object.entries<any>(res.slides).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, s]) => s.built);
      g.fillStyle = '#ffd54a'; g.font = 'bold 20px sans-serif'; g.fillText(`${imgs.length} picture${imgs.length === 1 ? '' : 's'}`, 12, 10 + r * (h + 10) + 28);
      g.fillStyle = '#fff'; g.font = '12px sans-serif';
      ['land1 3:2', 'port1 2:3', 'port2 2:3', 'square 1:1', 'land2 16:9'].slice(0, 5).forEach((t, k) => { if (sets[r].includes(k)) g.fillText(t, 12, 10 + r * (h + 10) + 52 + sets[r].indexOf(k) * 15); });
      for (let i = 0; i < slides.length; i++) g.drawImage(await createImageBitmap(await F.svgToPng(slides[i].svg, 540)), labelW + 10 + i * (w + 10), 10 + r * (h + 10), w, h);
    }
    for (const m of metas) await PL.removePicture(m.id);
    return cv.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(OUT, 'sheet.png'), Buffer.from(b64, 'base64'));
});
