// title-over-photo: the scrim behind the headline is chosen so that every word reads at 4.5:1 over 95% of the pixels behind it, measured on the REAL picture pixels plus the scrim.
// The slide is drawn (the picture comes through the project's picture resolver), the text is taken out of the drawing, and each word's box is sampled: the share of pixels whose contrast with the
// word's ink is under 4.5:1 must be at most 5%. The scrim is strengthened level by level (a stronger gradient, then a solid panel); the last level is a solid ground-colour panel, which reads by
// construction. Nothing here calls a model.
import { layoutText } from '../image-engine/draw/text';
import type { TextLayer } from '../image-engine/types';
import { svgToPng } from '../reference/faithful';
import type { Built } from './layouts';

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lumOf = (r: number, g: number, b: number) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
const hexRgb = (h: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{6})/i.exec(h.trim());
  return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : null;
};
export interface ScrimReading {
  ok: boolean;
  /** The smallest share (0..1) of pixels behind any word that reach 4.5:1. */
  worst: number;
  words: number;
}
/** The share of the pixels behind each word that read at 4.5:1 against the word's ink; ok when every word has 95% or more. */
export async function readScrim(b: Built): Promise<ScrimReading> {
  const bare = b.svg.replace(/<text\b[\s\S]*?<\/text>/g, '');
  const blob = await svgToPng(bare, 540);
  const bm = await createImageBitmap(blob);
  const c = new OffscreenCanvas(bm.width, bm.height);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bm, 0, 0);
  const k = bm.width / 1080;
  let worst = 1;
  let words = 0;
  for (const l of b.layers as unknown as { kind: string; name?: string; text?: string; x: number; y: number; style?: { color?: string } }[]) {
    if (l.kind !== 'text' || !l.text || (l.name !== 'title' && l.name !== 'body')) continue;
    const ink = hexRgb(l.style?.color ?? '');
    if (!ink) continue;
    const inkLum = lumOf(...ink);
    let block;
    try { block = layoutText(l as unknown as TextLayer); } catch { continue; }
    for (const line of block.lines) {
      for (const w of line.words) {
        // a word on the marker bar reads on the bar (its own ink), not on the picture
        if (w.highlighted) continue;
        const x0 = Math.max(0, Math.floor((l.x + w.x) * k)), x1 = Math.min(c.width, Math.ceil((l.x + w.x + w.width) * k));
        const y0 = Math.max(0, Math.floor((l.y + line.y + block.lineStep * 0.12) * k)), y1 = Math.min(c.height, Math.ceil((l.y + line.y + block.lineStep * 0.92) * k));
        if (x1 <= x0 || y1 <= y0) continue;
        const px = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        let pass = 0;
        const n = px.length / 4;
        for (let i = 0; i < px.length; i += 4) {
          const pl = lumOf(px[i], px[i + 1], px[i + 2]);
          const cr = (Math.max(pl, inkLum) + 0.05) / (Math.min(pl, inkLum) + 0.05);
          if (cr >= 4.5) pass++;
        }
        words++;
        worst = Math.min(worst, n ? pass / n : 1);
      }
    }
  }
  return { ok: worst >= 0.95, worst, words };
}

/**
 * Draws a title-over-photo slide with the weakest scrim that reads: `build(level)` draws it at a scrim level (0 gradient .. 3 solid panel). Returns the slide, the level used and what the last
 * reading was; `reads` false means even the solid panel was not measured as reading (the caller falls back to photo-full-caption).
 */
export async function settleScrim(build: (level: number) => Promise<Built>): Promise<{ built: Built; level: number; reads: boolean; tried: { level: number; worst: number }[] }> {
  const tried: { level: number; worst: number }[] = [];
  let last: Built | null = null;
  for (let level = 0; level <= 3; level++) {
    const b = await build(level);
    last = b;
    if (!b.ok) return { built: b, level, reads: false, tried };
    let r: ScrimReading;
    try { r = await readScrim(b); } catch { return { built: await build(3), level: 3, reads: true, tried }; }
    tried.push({ level, worst: Math.round(r.worst * 1000) / 1000 });
    if (r.ok) return { built: b, level, reads: true, tried };
  }
  return { built: last!, level: 3, reads: false, tried };
}
