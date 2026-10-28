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
        if (k === 'extraText') a.extraText += b.extraText;
        else {
          (a[k] as [number, number])[0] += (b[k] as [number, number])[0];
          (a[k] as [number, number])[1] += (b[k] as [number, number])[1];
        }
      }
    };
    const kinds = ['cover', 'content', 'step', 'stat', 'quote', 'closing', 'checklist'];
    const samples: { style: string; type: string; png: string; detected: unknown }[] = [];
    for (const st of getStyles().styles) {
      if (st.spec.name.startsWith('mine-')) continue;
      const slides = composeStyled(EXAMPLE as never, st as never, { width: 1080, height: 1350, handle: '@you', elements: 'shippable' }, false);
      const sc = emptyScore();
      for (const s of slides) {
        if (!kinds.includes(s.type)) continue;
        const blob = await renderer.preview(s.plan, 0.4);
        const bm = await I.bitmapOf(blob);
        const px = I.pxOfCanvas(I.cut(bm, null, 420));
        bm.close();
        const d = detectRegions(px);
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
    return { total, perStyle, samples: samples.map((s) => ({ style: s.style, type: s.type, detected: s.detected })) };
  });
  const pctOf = (v: [number, number]) => (v[1] ? Math.round((v[0] / v[1]) * 100) : null);
  const summary: Record<string, string> = {};
  for (const [k, v] of Object.entries(report.total)) summary[k] = Array.isArray(v) ? `${v[0]}/${v[1]} (${pctOf(v as [number, number])}%)` : String(v);
  const styles = Object.entries(report.perStyle).map(([n, s]) => ({ style: n, ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Array.isArray(v) ? `${v[0]}/${v[1]}` : v])) }));
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ summary, styles }, null, 2));
  console.log('TRUTH', JSON.stringify(summary));
  expect(report.total.textFound[1]).toBeGreaterThan(20);
});
