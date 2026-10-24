// Optional mask clean-ups and subject measurements. Pure functions on {data, width, height}, no DOM.
import type { Alpha, MaskOptions, SubjectStats } from './types';

/** Box blur along one axis using running sums. */
function boxBlurAxis(src: Float32Array, w: number, h: number, r: number, horizontal: boolean): Float32Array {
  const out = new Float32Array(src.length);
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const stride = horizontal ? 1 : w;
  const lineStride = horizontal ? w : 1;
  const win = 2 * r + 1;
  for (let l = 0; l < lines; l++) {
    const base = l * lineStride;
    let sum = 0;
    // Edges repeat the nearest pixel, so a solid subject touching the border stays solid.
    for (let k = -r; k <= r; k++) sum += src[base + Math.min(len - 1, Math.max(0, k)) * stride];
    for (let i = 0; i < len; i++) {
      out[base + i * stride] = sum / win;
      sum += src[base + Math.min(len - 1, i + r + 1) * stride] - src[base + Math.max(0, i - r) * stride];
    }
  }
  return out;
}

/**
 * EDGE FEATHERING. Softens the edge by blurring the mask about `radius` pixels (two passes of a box blur,
 * which approximates a Gaussian). Solid inside and fully empty outside stay as they are; only the border gets
 * a gentle ramp. Side effect: very thin parts (single hair strands) get fainter.
 */
export function featherAlpha(a: Alpha, radius: number): Alpha {
  const r = Math.round(radius);
  if (r < 1) return a;
  let f: Float32Array = Float32Array.from(a.data);
  for (let pass = 0; pass < 2; pass++) {
    f = boxBlurAxis(f, a.width, a.height, Math.max(1, Math.round(r / 2)), true);
    f = boxBlurAxis(f, a.width, a.height, Math.max(1, Math.round(r / 2)), false);
  }
  return { width: a.width, height: a.height, data: Uint8ClampedArray.from(f, (v) => Math.round(v)) };
}

/**
 * SMALL HOLE FILLING. Finds background areas completely enclosed by the subject and, if one is no bigger than
 * `maxShare` of the whole picture's area, makes it solid. Use it for pinholes inside a body or a bag. Do NOT use it
 * for scenes where see-through gaps are real (a handle, a gap between arm and torso, glass).
 */
export function fillSmallHoles(a: Alpha, maxShare: number, threshold = 128): Alpha {
  const { width: w, height: h, data } = a;
  const maxArea = Math.max(1, Math.floor(w * h * maxShare));
  if (maxShare <= 0) return a;
  const label = new Int32Array(w * h); // 0 = unvisited, -1 = subject, >0 = background component id
  for (let i = 0; i < w * h; i++) if (data[i] >= threshold) label[i] = -1;
  const out = Uint8ClampedArray.from(data);
  const stack = new Int32Array(w * h);
  let id = 0;
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== 0) continue;
    id++;
    let sp = 0;
    let area = 0;
    let touchesBorder = false;
    const members: number[] = [];
    stack[sp++] = start;
    label[start] = id;
    while (sp > 0) {
      const p = stack[--sp];
      area++;
      members.push(p);
      const x = p % w;
      const y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;
      if (x > 0 && label[p - 1] === 0) { label[p - 1] = id; stack[sp++] = p - 1; }
      if (x < w - 1 && label[p + 1] === 0) { label[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && label[p - w] === 0) { label[p - w] = id; stack[sp++] = p - w; }
      if (y < h - 1 && label[p + w] === 0) { label[p + w] = id; stack[sp++] = p + w; }
    }
    if (!touchesBorder && area <= maxArea) for (const p of members) out[p] = 255;
  }
  return { width: w, height: h, data: out };
}

export interface Rgba {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * EDGE DECONTAMINATION. On a cutout, hair and edges carry colour from the OLD background (a white or green fringe).
 * For every semi-transparent pixel this replaces the colour with colour from the nearest solid subject pixels,
 * found by growing the solid area outwards `radius` pixels. Transparency is not changed. Side effect: fine colour
 * detail inside the edge band is lost, which is what you want for a fringe but not for a really translucent object.
 */
export function decontaminateEdges(img: Rgba, alpha: Alpha, radius: number, solidThreshold = 235): Rgba {
  const { width: w, height: h } = img;
  const n = w * h;
  const rgb = new Float32Array(n * 3);
  const known = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (alpha.data[i] >= solidThreshold) {
      known[i] = 1;
      rgb[i * 3] = img.data[i * 4];
      rgb[i * 3 + 1] = img.data[i * 4 + 1];
      rgb[i * 3 + 2] = img.data[i * 4 + 2];
    }
  }
  const rounds = Math.max(0, Math.round(radius));
  for (let round = 0; round < rounds; round++) {
    const newly: number[] = [];
    const vals: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (known[p]) continue;
        let r = 0, g = 0, b = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const q = yy * w + xx;
            if (known[q]) { r += rgb[q * 3]; g += rgb[q * 3 + 1]; b += rgb[q * 3 + 2]; c++; }
          }
        }
        if (c) { newly.push(p); vals.push(r / c, g / c, b / c); }
      }
    newly.forEach((p, i) => {
      known[p] = 1;
      rgb[p * 3] = vals[i * 3];
      rgb[p * 3 + 1] = vals[i * 3 + 1];
      rgb[p * 3 + 2] = vals[i * 3 + 2];
    });
    if (newly.length === 0) break;
  }
  const out = new Uint8ClampedArray(img.data);
  for (let i = 0; i < n; i++) {
    const a = alpha.data[i];
    if (a > 0 && a < solidThreshold && known[i]) {
      out[i * 4] = rgb[i * 3];
      out[i * 4 + 1] = rgb[i * 3 + 1];
      out[i * 4 + 2] = rgb[i * 3 + 2];
    }
  }
  return { data: out, width: w, height: h };
}

/** Applies the chosen clean-ups in a sensible order: holes, then feather; returns the new alpha and recoloured picture. */
export function applyMaskOptions(img: Rgba, alpha: Alpha, o: MaskOptions): { image: Rgba; alpha: Alpha } {
  let a = alpha;
  if (o.fillHolesMaxShare) a = fillSmallHoles(a, o.fillHolesMaxShare);
  if (o.featherPx) a = featherAlpha(a, o.featherPx);
  const image = o.decontaminatePx ? decontaminateEdges(img, a, o.decontaminatePx) : img;
  return { image, alpha: a };
}

/** Where the subject is, from the mask alone. Pixels at or above `threshold` count as subject. */
export function subjectStats(a: Alpha, threshold = 128): SubjectStats {
  const { width: w, height: h, data } = a;
  const cols = new Float64Array(w);
  const rows = new Float64Array(h);
  let count = 0;
  let mass = 0;
  let cx = 0;
  let cy = 0;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x];
      if (v < threshold) continue;
      count++;
      const wgt = v / 255;
      mass += wgt;
      cx += x * wgt;
      cy += y * wgt;
      cols[x]++;
      rows[y]++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  if (count === 0) return { areaFraction: 0, bbox: null, bboxRobust: null, centroid: null, centroidNorm: null, bboxNorm: null };
  const trim = (hist: Float64Array) => {
    const cut = count * 0.01;
    let s = 0, lo = 0;
    for (let i = 0; i < hist.length; i++) { s += hist[i]; if (s > cut) { lo = i; break; } }
    s = 0;
    let hi = hist.length - 1;
    for (let i = hist.length - 1; i >= 0; i--) { s += hist[i]; if (s > cut) { hi = i; break; } }
    return [lo, hi] as const;
  };
  const [rx0, rx1] = trim(cols);
  const [ry0, ry1] = trim(rows);
  const box = (a0: number, b0: number, a1: number, b1: number) => ({ x: a0, y: b0, width: a1 - a0 + 1, height: b1 - b0 + 1 });
  const bbox = box(x0, y0, x1, y1);
  return {
    areaFraction: count / (w * h),
    bbox,
    bboxRobust: box(rx0, ry0, rx1, ry1),
    centroid: { x: cx / mass, y: cy / mass },
    centroidNorm: { x: cx / mass / w, y: cy / mass / h },
    bboxNorm: { x: bbox.x / w, y: bbox.y / h, width: bbox.width / w, height: bbox.height / h },
  };
}
