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
  const report = await page.evaluate(async () => {
    const { getStyles, renderer } = await import('/src/carousel/render.ts');
    const { composeStyled } = await import('/src/image-engine/styles/compose.ts');
    const { loadFonts } = await import('/src/image-engine/fonts.ts');
    const { EXAMPLE } = await import('/src/carousel/script.ts');
    const { detectRegions } = await import('/src/reference/regions.ts');
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
    for (const st of getStyles().styles) {
      if (st.spec.name.startsWith('mine-')) continue;
      const slides = composeStyled(EXAMPLE as never, st as never, { width: 1080, height: 1350, handle: '@you', elements: 'shippable' }, false);
      const sc = emptyScore();
      for (const s of slides) {
        if (!kinds.includes(s.type)) continue;
        const blob = await renderer.preview(s.plan, 0.4);
        const bm = await I.bitmapOf(blob);
        const px = I.pxOfCanvas(I.cut(bm, null, 420));
        const d = detectRegions(px);
        if (drawn.length < 14 && (s.type === 'cover' || s.type === 'content')) drawn.push({ name: `${st.spec.name}-${s.type}`, b64: await overlay(bm, d) });
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
    return { total, perStyle, drawn, samples: samples.map((s) => ({ style: s.style, type: s.type, detected: s.detected })) };
  });
  for (const d of report.drawn) fs.writeFileSync(path.join(OUT, `${d.name}.png`), Buffer.from(d.b64, 'base64'));
  const pctOf = (v: [number, number]) => (v[1] ? Math.round((v[0] / v[1]) * 100) : null);
  const summary: Record<string, string> = {};
  for (const [k, v] of Object.entries(report.total)) summary[k] = Array.isArray(v) ? `${v[0]}/${v[1]} (${pctOf(v as [number, number])}%)` : String(v);
  const styles = Object.entries(report.perStyle).map(([n, s]) => ({ style: n, ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Array.isArray(v) ? `${v[0]}/${v[1]}` : v])) }));
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ summary, styles }, null, 2));
  console.log('TRUTH', JSON.stringify(summary));
  console.log('MISSES', JSON.stringify(report.total.misses));
  expect(report.total.textFound[1]).toBeGreaterThan(20);
});
