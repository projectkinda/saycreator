// The crop budget (Round 13): a picture that a cover-crop would cut by more than 10% of its width or height is drawn WHOLE (contain) on a panel in its own average edge colour, so no edge content is
// lost (a screenshot's left column, a logo in a corner). A picture the person zoomed (z above 1) keeps the crop they chose.
import { resolvePictureRef } from '../../reference/faithful';
import type { PicRef } from './images';

export const CROP_BUDGET = 0.1;
type Slot = { x: number; y: number; w: number; h: number };
/** The share of the picture's width and height that a cover-crop at zoom 1 removes (0 when the picture has the slot's shape). Null for a picture with no known size. */
export function coverLoss(slot: Slot, ref: PicRef | null): { w: number; h: number } | null {
  if (!ref || !ref.w || !ref.h) return null;
  const s = Math.max(slot.w / ref.w, slot.h / ref.h);
  return { w: Math.max(0, 1 - slot.w / (ref.w * s)), h: Math.max(0, 1 - slot.h / (ref.h * s)) };
}
/** Whether the budget says "draw the whole picture". */
export const needsContain = (slot: Slot, ref: PicRef | null): boolean => {
  if (!ref || ref.z > 1) return false;
  const l = coverLoss(slot, ref);
  return !!l && Math.max(l.w, l.h) > CROP_BUDGET + 1e-6;
};
/** The picture drawn whole inside the slot, centred. `rx` is the slot's corner radius: the picture keeps inside it by 30% of the radius on every side, so a rounded corner never cuts one of its corners. */
export function containRect(slot0: Slot, ref: PicRef, rx = 0): Slot {
  const ins = Math.round(rx * 0.3);
  const slot = { x: slot0.x + ins, y: slot0.y + ins, w: slot0.w - 2 * ins, h: slot0.h - 2 * ins };
  const s = Math.min(slot.w / ref.w!, slot.h / ref.h!);
  const w = ref.w! * s, h = ref.h! * s;
  return { x: slot.x + (slot.w - w) / 2, y: slot.y + (slot.h - h) / 2, w, h };
}
const cache = new Map<string, string | null>();
/** The average colour of the outer ring of a project picture (about 2% of its size), as #rrggbb; null when the picture cannot be read. */
export async function edgeColour(src: string): Promise<string | null> {
  const key = src.split('#')[0];
  if (cache.has(key)) return cache.get(key)!;
  let out: string | null = null;
  try {
    const data = await resolvePictureRef(src);
    if (data) {
      // an <img> reads every picture type the project holds (an SVG test picture too, which createImageBitmap refuses)
      const bm = new Image();
      bm.src = data;
      await bm.decode();
      const bw = bm.naturalWidth || 1, bh = bm.naturalHeight || 1;
      const k = Math.min(1, 240 / Math.max(bw, bh));
      const w = Math.max(4, Math.round(bw * k)), h = Math.max(4, Math.round(bh * k));
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(bm, 0, 0, w, h);
      const ring = Math.max(1, Math.round(Math.min(w, h) * 0.02));
      const px = g.getImageData(0, 0, w, h).data;
      let r = 0, gg = 0, b = 0, n = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
        const i = (y * w + x) * 4;
        if (px[i + 3] < 8) continue;
        r += px[i]; gg += px[i + 1]; b += px[i + 2]; n++;
      }
      if (n) out = '#' + [r, gg, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('');
    }
  } catch {
    out = null;
  }
  cache.set(key, out);
  return out;
}
