// Round U: the dissolve. A photo drawn whole (its cover crop would cut more than the budget) used to sit on a blurred, darkened copy of itself: a box with a dark band above and below.
// Now the photo melts into the slide instead:
//   1. the photo's own picture is mirrored outward across each edge where its slot has room (so the colours just outside the edge are the colours just inside it: no step at the seam),
//   2. that mirror (and the photo under it) is blurred strongly, so no detail of the mirror reads as a reflection,
//   3. it fades out to nothing over a long distance (up to 300 px; all the room there is when there is less), so what lies under the slot (the slide's ground, a card) shows through at the
//      slot's edge: no box edge, and no dark band, since nothing is darkened,
//   4. the photo itself is drawn whole on top, with its 64 px feathered edge (Round N), so it never shows a hard line.
// The fade is one gradient across the whole slot per axis (top to bottom, left to right), the two multiplied (one mask inside the other), so the mask has no seams of its own. A side of the slot
// that is the edge of the slide stays filled (the photo bleeds off the slide there); a thin room on an inner side (the inset that keeps a photo off a rounded corner) fades over 40 px.
// The photo is never cut; the words, the layout and the slot are never changed. A screenshot is not touched (it stays on its flat edge-colour panel).

/** The blur of the mirrored edge (a Gaussian standard deviation in slide px). */
export const DISSOLVE_BLUR = 32;
/** The longest fade from the photo's edge into what lies under the slot. */
export const DISSOLVE_FADE_MAX = 300;
/** Room under this many px on a side is too thin to fade across: that side fades over DISSOLVE_EDGE_SOFT px at the slot's own edge instead (or stays filled at the edge of the slide). */
export const DISSOLVE_MIN_GAP = 24;
/** The soft edge of a slot side with a thin room (the photo's own feather covers the rest). */
export const DISSOLVE_EDGE_SOFT = 40;

type Box = { x: number; y: number; w: number; h: number };
const r1 = (n: number) => Math.round(n * 10) / 10;
/** The opacity of the fade at t (0 at the photo's edge, 1 at the end of the fade): a smooth ease, so neither end shows as a line. */
export const fadeAt = (t: number): number => {
  const u = Math.max(0, Math.min(1, t));
  return 1 - u * u * (3 - 2 * u);
};
const EASE = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];

export interface SideFade {
  /** How the side ends: 'fade' over the room beside the photo, 'soft' at the slot's own edge (thin room), 'bleed' (the slot's edge is the slide's edge: no fade). */
  kind: 'fade' | 'soft' | 'bleed';
  /** The room beside the photo on this side (px). */
  room: number;
  /** The length of the fade (px): 0 for 'bleed'. */
  len: number;
}
const CANVAS = { w: 1080, h: 1350 };
/** How each side of the slot ends. */
export function sideFades(slot: Box, rect: Box): { top: SideFade; bottom: SideFade; left: SideFade; right: SideFade } {
  const side = (room: number, along: number, atCanvasEdge: boolean): SideFade =>
    room >= DISSOLVE_MIN_GAP ? { kind: 'fade', room, len: Math.min(room, DISSOLVE_FADE_MAX, along) } : atCanvasEdge ? { kind: 'bleed', room, len: 0 } : { kind: 'soft', room, len: DISSOLVE_EDGE_SOFT };
  return {
    top: side(rect.y - slot.y, rect.h, slot.y <= 0.5),
    bottom: side(slot.y + slot.h - (rect.y + rect.h), rect.h, slot.y + slot.h >= CANVAS.h - 0.5),
    left: side(rect.x - slot.x, rect.w, slot.x <= 0.5),
    right: side(slot.x + slot.w - (rect.x + rect.w), rect.w, slot.x + slot.w >= CANVAS.w - 0.5),
  };
}
/**
 * The opacity profile along one axis of the slot, as gradient stops (offset 0..1 along the slot, opacity 0..1). `s0`/`s1` are the slot's ends, `r0`/`r1` the photo's, `a`/`b` how each end fades.
 */
export function axisStops(s0: number, s1: number, r0: number, r1v: number, a: SideFade, b: SideFade): { o: number; a: number }[] {
  const len = s1 - s0;
  const at = (y: number) => Math.max(0, Math.min(1, (y - s0) / len));
  const out: { o: number; a: number }[] = [];
  // the low end: a fade runs from the photo's edge outward; a soft edge runs from the slot's edge inward
  if (a.kind === 'fade') {
    if (r0 - a.len > s0) out.push({ o: 0, a: 0 });
    for (const t of [...EASE].reverse()) out.push({ o: at(r0 - t * a.len), a: fadeAt(t) });
  } else if (a.kind === 'soft') {
    for (const t of [...EASE].reverse()) out.push({ o: at(s0 + (1 - t) * a.len), a: fadeAt(t) });
  } else out.push({ o: 0, a: 1 });
  // the high end, mirrored
  if (b.kind === 'fade') {
    for (const t of EASE) out.push({ o: at(r1v + t * b.len), a: fadeAt(t) });
    if (r1v + b.len < s1) out.push({ o: 1, a: 0 });
  } else if (b.kind === 'soft') {
    for (const t of EASE) out.push({ o: at(s1 - (1 - t) * b.len), a: fadeAt(t) });
  } else out.push({ o: 1, a: 1 });
  // offsets must not go back (a soft end on a very short slot): keep them in order
  for (let i = 1; i < out.length; i++) if (out[i].o < out[i - 1].o) out[i].o = out[i - 1].o;
  return out.map((s) => ({ o: Math.round(s.o * 10000) / 10000, a: Math.round(s.a * 1000) / 1000 }));
}

/**
 * Round F, Round N, Round U: the feather of a photo drawn whole. The mask is the photo's rectangle moved `FEATHER_INSET` px in and blurred by `FEATHER_BLUR` (a Gaussian): the photo goes from
 * 10% to 90% visible between 34 and 116 px in from its edge, and is about 1% visible AT its edge (2.3 standard deviations), so the faint crisp detail of the photo never starts at a line (Round N
 * left it 10% visible at the edge: a thin line over a blurred fill). A side where the slot is the edge of the slide is not feathered (the photo runs off the slide there, crisp). The photo is
 * not moved or resized.
 */
export const FEATHER_BLUR = 32;
export const FEATHER_INSET = 75;
/** The feather of a photo of this size: the full 75 / 32 from a short side of 400 px up, less on a small photo (a row of small pictures), never under a quarter. */
export const featherOf = (rect: Box): { inset: number; blur: number } => { const k = Math.max(0.25, Math.min(1, Math.min(rect.w, rect.h) / 400)); return { inset: Math.round(FEATHER_INSET * k * 10) / 10, blur: Math.round(FEATHER_BLUR * k * 10) / 10 }; };
export function featherMask(id: string, slot: Box, rect: Box): string {
  const f = sideFades(slot, rect);
  const { inset, blur } = featherOf(rect);
  const out = 3 * blur;
  const x0 = f.left.kind === 'bleed' ? rect.x - out : rect.x + inset, x1 = f.right.kind === 'bleed' ? rect.x + rect.w + out : rect.x + rect.w - inset;
  const y0 = f.top.kind === 'bleed' ? rect.y - out : rect.y + inset, y1 = f.bottom.kind === 'bleed' ? rect.y + rect.h + out : rect.y + rect.h - inset;
  const pad = 3 * blur + out;
  return `<filter id="${id}f" filterUnits="userSpaceOnUse" x="${r1(rect.x - pad)}" y="${r1(rect.y - pad)}" width="${r1(rect.w + 2 * pad)}" height="${r1(rect.h + 2 * pad)}"><feGaussianBlur stdDeviation="${blur}"/></filter>`
    + `<mask id="${id}m" maskUnits="userSpaceOnUse" x="${r1(rect.x - 50)}" y="${r1(rect.y - 50)}" width="${r1(rect.w + 100)}" height="${r1(rect.h + 100)}"><rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(Math.max(1, x1 - x0))}" height="${r1(Math.max(1, y1 - y0))}" fill="#ffffff" filter="url(#${id}f)"/></mask>`;
}

/**
 * The SVG of the dissolve behind a photo drawn whole: `id` is the picture's id (pic<slide>x<i>), `slot` its slot (clipped with its corner radius `rx`), `rect` where the photo is drawn whole, `src`
 * the picture. The group is clipped with the clip path `<id>s` (the slot), which the photo-contrast check reads as the picture's box, so text over the dissolve is measured as text over the picture.
 */
export function dissolveFill(id: string, slot: Box & { rx?: number }, rect: Box, src: string): string {
  const href = src.replace(/&/g, '&amp;');
  const f = sideFades(slot, rect);
  const img = (extra: string) => `<image href="${href}" x="${r1(rect.x)}" y="${r1(rect.y)}" width="${r1(rect.w)}" height="${r1(rect.h)}" preserveAspectRatio="none"${extra}/>`;
  // the mirrors: the photo flipped about each edge where there is room
  const mirrors: string[] = [];
  if (f.top.room > 0.5) mirrors.push(img(` transform="matrix(1 0 0 -1 0 ${r1(2 * rect.y)})"`));
  if (f.bottom.room > 0.5) mirrors.push(img(` transform="matrix(1 0 0 -1 0 ${r1(2 * (rect.y + rect.h))})"`));
  if (f.left.room > 0.5) mirrors.push(img(` transform="matrix(-1 0 0 1 ${r1(2 * rect.x)} 0)"`));
  if (f.right.room > 0.5) mirrors.push(img(` transform="matrix(-1 0 0 1 ${r1(2 * (rect.x + rect.w))} 0)"`));
  const grad = (gid: string, vertical: boolean, stops: { o: number; a: number }[]) =>
    `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${vertical ? 0 : slot.x}" y1="${vertical ? slot.y : 0}" x2="${vertical ? 0 : slot.x + slot.w}" y2="${vertical ? slot.y + slot.h : 0}">${stops.map((s) => `<stop offset="${s.o}" stop-color="#ffffff" stop-opacity="${s.a}"/>`).join('')}</linearGradient>`;
  const vStops = axisStops(slot.y, slot.y + slot.h, rect.y, rect.y + rect.h, f.top, f.bottom);
  const hStops = axisStops(slot.x, slot.x + slot.w, rect.x, rect.x + rect.w, f.left, f.right);
  const mask = (mid: string, gid: string) => `<mask id="${mid}" maskUnits="userSpaceOnUse" x="${slot.x}" y="${slot.y}" width="${slot.w}" height="${slot.h}"><rect x="${slot.x}" y="${slot.y}" width="${slot.w}" height="${slot.h}" fill="url(#${gid})"/></mask>`;
  const filter = (fid: string, sd: number) => {
    const pad = sd * 3;
    return `<filter id="${fid}" filterUnits="userSpaceOnUse" x="${r1(slot.x - pad)}" y="${r1(slot.y - pad)}" width="${r1(slot.w + 2 * pad)}" height="${r1(slot.h + 2 * pad)}"><feGaussianBlur stdDeviation="${sd}" edgeMode="duplicate"/></filter>`;
  };
  const pics = img('') + mirrors.join('');
  return `<defs><clipPath id="${id}s"><rect x="${slot.x}" y="${slot.y}" width="${slot.w}" height="${slot.h}" rx="${slot.rx ?? 0}"/></clipPath>`
    + filter(`${id}b`, DISSOLVE_BLUR)
    + grad(`${id}gv`, true, vStops) + grad(`${id}gh`, false, hStops) + mask(`${id}dv`, `${id}gv`) + mask(`${id}dh`, `${id}gh`) + `</defs>`
    + `<g clip-path="url(#${id}s)"><g mask="url(#${id}dv)"><g mask="url(#${id}dh)"><g filter="url(#${id}b)">${pics}</g></g></g></g>`;
}
