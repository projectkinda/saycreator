// Ground truth for region detection: slides drawn from our own styles are plans, so every text block, photo, shape and graphic is known. Detection is run
// on the drawn picture and compared with the plan; the totals per property (and per style) are written for the Results screen and for tuning.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './reference-helpers';

const OUT = path.join(ROOT, 'out/image-engine/regions-truth');
test.beforeAll(() => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
});

test('detection against the plans of our own styles', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/images');
  // A real photograph for the slides with a photo (the private test photos; tests only, never in the app). Without it a drawn landscape is used.
  const photoFile = path.join(ROOT, 'test-images', 'baruk-granda-FKf0FU7OuPM-unsplash.jpg');
  const photoB64 = fs.existsSync(photoFile) ? fs.readFileSync(photoFile).toString('base64') : '';
  const report = await page.evaluate(async (photoB64) => {
    const { getStyles, renderer } = await import('/src/carousel/render.ts');
    const { composeStyled } = await import('/src/image-engine/styles/compose.ts');
    const { loadFonts } = await import('/src/image-engine/fonts.ts');
    const { EXAMPLE } = await import('/src/carousel/script.ts');
    const { detectRegions, photoBlocks, PHOTO_BLOCK } = await import('/src/reference/regions.ts');
    const diag: unknown[] = [];
    const { groundTruth, compare, emptyScore } = await import('/src/reference/truth.ts');
    const I = await import('/src/reference/images.ts');
    await loadFonts();
    const perStyle: Record<string, ReturnType<typeof emptyScore>> = {};
    const total = emptyScore();
    const merge = (a: ReturnType<typeof emptyScore>, b: ReturnType<typeof emptyScore>) => {
      for (const k of Object.keys(a) as (keyof typeof a)[]) {
        if (k === 'misses') a.misses.push(...b.misses.slice(0, 3));
        else if (k === 'extraText') a.extraText += b.extraText;
        else {
          (a[k] as [number, number])[0] += (b[k] as [number, number])[0];
          (a[k] as [number, number])[1] += (b[k] as [number, number])[1];
        }
      }
    };
    const kinds = ['cover', 'content', 'step', 'stat', 'quote', 'closing', 'checklist'];
    const samples: { style: string; type: string; png: string; detected: unknown }[] = [];
    const drawn: { name: string; b64: string }[] = [];
    const overlay = async (bm: ImageBitmap, d: import('/src/reference/regions.ts').Detected) => {
      const c = new OffscreenCanvas(bm.width, bm.height);
      const g = c.getContext('2d')!;
      g.drawImage(bm, 0, 0);
      const box = (b: { x: number; y: number; w: number; h: number }, col: string, label: string) => {
        g.strokeStyle = col; g.lineWidth = 2; g.strokeRect((b.x / 100) * c.width, (b.y / 100) * c.height, (b.w / 100) * c.width, (b.h / 100) * c.height);
        g.fillStyle = col; g.font = '12px sans-serif'; g.fillText(label, (b.x / 100) * c.width + 2, (b.y / 100) * c.height + 12);
      };
      d.photos.forEach((p) => box(p.box, '#00aa00', p.shape));
      d.texts.forEach((t) => { box(t.box, '#ff0000', t.id + ' ' + t.treatments.map((x) => x.kind).join(',')); t.lines.forEach((l) => box(l.box, '#ff9999', '')); });
      d.shapes.forEach((p) => box(p.box, '#0066ff', p.kind));
      d.graphics.forEach((p) => box(p.box, '#ff00ff', p.kind));
      const blob = await c.convertToBlob({ type: 'image/png' });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      return btoa(bin);
    };
    const { analysePhoto } = await import('/src/image-engine/photo/analyse.ts');
    let pic = await I.samplePhoto();
    if (photoB64) {
      const bin = Uint8Array.from(atob(photoB64), (c) => c.charCodeAt(0));
      const j = await I.jpegUrl(await I.bitmapOf(new Blob([bin], { type: 'image/jpeg' })), null, 1600);
      pic = j;
    }
    const photo = await analysePhoto(pic.url, 'truth-photo', { label: 'sample' });
    const withPhoto = { ...EXAMPLE, slides: EXAMPLE.slides.map((x: { type: string }) => (['cover', 'content', 'stat'].includes(x.type) ? { ...x, photo_hint: 'a photo' } : x)) };
    for (const st of getStyles().styles) {
      if (st.spec.name.startsWith('mine-')) continue;
      const slides = [
        ...composeStyled(EXAMPLE as never, st as never, { width: 1080, height: 1350, handle: '@you', elements: 'shippable' }, false),
        ...composeStyled(withPhoto as never, st as never, { width: 1080, height: 1350, handle: '@you', elements: 'shippable', photos: [photo] } as never, false).filter((x: { plan: { layers: { kind: string }[] } }) => x.plan.layers.some((l) => l.kind === 'image')),
      ];
      const sc = emptyScore();
      for (const s of slides) {
        if (!kinds.includes(s.type)) continue;
        const blob = await renderer.preview(s.plan, 0.4);
        const bm = await I.bitmapOf(blob);
        const px = I.pxOfCanvas(I.cut(bm, null, 420));
        const d = detectRegions(px);
        for (const g of groundTruth(s.plan).photos) {
          const pbk = photoBlocks(px, false);
          let n = 0, tot = 0;
          for (let r = Math.floor((g.y / 100) * pbk.rows); r < Math.min(pbk.rows, Math.ceil(((g.y + g.h) / 100) * pbk.rows)); r++) for (let c = Math.floor((g.x / 100) * pbk.cols); c < Math.min(pbk.cols, Math.ceil(((g.x + g.w) / 100) * pbk.cols)); c++) { tot++; n += pbk.mask[r * pbk.cols + c]; }
          diag.push({ style: st.spec.name, type: s.type, gt: [g.x, g.y, g.w, g.h].map(Math.round), cover: Math.round((100 * n) / Math.max(1, tot)), found: d.photos.map((q) => [q.box.x, q.box.y, q.box.w, q.box.h].map(Math.round)) });
        }
        const hasImg = s.plan.layers.some((l: { kind: string }) => l.kind === 'image');
        if ((drawn.length < 14 && !hasImg && (s.type === 'cover' || s.type === 'content')) || (hasImg && drawn.filter((x) => x.name.endsWith('-photo')).length < 5)) drawn.push({ name: `${st.spec.name}-${s.type}${hasImg ? '-photo' : ''}`, b64: await overlay(bm, d) });
        bm.close();
        const one = emptyScore();
        compare(groundTruth(s.plan), d, one);
        merge(sc, one);
        if (samples.length < 24 && (s.type === 'cover' || s.type === 'content')) {
          const u = URL.createObjectURL(blob);
          samples.push({ style: st.spec.name, type: s.type, png: u, detected: { texts: d.texts.length, shapes: d.shapes.length, photos: d.photos.length, graphics: d.graphics.length } });
        }
      }
      perStyle[st.spec.name] = sc;
      merge(total, sc);
    }
    return { diag, total, perStyle, drawn, samples: samples.map((s) => ({ style: s.style, type: s.type, detected: s.detected })) };
  }, photoB64);
  for (const d of report.drawn) fs.writeFileSync(path.join(OUT, `${d.name}.png`), Buffer.from(d.b64, 'base64'));
  const pctOf = (v: [number, number]) => (v[1] ? Math.round((v[0] / v[1]) * 100) : null);
  const summary: Record<string, string> = {};
  for (const [k, v] of Object.entries(report.total)) summary[k] = Array.isArray(v) ? `${v[0]}/${v[1]} (${pctOf(v as [number, number])}%)` : String(v);
  const styles = Object.entries(report.perStyle).map(([n, s]) => ({ style: n, ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Array.isArray(v) ? `${v[0]}/${v[1]}` : v])) }));
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ summary, styles }, null, 2));
  console.log('DIAG', JSON.stringify(report.diag));
  console.log('TRUTH', JSON.stringify(summary));
  console.log('MISSES', JSON.stringify(report.total.misses));
  const ratio = (v: [number, number]) => v[0] / Math.max(1, v[1]);
  const t = report.total;
  // Floors from the tuned detection: a change that lowers any of these has made the detection worse on slides whose layout we know.
  expect(t.textFound[1]).toBeGreaterThan(150);
  expect(ratio(t.textFound), 'text found').toBeGreaterThan(0.9);
  expect(ratio(t.textBox), 'text boxes right').toBeGreaterThan(0.7);
  expect(ratio(t.size), 'type size right').toBeGreaterThan(0.75);
  expect(ratio(t.align), 'alignment right').toBeGreaterThan(0.7);
  expect(ratio(t.photoFound), "photo regions found").toBeGreaterThan(0.7);
  expect(ratio(t.highlight), "highlight boxes found").toBeGreaterThan(0.6);
  expect(ratio(t.shapeFound), "shapes found").toBeGreaterThan(0.85);
  expect(ratio(t.background), 'background kind right').toBeGreaterThan(0.85);
});
