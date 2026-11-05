// What Recreate sends to the reader: one slide. A picture whose proportions are a slide's (4:5, 1:1, 9:16, 16:9) is ONE slide unless gutters cut it into pieces that are
// themselves slides; a picture that is not slide-shaped may be a sheet of slides (gutters, or evenly spaced seams). A nearly flat piece is never sent.
import { detectGrid, gutterGrid, type GridResult } from './grid';
import type { Px, Rect } from './types';

const SLIDE_FRAMES = [0.8, 1, 0.5625, 1.7778];
export const isSlideShaped = (w: number, h: number, tol = 0.08) => SLIDE_FRAMES.some((f) => Math.abs(w / h - f) / f < tol);

/** The spread (standard deviation of brightness, 0 to 128) of a piece, from a sample of its pixels. Under about 6 it is a flat colour. */
export function lumaSpread(p: Px, r: Rect = { x: 0, y: 0, width: p.width, height: p.height }): number {
  const step = Math.max(1, Math.floor(Math.min(r.width, r.height) / 40));
  let n = 0;
  let s = 0;
  let s2 = 0;
  for (let y = r.y; y < r.y + r.height; y += step)
    for (let x = r.x; x < r.x + r.width; x += step) {
      const k = (y * p.width + x) * 4;
      const l = 0.299 * p.data[k] + 0.587 * p.data[k + 1] + 0.114 * p.data[k + 2];
      n++;
      s += l;
      s2 += l * l;
    }
  return n ? Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)) : 0;
}

/** A piece without its outer 10% (picture edges and borders are not content). */
const inner = (c: Rect): Rect => ({ x: Math.round(c.x + c.width * 0.1), y: Math.round(c.y + c.height * 0.1), width: Math.round(c.width * 0.8), height: Math.round(c.height * 0.8) });

export interface SlideChoice {
  /** The piece to send, in the picture's own pixels (null: the whole picture). */
  rect: Rect | null;
  /** Whether the picture was read as a sheet of slides. */
  split: boolean;
  /** Whether a sheet could be found at all (so the toggle means something). */
  canSplit: boolean;
  why: string;
}

/** `pxAt(size)` gives the picture downsized to `size` px on its long side, with the factor back to its own pixels. Tried at 1400, 900 and 600 px. */
export function chooseSlide(pxAt: (size: number) => { p: Px; k: number }, mode: 'auto' | 'whole' | 'split'): SlideChoice {
  const { shaped, found, sheet } = findSheet(pxAt);
  if (mode === 'whole' || !found || (mode === 'auto' && !sheet)) {
    return { rect: null, split: false, canSplit: !!found, why: shaped ? 'The picture has a slide’s proportions: read as one slide.' : found ? 'Read as one slide.' : 'One slide.' };
  }
  const { g, p, k } = found;
  const c = g.cells[0];
  if (lumaSpread(p, c) < 6) return { rect: null, split: false, canSplit: true, why: 'The first piece is nearly flat, so the whole picture is sent.' };
  return { rect: { x: Math.round(c.x * k), y: Math.round(c.y * k), width: Math.round(c.width * k), height: Math.round(c.height * k) }, split: true, canSplit: true, why: `A sheet of ${g.cells.length} slides (${g.method}): the first slide is sent.` };
}

/** THE guard for "is this picture a sheet of slides?", used by the picture intake (ReferenceStylePage.addFiles) and by chooseSlide. A slide-shaped picture is ONE slide
 * unless gutters cut it into four or more slide-shaped pieces that hold content; a picture of another shape is a sheet when any grid is found. */
export function findSheet(pxAt: (size: number) => { p: Px; k: number }): { shaped: boolean; found: { g: GridResult; p: Px; k: number } | null; sheet: boolean } {
  const p0 = pxAt(600).p;
  const shaped = isSlideShaped(p0.width, p0.height);
  let found: { g: GridResult; p: Px; k: number } | null = null;
  for (const size of [1400, 900, 600]) {
    const { p, k } = pxAt(size);
    // Slide-shaped pictures count as a sheet only by their gutters; the seams inside a single slide's own artwork can look like a grid.
    const g = shaped ? gutterGrid(p) : detectGrid(p);
    if (g) {
      found = { g, p, k };
      break;
    }
  }
  // A slide-shaped picture is one slide unless it breaks into four or more pieces that are themselves slides and each hold content (a slide's own plain areas and
  // evenly spaced lines inside it must not be read as a grid).
  const sheet = !!found && (!shaped || (found.g.cells.length >= 4 && found.g.cells.every((c) => isSlideShaped(c.width, c.height, 0.16)) && found.g.cells.filter((c) => lumaSpread(found!.p, inner(c)) >= 8).length >= found.g.cells.length * 0.8));
  return { shaped, found, sheet };
}
