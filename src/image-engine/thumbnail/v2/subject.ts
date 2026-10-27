// The "subject" of a thumbnail: the point the person pointed at on their photo (or, if they did not, a guess from where the picture
// has the most detail and colour). It is a pointer, not detection: nothing here finds a face or understands a picture.
import type { Pixels } from '../../lint/metrics';

export interface Pt {
  x: number;
  y: number;
}
export interface SubjectPoint extends Pt {
  /** True when this is the guess, not the person's own pointer. */
  guessed?: boolean;
}

/** Where the most detail and colour is, as a share of the picture. A guess: it pulls gently towards the middle. */
export function guessSubject(img: Pixels): SubjectPoint {
  const { width: w, height: h, data } = img;
  const gray = new Float32Array(w * h);
  const sat = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    sat[i] = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  }
  let sum = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const edge = (Math.abs(gray[i + 1] - gray[i - 1]) + Math.abs(gray[i + w] - gray[i - w])) * (0.5 + sat[i]);
      // Gentle pull to the middle: most subjects sit near it.
      const d = Math.hypot(x / w - 0.5, y / h - 0.5);
      const e = edge * (1 - 0.5 * Math.min(1, d * 1.6));
      sum += e;
      sx += e * (x / w);
      sy += e * (y / h);
    }
  if (sum <= 0) return { x: 0.5, y: 0.5, guessed: true };
  return { x: Math.min(0.9, Math.max(0.1, sx / sum)), y: Math.min(0.9, Math.max(0.1, sy / sum)), guessed: true };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Crops a photo into a box so that the subject lands as near `target` (a share of the box) as the photo allows.
 * Returns the crop point for the image layer and where the subject really ends up, in the box's own pixels offset by its position.
 */
export function fitSubject(box: Box, src: { width: number; height: number }, subject: Pt, target: Pt): { focal: Pt; at: Pt } {
  const boxRatio = box.width / box.height;
  const srcRatio = src.width / src.height;
  let sw = src.width;
  let sh = src.height;
  if (srcRatio > boxRatio) sw = src.height * boxRatio;
  else sh = src.width / boxRatio;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const sx = clamp(subject.x * src.width - target.x * sw, 0, src.width - sw);
  const sy = clamp(subject.y * src.height - target.y * sh, 0, src.height - sh);
  const focal = { x: (sx + sw / 2) / src.width, y: (sy + sh / 2) / src.height };
  const rel = { x: (subject.x * src.width - sx) / sw, y: (subject.y * src.height - sy) / sh };
  return { focal, at: { x: box.x + rel.x * box.width, y: box.y + rel.y * box.height } };
}

/** The subject's keep-clear circle. Radius is a share of the shorter side. */
export const SUBJECT_RADIUS = 0.17;
export const subjectRadius = (W: number, H: number) => Math.round(Math.min(W, H) * SUBJECT_RADIUS);

/** A circle and a rectangle touch. */
export function circleTouchesBox(c: Pt & { r: number }, b: Box): boolean {
  const nx = Math.min(Math.max(c.x, b.x), b.x + b.width);
  const ny = Math.min(Math.max(c.y, b.y), b.y + b.height);
  return Math.hypot(c.x - nx, c.y - ny) < c.r;
}

/**
 * Like fitSubject, but for a photo that fills the whole canvas: the photo may be drawn a little bigger than the canvas (up to
 * `maxZoom`) and slid, so the subject can land where the layout wants it even when the photo has no spare room on that side.
 * Returns the box of the photo layer (it may reach past the canvas), the crop point and where the subject ends up.
 */
export function fitSubjectZoom(canvas: Box, src: { width: number; height: number }, subject: Pt, target: Pt, maxZoom = 1.5): { box: Box; focal: Pt; at: Pt; zoom: number } {
  const want = { x: canvas.x + target.x * canvas.width, y: canvas.y + target.y * canvas.height };
  let best: { box: Box; focal: Pt; at: Pt; zoom: number; d: number } | null = null;
  for (const zoom of [1, 1.12, 1.25, 1.4, 1.5].filter((z) => z <= maxZoom)) {
    const size = { width: Math.round(canvas.width * zoom), height: Math.round(canvas.height * zoom) };
    // The crop slides first (free: no zoom needed); whatever is still missing is made up by sliding the bigger photo.
    const fit = fitSubject({ x: 0, y: 0, ...size }, src, subject, target);
    const rel = { x: fit.at.x / size.width, y: fit.at.y / size.height };
    // Slide the (bigger) photo so the subject is at the wanted spot, while the photo still covers the canvas.
    const bx = Math.min(canvas.x, Math.max(canvas.x + canvas.width - size.width, want.x - rel.x * size.width));
    const by = Math.min(canvas.y, Math.max(canvas.y + canvas.height - size.height, want.y - rel.y * size.height));
    const at = { x: bx + rel.x * size.width, y: by + rel.y * size.height };
    const d = Math.hypot((at.x - want.x) / canvas.width, (at.y - want.y) / canvas.height);
    if (!best || d < best.d - 1e-6) best = { box: { x: bx, y: by, ...size }, focal: fit.focal, at, zoom, d };
    if (d < 0.03) break;
  }
  return best!;
}
