// npm run style:aggregate
// Adds up the per-slide MEASUREMENTS (out/image-engine/style/measurements.json) for each cluster in
// Reference carousels likes/clusters.json. Writes out/image-engine/style/cluster-measurements.json.
// Everything here is computed; the words about what it means are written by hand in clusters.json and marked GUESS.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'out/image-engine/style');
const clusters = JSON.parse(fs.readFileSync(path.join(root, 'Reference carousels likes/clusters.json'), 'utf8'));
const meas = JSON.parse(fs.readFileSync(path.join(OUT, 'measurements.json'), 'utf8'));

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const lin = (c) => ((c / 255) <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = lum(a) > lum(b) ? [a, b] : [b, a]; return (lum(x) + 0.05) / (lum(y) + 0.05); };
const sat = ([r, g, b]) => { const mx = Math.max(r, g, b); return mx ? (mx - Math.min(r, g, b)) / mx : 0; };
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const r3 = (v) => (v === null ? null : Math.round(v * 1000) / 1000);

/** Merge colours that look the same, keeping a running weighted mean. */
function merge(items, tol = 48) {
  const out = [];
  for (const { c, w } of items) {
    const m = out.find((x) => dist(x.c, c) < tol);
    if (m) { m.c = m.c.map((v, i) => (v * m.w + c[i] * w) / (m.w + w)); m.w += w; m.n++; } else out.push({ c: [...c], w, n: 1 });
  }
  return out.sort((a, b) => b.w - a.w);
}

const result = { generatedAt: new Date().toISOString(), clusters: {} };
for (const cl of clusters.clusters) {
  const slides = cl.images.flatMap((f) => (meas.files[f]?.slides ?? []).map((s) => ({ ...s, file: f })));
  const n = slides.length;
  const palette = merge(slides.flatMap((s) => s.palette.map((p) => ({ c: rgb(p.hex), w: p.share / n })))).slice(0, 8);
  const bgs = merge(slides.map((s) => ({ c: rgb(s.background), w: 1 })), 60);
  const texts = merge(slides.filter((s) => s.text).map((s) => ({ c: rgb(s.text), w: 1 })), 60);
  // The "hot" colour of a slide: its most saturated palette colour that covers at least 0.4% of the slide.
  const hotOf = (s) => s.palette.filter((p) => sat(rgb(p.hex)) > 0.45 && Math.max(...rgb(p.hex)) >= 110 && p.share >= 0.004).sort((a, b) => b.share - a.share)[0];
  const accents = merge(slides.map((s) => hotOf(s)).filter(Boolean).map((p) => ({ c: rgb(p.hex), w: 1 })), 60);
  const flat = slides.filter((s) => s.flatBackground);
  const dark = slides.filter((s) => lum(rgb(s.background)) < 0.18).length;
  const bandsTall = flat.map((s) => Math.max(0, ...s.bands.map((b) => b.height))).filter((v) => v > 0);
  const bandsSmall = flat.map((s) => (s.bands.length >= 2 ? Math.min(...s.bands.map((b) => b.height)) : null)).filter((v) => v);
  const ratios = flat.filter((s) => s.bands.length >= 2).map((s) => Math.max(...s.bands.map((b) => b.height)) / Math.min(...s.bands.map((b) => b.height)));
  const align = { left: 0, centre: 0, mixed: 0 };
  for (const s of flat) if (s.alignment) align[s.alignment.value]++;
  const pairs = slides.filter((s) => s.text).map((s) => s.textContrast);
  const perFile = cl.images.map((f) => {
    const ss = slides.filter((x) => x.file === f);
    const hot = merge(ss.map((x) => hotOf(x)).filter(Boolean).map((p) => ({ c: rgb(p.hex), w: 1 })), 60).slice(0, 2);
    const bg = merge(ss.map((x) => ({ c: rgb(x.background), w: 1 })), 60).slice(0, 3);
    const pal = merge(ss.flatMap((x) => x.palette.map((p) => ({ c: rgb(p.hex), w: p.share / ss.length }))), 40).slice(0, 6);
    return { file: f, slides: ss.length, flat: ss.filter((x) => x.flatBackground).length, hot: hot.map((h) => ({ hex: hex(h.c), slides: h.n, onBlack: r3(ratio(h.c, [17, 17, 17])), onWhite: r3(ratio(h.c, [255, 255, 255])) })), backgrounds: bg.map((b) => ({ hex: hex(b.c), slides: b.n })), palette: pal.map((p) => ({ hex: hex(p.c), share: r3(p.w) })) };
  });
  result.clusters[cl.id] = {
    slides: n,
    files: cl.images.length,
    flatBackgroundSlides: flat.length,
    photoLedSlides: n - flat.length,
    darkBackgroundShare: r3(dark / n),
    aspectMedian: r3(median(slides.map((s) => s.aspect))),
    palette: palette.map((p) => ({ hex: hex(p.c), share: r3(p.w) })),
    background: bgs.slice(0, 3).map((b) => ({ hex: hex(b.c), slides: b.n })),
    text: texts.slice(0, 3).map((b) => ({ hex: hex(b.c), slides: b.n })),
    hotColour: accents.slice(0, 4).map((b) => ({ hex: hex(b.c), slides: b.n })),
    perFile,
    contrast: {
      textVsOwnBackgroundMedian: r3(median(pairs)),
      textVsOwnBackgroundMin: pairs.length ? r3(Math.min(...pairs)) : null,
    },
    margins: {
      note: 'Share of the slide width or height between the slide edge and the nearest ink. Only flat-background slides can be measured.',
      measuredSlides: flat.length,
      left: r3(median(flat.map((s) => s.inkBox?.left).filter((v) => v !== undefined))),
      right: r3(median(flat.map((s) => s.inkBox?.right).filter((v) => v !== undefined))),
      top: r3(median(flat.map((s) => s.inkBox?.top).filter((v) => v !== undefined))),
      bottom: r3(median(flat.map((s) => s.inkBox?.bottom).filter((v) => v !== undefined))),
    },
    emptySpace: { median: r3(median(flat.map((s) => s.emptyShare))), min: flat.length ? r3(Math.min(...flat.map((s) => s.emptyShare))) : null, max: flat.length ? r3(Math.max(...flat.map((s) => s.emptyShare))) : null },
    bands: {
      note: 'Heights of horizontal bands that contain ink, as a share of slide height. A multi-line headline with tight leading is one band, so the ratio overstates the font-size ratio.',
      tallestMedian: r3(median(bandsTall)),
      smallestMedian: r3(median(bandsSmall)),
      tallestOverSmallestMedian: r3(median(ratios)),
    },
    alignment: { ...align, measuredSlides: flat.length },
  };
}
fs.writeFileSync(path.join(OUT, 'cluster-measurements.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 1).slice(0, 6000));
