// Round AA: a headline drawn over a photo (title-over-photo) is kept off faces. The faces come from a small face finder (faceFind.ts: UltraFace version-RFB-320, MIT, fetched by
// npm run fetch:models, never in git). When the words cover a face and the person did not pick the variant, the other side (text low or text high) is drawn too and kept if it
// covers fewer faces, or less of them. No face known (no model, no face, a stand-in picture), a picked variant, or the rule off: the slide is drawn exactly as before.
// AA1 and AA2 use a known answer in place of the model (setFaceFinder), so they run on any machine; AA3 runs the real model on a real photo and is skipped when either is missing.
// ZERO model calls to the writer.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const MODEL = 'public/models/version-RFB-320.onnx';
const BOOK = path.join(process.env.REAL_PICTURES_DIR ?? 'out/test-pictures', 'event', 'WhatsApp Image 2026-10-27 at 11.30.43 AM.jpeg');

let writes = 0;
test.beforeEach(async ({ page }) => {
  writes = 0;
  page.on('request', (r) => { if (/\/(__carousel|api\/carousel)\/write/.test(r.url())) writes++; });
  await page.goto('/images/carousel');
});
test.afterEach(() => expect(writes, 'writer calls').toBe(0));

test('AA1 the model output is read into faces on the photo: letterbox undone, low scores left out, overlapping boxes made one', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const FF = await import('/src/carousel/faceFind.ts');
    // 4 candidates on a 320 x 240 input where the photo filled the middle half across (ox 0.25, width 0.5) and the full height
    const scores = [0.1, 0.9, 0.05, 0.95, 0.2, 0.8, 0.5, 0.5];
    const boxes = [
      0.3, 0.1, 0.4, 0.3, // a face: x 0.1..0.3 of the photo
      0.31, 0.11, 0.41, 0.31, // the same face, a little lower score (0.95 > 0.9, so this one is kept, the other dropped)
      0.6, 0.5, 0.7, 0.7, // a second face: x 0.7..0.9
      0.0, 0.0, 0.2, 0.2, // score 0.5: under 0.7, left out
    ];
    return FF.decodeFaces(scores, boxes, { ox: 0.25, oy: 0, sw: 0.5, sh: 1 });
  });
  expect(r.length).toBe(2);
  expect(r[0].score).toBeCloseTo(0.95, 5);
  expect(r[0].x0).toBeCloseTo(0.12, 3);
  expect(r[0].x1).toBeCloseTo(0.32, 3);
  expect(r[1].x0).toBeCloseTo(0.7, 3);
  expect(r[1].y1).toBeCloseTo(0.7, 3);
});

test('AA2 title-over-photo: the headline moves off a face; no face, a face clear of the words, a picked variant, a stand-in picture or the rule off draw as before', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const DL = await import('/src/carousel/designLibrary.ts'); const PR = await import('/src/carousel/presets.ts'); const FA = await import('/src/reference/faithful.ts');
    const FF = await import('/src/carousel/faceFind.ts'); const IM = await import('/src/carousel/layouts/images.ts');
    const fonts = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    // a stand-in photo (a soft gradient) for the project picture
    const c = document.createElement('canvas'); c.width = 900; c.height = 1200; const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, 1200); gr.addColorStop(0, '#5d7a99'); gr.addColorStop(1, '#2b3440'); g.fillStyle = gr; g.fillRect(0, 0, 900, 1200);
    const src = c.toDataURL('image/jpeg', 0.9);
    FA.setPictureResolver(async () => src);
    const ref = IM.makeRef({ id: 'face1', w: 900, h: 1200, photo: true });
    const TOP = [{ x0: 0.3, y0: 0.15, x1: 0.6, y1: 0.35, score: 0.99 }];
    const BOTTOM = [{ x0: 0.3, y0: 0.62, x1: 0.6, y1: 0.8, score: 0.99 }];
    const BOTH = [...TOP, ...BOTTOM];
    const MIDDLE = [{ x0: 0.42, y0: 0.42, x1: 0.52, y1: 0.5, score: 0.99 }];
    const out: Record<string, unknown> = {};
    for (const styleId of ['style-1', 'editorial-collage', 'style-6']) {
      const { style } = DL.styleFromPack(PR.presetPackFor(styleId, false, null)!);
      const spec = { layout: 'title-over-photo', fields: { headline: 'Met some wonderful people there.', image: ref }, accents: [] } as any;
      const opts = { handle: '@saycreator', index: 3, total: 7, cut: 'plain' as const, invert: false as const, density: 'normal' as const };
      const draw = async (faces: unknown, v: 0 | 1, s = spec, on = true) => {
        FF.setFaceFinder(async () => faces as any);
        FF.faceRule.on = on;
        try { return await DL.drawOne(s, v, style, opts); } finally { FF.faceRule.on = true; }
      };
      const plain0 = (await draw(null, 0)).built!.svg, plain1 = (await draw(null, 1)).built!.svg;
      const high = await draw(TOP, 1), low = await draw(BOTTOM, 0);
      const highPinned = await draw(TOP, 1, { ...spec, pin: { look: true } });
      const highOff = await draw(TOP, 1, spec, false);
      const none = await draw([], 1), middle = await draw(MIDDLE, 1), both = await draw(BOTH, 0);
      const stand = await draw(TOP, 1, { ...spec, fields: { ...spec.fields, image: IM.placeholderImage('photo') } });
      const standOff = await draw(TOP, 1, { ...spec, fields: { ...spec.fields, image: IM.placeholderImage('photo') } }, false);
      const cover = (d: any, faces: any) => FF.faceCoverOf(d.built, 'face1', faces);
      out[styleId] = {
        high: { moved: high.faceVariant ?? null, same0: high.built!.svg === plain0, before: cover({ built: (await draw(null, 1)).built }, TOP), after: cover(high, TOP), note: high.adjustments.find((a) => /face/.test(a)) ?? null },
        low: { moved: low.faceVariant ?? null, same1: low.built!.svg === plain1, after: cover(low, BOTTOM) },
        pinned: { moved: highPinned.faceVariant ?? null, same: highPinned.built!.svg === plain1 },
        off: { moved: highOff.faceVariant ?? null, same: highOff.built!.svg === plain1 },
        none: { moved: none.faceVariant ?? null, same: none.built!.svg === plain1 },
        // a small face in the middle: clear of the words in most styles (a style whose header pushes the text down may reach it: then it is not a case of a face clear of the words)
        middle: { moved: middle.faceVariant ?? null, same: middle.built!.svg === plain1, clear: cover({ built: (await draw(null, 1)).built }, MIDDLE).covered === 0 },
        // faces at both ends: the other side is kept only when it covers fewer faces, or less of them (measured on this style)
        both: { moved: both.faceVariant ?? null, same: both.built!.svg === plain0, want: await (async () => { const a = cover({ built: (await draw(null, 0)).built }, BOTH), b = cover({ built: (await draw(null, 1)).built }, BOTH); return a.worst >= FF.FACE_COVER && (b.covered < a.covered || (b.covered === a.covered && b.total < a.total - 1e-9)) ? 1 : null; })() },
        stand: { moved: stand.faceVariant ?? null, same: stand.built!.svg === standOff.built!.svg },
      };
    }
    FF.setFaceFinder(null);
    return out;
  });
  for (const [styleId, x] of Object.entries(r) as [string, any][]) {
    // text high over a face at the top: moved low, drawn exactly as variant 0, the face no longer covered, and the slide notes say why
    expect(x.high.before.covered, styleId).toBe(1);
    expect(x.high.moved, styleId).toBe(0);
    expect(x.high.same0, styleId).toBe(true);
    expect(x.high.after.covered, styleId).toBe(0);
    expect(x.high.note, styleId).toMatch(/moved low on the photo so it does not cover a face/);
    // text low over a face at the bottom: moved high
    expect(x.low.moved, styleId).toBe(1);
    expect(x.low.same1, styleId).toBe(true);
    expect(x.low.after.covered, styleId).toBe(0);
    if (!x.middle.clear) expect(x.middle.moved, `${styleId} middle (reached by the words)`).toBe(0);
    // a variant the person picked, the rule off, no face, a face the words do not reach, faces at both ends (neither side is better) and a stand-in picture: as before
    expect(x.both.moved, `${styleId} both`).toBe(x.both.want);
    if (x.both.want === null) expect(x.both.same, `${styleId} both`).toBe(true);
    for (const k of ['pinned', 'off', 'none', 'middle', 'stand']) {
      if (k === 'middle' && !x.middle.clear) continue;
      expect(x[k].moved, `${styleId} ${k}`).toBe(null);
      expect(x[k].same, `${styleId} ${k}`).toBe(true);
    }
  }
});

test('AA3 the real face model finds the face on a real photo and the headline moves off it', async ({ page }) => {
  test.skip(!fs.existsSync(MODEL), `${MODEL} is not there (run npm run fetch:models)`);
  test.skip(!fs.existsSync(BOOK), `${BOOK} is not there (a real photo with a face)`);
  const data = 'data:image/jpeg;base64,' + fs.readFileSync(BOOK).toString('base64');
  const r = await page.evaluate(async (data) => {
    const DL = await import('/src/carousel/designLibrary.ts'); const PR = await import('/src/carousel/presets.ts'); const FA = await import('/src/reference/faithful.ts');
    const FF = await import('/src/carousel/faceFind.ts'); const IM = await import('/src/carousel/layouts/images.ts');
    const fonts = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    FF.setFaceFinder(null);
    FA.setPictureResolver(async () => data);
    const im = new Image(); im.src = data; await im.decode();
    const ref = IM.makeRef({ id: 'book', w: im.naturalWidth, h: im.naturalHeight, photo: true });
    const t0 = performance.now();
    const faces = await FF.facesOf(ref);
    const ms = performance.now() - t0;
    const { style } = DL.styleFromPack(PR.presetPackFor('style-1', false, null)!);
    const d = await DL.drawOne({ layout: 'title-over-photo', fields: { headline: 'Had a wonderful blast at the Hyderabad event.', image: ref }, accents: [] } as any, 1, style, { handle: '@saycreator', index: 0, total: 7, cut: 'plain', invert: false, density: 'normal' });
    return { faces, problem: FF.faceFinderProblem, ms, moved: d.faceVariant ?? null, cover: faces ? FF.faceCoverOf(d.built as any, 'book', faces) : null };
  }, data);
  expect(r.problem).toBe(null);
  expect(r.faces?.length).toBe(1);
  // the face on the book cover sits in the upper right half of the photo
  expect(r.faces![0].y0).toBeLessThan(0.3);
  expect(r.faces![0].x1).toBeGreaterThan(0.7);
  expect(r.moved).toBe(0);
  expect(r.cover!.covered).toBe(0);
  expect(r.ms).toBeLessThan(5000);
});
