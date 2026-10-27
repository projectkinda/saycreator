// A transparent picture of an object (a product, a sticker) placed on a slide by the person: how big, how turned, where, and
// which of the engine's effects it gets. Pure (no DOM). The picture itself is only an address.
import type { ImageLayer } from '../types';

/** A transparent picture the person added. `src` is an address the browser can load. */
export interface ObjectInput {
  id: string;
  src: string;
  width: number;
  height: number;
}

export const OBJECT_FX = ['none', 'contact', 'drop', 'glow'] as const;
export type ObjectFxChoice = (typeof OBJECT_FX)[number];

/** What the person chose for one object on one slide. */
export interface ObjectChoice {
  id: string;
  /** 1 is half the slide's width; from 0.15 to 2.5. */
  scale: number;
  /** Degrees, -180 to 180. */
  rotation: number;
  /** Where the middle of the object is, as a share of the slide (0 to 1). */
  x: number;
  y: number;
  fx: ObjectFxChoice;
}

export const DEFAULT_OBJECT = { scale: 1, rotation: 0, x: 0.5, y: 0.62, fx: 'contact' } as const;

export function objectLayer(W: number, H: number, o: ObjectChoice, input: ObjectInput, glow: string): ImageLayer {
  const box = Math.round(W * 0.5 * Math.min(2.5, Math.max(0.15, o.scale)));
  const ratio = input.width / Math.max(1, input.height);
  const w = ratio >= 1 ? box : Math.round(box * ratio);
  const h = ratio >= 1 ? Math.round(box / ratio) : box;
  const cx = Math.min(1, Math.max(0, o.x)) * W;
  const cy = Math.min(1, Math.max(0, o.y)) * H;
  return {
    id: 'object',
    kind: 'image',
    name: 'Object',
    role: 'decor',
    x: Math.round(cx - w / 2),
    y: Math.round(cy - h / 2),
    width: w,
    height: h,
    rotation: Math.min(180, Math.max(-180, o.rotation)),
    opacity: 1,
    src: input.src,
    fit: 'contain',
    ...(o.fx === 'contact' ? { object: { shadow: 'contact' as const } } : o.fx === 'drop' ? { object: { shadow: 'drop' as const } } : o.fx === 'glow' ? { object: { glow: { color: glow, blur: Math.round(box * 0.18), amount: 0.8 } } } : {}),
  };
}
