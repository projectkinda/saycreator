// Step 14f-check: the detection before and after 14f on the real reference decks on this machine. No model; tests only. The old detection is a temporary copy
// of the file from before 14f (src/reference/regions-old.ts), not committed.
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './reference-helpers';

const DIR = path.join(ROOT, 'Reference carousels likes');
test.skip(!fs.existsSync(DIR) || !fs.existsSync(path.join(ROOT, 'src/reference/regions-old.ts')), 'needs the private decks and the old copy');
test.setTimeout(300_000);

test('detection before and after 14f on the real decks', async ({ page }) => {
  await page.goto('/images/styles/new');
  const out: unknown[] = [];
  for (const ps of (process.env.SWEEP ?? '0.3').split(',').map(Number)) for (const f of fs.readdirSync(DIR).filter((x) => /\.(jpe?g|png)$/i.test(x) && (!process.env.ONLY || x.startsWith(process.env.ONLY)))) {
    await page.evaluate((v) => ((globalThis as { __ps?: number }).__ps = v), ps);
    const b64 = fs.readFileSync(path.join(DIR, f)).toString('base64');
    out.push(
      await page.evaluate(async ([name, b64]) => {
        const I = await import('/src/reference/images.ts');
        const G = await import('/src/reference/grid.ts');
        const N = await import('/src/reference/regions.ts');
        const O = await import('/src/reference/regions-old.ts');
        const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bm = await I.bitmapOf(new Blob([bin]));
        let cells: { x: number; y: number; width: number; height: number }[] | null = null;
        for (const size of [1400, 900, 600]) {
          const small = I.cut(bm, null, size);
          const g = G.detectGrid(I.pxOfCanvas(small));
          if (g) {
            const k = bm.width / small.width;
            cells = g.cells.map((c) => ({ x: Math.round(c.x * k), y: Math.round(c.y * k), width: Math.round(c.width * k), height: Math.round(c.height * k) }));
            break;
          }
        }
        const iou = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => {
          const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (w <= 0 || h <= 0) return 0;
          return (w * h) / (a.w * a.h + b.w * b.h - w * h);
        };
        const tot = { slides: 0, textOld: 0, textNew: 0, photoOld: 0, photoNew: 0, graphicOld: 0, graphicNew: 0, shapeOld: 0, shapeNew: 0, lost: 0, wrong: 0 };
        const examples: string[] = [];
        for (const [i, r] of (cells ?? [null]).entries()) {
          const px = I.pxOfCanvas(I.cut(bm, r, 420));
          const o = O.detectRegions(px);
          const n = N.detectRegions(px);
          tot.slides++;
          tot.textOld += o.texts.length; tot.textNew += n.texts.length;
          tot.photoOld += o.photos.length; tot.photoNew += n.photos.length;
          tot.graphicOld += o.graphics.length; tot.graphicNew += n.graphics.length;
          tot.shapeOld += o.shapes.length; tot.shapeNew += n.shapes.length;
          for (const t of o.texts) if (!n.texts.some((q) => iou(t.box, q.box) >= 0.3)) { tot.lost++; if (examples.length < 6) examples.push(`slide ${i + 1}: text lost at ${JSON.stringify(t.box)} ${t.lines ?? ''}; new photos ${JSON.stringify(n.photos.map((p) => p.box))}`); }
          for (const t of n.texts) if (!o.texts.some((q) => iou(t.box, q.box) >= 0.3)) { tot.wrong++; if (examples.length < 6) examples.push(`slide ${i + 1}: new text box ${JSON.stringify(t.box)} was not there before; photos ${JSON.stringify(n.photos.map((p) => p.box))}`); }
        }
        return { ps: (globalThis as { __ps?: number }).__ps, deck: name, grid: cells ? cells.length : 0, ...tot, examples };
      }, [f, b64] as const),
    );
  }
  fs.mkdirSync(path.join(ROOT, 'out/image-engine/detect-decks'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'out/image-engine/detect-decks/summary.json'), JSON.stringify(out, null, 1));
  for (const o of out as { deck: string; examples: string[] }[]) console.log('DECK', JSON.stringify({ ...o, deck: o.deck.slice(0, 8) }));
});
