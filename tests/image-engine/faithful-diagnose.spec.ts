// Step 17b item 1: for each saved SVG answer, the picture as written (rendered with the bundled fonts) against what the engine draws from its layers. No model; saved answers only.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './reference-helpers';

const OUT = path.join(ROOT, 'out/image-engine/faithful');
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));
test.setTimeout(240_000);

const files: { name: string; svg: string; palette?: Record<string, string> }[] = [];
const rec = path.join(ROOT, 'out/image-engine/recreate');
if (fs.existsSync(rec)) for (const f of fs.readdirSync(rec).filter((x) => x.endsWith('.svg'))) files.push({ name: f.replace('.svg', ''), svg: fs.readFileSync(path.join(rec, f), 'utf8') });
files.push({ name: 'docs-example', svg: fs.readFileSync(path.join(ROOT, 'docs', 'recreate-example.svg'), 'utf8') });
const packTxt = path.join(ROOT, 'out/image-engine/pack/raw-from-description.txt');
if (fs.existsSync(packTxt)) {
  const blocks = fs.readFileSync(packTxt, 'utf8').match(/<svg[\s\S]*?<\/svg>/gi) ?? [];
  const pm = /data-palette\s*=\s*'([^']*)'/.exec(blocks[0] ?? '');
  const palette = pm ? (JSON.parse(pm[1]) as Record<string, string>) : undefined;
  for (const b of blocks) files.push({ name: `pack-${/data-type\s*=\s*"([a-z]+)"/.exec(b)?.[1] ?? 'x'}`, svg: b, palette });
}

test('saved SVG answers: as written against what the engine draws, with what was lost', async ({ page }) => {
  await page.goto('/images/carousel');
  const rows: Record<string, unknown>[] = [];
  await page.evaluate(async () => {
    const { loadFonts, FONT_WEIGHTS } = await import('/src/image-engine/fonts.ts');
    const C = await import('/src/carousel/render.ts');
    await loadFonts();
    const layers = Object.entries(FONT_WEIGHTS).flatMap(([font, ws], i) => ws.map((w, j) => ({ kind: 'text', id: `w${i}${j}`, x: 10, y: 10 + (i * 4 + j) * 40, width: 600, height: 40, rotation: 0, opacity: 1, text: 'Warm up', style: { font, weight: w, size: 32, color: '#000000', align: 'left', lineHeight: 1.1 }, autoFit: { minSize: 32 } })));
    await C.renderer.preview({ schema: 1, revision: 1, canvas: { width: 700, height: 1400, background: '#FFFFFF' }, layers } as never, 0.2);
  });
  for (const f of files) {
    const r = await page.evaluate(async ({ svgRaw, palette }) => {
      const R = await import('/src/reference/recreate.ts');
      const F = await import('/src/reference/faithful.ts');
      const C = await import('/src/carousel/render.ts');
      const T = await import('/src/image-engine/draw/text.ts');
      const { loadFonts } = await import('/src/image-engine/fonts.ts');
      await loadFonts();
      let src = svgRaw as string;
      if (palette) src = src.replace(/data-palette\s*=\s*'[^']*'/, '').replace(/\$([a-zA-Z0-9]+)/g, (_m, k) => (palette as Record<string, string>)[k] ?? '#808080');
      const s = R.sanitizeSvg(src);
      if (!s.svg) return { ok: false, reasons: s.reasons };
      const { layers, notes } = R.svgToLayers(s.svg, 1080, 1350);
      const raw = await F.svgToPng(s.svg, 540);
      const plan = { schema: 1 as const, revision: 1, canvas: { width: 1080, height: 1350, background: '#FFFFFF' }, layers: layers.map(({ slot: _s, src: _a, srcAll: _b, ...rest }: never) => rest) };
      const eng = await C.renderer.preview(plan as never, 0.5);
      const a = await createImageBitmap(raw);
      const b = await createImageBitmap(eng);
      const w = 540;
      const h = Math.round(540 * 1350 / 1080);
      const ca = new OffscreenCanvas(w, h);
      const cb = new OffscreenCanvas(w, h);
      ca.getContext('2d')!.drawImage(a, 0, 0, w, h);
      cb.getContext('2d')!.drawImage(b, 0, 0, w, h);
      const pa = ca.getContext('2d')!.getImageData(0, 0, w, h).data;
      const pb = cb.getContext('2d')!.getImageData(0, 0, w, h).data;
      let sum = 0;
      let big = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const d = (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2])) / 3;
        sum += d;
        if (d > 48) big++;
      }
      const pair = new OffscreenCanvas(w * 2 + 30, h + 20);
      const g = pair.getContext('2d')!;
      g.fillStyle = '#e8e8e8';
      g.fillRect(0, 0, pair.width, pair.height);
      g.drawImage(ca, 10, 10);
      g.drawImage(cb, w + 20, 10);
      const pairUrl = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); void pair.convertToBlob({ type: 'image/png' }).then((bl) => fr.readAsDataURL(bl)); });
      const texts = layers.filter((l: { kind: string }) => l.kind === 'text') as unknown as import('/src/image-engine/types.ts').TextLayer[];
      let shrunk = 0;
      let wrapped = 0;
      for (const t of texts) {
        try {
          const lb = T.layoutText(t);
          if (lb.size < t.style.size * 0.97) shrunk++;
          if (lb.lines.length > t.text.split('\n').length) wrapped++;
        } catch { /* fonts */ }
      }
      const arcs = (s.svg.match(/ d="[^"]*"/g) ?? []).filter((d) => /[Aa]\s*-?[\d.]/.test(d)).length;
      const count = (re: RegExp) => (s.svg!.match(re) ?? []).length;
      return {
        ok: true,
        pctDiff: Math.round((sum / (pa.length / 4) / 255) * 1000) / 10,
        pctPixelsVeryDifferent: Math.round((big / (pa.length / 4)) * 1000) / 10,
        source: { text: s.stats.texts, groups: s.stats.groups, shapes: s.stats.shapes, paths: s.stats.paths, pathsWithArcs: arcs, radial: count(/<radialGradient/g), linear: count(/<linearGradient/g), filters: count(/<filter/g), clip: count(/clip-path=|mask=/g), dashed: count(/stroke-dasharray=/g), opacity: count(/-opacity=|opacity=/g) },
        layers: { text: texts.length, path: layers.filter((l: { kind: string }) => l.kind === 'path').length, shape: layers.filter((l: { kind: string }) => l.kind === 'shape').length },
        fontsReplaced: s.wished, textShrunk: shrunk, textWrapped: wrapped, notes, sanitiser: s.reasons, pairUrl,
      };
    }, { svgRaw: f.svg, palette: f.palette });
    const { pairUrl, ...rest } = r as Record<string, unknown> & { pairUrl?: string };
    if (pairUrl) fs.writeFileSync(path.join(OUT, `pair-${f.name}.png`), Buffer.from(pairUrl.split(',')[1], 'base64'));
    rows.push({ name: f.name, ...rest });
  }
  fs.writeFileSync(path.join(OUT, 'diagnose.json'), JSON.stringify(rows, null, 1));
  for (const r of rows) console.log('DIAG', JSON.stringify(r).slice(0, 700));
  expect(rows.every((r) => r.ok)).toBe(true);
});
