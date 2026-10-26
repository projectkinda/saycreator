// Where to put words on a photo, from a coarse grid of how bright and how busy each part of it is. No face finding, no
// model: just numbers. Pure (no DOM), so the choice is repeatable and can be tested without a browser.

/** A grid over the photo as it is cropped to the slide (cover fit). Row 0 is the top. */
export interface PhotoStats {
  cols: number;
  rows: number;
  /** Brightness of each cell, 0 (black) to 1 (white), as the eye sees it (gamma-encoded luma). */
  lum: number[];
  /** How busy each cell is, 0 (flat) to 1 (very detailed): the average edge strength. */
  detail: number[];
}

/** A photo as the composer is given it. The pixels are never in the plan, only the address and these numbers. */
export interface PhotoInput {
  id: string;
  src: string;
  width: number;
  height: number;
  focal?: { x: number; y: number };
  /** Without it, text is placed as if the photo were mid-bright and busy (so it always gets an overlay). */
  stats?: PhotoStats;
  /** A stand-in picture made in code, not the person's own. Labelled wherever it is shown. */
  synthetic?: boolean;
  /** A short name for people ("balcony"), shown on the slide card. */
  label?: string;
}

export interface BandStats {
  /** Mean brightness of the band, 0 to 1. */
  mean: number;
  /** Brightness that 90% of the band is under. */
  p90: number;
  /** Brightness that 98% of the band is under: the bright spots, which are what white text fails on (the phone check wants 95% of the pixels behind a word to pass). */
  p98: number;
  /** Mean detail, 0 to 1. */
  detail: number;
}

const FLAT: PhotoStats = { cols: 1, rows: 1, lum: [0.55], detail: [0.6] };

/** Numbers for a band of the slide: from y0 to y1 and x0 to x1, each as a share (0 to 1) of the slide. */
export function bandOf(stats: PhotoStats | undefined, y0: number, y1: number, x0 = 0, x1 = 1): BandStats {
  const s = stats ?? FLAT;
  const r0 = Math.max(0, Math.min(s.rows - 1, Math.floor(y0 * s.rows)));
  const r1 = Math.max(r0, Math.min(s.rows - 1, Math.ceil(y1 * s.rows) - 1));
  const c0 = Math.max(0, Math.min(s.cols - 1, Math.floor(x0 * s.cols)));
  const c1 = Math.max(c0, Math.min(s.cols - 1, Math.ceil(x1 * s.cols) - 1));
  const lums: number[] = [];
  let detail = 0;
  let n = 0;
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      lums.push(s.lum[r * s.cols + c]);
      detail += s.detail[r * s.cols + c];
      n++;
    }
  lums.sort((a, b) => a - b);
  const at = (q: number) => lums[Math.min(lums.length - 1, Math.floor(lums.length * q))];
  return { mean: lums.reduce((a, b) => a + b, 0) / n, p90: at(0.9), p98: lums[lums.length - 1] > at(0.98) ? Math.max(at(0.98), lums[lums.length - 1] - 0.04) : at(0.98), detail: detail / n };
}

export type Where = 'top' | 'bottom' | 'middle';

/** The calmest place for a block of text that is `height` (a share of the slide tall). A small bias keeps ties where the style likes them. */
export function pickBand(stats: PhotoStats | undefined, height: number, options: Where[] = ['bottom', 'top']): { where: Where; y0: number; y1: number; band: BandStats } {
  const at = (w: Where) => {
    const y0 = w === 'top' ? 0 : w === 'bottom' ? 1 - height : (1 - height) / 2;
    return { where: w, y0, y1: y0 + height, band: bandOf(stats, y0, y0 + height) };
  };
  const scored = options.map((w, i) => ({ ...at(w), score: at(w).band.detail + i * 0.04 }));
  scored.sort((a, b) => a.score - b.score);
  return scored[0];
}

/** Luminance as contrast is figured it (0 to 1, linear light) from a gamma-encoded grey level 0 to 1. */
export const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * How strong a flat overlay of `overlay` (a grey level 0 to 1: 0 is black) must be so text of `text` brightness (0 to 1 grey level)
 * reaches `target`:1 over a part of the photo of brightness `lum`. null when no overlay can do it.
 */
export function overlayAlpha(lum: number, text: number, overlay = 0, target = 6.5): number | null {
  const at = (a: number) => ratio(linear(text), linear(lum * (1 - a) + overlay * a));
  if (at(0) >= target) return 0;
  if (at(1) < target) return null;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) >= target) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi * 100) / 100;
}

/** What to do about the text over a photo band: nothing, a soft overlay at this strength, or a solid plate because the overlay would flatten the photo. */
export function textBackdrop(band: BandStats, text: number, overlay = 0): { kind: 'none' | 'overlay' | 'plate'; alpha: number } {
  // Busy places need a little more help than their brightness alone says: single bright pixels sit under letters.
  const lum = Math.min(1, band.p98 + band.detail * 0.1);
  const a = overlayAlpha(lum, text, overlay);
  if (a === null || a > 0.82) return { kind: 'plate', alpha: 1 };
  if (a === 0) return { kind: 'none', alpha: 0 };
  return { kind: 'overlay', alpha: Math.min(0.85, a + 0.04) };
}
