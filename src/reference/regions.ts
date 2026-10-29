// Region detection in code, with no model: from the pixels of one reference slide, the background, the photo regions, the text blocks (box, lines, size,
// alignment, colour), the flat shapes, the other graphics, and the graphic treatment of the text (outline, shadow, highlight, tilt...). Positions are in
// percent of the canvas. Every value is a measurement with a stated method; the methods are heuristics and say so. Pure (no DOM): it works on pixel data.
import type { Px } from './types';

type RGB = [number, number, number];
export interface Box {
  /** Percent of the canvas width and height (0 to 100). */
  x: number;
  y: number;
  w: number;
  h: number;
}
export type TreatmentKind = 'size-hierarchy' | 'caps' | 'wide-spacing' | 'tight-spacing' | 'outline' | 'shadow' | 'highlight-box' | 'on-shape' | 'underline' | 'circled' | 'tilt' | 'staggered' | 'two-tone' | 'over-photo';
export interface Treatment {
  kind: TreatmentKind;
  detail: string;
  colour?: string;
  /** Degrees, for tilt. */
  angle?: number;
  /** Whether the drawing can reproduce it (the rest are listed as missing for this reference). */
  supported: boolean;
}
export interface TextBlock {
  id: string;
  box: Box;
  lines: { box: Box }[];
  /** Tallest and shortest line, as a share of the canvas height (percent). */
  lineHeightPct: number;
  /** The type size on a 1350 px high slide that gives this line height. */
  fontPx: number;
  align: 'left' | 'centre' | 'right';
  colour: string;
  /** 300, 400, 700 or 900, from the thickness of the strokes against the height of the letters (a guess). */
  weight: number;
  caps: boolean;
  treatments: Treatment[];
}
export interface PhotoRegion {
  id: string;
  box: Box;
  shape: 'rect' | 'rounded' | 'circle' | 'full-bleed';
}
export interface FlatShape {
  id: string;
  box: Box;
  colour: string;
  kind: 'rect' | 'rounded' | 'pill' | 'circle' | 'bar';
  /** The text block that sits on it, if any. */
  holds?: string;
}
export interface Graphic {
  id: string;
  box: Box;
  colour: string;
  kind: 'ring' | 'mark';
}
export interface Background {
  kind: 'flat' | 'gradient' | 'split' | 'photo';
  colours: string[];
  direction?: 'vertical' | 'horizontal';
  /** Percent along the axis where a split falls. */
  split?: number;
}
export interface Detected {
  size: { width: number; height: number };
  background: Background;
  photos: PhotoRegion[];
  texts: TextBlock[];
  shapes: FlatShape[];
  graphics: Graphic[];
  notes: string[];
}

const hex = (c: RGB) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const l1 = (a: RGB, b: RGB) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const at = (p: Px, x: number, y: number): RGB => {
  const k = (y * p.width + x) * 4;
  return [p.data[k], p.data[k + 1], p.data[k + 2]];
};
const median = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0);
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const std = (v: number[]) => {
  const m = mean(v);
  return Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
};

interface Comp {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  area: number;
  rgb: RGB;
  /** Pixels on the edge of the component (a thin stroke has a high edge share). */
  edge: number;
}

/** The colour at the edges of the picture: the commonest of the border pixels. */
function borderColour(p: Px): RGB {
  const bins = new Map<number, { n: number; s: RGB }>();
  const add = (x: number, y: number) => {
    const c = at(p, x, y);
    const k = ((c[0] >> 4) << 8) | ((c[1] >> 4) << 4) | (c[2] >> 4);
    const e = bins.get(k) ?? { n: 0, s: [0, 0, 0] as RGB };
    e.n++;
    e.s = [e.s[0] + c[0], e.s[1] + c[1], e.s[2] + c[2]];
    bins.set(k, e);
  };
  for (let x = 0; x < p.width; x++) {
    add(x, 0);
    add(x, p.height - 1);
  }
  for (let y = 0; y < p.height; y++) {
    add(0, y);
    add(p.width - 1, y);
  }
  const top = [...bins.values()].sort((a, b) => b.n - a.n)[0];
  return [top.s[0] / top.n, top.s[1] / top.n, top.s[2] / top.n];
}

/** Rows and columns of mean colour along each axis, to see a gradient or a split. */
function backgroundOf(p: Px, bg: RGB): Background {
  const rows: RGB[] = [];
  const cols: RGB[] = [];
  for (let y = 0; y < p.height; y += 2) {
    const s: RGB = [0, 0, 0];
    let n = 0;
    for (let x = 0; x < p.width; x += 4) {
      const c = at(p, x, y);
      s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; n++;
    }
    rows.push([s[0] / n, s[1] / n, s[2] / n]);
  }
  for (let x = 0; x < p.width; x += 2) {
    const s: RGB = [0, 0, 0];
    let n = 0;
    for (let y = 0; y < p.height; y += 4) {
      const c = at(p, x, y);
      s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; n++;
    }
    cols.push([s[0] / n, s[1] / n, s[2] / n]);
  }
  // A split: one big jump in the profile with steady colour either side.
  for (const [prof, dir] of [[cols, 'horizontal'], [rows, 'vertical']] as const) {
    let best = 0;
    let bi = 0;
    for (let i = 3; i < prof.length - 3; i++) {
      const j = l1(prof[i - 1], prof[i]);
      if (j > best) { best = j; bi = i; }
    }
    if (best > 90) {
      const a = prof.slice(0, bi - 1);
      const b = prof.slice(bi + 1);
      const spread = (v: RGB[]) => mean(v.map((c) => l1(c, v[Math.floor(v.length / 2)])));
      if (a.length > 4 && b.length > 4 && spread(a) < 40 && spread(b) < 40 && bi > prof.length * 0.15 && bi < prof.length * 0.85) return { kind: 'split', colours: [hex(a[Math.floor(a.length / 2)]), hex(b[Math.floor(b.length / 2)])], direction: dir, split: Math.round((bi / prof.length) * 100) };
    }
  }
  // A gradient: the first and last rows (or columns) differ and the profile moves steadily between them.
  for (const [prof, dir] of [[rows, 'vertical'], [cols, 'horizontal']] as const) {
    const a = prof[1];
    const b = prof[prof.length - 2];
    if (l1(a, b) > 50) {
      let steady = 0;
      for (let i = 1; i < prof.length; i++) if (l1(prof[i - 1], prof[i]) < 18) steady++;
      if (steady / prof.length > 0.9) return { kind: 'gradient', colours: [hex(a), hex(b)], direction: dir };
    }
  }
  return { kind: 'flat', colours: [hex(bg)] };
}

/** Blocks that look like a photograph: a photograph is made of many slightly different colours (even a dark, smooth one), where flat colour, a soft
 *  gradient and the edge of a letter have only a few. Counts the distinct colours (6-bit) in each 8 by 8 block. */
export const PHOTO_BLOCK = 8;
export function photoBlocks(p: Px, _gradient: boolean, texture = 30): { mask: Uint8Array; cols: number; rows: number } {
  const B = PHOTO_BLOCK;
  const cols = Math.floor(p.width / B);
  const rows = Math.floor(p.height / B);
  const mask = new Uint8Array(cols * rows);
  const seen = new Set<number>();
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      seen.clear();
      for (let y = 0; y < B; y++)
        for (let x = 0; x < B; x++) {
          const v = at(p, c * B + x, r * B + y);
          seen.add(((v[0] >> 2) << 12) | ((v[1] >> 2) << 6) | (v[2] >> 2));
        }
      if (seen.size >= texture) mask[r * cols + c] = 1;
    }
  return { mask, cols, rows };
}

/** Fills gaps of up to 2r cells in a grid of cells without eating into the picture's own edges (the grid's edge counts as more of the same). */
function closeCells(m: Uint8Array, cols: number, rows: number, r: number): Uint8Array {
  const pc = cols + 2 * r;
  const pr = rows + 2 * r;
  const pad = new Uint8Array(pc * pr);
  for (let y = 0; y < pr; y++)
    for (let x = 0; x < pc; x++) pad[y * pc + x] = m[Math.min(rows - 1, Math.max(0, y - r)) * cols + Math.min(cols - 1, Math.max(0, x - r))];
  const done = erode(dilate(pad, pc, pr, r), pc, pr, r);
  const out = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out[y * cols + x] = done[(y + r) * pc + x + r];
  return out;
}

/** Connected groups of marked cells, as boxes in cell units, with the number of cells. */
export function groups(mask: Uint8Array, cols: number, rows: number, link = 1): { x0: number; y0: number; x1: number; y1: number; n: number }[] {
  const seen = new Uint8Array(mask.length);
  const out: { x0: number; y0: number; x1: number; y1: number; n: number }[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    const g = { x0: cols, y0: rows, x1: -1, y1: -1, n: 0 };
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % cols;
      const y = Math.floor(k / cols);
      g.x0 = Math.min(g.x0, x); g.x1 = Math.max(g.x1, x); g.y0 = Math.min(g.y0, y); g.y1 = Math.max(g.y1, y); g.n++;
      for (let dy = -link; dy <= link; dy++)
        for (let dx = -link; dx <= link; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const j = ny * cols + nx;
          if (mask[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
    }
    out.push(g);
  }
  return out;
}

/** The commonest colour inside a box that is not close to the page colour (4-bit bins, averaged). */
function dominantIn(p: Px, b: { x0: number; y0: number; x1: number; y1: number }, bg: RGB): RGB {
  const bins = new Map<number, { n: number; s: RGB }>();
  for (let y = b.y0; y <= b.y1; y += 2)
    for (let x = b.x0; x <= b.x1; x += 2) {
      const c = at(p, x, y);
      if (l1(c, bg) < 60) continue;
      const k = ((c[0] >> 4) << 8) | ((c[1] >> 4) << 4) | (c[2] >> 4);
      const e = bins.get(k) ?? { n: 0, s: [0, 0, 0] as RGB };
      e.n++;
      e.s = [e.s[0] + c[0], e.s[1] + c[1], e.s[2] + c[2]];
      bins.set(k, e);
    }
  const top = [...bins.values()].sort((a, c) => c.n - a.n)[0];
  return top ? [top.s[0] / top.n, top.s[1] / top.n, top.s[2] / top.n] : bg;
}

/** Takes away strokes thinner than 2r+1 pixels (a square window, separable). */
function erode(m: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const tmp = new Uint8Array(m.length);
  const out = new Uint8Array(m.length);
  for (let y = 0; y < H; y++) {
    let run = 0;
    for (let x = 0; x < W; x++) {
      run = m[y * W + x] ? run + 1 : 0;
      // A pixel survives when the 2r+1 pixels centred on it are all set: the run that ends at x+r is long enough.
      if (run >= 2 * r + 1) tmp[y * W + x - r] = 1;
    }
  }
  for (let x = 0; x < W; x++) {
    let run = 0;
    for (let y = 0; y < H; y++) {
      run = tmp[y * W + x] ? run + 1 : 0;
      if (run >= 2 * r + 1) out[(y - r) * W + x] = 1;
    }
  }
  return out;
}
/** Grows the set by r pixels each way (the other half of an opening). */
function dilate(m: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const tmp = new Uint8Array(m.length);
  const out = new Uint8Array(m.length);
  for (let y = 0; y < H; y++) {
    let last = -1e9;
    for (let x = 0; x < W + r; x++) {
      if (x < W && m[y * W + x]) last = x;
      if (x - r >= 0 && x - r < W && x - last <= 2 * r) tmp[y * W + x - r] = 1;
    }
  }
  for (let x = 0; x < W; x++) {
    let last = -1e9;
    for (let y = 0; y < H + r; y++) {
      if (y < H && tmp[y * W + x]) last = y;
      if (y - r >= 0 && y - r < H && y - last <= 2 * r) out[(y - r) * W + x] = 1;
    }
  }
  return out;
}

/** Connected components of the foreground mask (8-connected), with their box, area, mean colour and edge pixels. */
function components(p: Px, fg: Uint8Array): { comps: Comp[]; labels: Int32Array } {
  const W = p.width;
  const H = p.height;
  const seen = new Uint8Array(fg.length);
  const labels = new Int32Array(fg.length);
  const comps: Comp[] = [];
  const stack: number[] = [];
  for (let s = 0; s < fg.length; s++) {
    if (!fg[s] || seen[s]) continue;
    stack.length = 0;
    stack.push(s);
    seen[s] = 1;
    const c: Comp = { x0: W, y0: H, x1: -1, y1: -1, area: 0, rgb: [0, 0, 0], edge: 0 };
    const sum = [0, 0, 0];
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % W;
      const y = (k - x) / W;
      c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y); c.area++;
      labels[k] = comps.length + 1;
      const v = at(p, x, y);
      sum[0] += v[0]; sum[1] += v[1]; sum[2] += v[2];
      let inner = true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !fg[ny * W + nx]) { inner = false; continue; }
          const j = ny * W + nx;
          if (!seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      if (!inner) c.edge++;
    }
    c.rgb = [sum[0] / c.area, sum[1] / c.area, sum[2] / c.area];
    comps.push(c);
  }
  return { comps, labels };
}

const boxOf = (c: { x0: number; y0: number; x1: number; y1: number }, W: number, H: number): Box => ({ x: (c.x0 / W) * 100, y: (c.y0 / H) * 100, w: ((c.x1 - c.x0 + 1) / W) * 100, h: ((c.y1 - c.y0 + 1) / H) * 100 });
const inside = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }, slack = 1) => a.x0 >= b.x0 - slack && a.x1 <= b.x1 + slack && a.y0 >= b.y0 - slack && a.y1 <= b.y1 + slack;
const round1 = (n: number) => Math.round(n * 10) / 10;
const roundBox = (b: Box): Box => ({ x: round1(b.x), y: round1(b.y), w: round1(b.w), h: round1(b.h) });

export function detectRegions(p: Px): Detected {
  const W = p.width;
  const H = p.height;
  const notes: string[] = [];
  const bgRgb = borderColour(p);
  const background = backgroundOf(p, bgRgb);
  const bgAt = (x: number, y: number): RGB => {
    if (background.kind === 'gradient') {
      const t = background.direction === 'vertical' ? y / (H - 1) : x / (W - 1);
      const a = background.colours[0];
      const b = background.colours[1];
      const pa: RGB = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
      const pb: RGB = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
      return [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t];
    }
    if (background.kind === 'split') {
      const t = ((background.direction === 'vertical' ? y / H : x / W) * 100) < (background.split ?? 50);
      const c = background.colours[t ? 0 : 1];
      return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    }
    return bgRgb;
  };

  // ---- photo regions ----
  // Seeds: blocks with many distinct colours (words never have them, a photograph has them in patches). The seeds are closed so a smooth sky or a dark
  // corner between them does not split the picture, then each group is cut at the empty gaps (flat page colour all the way across) and only the parts that
  // are really photographic are kept: a list beside a photo is not.
  const pb = photoBlocks(p, background.kind === 'gradient');
  // A photograph without much colour (a grey or two-tone one) has few colours per block but still some texture in nearly every block.
  const tex = photoBlocks(p, false, 10);
  const closedSeeds = closeCells(pb.mask, pb.cols, pb.rows, 3);
  const photos: PhotoRegion[] = [];
  const photoMask = new Uint8Array(W * H);
  const flatLike = (x: number, y: number) => l1(at(p, x, y), bgAt(x, y)) < 24;
  /** Cuts [lo, hi] at runs of at least `minRun` empty lines; the pieces are trimmed of empty lines at both ends. */
  const cut = (lo: number, hi: number, empty: (i: number) => boolean, minRun: number): [number, number][] => {
    const pieces: [number, number][] = [];
    let start = -1;
    let gap = 0;
    for (let i = lo; i <= hi + 1; i++) {
      const e = i > hi ? true : empty(i);
      if (!e) {
        if (start < 0) start = i;
        gap = 0;
      } else if (start >= 0) {
        gap++;
        if (gap >= minRun || i > hi) {
          pieces.push([start, i - gap]);
          start = -1;
        }
      }
    }
    return pieces;
  };
  for (const g of groups(closedSeeds, pb.cols, pb.rows, 1)) {
    if (g.n * PHOTO_BLOCK * PHOTO_BLOCK < W * H * 0.02) continue;
    const gx0 = g.x0 * PHOTO_BLOCK;
    const gx1 = Math.min(W - 1, (g.x1 + 1) * PHOTO_BLOCK - 1);
    const gy0 = g.y0 * PHOTO_BLOCK;
    const gy1 = Math.min(H - 1, (g.y1 + 1) * PHOTO_BLOCK - 1);
    const colEmpty = (lo: number, hi: number) => (x: number) => {
      let n = 0;
      for (let y = lo; y <= hi; y += 2) if (flatLike(x, y)) n++;
      return n / Math.ceil((hi - lo + 1) / 2) > 0.85;
    };
    const rowEmpty = (lo: number, hi: number) => (y: number) => {
      let n = 0;
      for (let x = lo; x <= hi; x += 2) if (flatLike(x, y)) n++;
      return n / Math.ceil((hi - lo + 1) / 2) > 0.85;
    };
    for (const [x0, x1] of cut(gx0, gx1, colEmpty(gy0, gy1), Math.max(2, Math.round(W * 0.004))))
      for (const [y0, y1] of cut(gy0, gy1, rowEmpty(x0, x1), Math.max(2, Math.round(H * 0.004)))) {
        const box = { x0, y0, x1, y1 };
        const bw = x1 - x0 + 1;
        const bh = y1 - y0 + 1;
        if (Math.min(bw / W, bh / H) < 0.12 || bw * bh < W * H * 0.02) continue;
        // How much of the part is photographic: seeds per cell, and how much of it is plain page colour (words and gaps).
        let seeds = 0;
        let cells = 0;
        let closed = 0;
        let textured = 0;
        for (let cy = Math.floor(y0 / PHOTO_BLOCK); cy <= Math.floor(y1 / PHOTO_BLOCK) && cy < pb.rows; cy++)
          for (let cx = Math.floor(x0 / PHOTO_BLOCK); cx <= Math.floor(x1 / PHOTO_BLOCK) && cx < pb.cols; cx++) {
            cells++;
            seeds += pb.mask[cy * pb.cols + cx];
            closed += closedSeeds[cy * pb.cols + cx];
            textured += tex.mask[cy * pb.cols + cx];
          }
        if (seeds / cells < 0.3 && !(seeds / cells >= 0.12 && textured / cells >= 0.7 && bw * bh >= W * H * 0.15)) continue;
        let flat = 0;
        let nn = 0;
        for (let y = y0; y <= y1; y += 3)
          for (let x = x0; x <= x1; x += 3) {
            nn++;
            if (flatLike(x, y)) flat++;
          }
        if (flat / nn > 0.45) continue;
        const fillRatio = closed / cells;
        const cover = (bw * bh) / (W * H);
        const shape: PhotoRegion['shape'] = cover > 0.85 ? 'full-bleed' : fillRatio > 0.9 ? 'rect' : fillRatio > 0.7 && Math.abs(bw - bh) < 0.2 * bw ? 'circle' : fillRatio > 0.75 ? 'rounded' : 'rect';
        photos.push({ id: `photo${photos.length + 1}`, box: roundBox(boxOf(box, W, H)), shape });
        // Only a part that is photographic all over limits the words to white and black; a poster's picture with coloured headlines on it is still reported as a photo
        // but its pixels are read as before, so no text is lost there.
        if (seeds / cells >= 0.75) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) photoMask[y * W + x] = 1;
      }
  }
  if (photos.length === 1 && photos[0].shape === 'full-bleed') background.kind = 'photo';

  // ---- foreground: pixels unlike the background, outside photos ----
  const fg = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!photoMask[y * W + x]) {
        if (l1(at(p, x, y), bgAt(x, y)) > 70) fg[y * W + x] = 1;
      } else {
        // On a photograph the words are almost always white or black: take only those pixels (anything else is the picture).
        const v = at(p, x, y);
        if (Math.min(v[0], v[1], v[2]) >= 232 || Math.max(v[0], v[1], v[2]) <= 18) fg[y * W + x] = 1;
      }
    }
  const minH = Math.max(3, H * 0.008);

  // ---- flat shapes: what is left of the foreground after thin strokes are taken away (letters are thin, boxes and bars are not) ----
  const r = Math.max(2, Math.round(Math.min(W, H) * 0.01));
  const core = dilate(erode(fg, W, H, r), W, H, r);
  const shapes: FlatShape[] = [];
  const shapeBoxes: { x0: number; y0: number; x1: number; y1: number; rgb: RGB }[] = [];
  for (const c of components(p, core).comps) {
    const w = c.x1 - c.x0 + 1;
    const h = c.y1 - c.y0 + 1;
    if (w < W * 0.04 || h < H * 0.012 || w * h < W * H * 0.004) continue;
    const fill = c.area / (w * h);
    if (fill < 0.45) continue;
    // The colour of the shape is the commonest colour in its box that is not the page's (the mean would mix in the letters on it).
    const dom = dominantIn(p, c, bgRgb);
    // Solid in colour: the box is mostly this colour, and its edge all round is.
    let same = 0;
    let n = 0;
    for (let y = c.y0; y <= c.y1; y += 2)
      for (let x = c.x0; x <= c.x1; x += 2) {
        n++;
        if (l1(at(p, x, y), dom) < 50) same++;
      }
    let edgeSame = 0;
    let edgeN = 0;
    for (let x = c.x0 + 2; x < c.x1 - 1; x += 2)
      for (const y of [c.y0 + 2, c.y1 - 2]) {
        edgeN++;
        if (l1(at(p, x, y), dom) < 60) edgeSame++;
      }
    for (let y = c.y0 + 2; y < c.y1 - 1; y += 2)
      for (const x of [c.x0 + 2, c.x1 - 2]) {
        edgeN++;
        if (l1(at(p, x, y), dom) < 60) edgeSame++;
      }
    const straight = edgeN > 0 && edgeSame / edgeN > 0.6;
    if (same / n < 0.3 || (!straight && same / n < 0.5 && !(fill > 0.6 && same / n >= 0.35))) continue;
    const thin = Math.min(w, h) < Math.min(W, H) * 0.03;
    const circle = Math.abs(w - h) < 0.15 * Math.max(w, h) && fill > 0.65 && fill < 0.85;
    const pill = !thin && fill > 0.78 && fill < 0.94 && w > h * 1.6;
    const kind: FlatShape['kind'] = thin ? 'bar' : circle ? 'circle' : pill ? 'pill' : fill > 0.93 || straight ? 'rect' : 'rounded';
    shapes.push({ id: `shape${shapes.length + 1}`, box: roundBox(boxOf(c, W, H)), colour: hex(dom), kind });
    shapeBoxes.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, rgb: dom });
  }

  // ---- soft shapes: a box only a little unlike the page (a pale highlight, a tinted label) is below the foreground threshold above ----
  const soft = new Uint8Array(W * H);
  for (let i = 0; i < soft.length; i++) {
    if (photoMask[i]) continue;
    const d = l1(at(p, i % W, Math.floor(i / W)), bgAt(i % W, Math.floor(i / W)));
    if (d > 28 && d <= 70) soft[i] = 1;
  }
  const softCore = dilate(erode(soft, W, H, r), W, H, r);
  for (const c of components(p, softCore).comps) {
    const w = c.x1 - c.x0 + 1;
    const h = c.y1 - c.y0 + 1;
    if (w < W * 0.04 || h < H * 0.012 || w * h < W * H * 0.004 || w > W * 0.97 || c.area / (w * h) < 0.55) continue;
    // Not one already found, and not a patch of the page's own shading: the box is one colour all round.
    if (shapeBoxes.some((o) => Math.min(o.x1, c.x1) - Math.max(o.x0, c.x0) > 0.5 * Math.min(w, o.x1 - o.x0 + 1) && Math.min(o.y1, c.y1) - Math.max(o.y0, c.y0) > 0.5 * Math.min(h, o.y1 - o.y0 + 1))) continue;
    const dom = dominantIn(p, c, bgRgb);
    let edgeSame = 0;
    let edgeN = 0;
    for (let x = c.x0 + 2; x < c.x1 - 1; x += 2)
      for (const y of [c.y0 + 2, c.y1 - 2]) {
        edgeN++;
        if (l1(at(p, x, y), dom) < 24) edgeSame++;
      }
    for (let y = c.y0 + 2; y < c.y1 - 1; y += 2)
      for (const x of [c.x0 + 2, c.x1 - 2]) {
        edgeN++;
        if (l1(at(p, x, y), dom) < 24) edgeSame++;
      }
    if (edgeN === 0 || edgeSame / edgeN < 0.8) continue;
    const thin = Math.min(w, h) < Math.min(W, H) * 0.03;
    shapes.push({ id: `shape${shapes.length + 1}`, box: roundBox(boxOf(c, W, H)), colour: hex(dom), kind: thin ? 'bar' : 'rect' });
    shapeBoxes.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, rgb: dom });
  }

  // ---- text pixels: the foreground minus the shapes' own colour, plus whatever on a shape is unlike the shape (letters the colour of the page too) ----
  const fgText = new Uint8Array(W * H);
  for (let i = 0; i < fg.length; i++) if (fg[i]) fgText[i] = 1;
  for (const s of shapeBoxes) {
    for (let y = Math.max(0, s.y0 - 2); y <= Math.min(H - 1, s.y1 + 2); y++)
      for (let x = Math.max(0, s.x0 - 2); x <= Math.min(W - 1, s.x1 + 2); x++) {
        const i = y * W + x;
        if (photoMask[i]) continue;
        const inBox = x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1;
        const d = l1(at(p, x, y), s.rgb);
        if (d < 60) fgText[i] = 0;
        else if (inBox && d > 80) fgText[i] = 1;
        else if (!inBox && fg[i] && d < 120) fgText[i] = 0;
      }
  }
  const rest = components(p, fgText).comps.filter((c) => c.area >= 3);

  // ---- letters and graphics ----
  const letters: Comp[] = [];
  const graphics: Graphic[] = [];
  const heights = rest.map((c) => c.y1 - c.y0 + 1).filter((h) => h >= minH);
  const typical = median(heights) || minH;
  const lonely = (c: Comp) => !rest.some((o) => o !== c && Math.min(c.y1, o.y1) - Math.max(c.y0, o.y0) > 0.5 * Math.min(c.y1 - c.y0, o.y1 - o.y0) && Math.max(c.x0, o.x0) - Math.min(c.x1, o.x1) < 1.0 * Math.max(c.y1 - c.y0 + 1, typical));
  for (const c of rest) {
    const w = c.x1 - c.x0 + 1;
    const h = c.y1 - c.y0 + 1;
    const big = w * h > W * H * 0.006;
    const holeBox = rest.filter((o) => o !== c && inside(o, c, 0));
    const ring = w > 6 && h > 6 && c.area / (w * h) < 0.4 && holeBox.length > 0 && c.edge / c.area > 0.6;
    if (ring) graphics.push({ id: `graphic${graphics.length + 1}`, box: roundBox(boxOf(c, W, H)), colour: hex(c.rgb), kind: 'ring' });
    else if (big && lonely(c)) graphics.push({ id: `graphic${graphics.length + 1}`, box: roundBox(boxOf(c, W, H)), colour: hex(c.rgb), kind: 'mark' });
    else if (h >= minH * 0.6 || w >= minH) letters.push(c);
  }

  // ---- lines then blocks ----
  interface Line { comps: Comp[]; x0: number; y0: number; x1: number; y1: number }
  letters.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  // Rows first (the pieces whose centres are at the same height), then a row is split where there is a wide gap (columns).
  const rowsOf: Comp[][] = [];
  for (const c of letters) {
    const h = c.y1 - c.y0 + 1;
    const cy = (c.y0 + c.y1) / 2;
    const row = rowsOf.find((r) => {
      const rh = median(r.map((k) => k.y1 - k.y0 + 1));
      const rcy = mean(r.map((k) => (k.y0 + k.y1) / 2));
      return Math.abs(cy - rcy) < 0.5 * Math.max(h, rh) && Math.max(h, rh) / Math.max(1, Math.min(h, rh)) < 3.5;
    });
    if (row) row.push(c);
    else rowsOf.push([c]);
  }
  const lines: Line[] = [];
  for (const r of rowsOf) {
    r.sort((a, b) => a.x0 - b.x0);
    const rh = median(r.map((k) => k.y1 - k.y0 + 1));
    let cur: Comp[] = [r[0]];
    const flush = () => {
      lines.push({ comps: cur, x0: Math.min(...cur.map((c) => c.x0)), x1: Math.max(...cur.map((c) => c.x1)), y0: Math.min(...cur.map((c) => c.y0)), y1: Math.max(...cur.map((c) => c.y1)) });
    };
    for (const c of r.slice(1)) {
      const prevX1 = Math.max(...cur.map((k) => k.x1));
      if (c.x0 - prevX1 > 2.5 * Math.max(rh, minH)) {
        flush();
        cur = [c];
      } else cur.push(c);
    }
    flush();
  }
  // A "line" of one tiny piece is a speck, not text.
  const realLines = lines.filter((l) => l.comps.length >= 2 || (l.y1 - l.y0 + 1 >= minH * 1.6 && l.x1 - l.x0 + 1 >= minH * 1.6));
  realLines.sort((a, b) => a.y0 - b.y0);
  const blocksOf: Line[][] = [];
  for (const l of realLines) {
    const lh = l.y1 - l.y0 + 1;
    const blk = blocksOf.find((b) => {
      const last = b[b.length - 1];
      const gap = l.y0 - last.y1;
      const bh = last.y1 - last.y0 + 1;
      const overlapX = Math.min(l.x1, last.x1) - Math.max(l.x0, last.x0);
      const near = Math.abs(l.x0 - last.x0) < W * 0.12 || Math.abs((l.x0 + l.x1) / 2 - (last.x0 + last.x1) / 2) < W * 0.12 || Math.abs(l.x1 - last.x1) < W * 0.12;
      const ratio = Math.max(lh, bh) / Math.max(1, Math.min(lh, bh));
      return gap >= -bh * 0.3 && gap < 0.7 * Math.min(lh, bh) && ratio < 2.5 && (overlapX > 0 || near);
    });
    if (blk) blk.push(l);
    else blocksOf.push([l]);
  }

  const texts: TextBlock[] = blocksOf.map((ls, bi) => {
    const x0 = Math.min(...ls.map((l) => l.x0));
    const x1 = Math.max(...ls.map((l) => l.x1));
    const y0 = Math.min(...ls.map((l) => l.y0));
    const y1 = Math.max(...ls.map((l) => l.y1));
    const lh = ls.map((l) => l.y1 - l.y0 + 1);
    const lineH = median(lh);
    const allComps = ls.flatMap((l) => l.comps);
    // Caps: most letters reach the full height of their line.
    const full = allComps.filter((c) => (c.y1 - c.y0 + 1) >= 0.85 * (ls.find((l) => l.comps.includes(c))!.y1 - ls.find((l) => l.comps.includes(c))!.y0 + 1)).length;
    const caps = full / allComps.length > 0.8;
    const fontPx = Math.round(((lineH / H) * 1350) / (caps ? 0.72 : 0.95));
    // Alignment from the edges of the lines.
    let align: TextBlock['align'] = 'left';
    if (ls.length >= 2) {
      const L = std(ls.map((l) => l.x0));
      const R = std(ls.map((l) => l.x1));
      const C = std(ls.map((l) => (l.x0 + l.x1) / 2));
      align = C < L && C < R && C < W * 0.02 ? 'centre' : R < L && R < W * 0.02 ? 'right' : 'left';
    } else {
      const cx = (x0 + x1) / 2 / W;
      align = Math.abs(cx - 0.5) < 0.06 ? 'centre' : x0 / W > 0.5 && x1 / W > 0.9 ? 'right' : 'left';
    }
    // Colour: the area-weighted mean of the pieces.
    const tot = allComps.reduce((a, c) => a + c.area, 0);
    const colour: RGB = [0, 1, 2].map((k) => allComps.reduce((a, c) => a + c.rgb[k] * c.area, 0) / tot) as RGB;
    // Stroke thickness against the letter height: area over half the edge length.
    const sw = median(allComps.map((c) => (c.edge > 0 ? (2 * c.area) / c.edge : 0)));
    const ratio = sw / Math.max(1, lineH);
    const weight = ratio < 0.07 ? 300 : ratio < 0.115 ? 400 : ratio < 0.18 ? 700 : 900;

    const treatments: Treatment[] = [];
    const box: Box = roundBox(boxOf({ x0, y0, x1, y1 }, W, H));
    if (ls.length >= 2 && Math.max(...lh) / Math.max(1, Math.min(...lh)) >= 1.5) treatments.push({ kind: 'size-hierarchy', detail: `lines from ${Math.round(Math.min(...lh) / H * 100)}% to ${Math.round(Math.max(...lh) / H * 100)}% of the height`, supported: true });
    if (caps) treatments.push({ kind: 'caps', detail: 'the letters all reach the full line height (probably capitals)', supported: true });
    // Letter spacing: the gap between neighbouring pieces against their width, in the longest line.
    const long = [...ls].sort((a, b) => b.comps.length - a.comps.length)[0];
    if (long.comps.length >= 4) {
      const sorted = [...long.comps].sort((a, b) => a.x0 - b.x0);
      const gaps = sorted.slice(1).map((c, i) => c.x0 - sorted[i].x1).filter((g) => g >= 0);
      const widths = sorted.map((c) => c.x1 - c.x0 + 1);
      const g = median(gaps) / Math.max(1, median(widths));
      if (g > 0.5) treatments.push({ kind: 'wide-spacing', detail: 'wide letter spacing', supported: false });
      else if (g < 0.04 && median(gaps) <= 1) treatments.push({ kind: 'tight-spacing', detail: 'tight letter spacing', supported: false });
    }
    // A shape behind the block: a highlight box when it hugs the words, otherwise text on a pill, label or block.
    const sh = shapes.find((s) => {
      const sb = { x0: (s.box.x / 100) * W, y0: (s.box.y / 100) * H, x1: ((s.box.x + s.box.w) / 100) * W, y1: ((s.box.y + s.box.h) / 100) * H };
      return !s.holds && s.kind !== 'bar' && ls.some((l) => inside(l, sb, 3) || (Math.min(l.y1, sb.y1) - Math.max(l.y0, sb.y0) > 0.7 * (sb.y1 - sb.y0) && sb.x0 >= l.x0 - 3 && sb.x1 <= l.x1 + 3 && sb.y1 - sb.y0 < 1.8 * (l.y1 - l.y0 + 1)));
    });
    if (sh) {
      sh.holds = `text${bi + 1}`;
      const sb = { x0: (sh.box.x / 100) * W, y0: (sh.box.y / 100) * H, x1: ((sh.box.x + sh.box.w) / 100) * W, y1: ((sh.box.y + sh.box.h) / 100) * H };
      const held = ls.filter((l) => inside(l, sb, 3) || (Math.min(l.y1, sb.y1) - Math.max(l.y0, sb.y0) > 0.7 * (sb.y1 - sb.y0) && sb.x0 >= l.x0 - 3 && sb.x1 <= l.x1 + 3));
      const hug = ((sh.box.h / 100) * H) / Math.max(1, Math.max(...held.map((l) => l.y1 - l.y0 + 1))) < 1.6 && held.length === 1;
      treatments.push({ kind: hug ? 'highlight-box' : 'on-shape', detail: `${hug ? 'a box behind the words' : `text on a ${sh.kind}`} (${sh.colour})`, colour: sh.colour, supported: true });
    }
    // An underline: a thin wide bar just under a line.
    const under = shapes.find((s) => s.kind === 'bar' && s.box.w > box.w * 0.4 && s.box.w < box.w * 1.3 && s.box.y > box.y + box.h - 1 && s.box.y < box.y + box.h + box.h * 0.35 && s.box.x > box.x - 5 && s.box.x < box.x + box.w * 0.5);
    if (under) treatments.push({ kind: 'underline', detail: `a line under the text (${under.colour})`, colour: under.colour, supported: true });
    // A ring drawn round the block or a word of it.
    const circled = graphics.find((g) => g.kind === 'ring' && g.box.x <= box.x + box.w && g.box.x + g.box.w >= box.x && g.box.y <= box.y + box.h && g.box.y + g.box.h >= box.y);
    if (circled) treatments.push({ kind: 'circled', detail: `a ring round a word (${circled.colour})`, colour: circled.colour, supported: true });
    // Tilt: the slope of the centres of a line's letters.
    const tilts = ls.filter((l) => l.comps.length >= 4).map((l) => {
      const xs = l.comps.map((c) => (c.x0 + c.x1) / 2);
      const ys = l.comps.map((c) => (c.y0 + c.y1) / 2);
      const mx = mean(xs);
      const my = mean(ys);
      const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
      const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
      return sxx > 0 ? (Math.atan(sxy / sxx) * 180) / Math.PI : 0;
    });
    if (tilts.length && Math.abs(median(tilts)) >= 2.5) treatments.push({ kind: 'tilt', detail: `tilted about ${round1(median(tilts))} degrees`, angle: round1(median(tilts)), supported: true });
    // Staggered lines: the left edges step along.
    if (ls.length >= 3 && align === 'left') {
      const steps = ls.slice(1).map((l, i) => l.x0 - ls[i].x0);
      if (steps.every((s) => Math.abs(s) > W * 0.03) && std(ls.map((l) => l.x0)) > W * 0.05) treatments.push({ kind: 'staggered', detail: 'each line starts further along', supported: false });
    }
    // Two tones: the pieces fall into two colours that are far apart.
    const cols = allComps.filter((c) => !shapes.some((sh) => c.x0 >= (sh.box.x / 100) * W - 2 && c.x1 <= ((sh.box.x + sh.box.w) / 100) * W + 2 && c.y0 >= (sh.box.y / 100) * H - 2 && c.y1 <= ((sh.box.y + sh.box.h) / 100) * H + 2)).map((c) => c.rgb);
    const far = cols.filter((c) => l1(c, colour) > 120);
    if (far.length >= 2 && far.length < cols.length * 0.7) treatments.push({ kind: 'two-tone', detail: 'some words in another colour', supported: false });
    // Over a photo.
    if (photos.some((ph) => ph.box.x < box.x + box.w && ph.box.x + ph.box.w > box.x && ph.box.y < box.y + box.h && ph.box.y + ph.box.h > box.y)) treatments.push({ kind: 'over-photo', detail: 'the words sit on a photo', supported: true });

    return { id: `text${bi + 1}`, box, lines: ls.map((l) => ({ box: roundBox(boxOf(l, W, H)) })), lineHeightPct: round1((lineH / H) * 100), fontPx, align, colour: hex(colour), weight, caps, treatments };
  });

  // Outline and shadow: the ring just outside the letters. One colour all round is an outline; a colour on one side only is a shadow.
  for (const t of texts) {
    const ls = blocksOf[Number(t.id.slice(4)) - 1];
    const sample = ls.flatMap((l) => l.comps).filter((c) => c.area >= 12).slice(0, 10);
    let outline = 0;
    let shadow = 0;
    let ringColour: RGB | null = null;
    for (const c of sample) {
      const down = { n: 0, hit: 0 };
      const up = { n: 0, hit: 0 };
      for (let y = c.y0 - 3; y <= c.y1 + 3; y++)
        for (let x = c.x0 - 3; x <= c.x1 + 3; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H || fg[y * W + x]) continue;
          // Only pixels within 3 px of the component's own box edge, outside its pixels.
          const near = x < c.x0 || x > c.x1 || y < c.y0 || y > c.y1;
          if (!near) continue;
          const v = at(p, x, y);
          const b = bgAt(x, y);
          const unlikeBg = l1(v, b) > 40;
          const unlikeText = l1(v, [parseInt(t.colour.slice(1, 3), 16), parseInt(t.colour.slice(3, 5), 16), parseInt(t.colour.slice(5, 7), 16)]) > 40;
          const side = (x - (c.x0 + c.x1) / 2) + (y - (c.y0 + c.y1) / 2) > 0 ? down : up;
          side.n++;
          if (unlikeBg && unlikeText) {
            side.hit++;
            ringColour = v;
          }
        }
      const d = down.n ? down.hit / down.n : 0;
      const u = up.n ? up.hit / up.n : 0;
      if (d > 0.25 && u > 0.25) outline++;
      else if (d > 0.3 && u < 0.08) shadow++;
    }
    if (sample.length >= 3 && ringColour) {
      if (outline / sample.length > 0.6) t.treatments.push({ kind: 'outline', detail: `an outline round the letters (${hex(ringColour)})`, colour: hex(ringColour), supported: true });
      else if (shadow / sample.length > 0.6) t.treatments.push({ kind: 'shadow', detail: `a shadow down and to the right (${hex(ringColour)})`, colour: hex(ringColour), supported: true });
    }
  }

  if (texts.length === 0) notes.push('No text was found: the picture may be a photo with little text, or text too small for the size it was read at.');
  return { size: { width: W, height: H }, background, photos, texts, shapes, graphics, notes };
}
