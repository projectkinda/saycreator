// How close a replica is to a reference, in three numbers taken from the pixels: palette distance, how much the text zones overlap, and
// the ratio of the title sizes. The total is a plain weighted mean, not a judgement of taste. Pure.
import type { Frac, Measured } from './types';

type RGB = [number, number, number];
const hexRgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** CIE Lab, so that "distance" follows what the eye sees better than raw RGB. */
function lab([r, g, b]: RGB): RGB {
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const dE = (a: string, b: string) => {
  const x = lab(hexRgb(a));
  const y = lab(hexRgb(b));
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** 1 when every colour of the reference has a near twin in the replica, falling to 0 around a distance of 60 (a clearly different colour). */
export function paletteScore(ref: Measured, rep: Measured): { score: number; meanDistance: number } {
  const colours = ref.palette.slice(0, 5);
  const total = colours.reduce((s, c) => s + c.share, 0) || 1;
  let sum = 0;
  for (const c of colours) {
    const nearest = Math.min(...rep.palette.map((r) => dE(c.hex, r.hex)), 100);
    sum += (c.share / total) * nearest;
  }
  return { score: Math.max(0, 1 - sum / 60), meanDistance: Math.round(sum * 10) / 10 };
}

const GX = 24;
const GY = 30;
function raster(zones: Frac[]): Uint8Array {
  const g = new Uint8Array(GX * GY);
  for (const z of zones) {
    const x0 = Math.max(0, Math.floor(z.x * GX));
    const x1 = Math.min(GX, Math.ceil((z.x + z.width) * GX));
    const y0 = Math.max(0, Math.floor(z.y * GY));
    const y1 = Math.min(GY, Math.ceil((z.y + z.height) * GY));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y * GX + x] = 1;
  }
  return g;
}
/** Intersection over union of the two pictures' text zones (1 = the words sit in the same places). */
export function zoneScore(ref: Measured, rep: Measured): number {
  const a = raster(ref.textZones);
  const b = raster(rep.textZones);
  let i = 0;
  let u = 0;
  for (let k = 0; k < a.length; k++) {
    if (a[k] && b[k]) i++;
    if (a[k] || b[k]) u++;
  }
  return u === 0 ? 1 : i / u;
}
/** The smaller title over the bigger (1 = the same size). */
export function titleScore(ref: Measured, rep: Measured): number {
  if (ref.titleHeight === null && rep.titleHeight === null) return 1;
  if (ref.titleHeight === null || rep.titleHeight === null) return 0;
  return Math.min(ref.titleHeight, rep.titleHeight) / Math.max(ref.titleHeight, rep.titleHeight);
}

export interface Similarity {
  palette: number;
  paletteDistance: number;
  zones: number;
  title: number;
  /** The weighted mean of the three, 0 to 1. */
  total: number;
}
export function similarity(ref: Measured, rep: Measured): Similarity {
  const p = paletteScore(ref, rep);
  const z = zoneScore(ref, rep);
  const t = titleScore(ref, rep);
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { palette: r(p.score), paletteDistance: p.meanDistance, zones: r(z), title: r(t), total: r(0.4 * p.score + 0.35 * z + 0.25 * t) };
}

/** The mean over several reference and replica pairs. */
export function meanSimilarity(list: Similarity[]): Similarity {
  const n = Math.max(1, list.length);
  const avg = (f: (s: Similarity) => number) => Math.round((list.reduce((a, s) => a + f(s), 0) / n) * 1000) / 1000;
  return { palette: avg((s) => s.palette), paletteDistance: Math.round((list.reduce((a, s) => a + s.paletteDistance, 0) / n) * 10) / 10, zones: avg((s) => s.zones), title: avg((s) => s.title), total: avg((s) => s.total) };
}
