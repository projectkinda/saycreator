// Many references are collages: 6 to 12 slides in one picture. This finds the grid in code, with no model: first by the gutters
// (strips of one plain colour running the whole height or width), then, for slides set edge to edge, by where the picture changes
// most along evenly spaced lines. Pure (no DOM): it works on pixel data.
import type { Px, Rect } from './types';

export interface GridResult {
  cols: number;
  rows: number;
  /** The cells in reading order, in the picture's own pixels. */
  cells: Rect[];
  /** How it was found, in plain words. */
  method: string;
}

type RGB = [number, number, number];
const l1 = (a: RGB, b: RGB) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** For each column (or row), its mean colour and how much it varies along its length (the few most unlike samples are left out, so a speck of
 *  white in a corner does not make a plain strip look busy). */
function lineStats(p: Px, vertical: boolean) {
  const n = vertical ? p.width : p.height;
  const len = vertical ? p.height : p.width;
  const mean: RGB[] = [];
  const spread: number[] = [];
  const step = Math.max(1, Math.floor(len / 400));
  for (let i = 0; i < n; i++) {
    let r = 0;
    let g = 0;
    let b = 0;
    const sums: number[] = [];
    for (let j = 0; j < len; j += step) {
      const k = ((vertical ? j * p.width + i : i * p.width + j) * 4);
      r += p.data[k];
      g += p.data[k + 1];
      b += p.data[k + 2];
      sums.push(p.data[k] + p.data[k + 1] + p.data[k + 2]);
    }
    const c = sums.length;
    mean.push([r / c, g / c, b / c]);
    sums.sort((x, y) => x - y);
    const lo = Math.floor(c * 0.04);
    const mid = sums.slice(lo, c - lo);
    const m = mid.reduce((x, y) => x + y, 0) / mid.length;
    spread.push(Math.sqrt(mid.reduce((x, y) => x + (y - m) ** 2, 0) / mid.length));
  }
  return { mean, spread };
}

/** The strips that are one plain colour along their whole length, grouped into runs: [start, end) and the colour. */
function gutterRuns(p: Px, vertical: boolean): { a: number; b: number; rgb: RGB }[] {
  const { mean, spread } = lineStats(p, vertical);
  const n = mean.length;
  // Plain means far calmer than a typical column: an absolute floor for flat gutters, and a share of the median for gutters over a soft vignette.
  const sorted = [...spread].sort((a, b) => a - b);
  const limit = Math.min(70, Math.max(14, 0.3 * (sorted[Math.floor(sorted.length / 2)] ?? 0)));
  const plain: boolean[] = spread.map((s) => s < limit);
  const runs: { a: number; b: number; rgb: RGB }[] = [];
  let i = 0;
  while (i < n) {
    if (!plain[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && plain[j] && l1(mean[j], mean[i]) < 40) j++;
    runs.push({ a: i, b: j, rgb: mean[i] });
    i = j;
  }
  // A soft edge can split one gutter into pieces: join neighbours that touch and are alike.
  const joined: { a: number; b: number; rgb: RGB }[] = [];
  for (const r of runs) {
    const last = joined[joined.length - 1];
    if (last && last.b === r.a && l1(last.rgb, r.rgb) < 80) last.b = r.b;
    else joined.push({ ...r });
  }
  // A gutter is a thin strip. A wide plain run is a plain slide (or a plain part of one), not a gutter.
  return joined.filter((r) => r.b - r.a < n * 0.08);
}

/** The cells between gutters along one direction: [start, end) spans whose sizes agree. Empty when there is no repeat. */
function spansFrom(runs: { a: number; b: number; rgb: RGB }[], n: number): { a: number; b: number }[] {
  if (runs.length === 0) return [];
  // Real gutters repeat at one distance. Look for the longest chain of strips spaced evenly, and ignore plain strips inside slides.
  const chain = evenChain(runs, n);
  if (chain.length >= 2) return cellsBetween(chain, n);
  // The gutter colour is the commonest among the runs.
  const colour = runs.reduce((best, r) => (runs.filter((q) => l1(q.rgb, r.rgb) < 40).length > runs.filter((q) => l1(q.rgb, best.rgb) < 40).length ? r : best), runs[0]).rgb;
  return cellsBetween(runs.filter((r) => l1(r.rgb, colour) < 40), n);
}

/** The longest run of strips spaced one distance apart (within a few percent), starting from any pair. */
function evenChain(runs: { a: number; b: number; rgb: RGB }[], n: number): { a: number; b: number; rgb: RGB }[] {
  const mid = (r: { a: number; b: number }) => (r.a + r.b) / 2;
  let best: { a: number; b: number; rgb: RGB }[] = [];
  for (let i = 0; i < runs.length; i++)
    for (let j = i + 1; j < runs.length; j++) {
      const T = mid(runs[j]) - mid(runs[i]);
      if (T < n * 0.1) continue;
      const tol = Math.max(3, T * 0.03);
      const got: { a: number; b: number; rgb: RGB }[] = [];
      for (let k = -8; k <= 8; k++) {
        const at = mid(runs[i]) + k * T;
        if (at < 0 || at > n) continue;
        const hit = runs.find((r) => Math.abs(mid(r) - at) <= tol && l1(r.rgb, runs[i].rgb) < 60);
        if (hit) got.push(hit);
      }
      if (got.length > best.length || (got.length === best.length && got.length >= 2 && T < mid(best[1]) - mid(best[0]))) best = got;
    }
  return best;
}

function cellsBetween(gut: { a: number; b: number; rgb: RGB }[], n: number): { a: number; b: number }[] {
  const inner: { a: number; b: number }[] = [];
  for (let i = 0; i + 1 < gut.length; i++) if (gut[i + 1].a > gut[i].b) inner.push({ a: gut[i].b, b: gut[i + 1].a });
  const sizes = inner.map((e) => e.b - e.a).sort((x, y) => x - y);
  const med = sizes[Math.floor(sizes.length / 2)] ?? 0;
  const edges = [...inner];
  // The strips before the first gutter and after the last are a slide, or a slide with a margin: keep the slide-sized piece next to the gutter.
  const first = gut[0];
  if (med > 0 && first.a >= med * 0.85) edges.unshift({ a: Math.max(0, first.a - Math.round(med)), b: first.a });
  const last = gut[gut.length - 1];
  if (med > 0 && n - last.b >= med * 0.85) edges.push({ a: last.b, b: Math.min(n, last.b + Math.round(med)) });
  const spans = edges.filter((e) => e.b - e.a >= med * 0.85 && e.b - e.a <= med * 1.15);
  return spans.length >= 2 ? spans : [];
}

/** The sum of changes between neighbouring columns (or rows) at one position: large where two slides meet. */
function seam(p: Px, vertical: boolean, at: number): number {
  const len = vertical ? p.height : p.width;
  const step = Math.max(1, Math.floor(len / 300));
  let s = 0;
  let c = 0;
  for (let j = 0; j < len; j += step) {
    const k1 = vertical ? (j * p.width + at - 1) * 4 : ((at - 1) * p.width + j) * 4;
    const k2 = vertical ? (j * p.width + at) * 4 : (at * p.width + j) * 4;
    s += Math.abs(p.data[k1] - p.data[k2]) + Math.abs(p.data[k1 + 1] - p.data[k2 + 1]) + Math.abs(p.data[k1 + 2] - p.data[k2 + 2]);
    c++;
  }
  return s / c;
}

const FRAMES = [0.8, 1, 0.5625, 1.7778, 0.75, 1.25];

/** Looks for a grid. Null when the picture looks like a single slide. */
export function detectGrid(p: Px): GridResult | null {
  // Seams at every evenly spaced line, all of them clear, settle it before looking for gutters (the plain margins inside slides can repeat evenly too).
  const sure = seamGrid(p);
  if (sure && sure.all) return sure.result;
  // 1. Gutters.
  const xs = spansFrom(gutterRuns(p, true), p.width);
  const ys = spansFrom(gutterRuns(p, false), p.height);
  if (xs.length >= 2 || ys.length >= 2) {
    const cx = xs.length >= 2 ? xs : [{ a: 0, b: p.width }];
    const cy = ys.length >= 2 ? ys : [{ a: 0, b: p.height }];
    const cells: Rect[] = [];
    for (const y of cy) for (const x of cx) cells.push({ x: x.a, y: y.a, width: x.b - x.a, height: y.b - y.a });
    // The cells must look like slides, not slivers.
    const aspects = cells.map((c) => c.width / c.height);
    if (cells.length >= 2 && aspects.every((a) => a > 0.3 && a < 3.2)) return { cols: cx.length, rows: cy.length, cells, method: 'gutters between the slides' };
  }
  // 2. Slides set edge to edge: evenly spaced seams.
  return sure ? sure.result : null;
}

function seamGrid(p: Px): { result: GridResult; all: boolean } | null {
  let best: { cols: number; rows: number; score: number; all: boolean } | null = null;
  for (let cols = 1; cols <= 6; cols++)
    for (let rows = 1; rows <= 4; rows++) {
      if (cols * rows < 2) continue;
      const cw = p.width / cols;
      const ch = p.height / rows;
      const asp = cw / ch;
      if (!FRAMES.some((f) => Math.abs(asp - f) / f < 0.12)) continue;
      const seams: number[] = [];
      for (let c = 1; c < cols; c++) seams.push(seam(p, true, Math.round(c * cw)));
      for (let r = 1; r < rows; r++) seams.push(seam(p, false, Math.round(r * ch)));
      // Compare with the typical change between neighbours elsewhere.
      let base = 0;
      let bn = 0;
      for (let x = 8; x < p.width - 8; x += Math.max(1, Math.floor(p.width / 60))) {
        if (Array.from({ length: cols - 1 }, (_, c) => Math.abs(x - Math.round((c + 1) * cw)) < 3).some(Boolean)) continue;
        base += seam(p, true, x);
        bn++;
      }
      // Two slides of the same dark colour meet without a visible seam, so not every seam has to show: most of them must, and at least two.
      const b = Math.max(1, base / Math.max(1, bn));
      const strong = seams.map((x) => Math.min(12, x / b)).filter((x) => x > 2.4);
      if (strong.length < 2 || strong.length < seams.length / 2) continue;
      const score = (strong.reduce((x, y) => x + y, 0) / strong.length) * (strong.length / seams.length) * Math.sqrt(cols * rows);
      if (!best || score > best.score) best = { cols, rows, score, all: strong.length === seams.length && strong.every((x) => x > 4) };
    }
  if (best) {
    const cells: Rect[] = [];
    const cw = p.width / best.cols;
    const ch = p.height / best.rows;
    for (let r = 0; r < best.rows; r++) for (let c = 0; c < best.cols; c++) cells.push({ x: Math.round(c * cw), y: Math.round(r * ch), width: Math.round(cw), height: Math.round(ch) });
    return { result: { cols: best.cols, rows: best.rows, cells, method: 'seams where the slides meet (no gutter)' }, all: best.all };
  }
  return null;
}
