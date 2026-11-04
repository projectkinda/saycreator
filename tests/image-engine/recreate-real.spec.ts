// Step 17, REAL (REAL_RECREATE=1): three carousel references of different kinds, each recreated once (the read and its one look-and-fix, two model calls).
// A sheet per reference (reference left, recreated slide right), no scores. Reference files are read from the private folder and never stored in the repo.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './reference-helpers';

const OUT = path.join(ROOT, 'out/image-engine/recreate');
const DIR = path.join(ROOT, 'Reference carousels likes');
test.skip(process.env.REAL_RECREATE !== '1', 'Real runs are opt-in (REAL_RECREATE=1): they use model time.');
test.describe.configure({ mode: 'serial' });
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

// RECREATE_FILE=<path>: one full-size picture (for example from the private test-assets folder) in place of the three sheets.
const SETS = process.env.RECREATE_FILE ? [{ id: 'full-size', kind: 'full-size reference', prefix: '', cell: 0 }] : [
  { id: 'deck-a', kind: 'text slide', prefix: '44937935', cell: 0 },
  { id: 'single', kind: 'photo slide', prefix: '1503c1de', cell: 0 },
  { id: 'deck-c', kind: 'shapes and patterns (yellow posters)', prefix: '05bedfc0', cell: 0 },
];

for (const set of SETS) {
  test(`real recreate: ${set.id} (${set.kind})`, async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto('/images/carousel');
    const b64 = process.env.RECREATE_FILE ? fs.readFileSync(process.env.RECREATE_FILE).toString('base64') : fs.readFileSync(path.join(DIR, fs.readdirSync(DIR).find((f) => f.startsWith(set.prefix))!)).toString('base64');
    const r = await page.evaluate(async ([b64, cell]) => {
      const I = await import('/src/reference/images.ts');
      const G = await import('/src/reference/grid.ts');
      const R = await import('/src/reference/recreate.ts');
      const D = await import('/src/reference/reader.ts');
      const C = await import('/src/carousel/render.ts');
      const F = await import('/src/reference/faithful.ts');
      const reader = (await D.detectReaders())[0];
      const bm = await I.bitmapOf(new Blob([Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0))]));
      let rect = null as { x: number; y: number; width: number; height: number } | null;
      for (const size of [1400, 900, 600]) {
        const small = I.cut(bm, null, size);
        const g = G.detectGrid(I.pxOfCanvas(small));
        if (g) {
          const k = bm.width / small.width;
          const c = g.cells[cell as number];
          rect = { x: Math.round(c.x * k), y: Math.round(c.y * k), width: Math.round(c.width * k), height: Math.round(c.height * k) };
          break;
        }
      }
      const ref = await I.jpegUrl(bm, rect, 1400);
      const ctx = { w: 1080, h: 1350, ownRoles: ['kicker', 'tag', 'title', 'body', 'caption', 'number'] };
      const kb = (url: string) => Math.round((url.length * 3) / 4 / 1000);
      const render = async (layers: unknown[], palette: Record<string, string>, scale: number) => {
        const plan = { schema: 1 as const, revision: 1, canvas: { width: 1080, height: 1350, background: '#FFFFFF' }, layers: R.resolveTokens(layers as never, palette) };
        return C.renderer.preview(plan as never, scale);
      };
      const asUrl = (b: Blob) => new Promise<string>((res) => { const f = new FileReader(); f.onload = () => res(String(f.result)); f.readAsDataURL(b); });
      const t0 = performance.now();
      const text1 = await R.callRecreate(reader, R.buildRecreatePrompt(ctx), [I.readerImageOf(ref.url, 'reference.jpg')], new AbortController().signal);
      const t1 = performance.now();
      (window as unknown as { __rec?: string }).__rec = text1;
      const a1 = await R.answerToLayers(text1, ctx);
      if (!a1.ok) return { ok: false, reasons: a1.reasons, text1: text1.slice(0, 600), seconds1: (t1 - t0) / 1000, refSize: [ref.width, ref.height, kb(ref.url)] };
      // The look-and-fix is shown the picture as written (the faithful render), as the app does until the person edits.
      const renderUrl1 = await asUrl(await F.svgToPng(a1.result.svg, 1400));
      const t2 = performance.now();
      const text2 = await R.callRecreate(reader, R.buildFixPrompt(ctx, ''), [I.readerImageOf(ref.url, 'reference.jpg'), I.readerImageOf(renderUrl1, 'render.jpg')], new AbortController().signal);
      const t3 = performance.now();
      const a2 = await R.answerToLayers(text2, ctx);
      const fin = a2.ok ? a2.result : a1.result;
      const blobF = await render(fin.layers, fin.palette, 0.5);
      const faithF = await F.svgToPng(fin.svg, 540);
      const dims = (b: ImageBitmap) => [b.width, b.height];
      const fa = await createImageBitmap(faithF);
      const ea = await createImageBitmap(blobF);
      const cw = 540;
      const chh = Math.round((540 * 1350) / 1080);
      const c1 = new OffscreenCanvas(cw, chh);
      const c2 = new OffscreenCanvas(cw, chh);
      c1.getContext('2d')!.drawImage(fa, 0, 0, cw, chh);
      c2.getContext('2d')!.drawImage(ea, 0, 0, cw, chh);
      const p1 = c1.getContext('2d')!.getImageData(0, 0, cw, chh).data;
      const p2 = c2.getContext('2d')!.getImageData(0, 0, cw, chh).data;
      let dsum = 0;
      for (let i = 0; i < p1.length; i += 4) dsum += (Math.abs(p1[i] - p2[i]) + Math.abs(p1[i + 1] - p2[i + 1]) + Math.abs(p1[i + 2] - p2[i + 2])) / 3;
      void dims;
      // The sheet: the reference on the left, the recreated slide on the right.
      const left = await I.bitmapFromUrl(ref.url);
      const right = ea;
      const c = new OffscreenCanvas(1680, 720);
      const g = c.getContext('2d')!;
      g.fillStyle = '#e8e8e8';
      g.fillRect(0, 0, c.width, c.height);
      const fit = (b: ImageBitmap, x: number) => { const k = Math.min(540 / b.width, 700 / b.height); g.drawImage(b, x + (540 - b.width * k) / 2, 10, b.width * k, b.height * k); };
      fit(left, 10);
      fit(fa, 570);
      fit(right, 1130);
      const sheet = await asUrl(await c.convertToBlob({ type: 'image/png' }));
      const count = (layers: { kind: string }[], k: string) => layers.filter((l) => l.kind === k).length;
      return {
        ok: true,
        fixUsed: a2.ok,
        fixReasons: a2.ok ? [] : a2.reasons,
        seconds1: Math.round((t1 - t0) / 100) / 10,
        seconds2: Math.round((t3 - t2) / 100) / 10,
        refSize: [ref.width, ref.height, kb(ref.url)],
        faithfulVsEnginePctDiff: Math.round((dsum / (p1.length / 4) / 255) * 1000) / 10,
        notes: fin.notes,
        renderSentKb: kb(renderUrl1),
        first: { text: count(a1.result.layers, 'text'), path: count(a1.result.layers, 'path'), shape: count(a1.result.layers, 'shape') },
        final: { text: count(fin.layers, 'text'), path: count(fin.layers, 'path'), shape: count(fin.layers, 'shape'), roles: [...new Set(fin.layers.filter((l) => l.kind === 'text').map((l) => l.name))], groups: [...new Set(fin.layers.filter((l) => l.kind === 'path').map((l) => l.name))], palette: fin.palette, notes: fin.notes, wished: fin.wished, texts: fin.layers.filter((l) => l.kind === 'text').map((l) => (l as unknown as { text: string }).text.slice(0, 60)) },
        svg1: a1.result.svg,
        svg2: a2.ok ? a2.result.svg : null,
        sheet,
      };
    }, [b64, set.cell] as const).catch(async (e) => {
      const raw = await page.evaluate(() => (window as unknown as { __rec?: string }).__rec ?? '').catch(() => '');
      if (raw) fs.writeFileSync(path.join(OUT, `${set.id}-raw.txt`), raw);
      throw e;
    });
    const { sheet, svg1, svg2, ...rest } = r as Record<string, unknown> & { sheet?: string; svg1?: string; svg2?: string | null };
    if (sheet) fs.writeFileSync(path.join(OUT, `sheet-${set.id}.png`), Buffer.from(sheet.split(',')[1], 'base64'));
    if (svg1) fs.writeFileSync(path.join(OUT, `${set.id}-1.svg`), svg1);
    if (svg2) fs.writeFileSync(path.join(OUT, `${set.id}-2.svg`), svg2);
    fs.writeFileSync(path.join(OUT, `${set.id}.json`), JSON.stringify({ id: set.id, kind: set.kind, ...rest }, null, 1));
    console.log('RECREATE', JSON.stringify({ id: set.id, ...rest }).slice(0, 1800));
    expect((r as { ok: boolean }).ok, JSON.stringify(rest).slice(0, 500)).toBe(true);
  });
}
