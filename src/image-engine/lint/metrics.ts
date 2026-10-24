// Measurements on pixel data. Pure: they only need {data, width, height}, so they run anywhere.
import { luminance } from './color';

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Average brightness as the eye-weighted gamma value, 0 (black) to 1 (white). */
export function meanLuma(img: Pixels): number {
  let sum = 0;
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) sum += 0.2126 * img.data[i * 4] + 0.7152 * img.data[i * 4 + 1] + 0.0722 * img.data[i * 4 + 2];
  return sum / n / 255;
}

function gray(img: Pixels): Float32Array {
  const g = new Float32Array(img.width * img.height);
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2];
  return g;
}

/**
 * Variance of the Laplacian of the grayscale image. Low means few sharp edges (blurry or flat).
 * Flat-colour artwork also scores low, so this is a hint, not a verdict.
 */
export function laplacianVariance(img: Pixels): number {
  const { width: w, height: h } = img;
  if (w < 3 || h < 3) return 0;
  const g = gray(img);
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = g[i - w] + g[i + w] + g[i - 1] + g[i + 1] - 4 * g[i];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export interface PxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Relative luminance of every pixel inside the rectangles (clipped to the image). */
export function luminancesIn(img: Pixels, rects: PxRect[]): number[] {
  const out: number[] = [];
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x));
    const y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(img.width, Math.ceil(r.x + r.width));
    const y1 = Math.min(img.height, Math.ceil(r.y + r.height));
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * img.width + x) * 4;
        out.push(luminance(img.data[i], img.data[i + 1], img.data[i + 2]));
      }
  }
  return out;
}

export const median = (v: number[]) => {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
