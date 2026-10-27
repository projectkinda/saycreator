// Where a transparent object goes when the person has not placed it by hand: in the free space of the slide, off the words.
// Pure (no DOM). The words are already placed by the layout (on a photo slide the layout has already chosen the calm part of the photo
// for them), so what is left over is the free space. A full photo's crop point is kept clear when there is a choice.
import { layerBox, textInk, type Box } from '../carousel/lint';
import type { Layer } from '../types';
import type { ObjectChoice, ObjectInput } from './objects';

/** The box one object takes at a scale, turned: its width and height. */
export function objectSize(W: number, input: ObjectInput, scale: number, rotation: number): { w: number; h: number; bw: number; bh: number } {
  const box = Math.round(W * 0.5 * Math.min(2.5, Math.max(0.15, scale)));
  const ratio = input.width / Math.max(1, input.height);
  const w = ratio >= 1 ? box : Math.round(box * ratio);
  const h = ratio >= 1 ? Math.round(box / ratio) : box;
  const a = (rotation * Math.PI) / 180;
  return { w, h, bw: Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)), bh: Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a)) };
}

/** The areas of the slide the object must stay off: every text (as it is really laid out) and every card or plate that holds something. */
export function boxesToAvoid(layers: Layer[], W: number, H: number): Box[] {
  const out: Box[] = [];
  for (const l of layers) {
    if (l.visible === false) continue;
    if (l.kind === 'text') {
      if (l.role === 'decor') continue;
      try {
        out.push(textInk(l).box);
      } catch {
        out.push(layerBox(l));
      }
    } else if (l.role === 'container') {
      const b = layerBox(l);
      if (b.width < W * 0.9 || b.height < H * 0.9) out.push(b);
    }
  }
  return out;
}

const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

export interface Placed {
  x: number;
  y: number;
  scale: number;
  /** False when no free space was found, so the object sits where it covers least. */
  free: boolean;
  /** True when the object had to be made smaller than asked to fit. */
  shrunk: boolean;
}

/**
 * The middle of the object (as shares of the slide) and its size. The asked size is tried first, then smaller ones down to 40% of it.
 * Among the places that touch no text, the one nearest the usual spot (lower middle) wins, and a place that does not cover the
 * photo's crop point (`keepClear`, a point in px) is preferred.
 */
export function placeObject(W: number, H: number, o: Pick<ObjectChoice, 'scale' | 'rotation'>, input: ObjectInput, avoid: Box[], area: Box, keepClear?: { x: number; y: number }): Placed {
  const PAD = 24;
  const padded = avoid.map((b) => ({ x: b.x - PAD, y: b.y - PAD, width: b.width + 2 * PAD, height: b.height + 2 * PAD }));
  const prefer = { x: W * 0.5, y: H * 0.62 };
  const STEP = 36;
  let fallback: { x: number; y: number; scale: number; covered: number } | null = null;
  const factors = [1, 0.85, 0.72, 0.6, 0.5, 0.4];
  for (let f = 0; f < factors.length; f++) {
    const scale = Math.max(0.15, o.scale * factors[f]);
    const { bw, bh } = objectSize(W, input, scale, o.rotation);
    if (bw > area.width || bh > area.height) continue;
    let best: { x: number; y: number; key: number } | null = null;
    for (let cx = area.x + bw / 2; cx <= area.x + area.width - bw / 2 + 0.5; cx += STEP)
      for (let cy = area.y + bh / 2; cy <= area.y + area.height - bh / 2 + 0.5; cy += STEP) {
        const box = { x: cx - bw / 2, y: cy - bh / 2, width: bw, height: bh };
        const covered = padded.reduce((n, b) => n + overlapArea(box, b), 0);
        if (covered > 0) {
          if (!fallback || covered < fallback.covered) fallback = { x: cx, y: cy, scale, covered };
          continue;
        }
        const onSubject = keepClear && keepClear.x >= box.x && keepClear.x <= box.x + box.width && keepClear.y >= box.y && keepClear.y <= box.y + box.height ? 1 : 0;
        const key = onSubject * 1e7 + Math.hypot(cx - prefer.x, cy - prefer.y);
        if (!best || key < best.key) best = { x: cx, y: cy, key };
      }
    if (best) return { x: best.x / W, y: best.y / H, scale, free: true, shrunk: f > 0 };
  }
  if (fallback) return { x: fallback.x / W, y: fallback.y / H, scale: fallback.scale, free: false, shrunk: fallback.scale < o.scale };
  return { x: prefer.x / W, y: prefer.y / H, scale: o.scale, free: false, shrunk: false };
}
