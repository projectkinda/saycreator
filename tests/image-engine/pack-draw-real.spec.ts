// Step 16a, REAL (REAL_LAYOUT=1, opt-in: uses model time): the same five real reference sets as layout-real.spec.ts, one slide each (referenceAt1400: one slide at 1400 px,
// never the mosaic), drawn twice as a pack cover design: BEFORE (the old prompt, no inventory, no block check) and AFTER (look first with <inventory>, the <rect> rule, the
// block check with at most one retry). For each: text-region overlap (share of the reference's detected text area that the drawn text slots cover), plain-rect share,
// model calls and seconds. Reference files are read from the private folder and never stored.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './reference-helpers';

const OUT = path.join(ROOT, 'out/image-engine/pack-draw-real');
const DIR = path.join(ROOT, 'Reference carousels likes');
test.describe.configure({ mode: 'default' }); // was 'serial': one failing test used to skip every test after it in the file; the tests here do not share state
test.skip(process.env.REAL_LAYOUT !== '1', 'Real runs are opt-in (REAL_LAYOUT=1): they use model time.');
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

const SETS = [
  { id: 'deck-a', file: '44937935' },
  { id: 'deck-b', file: '58d68b12' },
  { id: 'deck-c', file: '05bedfc0' },
  { id: 'single', file: '1503c1de' },
  { id: 'laptop', file: '9885e1020' },
];

for (const set of SETS.filter((s) => !process.env.PACK_ONLY || s.id === process.env.PACK_ONLY)) {
  test(`real pack draw: ${set.id}`, async ({ page }) => {
    test.setTimeout(1_200_000);
    await page.goto('/images/carousel');
    const real = fs.readdirSync(DIR).find((f) => f.startsWith(set.file))!;
    const b64 = fs.readFileSync(path.join(DIR, real)).toString('base64');
    const out = await page.evaluate(async ([id, b64]) => {
      const R = await import('/src/reference/RecreatePanel.tsx');
      const I = await import('/src/reference/images.ts');
      const G = await import('/src/reference/regions.ts');
      const P = await import('/src/reference/pack.ts');
      const D = await import('/src/reference/reader.ts');
      const reader = (await D.detectReaders())[0];
      const sig = new AbortController().signal;
      const file = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], `${id}.jpg`, { type: 'image/jpeg' });
      const ref = await R.referenceAt1400(file, 'auto');
      const detected = G.detectRegions(I.pxOfCanvas(I.cut(await I.bitmapFromUrl(ref.url), null, 1000)));
      const images = [I.readerImageOf(ref.url, 'reference.jpg')];
      const textBoxes = detected.texts.map((t) => (t as unknown as { box: { x: number; y: number; w: number; h: number } }).box);
      // Share of the reference's text area covered by the drawn text slots (100 x 100 grid, percent boxes).
      const overlap = (layers: { kind: string; x: number; y: number; width: number; height: number }[]) => {
        const g = new Uint8Array(10000);
        const mark = (b: { x: number; y: number; w: number; h: number }, v: number) => {
          for (let y = Math.max(0, Math.floor(b.y)); y < Math.min(100, Math.ceil(b.y + b.h)); y++) for (let x = Math.max(0, Math.floor(b.x)); x < Math.min(100, Math.ceil(b.x + b.w)); x++) g[y * 100 + x] |= v;
        };
        textBoxes.forEach((b) => mark(b, 1));
        layers.filter((l) => l.kind === 'text').forEach((l) => mark({ x: (l.x / 1080) * 100, y: (l.y / 1350) * 100, w: (l.width / 1080) * 100, h: (l.height / 1350) * 100 }, 2));
        let ref = 0;
        let both = 0;
        for (const v of g) {
          if (v & 1) ref++;
          if (v === 3) both++;
        }
        return ref ? Math.round((both / ref) * 100) : null;
      };
      const run = async (mode: 'before' | 'after') => {
        const t0 = performance.now();
        let calls = 1;
        let text = await P.callPack(reader, P.buildPackPrompt({ kind: 'reference', types: ['cover'], inventory: mode === 'after' }), images, sig);
        let retried = false;
        let check = P.blockCheck(text, detected);
        if (mode === 'after') {
          const b = await P.retryIfBlocky({ reader, text, detected, build: (blocks) => P.buildPackPrompt({ kind: 'reference', types: ['cover'], blocks }), images, signal: sig, canRetry: true });
          if (b.retried) calls++;
          retried = b.retried;
          text = b.text;
          check = P.blockCheck(text, detected);
        }
        const parsed = await P.parsePack(text, `${id}-${mode}`);
        const cover = parsed.ok ? (parsed.pack.designs.cover as never as { kind: string; x: number; y: number; width: number; height: number }[]) : [];
        return { mode, ok: parsed.ok, reasons: parsed.ok ? [] : parsed.reasons, calls, retried, seconds: Math.round((performance.now() - t0) / 100) / 10, textOverlapPct: parsed.ok ? overlap(cover) : null, rectShare: Math.round(check.share * 100), shapes: check.shapes, rects: check.rects, hadInventory: /<inventory/i.test(text) };
      };
      const before = await run('before');
      const after = await run('after');
      return { id, refPx: [ref.width, ref.height], split: ref.split, why: ref.why, textBlocks: textBoxes.length, notRectangular: P.notRectangular(detected), before, after };
    }, [set.id, b64] as const);
    fs.writeFileSync(path.join(OUT, `${set.id}.json`), JSON.stringify(out, null, 2));
    console.log('PACKDRAW', JSON.stringify(out));
    expect(out.before.ok || out.after.ok, JSON.stringify(out).slice(0, 500)).toBe(true);
  });
}
