// Pixel-level check of the marker bars and the headline ink (ZERO model calls, static images only).
//   For every slide drawn by the layout library: 7 presets x layouts with a headline x short/normal/long/wrapping headlines (the accent phrase also appears earlier: "your head")
//   x upper/lower/no case x (the preset as it is, and forced onto a marker) x every ground of the preset's rhythm, the slide is rendered to pixels and:
//     - every marker bar holds ink (no empty bar) that reads at 4.5:1 against the bar,
//     - the accent words sit on a bar and no other word does (the bar is exactly behind the accent phrase, on whichever lines it lands),
//     - every headline word reads at 3:1 against what is directly behind it (a word with no ink at all fails too: dark ink under a dark bar, white on lime).
// Output of failures: out/app-fix/marker-pixels.json
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(20 * 60_000);
const PRESETS = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon'];
const HEADS = [
  { id: 'short', headline: 'Clear your head', accent: 'your head' },
  { id: 'normal', headline: 'Stop storing your life in your head', accent: 'your head' },
  { id: 'long', headline: 'Stop storing your plans and your goals in your head', accent: 'your head' },
  { id: 'wrap', headline: 'Move your ideas out of your head into a system', accent: 'out of your head' },
  { id: 'again', headline: 'The third one is the one almost nobody does', accent: 'the one almost nobody' },
];

test('marker bars and headline ink, measured on the pixels', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ presets, heads }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const L = await import('/src/carousel/layouts/index.ts');
    const PR = await import('/src/carousel/presets.ts');
    const T = await import('/src/image-engine/draw/text.ts');
    const F = await import('/src/reference/faithful.ts');
    const lum = (c: number[]) => { const f = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
    const ratio = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const dist = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    const fails: string[] = [];
    let slides = 0, bars = 0, words = 0;
    const skipped: Record<string, number> = {};
    const FIELDS = (layout: string, h: { headline: string; accent: string }) =>
      layout === 'statement' ? { kicker: 'Three fixes', headline: h.headline, caption: 'The third one is the one almost nobody does.', accent: [h.accent] }
      : layout === 'cta-button' ? { headline: h.headline, button: 'Comment brain', sub: 'I will send you a document.', accent: [h.accent] }
      : { headline: h.headline, paragraph: 'It keeps things running, and every open loop drains you all day.', accent: [h.accent] };
    for (const name of presets) {
      const pack = PR.presetPackFor(name, false);
      if (!pack) continue;
      const base = D.styleFromPack(pack).style;
      for (const mode of ['preset', 'marker'] as const) for (const caseStyle of ['upper', 'lower', 'none'] as const) {
        const style: any = { ...base, caseStyle, ...(mode === 'marker' ? { accentStyle: 'marker', devices: { ...base.devices, marker: true } } : {}) };
        const grounds = style.rhythm && style.rhythm.length > 1 ? style.rhythm.map((_: unknown, i: number) => i) : [undefined];
        for (const layout of ['statement', 'cta-button', 'split-text']) for (const h of heads) for (const g of grounds) {
          const tag = `${name}/${mode}/${caseStyle}/${layout}/${h.id}${g === undefined ? '' : '/g' + g}`;
          let b: any;
          try { b = await L.buildSlide(layout, 0, FIELDS(layout, h), style, { handle: '@h', index: 1, total: 7, ...(g === undefined ? {} : { ground: g }) }); } catch (e) { fails.push(tag + ': build threw ' + String(e).slice(0, 80)); continue; }
          if (!b.ok) { skipped[h.id] = (skipped[h.id] ?? 0) + 1; continue; }
          slides++;
          const png = await F.svgToPng(b.svg, 1080);
          const bm = await createImageBitmap(png);
          const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height;
          const cx = cv.getContext('2d', { willReadFrequently: true })!; cx.drawImage(bm, 0, 0);
          const px = (x: number, y: number) => { const d = cx.getImageData(Math.max(0, Math.min(bm.width - 1, Math.round(x))), Math.max(0, Math.min(bm.height - 1, Math.round(y))), 1, 1).data; return [d[0], d[1], d[2]]; };
          // ink inside a pixel box against a known background: how much of the box is ink, and the ink colour (the pixels farthest from the background)
          const inkIn = (x0: number, y0: number, x1: number, y1: number, bg: number[]) => {
            const w = Math.max(1, Math.round(x1 - x0)), hh = Math.max(1, Math.round(y1 - y0));
            const d = cx.getImageData(Math.round(x0), Math.round(y0), w, hh).data;
            let n = 0, far = 0;
            const all: number[][] = [];
            for (let i = 0; i < d.length; i += 4) { const c = [d[i], d[i + 1], d[i + 2]]; const dd = dist(c, bg); if (dd > 90) { n++; all.push(c); far = Math.max(far, dd); } }
            const strong = all.filter((c) => dist(c, bg) >= far * 0.8);
            const col = strong.length ? [0, 1, 2].map((k) => strong.reduce((a, c) => a + c[k], 0) / strong.length) : bg;
            return { frac: n / (d.length / 4), color: col };
          };
          const title = (b.layers as any[]).find((l) => l.kind === 'text' && l.name === 'title');
          if (!title) continue;
          const blk = T.layoutText(title);
          const runs: { start: number; end: number }[] = title.runs ?? [];
          const hl = title.highlight;
          blk.lines.forEach((line: any, li: number) => {
            const yTop = title.y + line.y + blk.lineStep * 0.34, yBot = title.y + line.y + blk.lineStep * 0.66;
            // the bars of this line
            for (const m of line.marks ?? []) {
              bars++;
              const x0 = title.x + m.x, x1 = title.x + m.x + m.width;
              // the bar reaches paddingX beyond the words on both sides: its colour is read there, in the padding
              const bar = px(x0 - (hl?.paddingX ?? 12) / 2, (yTop + yBot) / 2);
              const ink = inkIn(x0, yTop, x1, yBot, bar);
              if (ink.frac < 0.02) fails.push(`${tag}: line ${li + 1} has an EMPTY marker bar`);
              else if (ratio(ink.color, bar) < 4.5) fails.push(`${tag}: line ${li + 1} ink on the bar reads ${ratio(ink.color, bar).toFixed(2)}:1 (needs 4.5)`);
            }
            for (const w of line.words ?? []) {
              words++;
              const ws = w.start;
              const x0 = title.x + w.x + 2, x1 = title.x + w.x + w.width - 2;
              const mid = (yTop + yBot) / 2;
              const isAccent = ws !== undefined && runs.some((rr) => rr.start < ws + w.text.length && rr.end > ws);
              const inBar = (line.marks ?? []).some((m: any) => title.x + m.x <= (x0 + x1) / 2 && (x0 + x1) / 2 <= title.x + m.x + m.width);
              if (hl && ws !== undefined) {
                if (isAccent && !inBar) fails.push(`${tag}: the accent word "${w.text}" (line ${li + 1}) is not on a bar`);
                if (!isAccent && inBar) fails.push(`${tag}: the word "${w.text}" (line ${li + 1}) sits on a bar but is not part of the accent`);
              }
              // what is directly behind: the pixels just left of the word, else just right of it
              const left = title.x + w.x - 8;
              const probe = left >= 2 ? [px(left, mid), px(left - 2, mid), px(left - 4, mid)] : [px(title.x + w.x + w.width + 8, mid), px(title.x + w.x + w.width + 10, mid)];
              const bg = probe[0];
              const ink = inkIn(x0, yTop, x1, yBot, bg);
              if (ink.frac < 0.02) fails.push(`${tag}: the word "${w.text}" (line ${li + 1}) has no ink against what is behind it (invisible)`);
              else if (ratio(ink.color, bg) < (inBar ? 4.5 : 3)) fails.push(`${tag}: the word "${w.text}" (line ${li + 1}) reads ${ratio(ink.color, bg).toFixed(2)}:1 against what is behind it`);
            }
          });
        }
      }
    }
    return { fails, slides, bars, words, skipped };
  }, { presets: PRESETS, heads: HEADS });
  fs.mkdirSync('out/app-fix', { recursive: true });
  const kinds: Record<string, number> = {};
  for (const f of r.fails) { const k = f.replace(/^[^:]*: /, '').replace(/"[^"]*"/, '"w"').replace(/\(line \d+\)/, '').replace(/line \d+/, 'line n').replace(/[\d.]+:1/, 'x:1'); kinds[k] = (kinds[k] ?? 0) + 1; }
  // which combinations failed: by preset, headline, case, layout and mode (a slide is counted once)
  const slidesBad = new Set(r.fails.map((f) => f.split(': ')[0]));
  const by = (idx: number) => { const o: Record<string, number> = {}; for (const t of slidesBad) { const k = t.split('/')[idx]; o[k] = (o[k] ?? 0) + 1; } return o; };
  const summary = { skippedNotDrawn: r.skipped, slides: r.slides, bars: r.bars, words: r.words, failures: r.fails.length, slidesWithAFailure: slidesBad.size, kinds, byPreset: by(0), byMode: by(1), byCase: by(2), byLayout: by(3), byHeadline: by(4) };
  fs.writeFileSync('out/app-fix/marker-pixels.json', JSON.stringify({ ...summary, sample: r.fails.slice(0, 200) }, null, 1));
  fs.writeFileSync('out/app-fix/marker-pixels-all.txt', r.fails.join('\n'));
  console.log('MARKERPX', JSON.stringify(summary));
  expect(r.slides, 'many slides were drawn').toBeGreaterThan(400);
  expect(r.bars, 'many bars were checked').toBeGreaterThan(100);
  expect(r.fails.slice(0, 25)).toEqual([]);
});
