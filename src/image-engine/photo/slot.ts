// What a layout needs to use photos: take the slide's photo (or a clean placeholder), treat it as the style asks, and keep words
// readable over it. Pure (no DOM): the photo's numbers come in with the photo (see zones.ts).
import { buildText, circleD, ellipse, pathLayer, rect, solidOf } from '../carousel/toolbox';
import type { Palette } from '../carousel/types';
import type { FieldLayer, GlassLayer, Layer, Mask, ShapeLayer } from '../types';
import { add, type LCtx } from '../styles/kit';
import { parseColor } from '../lint/color';
import { photoLayer, type PhotoRef } from './frames';
import { resolveColor, resolveTreatments } from './resolve';
import { bandOf, pickBand, textBackdrop, type PhotoInput, type Where } from './zones';

/** One place in a slide where a photo goes: the picture to use, or none yet. */
export interface Slot {
  /** The photo as the frames take it (address, crop point, treatments in this slide's colours). Null when there is none. */
  ref: PhotoRef | null;
  input: PhotoInput | null;
  hint?: string;
}

/** The slide's photos, `n` of them (a strip takes 3). The first is the one the slide named, if it named one. */
export function takePhotos(c: LCtx, n = 1, treatment?: string): Slot[] {
  // The last three photos of the pool are kept for strips, so a strip never repeats the photo of the slide next to it.
  const strips = n > 1 && c.photoPool.length >= 4;
  const pool = strips ? c.photoPool.slice(-3) : c.photoPool.length >= 5 ? c.photoPool.slice(0, c.photoPool.length - 3) : c.photoPool;
  const name = treatment ?? (typeof c.params.treatment === 'string' ? c.params.treatment : undefined);
  const list = name && c.style.photo ? c.style.photo.treatments[name] : undefined;
  // The person's own choice for this slide (a treatment list, a crop point) wins over the style's.
  const own = c.photoOverride;
  const chosen = own?.treatments ?? list;
  const treatments = chosen ? resolveTreatments(chosen, c.pal as unknown as Record<string, unknown>) : [];
  const out: Slot[] = [];
  for (let k = 0; k < n; k++) {
    let input: PhotoInput | null = null;
    // A photo the person chose is found among all of them (the last three are only reserved for the automatic fill of strips).
    if (k === 0 && c.photoPick) input = c.photoPool.find((p) => p.id === c.photoPick || p.label === c.photoPick) ?? null;
    if (!input && pool.length > 0 && !(k === 0 && c.photoPick)) input = pool[(strips ? c.occurrence + k : c.index + k) % pool.length];
    out.push({
      input,
      ref: input ? { src: input.src, ...(own?.focal ?? input.focal ? { focal: own?.focal ?? input.focal } : {}), ...(treatments.length ? { treatments } : {}), ...(input.synthetic ? { synthetic: true } : {}), width: input.width, height: input.height } : null,
      hint: c.photoHint,
    });
  }
  if (c.photoPick && out[0] && !out[0].input) c.notes.push(`Photo "${c.photoPick}" is not one of the photos given, so this slide shows a placeholder.`);
  return out;
}

/** Records the slot on the slide (the plan's meta and a note when it is empty). */
export function recordSlot(c: LCtx, id: string, s: Slot) {
  c.slots.push({ id, filled: !!s.ref, ...(s.input ? { photo: s.input.id } : {}), ...(s.hint ? { hint: s.hint } : {}), ...(s.input?.synthetic ? { synthetic: true } : {}) });
  if (!s.ref) c.notes.push(`Photo slot "${id}" is empty${s.hint ? ` (wanted: ${s.hint})` : ''}. A placeholder is drawn; add a photo to fill it.`);
  else if (s.input?.synthetic) c.notes.push(`Photo slot "${id}" uses a synthetic stand-in picture, not a real photo.`);
}

/** A clean placeholder for an empty photo slot: a soft panel with a dashed edge and a short label. */
function placeholder(c: LCtx, id: string, x: number, y: number, w: number, h: number, hint: string | undefined, mask?: Mask): Layer[] {
  const pal = c.pal;
  if (w >= c.W * 0.9 && h >= c.H * 0.9) {
    // A photo that fills the slide: a plain panel with a small picture symbol high up, and no words, so the slide's own words never collide with it.
    const g = 190;
    const gx = Math.round(x + (w - g) / 2);
    const gy = Math.round(y + h * 0.2);
    const sw = { color: pal.muted, width: 6, cap: 'round' as const, join: 'round' as const };
    return [
      rect(`${id}-empty`, 'decor', x, y, w, h, pal.surface),
      pathLayer(`${id}-empty-frame`, 'decor', gx, gy, g, g * 0.8, 'M 0 0 L 190 0 L 190 152 L 0 152 Z', { stroke: sw }),
      pathLayer(`${id}-empty-hills`, 'decor', gx, gy, g, g * 0.8, 'M 0 130 L 62 70 L 104 112 L 134 84 L 190 140', { stroke: sw }),
      pathLayer(`${id}-empty-sun`, 'decor', gx + 112, gy + 18, 40, 40, circleD(20, 20, 14), { stroke: sw }),
    ];
  }
  const radius = mask?.shape === 'roundRect' ? (mask.radius ?? 0) : mask?.shape === 'pill' ? Math.min(w, h) / 2 : 0;
  const ell = mask?.shape === 'ellipse';
  const body: ShapeLayer = ell
    ? (ellipse(`${id}-empty`, 'container', x, y, w, h, pal.surface, { stroke: { color: pal.muted, width: 3 } }) as ShapeLayer)
    : (rect(`${id}-empty`, 'container', x, y, w, h, pal.surface, { radius, stroke: { color: pal.muted, width: 3 } }) as ShapeLayer);
  const size = Math.max(32, c.theme.type.label ?? 32);
  const label = buildText({ id: `${id}-empty-label`, x: x + 24, y: 0, width: Math.max(120, w - 48), text: hint ? `PHOTO: ${hint}` : 'PHOTO GOES HERE', font: c.theme.fonts.body, weight: c.theme.fonts.strong, size, minSize: 32, maxHeight: Math.max(size * 1.2, h - 48), color: pal.onSurface, lineHeight: 1.2, align: 'center' });
  c.notes.push(...label.notes);
  label.layer.y = Math.round(y + (h - label.height) / 2);
  return [body, label.layer];
}

/** The photo drawn at this box, or the placeholder when the slot is empty. Records the slot. */
export function putPhoto(c: LCtx, id: string, s: Slot, x: number, y: number, w: number, h: number, o: { mask?: Mask; rotation?: number; role?: 'decor' | 'content'; name?: string } = {}): Layer[] {
  recordSlot(c, id, s);
  if (s.input && w >= c.W * 0.9 && h >= c.H * 0.9) c.fullPhoto = s.input;
  if (!s.ref) return placeholder(c, id, x, y, w, h, s.hint, o.mask);
  return [photoLayer(id, x, y, w, h, s.ref, { mask: o.mask, rotation: o.rotation, name: o.name, role: o.role })];
}

const rgba = (css: string, a: number) => {
  const { rgb } = parseColor(css);
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.round(a * 1000) / 1000})`;
};
const grey = (css: string) => {
  const { rgb } = parseColor(css);
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
};

/** The colour of the overlay under words on a photo. */
export function overlayColor(c: LCtx): string {
  const v = c.style.photo?.overlay;
  return v ? resolveColor(v, c.pal as unknown as Record<string, unknown>) : '#000000';
}

/** A soft overlay: strongest at `edge`, fading to nothing `feather` px before it ends. Covers from y0 to y1. */
export function scrim(c: LCtx, id: string, y0: number, y1: number, edge: 'top' | 'bottom' | 'full', alpha: number, color = overlayColor(c), feather = 220): ShapeLayer {
  const h = y1 - y0;
  const f = Math.min(0.9, feather / h);
  const clear = rgba(color, 0);
  const solid = rgba(color, alpha);
  const fill = edge === 'full' ? solid : edge === 'bottom' ? { type: 'linear' as const, angle: 180, stops: [{ at: 0, color: clear }, { at: f, color: solid }, { at: 1, color: solid }] } : { type: 'linear' as const, angle: 180, stops: [{ at: 0, color: solid }, { at: 1 - f, color: solid }, { at: 1, color: clear }] };
  return rect(id, 'decor', 0, y0, c.W, h, fill) as ShapeLayer;
}

export interface Protected {
  where: Where;
  /** The text's colour on this backdrop. */
  text: string;
  kind: 'none' | 'overlay' | 'plate';
}

/**
 * Picks the calmest place for a block of text of `blockH` px on the slide's photo (among `options`), and adds what it needs
 * under the words so they reach the phone-size contrast: nothing, a soft overlay, or a solid plate. The check afterwards decides.
 */
export function protect(c: LCtx, slot: Slot, blockH: number, options: Where[] = ['bottom', 'top'], forced?: Where): Protected & { y0: number; y1: number } {
  const share = Math.min(0.9, (blockH + 2 * c.M * 0.5) / c.H);
  const picked = forced ? { where: forced, y0: forced === 'top' ? 0 : forced === 'bottom' ? 1 - share : (1 - share) / 2, y1: forced === 'top' ? share : forced === 'bottom' ? 1 : (1 + share) / 2 } : pickBand(slot.input?.stats, share, options);
  const band = bandOf(slot.input?.stats, picked.y0, picked.y1);
  const pal = c.pal;
  const back = textBackdrop(band, grey(pal.text), grey(overlayColor(c)));
  const y0 = Math.round(picked.y0 * c.H);
  const y1 = Math.round(picked.y1 * c.H);
  if (back.kind === 'overlay') add(c, scrim(c, 'photo-scrim', picked.where === 'bottom' ? Math.max(0, y0 - 240) : 0, picked.where === 'top' ? Math.min(c.H, y1 + 240) : c.H, picked.where === 'middle' ? 'full' : picked.where, back.alpha));
  else if (back.kind === 'plate') add(c, rect('photo-plate', 'container', 0, picked.where === 'bottom' ? y0 : picked.where === 'top' ? 0 : y0, c.W, picked.where === 'top' ? y1 : picked.where === 'bottom' ? c.H - y0 : y1 - y0, rgba(solidOf(pal.bg), 0.92)));
  return { where: picked.where, kind: back.kind, text: pal.text, y0, y1 };
}

/** The soft colour background, in place of a flat one: blobs of the style's colours, blurred, with a little grain. */
export function fieldLayer(c: LCtx, id = 'field'): FieldLayer | null {
  const f = c.style.photo?.fields?.[c.palName] ?? c.style.photo?.field;
  if (!f) return null;
  const pal = c.pal as unknown as Record<string, unknown>;
  const seed = (c.index + 1) * 7919 + c.W;
  // Each slide shifts the blobs a little, in a repeatable way, so a deck is a family and not a copy.
  const jitter = (n: number, k: number) => ((((seed * (n + 3) * 2654435761) >>> 0) % 1000) / 1000 - 0.5) * k;
  return {
    id,
    kind: 'field',
    role: 'decor',
    x: 0,
    y: 0,
    width: c.W,
    height: c.H,
    rotation: 0,
    opacity: 1,
    base: resolveColor('$bg', pal),
    blobs: f.blobs.map((b, i) => ({ x: Math.round((b.x + jitter(i, 0.16)) * 1000) / 1000, y: Math.round((b.y + jitter(i + 9, 0.16)) * 1000) / 1000, r: b.r, color: resolveColor(b.color, pal), ...(b.alpha !== undefined ? { alpha: b.alpha } : {}) })),
    blur: f.blur,
    grain: f.grain,
    seed,
  };
}

/** A glass card: it blurs what is behind it. */
export function glassCard(c: LCtx, id: string, x: number, y: number, w: number, h: number): GlassLayer {
  const g = c.style.photo?.glass ?? { fill: 'rgba(255,255,255,0.14)', blur: 28, radius: 36 };
  return { id, kind: 'glass', role: 'container', x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h), rotation: 0, opacity: 1, fill: g.fill, blur: g.blur, radius: g.radius, ...(g.border ? { border: g.border } : {}), ...(g.shadow ? { shadow: g.shadow } : {}) };
}

export type { Palette };

/** A scrim under the page chrome (the handle strip at the top, or the dots and page number at the bottom) when a photo fills the slide. */
export function chromeScrim(c: LCtx, chrome: string, M: number): ShapeLayer | null {
  const photo = c.fullPhoto;
  if (!photo || chrome === 'none') return null;
  const top = chrome === 'strip';
  const share = top ? (M + 140) / c.H : 0.17;
  const y0 = top ? 0 : 1 - share;
  const band = bandOf(photo.stats, y0, y0 + share);
  const back = textBackdrop(band, grey(c.pal.muted), grey(overlayColor(c)));
  if (back.kind === 'none') return null;
  const alpha = back.kind === 'plate' ? 0.85 : back.alpha;
  const h = Math.round(share * c.H);
  const out = scrim(c, 'chrome-scrim', top ? 0 : c.H - h, top ? h : c.H, top ? 'top' : 'bottom', alpha, overlayColor(c), Math.round(h * 0.7));
  return out;
}
