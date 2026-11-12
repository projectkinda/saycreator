// Round 16: pictures keep clear of the slide's chrome, and a photo drawn whole sits on a blurred copy of itself.
import type { PlanImage } from './types';

interface Chrome {
  x: number;
  y: number;
  size: number;
  anchor?: string;
  text?: string;
  shape?: string;
}
export interface Box { x: number; y: number; w: number; h: number }
/** The boxes the chrome items take (profile avatar and name, handle, page counter, footer), with 6 px of air. Text is measured the way the builder estimates it (0.58 em per character). */
export function chromeBoxes(rec: Chrome[]): Box[] {
  const air = 6;
  return rec.map((c) => {
    if (c.shape) return { x: c.x - c.size - air, y: c.y - c.size - air, w: 2 * c.size + 2 * air, h: 2 * c.size + 2 * air };
    const w = (c.text ?? '').length * c.size * 0.58;
    const x0 = c.anchor === 'end' ? c.x - w : c.anchor === 'middle' ? c.x - w / 2 : c.x;
    return { x: x0 - air, y: c.y - c.size * 0.82 - air, w: w + 2 * air, h: c.size * 1.25 + 2 * air };
  });
}
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * A picture that reaches under an item of the chrome gives up that edge: its top moves below a header item, its bottom moves above a footer item (the area shrinks, the picture is not cut by
 * the chrome moving over it). A picture that would lose more than 40% of its height this way is left as it is (the chrome then stays on top). Round pictures (avatars) are left alone.
 */
export function avoidChrome(images: PlanImage[], rec: Chrome[]): PlanImage[] {
  const boxes = chromeBoxes(rec);
  if (!boxes.length) return images;
  return images.map((p) => {
    if (p.circle) return p;
    let top = p.y, bottom = p.y + p.h;
    for (const b of boxes) {
      if (!overlap({ x: p.x, y: top, w: p.w, h: bottom - top }, b)) continue;
      if (b.y + b.h / 2 < 675) top = Math.max(top, Math.ceil(b.y + b.h));
      else bottom = Math.min(bottom, Math.floor(b.y));
    }
    if (top === p.y && bottom === p.y + p.h) return p;
    if (bottom - top < p.h * 0.6) return p;
    return { ...p, y: top, h: bottom - top };
  });
}

/**
 * The backdrop of a photo drawn whole: the same photo, covering the slot, blurred and darkened, clipped to the slot (rounded as the slot is). No flat bars. `crop` is the cover rectangle of the
 * photo in the slot (null: the browser crops it). The copy is drawn 12% larger so the blur has no soft edge inside the slot.
 */
export function blurredBackdrop(id: string, p: PlanImage, src: string, crop: Box | null): string {
  const r = (n: number) => Math.round(n * 10) / 10;
  const grow = 0.06;
  const c = crop ?? { x: p.x, y: p.y, w: p.w, h: p.h };
  const x = c.x - c.w * grow, y = c.y - c.h * grow, w = c.w * (1 + 2 * grow), h = c.h * (1 + 2 * grow);
  const href = src.replace(/&/g, '&amp;');
  return `<defs><clipPath id="${id}s"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rx}"/></clipPath><filter id="${id}b" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="30"/></filter></defs>`
    + `<g clip-path="url(#${id}s)"><image href="${href}" x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" preserveAspectRatio="none" filter="url(#${id}b)"/><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="#000000" fill-opacity="0.42"/></g>`;
}
