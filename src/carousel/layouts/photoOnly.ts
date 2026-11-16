// Round R: picture-only slides. When the writer made fewer slides than the person asked for and photos are still unused after every placement pass, the code adds slides that carry ONLY
// photos: no text slot at all (no caption, no invented word). Three layouts:
//   photo-full : one photo, as large as the picture zone allows (edge to edge, like title-over-photo and photo-full-caption);
//   photo-pair : two photos stacked, a thin gap in the ground colour between them, inside the margins of the other picture layouts (twin-photos, photo-grid);
//   photo-quad : three or four photos in a 2 x 2 grid, inside the same margins (the brief's "photo-grid": that id is already the grid WITH a headline, so this one is photo-quad).
// Every cell is the largest rectangle of its share of the photo area whose cover crop of its photo stays inside the photo crop budget (25%): a photo is never drawn whole on bars here.
// Which layout a group of photos gets is decided by measuring these cells (photoSlides.ts), never by a fixed list. They are not offered to the writer and are not in LAYOUT_IDS.
import { PHOTO_CROP_BUDGET } from './pictureFit';
import { imageOf, parseRef, zoneTopOf } from './images';
import { mk, place } from './library';
import type { LayoutDef, LayoutStyle } from './types';

export const PHOTO_ONLY_IDS = ['photo-full', 'photo-pair', 'photo-quad'] as const;
export type PhotoOnlyId = (typeof PHOTO_ONLY_IDS)[number];
export const isPhotoOnly = (id: string): boolean => (PHOTO_ONLY_IDS as readonly string[]).includes(id);
/** The photos each layout holds (the fewest and the most). */
export const PHOTO_ONLY_COUNT: Record<PhotoOnlyId, [number, number]> = { 'photo-full': [1, 1], 'photo-pair': [2, 2], 'photo-quad': [3, 4] };
/** The cells keep a little inside the crop budget, so the rounding of the drawn slot never pushes a crop over it. */
const BUDGET = PHOTO_CROP_BUDGET - 0.01;
/** The thin gap between two photos, in the ground colour. */
export const PHOTO_GAP = 24;
/** The side margins of the pictures of twin-photos and photo-grid (978 px wide pictures). */
export const PHOTO_MARGIN = 51;
const SLIDE_W = 1080;
const ZONE_BOTTOM = 1250;
type Rect = { x: number; y: number; w: number; h: number };
const rad = (st: LayoutStyle) => Math.max(12, Math.min(48, st.radius ?? 28));
/** The largest rectangle inside `box` whose cover crop of a picture of shape `a` (width / height) stays inside the budget; `ax`, `ay` (0 start, 0.5 middle, 1 end) say where it sits in the box. */
export function cellIn(box: Rect, a: number, ax = 0.5, ay = 0.5): Rect {
  const lo = a * (1 - BUDGET), hi = a / (1 - BUDGET);
  const ba = box.w / box.h;
  let w = box.w, h = box.h;
  if (ba > hi) w = Math.floor(h * hi);
  else if (ba < lo) h = Math.floor(w / lo);
  return { x: Math.round(box.x + (box.w - w) * ax), y: Math.round(box.y + (box.h - h) * ay), w, h };
}
/** The shape of a picture reference (a landscape photo when its size is not known). */
const aspectOf = (src: string): number => { const r = parseRef(src); return r?.w && r.h ? r.w / r.h : 4 / 3; };
export interface PhotoCell { cell: Rect; box: Rect }
/**
 * The cells of a picture-only layout for photos of these shapes (pure: the plan and the measurement use it). `box` is the photo's share of the photo area; `cell` is where it is drawn.
 * photo-full: the picture zone edge to edge. photo-pair: two halves of the area inside the margins, the top cell sitting on the gap, the bottom cell under it. photo-quad: four quarters,
 * each cell pushed to the middle of the grid; three photos put the third quarter in the middle of the bottom row.
 */
export function photoCells(layout: string, aspects: number[], st: LayoutStyle): PhotoCell[] {
  const top = zoneTopOf(st);
  const H = ZONE_BOTTOM - top;
  if (layout === 'photo-full') {
    const box = { x: 0, y: top, w: SLIDE_W, h: H };
    return [{ box, cell: cellIn(box, aspects[0] ?? 4 / 3) }];
  }
  const x0 = PHOTO_MARGIN, W = SLIDE_W - 2 * PHOTO_MARGIN;
  if (layout === 'photo-pair') {
    const hh = Math.floor((H - PHOTO_GAP) / 2);
    const boxes = [{ x: x0, y: top, w: W, h: hh }, { x: x0, y: top + hh + PHOTO_GAP, w: W, h: hh }];
    const cells = boxes.map((b, i) => cellIn(b, aspects[i] ?? 4 / 3, 0.5, i === 0 ? 1 : 0));
    // the pair is one block: the space the cells leave above and below is shared, so the gap between them stays thin
    const slack = cells[0].y - boxes[0].y + (boxes[1].y + boxes[1].h - (cells[1].y + cells[1].h));
    const shift = Math.round(slack / 2) - (cells[0].y - boxes[0].y);
    return boxes.map((box, i) => ({ box, cell: { ...cells[i], y: cells[i].y + shift } }));
  }
  if (layout === 'photo-quad') {
    const qw = Math.floor((W - PHOTO_GAP) / 2), qh = Math.floor((H - PHOTO_GAP) / 2);
    const n = Math.min(4, Math.max(3, aspects.length));
    const boxes: Rect[] = [0, 1, 2, 3].slice(0, n).map((i) => ({ x: n === 3 && i === 2 ? x0 + Math.round((W - qw) / 2) : x0 + (i % 2) * (qw + PHOTO_GAP), y: top + Math.floor(i / 2) * (qh + PHOTO_GAP), w: qw, h: qh }));
    return boxes.map((box, i) => ({ box, cell: cellIn(box, aspects[i] ?? 4 / 3, n === 3 && i === 2 ? 0.5 : i % 2 === 0 ? 1 : 0, i < 2 ? 1 : 0) }));
  }
  return [];
}
const KEYS = ['image', 'image2', 'image3', 'image4'];
const IMG = (name: string, note: string) => ({ name, required: false as const, max: 12_000_000, image: true as const, note });
/** One plan for the three layouts: the photos in their cells, no text. With fewer photos than the layout holds (a picture removed), the photos that are left are drawn as the smaller layout. */
const photoPlan = (id: PhotoOnlyId): LayoutDef['plan'] => (f, _v, st, cx) => {
  const imgs = KEYS.map((k) => imageOf(f[k])).filter(Boolean);
  const as = imgs.length >= 3 ? 'photo-quad' : imgs.length === 2 ? 'photo-pair' : 'photo-full';
  const layout = imgs.length >= PHOTO_ONLY_COUNT[id][0] ? id : as;
  const cells = imgs.length ? photoCells(layout, imgs.map(aspectOf), st) : [];
  const d = place(st, cx, 'top', (d) => {
    imgs.forEach((src, i) => {
      const c = cells[i]?.cell;
      if (!c) return;
      const rx = layout === 'photo-full' && c.w >= SLIDE_W ? 0 : rad(st);
      // a fully transparent marker of the cell (the engine keeps a slide only when it has drawn parts besides its ground; shapes are drawn over pictures, so this one draws nothing)
      d.shape(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="$bg" fill-opacity="0"/>`, { y0: c.y, y1: c.y + c.h });
      d.image(src, c.x, c.y, c.w, c.h, { rx });
    });
    // the engine keeps a design only with a text slot: an empty caption slot (the slide has no caption, so nothing is written in it)
    d.y = cells[0]?.cell.y ?? d.y;
    d.text('caption', '', { size: 32, max: 32, lines: 1, min: 32, gap: 0 });
  });
  return mk(d, { noBalance: true, type: 'content', fitAs: 'statement-card', slide: { type: 'content' } });
};
const SAMPLE = { normal: {}, long: {}, short: {} };
export const PHOTO_ONLY_LAYOUTS: LayoutDef[] = [
  { id: 'photo-full', label: 'One photo, no text', shapes: ['photo'], variants: ['photo', 'photo'], fields: [IMG('image', 'one photo')], samples: SAMPLE, plan: photoPlan('photo-full'), cuts: ['plain'] },
  { id: 'photo-pair', label: 'Two photos, no text', shapes: ['photo'], variants: ['photos', 'photos'], fields: [IMG('image', 'photo 1'), IMG('image2', 'photo 2')], samples: SAMPLE, plan: photoPlan('photo-pair'), cuts: ['plain'] },
  { id: 'photo-quad', label: 'Photo grid, no text', shapes: ['photo'], variants: ['photos', 'photos'], fields: [IMG('image', 'photo 1'), IMG('image2', 'photo 2'), IMG('image3', 'photo 3'), IMG('image4', 'photo 4')], samples: SAMPLE, plan: photoPlan('photo-quad'), cuts: ['plain'] },
];
// the picture slots (for the picker and the placement's bookkeeping): one per photo
PHOTO_ONLY_LAYOUTS.forEach((l) => {
  const n = PHOTO_ONLY_COUNT[l.id as PhotoOnlyId];
  l.minImages = n[0];
  l.imageSlots = () => KEYS.slice(0, n[1]).map((field) => ({ field, aspect: l.id === 'photo-full' ? 1080 / 1134 : l.id === 'photo-pair' ? 978 / 555 : 477 / 555, orientation: 'landscape' as const, accepts: ['landscape', 'square', 'portrait'] }));
});
