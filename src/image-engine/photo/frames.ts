// Frames and arrangements for photos, built from ordinary layers (shapes, paths, images), so every part stays editable.
// Each function returns the layers, back to front. Pure: no DOM.
import { measureWidth } from '../draw/text';
import type { FontFamily, ImageLayer, Layer, Mask, PathLayer, ShapeLayer, Treatment } from '../types';

/** A photo as the layouts hand it around: where it is, how to crop it, how to treat it. */
export interface PhotoRef {
  src: string;
  focal?: { x: number; y: number };
  treatments?: Treatment[];
  /** A stand-in (not the person's own picture). */
  synthetic?: boolean;
  /** Natural size, if known. */
  width?: number;
  height?: number;
}

const base = { rotation: 0, opacity: 1 } as const;

export function photoLayer(id: string, x: number, y: number, w: number, h: number, p: PhotoRef, o: { mask?: Mask; rotation?: number; name?: string; shadow?: ImageLayer['shadow']; role?: ImageLayer['role'] } = {}): ImageLayer {
  return {
    id,
    kind: 'image',
    name: o.name ?? (p.synthetic ? 'Photo (synthetic placeholder)' : 'Photo'),
    role: o.role ?? 'decor',
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(w),
    height: Math.round(h),
    rotation: o.rotation ?? 0,
    opacity: 1,
    src: p.src,
    fit: 'cover',
    ...(p.focal ? { focal: p.focal } : {}),
    ...(p.treatments && p.treatments.length ? { treatments: p.treatments } : {}),
    ...(p.synthetic ? { synthetic: true } : {}),
    ...(o.mask ? { mask: o.mask } : {}),
    ...(o.shadow ? { shadow: o.shadow } : {}),
  };
}

const rect = (id: string, x: number, y: number, w: number, h: number, fill: string, o: { radius?: number; stroke?: ShapeLayer['stroke']; shadow?: ShapeLayer['shadow']; role?: ShapeLayer['role']; rotation?: number } = {}): ShapeLayer => ({
  id,
  kind: 'shape',
  shape: 'rect',
  role: o.role ?? 'decor',
  x: Math.round(x),
  y: Math.round(y),
  width: Math.round(w),
  height: Math.round(h),
  rotation: o.rotation ?? 0,
  opacity: 1,
  fill,
  ...(o.radius ? { radius: o.radius } : {}),
  ...(o.stroke ? { stroke: o.stroke } : {}),
  ...(o.shadow ? { shadow: o.shadow } : {}),
});
const ellipse = (id: string, x: number, y: number, w: number, h: number, fill: string, o: { shadow?: ShapeLayer['shadow'] } = {}): ShapeLayer => ({ id, kind: 'shape', shape: 'ellipse', role: 'decor', x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h), ...base, fill, ...(o.shadow ? { shadow: o.shadow } : {}) });
const SOFT = { color: 'rgba(0,0,0,0.38)', blur: 30, offsetX: 0, offsetY: 18 };

/** A phone: a dark body, a thin screen edge, a speaker pill, the photo as the screen. Width is the phone's; height follows. */
export function phoneFrame(id: string, x: number, y: number, w: number, p: PhotoRef, o: { body?: string; rotation?: number } = {}): { layers: Layer[]; height: number } {
  const h = Math.round(w * 2.05);
  const bez = Math.round(w * 0.045);
  const body = o.body ?? '#111111';
  const layers: Layer[] = [
    rect(`${id}-body`, x, y, w, h, body, { radius: Math.round(w * 0.14), shadow: SOFT, rotation: o.rotation }),
    photoLayer(`${id}-screen`, x + bez, y + bez, w - 2 * bez, h - 2 * bez, p, { mask: { shape: 'roundRect', radius: Math.round(w * 0.11) }, rotation: o.rotation, name: 'Phone screen' }),
    rect(`${id}-notch`, x + w * 0.36, y + bez * 1.7, w * 0.28, Math.max(10, w * 0.045), body, { radius: 99, rotation: o.rotation }),
  ];
  return { layers, height: h };
}

/** A laptop: a lid with the photo as the screen, and a flat base under it. */
export function laptopFrame(id: string, x: number, y: number, w: number, p: PhotoRef, o: { body?: string; base?: string } = {}): { layers: Layer[]; height: number } {
  const lidH = Math.round(w * 0.62);
  const bez = Math.round(w * 0.028);
  const baseH = Math.round(w * 0.045);
  const body = o.body ?? '#161616';
  const baseColour = o.base ?? '#c9c9cc';
  const layers: Layer[] = [
    rect(`${id}-lid`, x + w * 0.06, y, w * 0.88, lidH, body, { radius: Math.round(w * 0.025), shadow: SOFT }),
    photoLayer(`${id}-screen`, x + w * 0.06 + bez, y + bez, w * 0.88 - 2 * bez, lidH - 2 * bez, p, { name: 'Laptop screen' }),
    rect(`${id}-base`, x, y + lidH, w, baseH, baseColour, { radius: Math.round(baseH * 0.5) }),
    rect(`${id}-lip`, x + w * 0.42, y + lidH, w * 0.16, Math.max(4, baseH * 0.45), '#9b9ba0', { radius: 99 }),
  ];
  return { layers, height: lidH + baseH };
}

/** A polaroid: a white card, the photo inside with a thick margin below, a slight tilt, a soft shadow. Returns the layers and the card box. */
export function polaroid(id: string, x: number, y: number, w: number, p: PhotoRef, o: { rotation?: number; card?: string; side?: number } = {}): { layers: Layer[]; height: number; photoBottom: number } {
  const side = o.side ?? Math.round(w * 0.06);
  const photoW = w - 2 * side;
  const photoH = Math.round(photoW * 1.0);
  const h = side + photoH + Math.round(w * 0.2);
  const rot = o.rotation ?? 0;
  // The photo is placed inside the card, then both are turned together about the card's centre.
  const cx = x + w / 2;
  const cy = y + h / 2;
  const turn = (px: number, py: number, pw: number, ph: number) => {
    const a = (rot * Math.PI) / 180;
    const dx = px + pw / 2 - cx;
    const dy = py + ph / 2 - cy;
    return { x: cx + dx * Math.cos(a) - dy * Math.sin(a) - pw / 2, y: cy + dx * Math.sin(a) + dy * Math.cos(a) - ph / 2 };
  };
  const ph = turn(x + side, y + side, photoW, photoH);
  return {
    layers: [
      rect(`${id}-card`, x, y, w, h, o.card ?? '#fbfaf5', { radius: 6, shadow: SOFT, rotation: rot }),
      photoLayer(`${id}-photo`, ph.x, ph.y, photoW, photoH, p, { rotation: rot, name: 'Polaroid photo' }),
    ],
    height: h,
    photoBottom: y + side + photoH,
  };
}

/** A ticket: a rounded card with a half-circle bite out of each side, and a dashed tear line at `tearAt` (0 to 1 of the width). */
export function ticket(id: string, x: number, y: number, w: number, h: number, o: { fill: string; background: string; line: string; tearAt?: number; rotation?: number }): Layer[] {
  const r = Math.round(h * 0.11);
  const tear = x + w * (o.tearAt ?? 0.72);
  const dash: PathLayer = {
    id: `${id}-tear`,
    kind: 'path',
    role: 'decor',
    x: Math.round(tear),
    y: Math.round(y + r * 1.4),
    width: 2,
    height: Math.round(h - r * 2.8),
    ...base,
    d: `M 1 0 L 1 ${Math.round(h - r * 2.8)}`,
    stroke: { color: o.line, width: 3, cap: 'butt' },
  };
  return [
    rect(`${id}-body`, x, y, w, h, o.fill, { radius: Math.round(h * 0.07), shadow: { color: 'rgba(0,0,0,0.3)', blur: 22, offsetX: 0, offsetY: 12 }, rotation: o.rotation }),
    ellipse(`${id}-bite-l`, x - r, y + h / 2 - r, r * 2, r * 2, o.background),
    ellipse(`${id}-bite-r`, x + w - r, y + h / 2 - r, r * 2, r * 2, o.background),
    dash,
  ];
}

/** Three photos side by side with a small gap (or any count from 2 to 4). */
export function strip(id: string, x: number, y: number, w: number, h: number, gap: number, photos: PhotoRef[], o: { mask?: Mask } = {}): Layer[] {
  const n = photos.length;
  const cw = (w - gap * (n - 1)) / n;
  return photos.map((p, i) => photoLayer(`${id}-${i + 1}`, x + i * (cw + gap), y, cw, h, p, { mask: o.mask, name: `Strip photo ${i + 1}` }));
}

/** A photo with a flat colour block behind it, shifted by (dx, dy), like a printed offset. */
export function blockOffset(id: string, x: number, y: number, w: number, h: number, p: PhotoRef, o: { block: string; dx: number; dy: number; mask?: Mask }): Layer[] {
  return [rect(`${id}-block`, x + o.dx, y + o.dy, w, h, o.block, { radius: o.mask?.shape === 'roundRect' ? o.mask.radius : 0 }), photoLayer(`${id}-photo`, x, y, w, h, p, { mask: o.mask })];
}

/** Small white cards, each tilted a little, each with a short line of words on it (like notes stuck on a photo). Words are at least 32 px. */
export function chipCards(id: string, x: number, y: number, items: { text: string; rotation: number; width?: number }[], o: { card: string; ink: string; font: FontFamily; weight: number; size?: number; gap?: number; width?: number }): { layers: Layer[]; height: number } {
  const size = Math.max(32, o.size ?? 36);
  const pad = Math.round(size * 0.6);
  const gap = o.gap ?? 20;
  const layers: Layer[] = [];
  let cy = y;
  items.forEach((it, i) => {
    const w = it.width ?? o.width ?? Math.round(measureWidth(it.text, o.font, o.weight, size) + pad * 2 + 6);
    const h = Math.round(size * 1.2 + pad * 1.2);
    layers.push(rect(`${id}-${i + 1}`, x + (i % 2) * 36, cy, w, h, o.card, { radius: 14, shadow: { color: 'rgba(0,0,0,0.3)', blur: 18, offsetX: 0, offsetY: 8 }, rotation: it.rotation, role: 'container' }));
    layers.push({
      id: `${id}-${i + 1}-text`,
      kind: 'text',
      role: 'content',
      x: Math.round(x + (i % 2) * 36 + pad),
      y: Math.round(cy + (h - size * 1.3) / 2),
      width: w - pad * 2,
      height: Math.ceil(size * 1.3),
      rotation: it.rotation,
      opacity: 1,
      text: it.text,
      style: { font: o.font, weight: o.weight, size, color: o.ink, lineHeight: 1.2, align: 'left' },
    } as Layer);
    cy += h + gap;
  });
  return { layers, height: cy - y - gap };
}
