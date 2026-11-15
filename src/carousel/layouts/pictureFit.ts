// The crop budget (Round 13): a picture that a cover-crop would cut by more than 10% of its width or height is drawn WHOLE (contain) on a panel in its own average edge colour, so no edge content is
// lost (a screenshot's left column, a logo in a corner). A picture the person zoomed (z above 1) keeps the crop they chose.
import { resolvePictureRef } from '../../reference/faithful';
import type { PicRef } from './images';

export const CROP_BUDGET = 0.1;
/** A photo (not a screenshot) may lose more: 25%. Beyond it the whole photo is shown on a blurred, darkened copy of itself (no flat bars). */
export const PHOTO_CROP_BUDGET = 0.25;
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
  return !!l && Math.max(l.w, l.h) > (ref.photo ? PHOTO_CROP_BUDGET : CROP_BUDGET) + 1e-6;
};
/** The picture drawn whole inside the slot, centred. `rx` is the slot's corner radius: the picture keeps inside it by 30% of the radius on every side, so a rounded corner never cuts one of its corners. */
export function containRect(slot0: Slot, ref: PicRef, rx = 0): Slot {
  const ins = Math.round(rx * 0.3);
  const slot = { x: slot0.x + ins, y: slot0.y + ins, w: slot0.w - 2 * ins, h: slot0.h - 2 * ins };
  const s = Math.min(slot.w / ref.w!, slot.h / ref.h!);
  const w = ref.w! * s, h = ref.h! * s;
  return { x: slot.x + (slot.w - w) / 2, y: slot.y + (slot.h - h) / 2, w, h };
}
/** Today's darkening of the blurred copy behind a photo drawn whole (a black veil of this opacity): the most it is ever darkened. */
export const BACKDROP_VEIL = 0.42;
/** Round N: the photo's own edge strip that the fill is matched to, in slide px. */
export const EDGE_STRIP = 40;
/** Round N: the fill is read across this many slide px on both sides of the photo's edge (the blurred copy runs on under the photo, and the blur mixes both sides in). */
export const FILL_ZONE = 60;
/** Round N: a photo edge strip more than this (luminance, 0..255) lighter than the photo just inside it is a bright rim: the fill keeps today's darkening (a matched fill would show as a light band). */
export const HALO_STEP = 8;
/** Round N: a blurred copy drawn more than this many times larger than the photo itself keeps today's darkening (measured: tall-crop in list-under-band, 3.6x, band 2.0 at 0.42 against 12.4 matched; every other Round K case is 2.7x or less). */
export const COPY_ZOOM_MAX = 3;
const pixCache = new Map<string, { w: number; h: number; d: Uint8ClampedArray } | null>();
async function pixelsOf(src: string): Promise<{ w: number; h: number; d: Uint8ClampedArray } | null> {
  const key = src.split('#')[0];
  if (pixCache.has(key)) return pixCache.get(key)!;
  let out: { w: number; h: number; d: Uint8ClampedArray } | null = null;
  try {
    const data = await resolvePictureRef(src);
    if (data) {
      const bm = new Image();
      bm.src = data;
      await bm.decode();
      const bw = bm.naturalWidth || 1, bh = bm.naturalHeight || 1;
      const k = Math.min(1, 400 / Math.max(bw, bh));
      const w = Math.max(4, Math.round(bw * k)), h = Math.max(4, Math.round(bh * k));
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(bm, 0, 0, w, h);
      out = { w, h, d: g.getImageData(0, 0, w, h).data };
    }
  } catch {
    out = null;
  }
  pixCache.set(key, out);
  return out;
}
type Box = { x: number; y: number; w: number; h: number };
/**
 * Round N: the veil of the blurred copy behind a photo drawn whole, matched to the photo. `rect` is where the whole photo is drawn, `cover` where the cover-cropped copy is (both in slide px).
 * Along the edges where the photo meets the fill, the mean luminance of the photo's own 40 px strip and of the copy within 60 px of the edge (the blur averages it) are read from the picture's
 * pixels; the veil darkens the copy to the strip's level: never lighter than the photo's edge, never darker than today (0.42). Null when the picture cannot be read (today's veil is used).
 */
export async function matchedVeil(src: string, slot: Box, rect: Box, cover: Box): Promise<{ veil: number; edge: number; fill: number; halo?: true; /** How much larger the blurred copy is drawn than the photo. */ zoom: number } | null> {
  const px = await pixelsOf(src);
  if (!px) return null;
  // mean luminance (0..255, Rec. 709 weights on the sRGB values, as the seam is measured) of a slide-px box mapped into the picture through `at` (where the picture lies on the slide)
  const mean = (b: Box, at: Box): { s: number; n: number } => {
    let s = 0, n = 0;
    const x0 = Math.max(0, Math.floor(((b.x - at.x) / at.w) * px.w)), x1 = Math.min(px.w, Math.ceil(((b.x + b.w - at.x) / at.w) * px.w));
    const y0 = Math.max(0, Math.floor(((b.y - at.y) / at.h) * px.h)), y1 = Math.min(px.h, Math.ceil(((b.y + b.h - at.y) / at.h) * px.h));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * px.w + x) * 4;
      s += 0.2126 * px.d[i] + 0.7152 * px.d[i + 1] + 0.0722 * px.d[i + 2];
      n++;
    }
    return { s, n };
  };
  const strips: [Box, Box][] = [];
  if (rect.h < slot.h - 4) {
    strips.push([{ x: rect.x, y: rect.y, w: rect.w, h: EDGE_STRIP }, { x: slot.x, y: Math.max(slot.y, rect.y - FILL_ZONE), w: slot.w, h: rect.y + FILL_ZONE - Math.max(slot.y, rect.y - FILL_ZONE) }]);
    strips.push([{ x: rect.x, y: rect.y + rect.h - EDGE_STRIP, w: rect.w, h: EDGE_STRIP }, { x: slot.x, y: rect.y + rect.h - FILL_ZONE, w: slot.w, h: Math.min(slot.y + slot.h, rect.y + rect.h + FILL_ZONE) - (rect.y + rect.h - FILL_ZONE) }]);
  }
  if (rect.w < slot.w - 4) {
    strips.push([{ x: rect.x, y: rect.y, w: EDGE_STRIP, h: rect.h }, { x: Math.max(slot.x, rect.x - FILL_ZONE), y: slot.y, w: rect.x + FILL_ZONE - Math.max(slot.x, rect.x - FILL_ZONE), h: slot.h }]);
    strips.push([{ x: rect.x + rect.w - EDGE_STRIP, y: rect.y, w: EDGE_STRIP, h: rect.h }, { x: rect.x + rect.w - FILL_ZONE, y: slot.y, w: Math.min(slot.x + slot.w, rect.x + rect.w + FILL_ZONE) - (rect.x + rect.w - FILL_ZONE), h: slot.h }]);
  }
  // per edge: the veil that brings the fill there down to the photo's own strip; the fill is never lighter than ANY edge, so the strongest of them is used
  let veil = 0, edge = 255, fill = 0;
  const seen: { ea: number; fb: number; inner: number }[] = [];
  for (const [e, f] of strips) {
    if (f.w <= 0 || f.h <= 0) continue;
    const a = mean(e, rect), b = mean(f, cover);
    if (!a.n || !b.n) continue;
    // the photo a little further in (the next 60 px): a strip much lighter than it is a bright rim, and a fill matched to that rim would show as a light band
    const inBox = e.h === EDGE_STRIP ? { ...e, y: e.y === rect.y ? e.y + EDGE_STRIP : e.y - FILL_ZONE, h: FILL_ZONE } : { ...e, x: e.x === rect.x ? e.x + EDGE_STRIP : e.x - FILL_ZONE, w: FILL_ZONE };
    const c = mean(inBox, rect);
    const ea = a.s / a.n, fb = b.s / b.n;
    seen.push({ ea, fb, inner: c.n ? c.s / c.n : ea });
    const v = fb <= 0 ? 0 : 1 - ea / fb;
    if (v > veil) veil = v;
    edge = Math.min(edge, ea);
    fill = Math.max(fill, fb);
  }
  if (!seen.length) return null;
  veil = Math.max(0, Math.min(BACKDROP_VEIL, veil));
  // the guard: where the matched fill would sit more than HALO_STEP above the photo further in (a bright rim), today's darkening stays
  const halo = seen.some((q) => q.fb * (1 - veil) > q.inner + HALO_STEP && q.ea > q.inner + HALO_STEP);
  // a copy blown up far beyond the photo (a tall photo in a wide band) shows big soft blobs once it is lighter: today's darkening stays
  const zoom = cover.w / 1.12 / rect.w; // the copy is drawn 12% larger than the cover crop (chromeAvoid BACKDROP_GROW)
  if (zoom > COPY_ZOOM_MAX) return { veil: BACKDROP_VEIL, edge: Math.round(edge * 10) / 10, fill: Math.round(fill * 10) / 10, zoom: Math.round(zoom * 100) / 100 };
  if (halo) veil = BACKDROP_VEIL;
  return { veil: Math.round(veil * 1000) / 1000, edge: Math.round(edge * 10) / 10, fill: Math.round(fill * 10) / 10, ...(halo ? { halo: true } : {}), zoom: Math.round(zoom * 100) / 100 };
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
