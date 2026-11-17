// Round U part 3: fill the slide when it is safe. On a full-bleed layout (title-over-photo, photo-full-caption, cover-art) a photo whose cover crop would cut more than the 25% budget is drawn
// whole (and dissolves into the slide, Round U part 2). It may fill its slot instead, cutting up to 40%, but only when the important part of the photo stays inside what is kept:
//   - the important part is a saliency box measured on the photo's own pixels (a 400 px copy, already read for the drawing). Blocks of 8 x 8 px are scored by local contrast (detail) and by how
//     far their colour is from the colour of the photo's border (a subject against its background), weighted towards the middle of the photo and towards its focus point (fx, fy). Blocks under
//     30% of the strongest score are left out (a plain wall, a sky); the box spans the middle 90% of what is left along each axis;
//   - the kept part is the NARROWEST a fill may ever keep: 60% of the photo's width (or height) around its focus point (the focus point is never moved). The choice does not depend on the slot
//     as drawn, so a style switch (a profile header makes the picture zone shorter), a colour or brand switch, a reload, a move or a remove never change it;
//   - at least 90% of the saliency box must be inside it; otherwise the photo stays whole (the dissolve).
// The person can switch it for a picture ("Fill the slide", in the picture row): on fills even when the measure says no (still at most 40%), off keeps the photo whole. "Keep the full picture"
// (a photo with letterbox bars) keeps it whole too.
// No model and no download: the cut-out editor's model (public/models, onnxruntime) is a background remover the person starts by hand (fetched by npm run fetch:models, not in git), too slow
// and too large to run on every drawing.
import type { PicRef } from './images';
import { coverLoss, photoPixels, PHOTO_CROP_BUDGET } from './pictureFit';

/** The layouts where a photo may fill its slot past the 25% budget (their picture is the slide, edge to edge). photo-full is not here: its photo already fills its cell within the budget. */
export const FILL_LAYOUTS = ['title-over-photo', 'photo-full-caption', 'cover-art'];
/** The most a cover crop may cut (width or height) to fill the slot. */
export const FILL_BUDGET = 0.4;
/** The share of the saliency box that must stay inside the kept part. */
export const SALIENT_KEEP = 0.9;
/** The share of the saliency score the box spans along each axis (the middle 90%). */
export const SALIENT_MASS = 0.9;
/** Blocks scoring under this share of the strongest block are left out of the box. */
export const SALIENT_FLOOR = 0.3;
const BLOCK = 8;

type Box = { x: number; y: number; w: number; h: number };
/** A box in the photo's own coordinates, 0..1 on each axis. */
export interface UnitBox { x0: number; y0: number; x1: number; y1: number }

// ----- what the person chose for a picture: 'on' (fill even when the measure says no, up to 40%), 'off' (always whole), or nothing (the measure decides) -----
// "Keep the full picture" (letterbox bars kept) counts as 'off': a photo kept with its bars is never cut.
const overrides = new Map<string, 'on' | 'off'>();
/** Tells the drawing what the person chose per picture (set from the project's pictures, as the letterbox crops are). Returns whether anything changed. */
export function setFillOverrides(next: Iterable<[string, 'on' | 'off']>): boolean {
  const m = new Map(next);
  const changed = m.size !== overrides.size || [...m].some(([id, v]) => overrides.get(id) !== v);
  overrides.clear();
  for (const [id, v] of m) overrides.set(id, v);
  return changed;
}
export const fillOverride = (id: string): 'on' | 'off' | undefined => overrides.get(id);

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const boxCache = new Map<string, UnitBox | null>();
/** The saliency box of a picture with this focus point (0..1 in the picture), or null when the picture cannot be read. */
export async function salientBox(src: string, fx = 0.5, fy = 0.5): Promise<UnitBox | null> {
  const key = `${src.split('#')[0]}|${fx}|${fy}`;
  if (boxCache.has(key)) return boxCache.get(key)!;
  const px = await photoPixels(src);
  let out: UnitBox | null = null;
  if (px) {
    const gw = Math.max(1, Math.floor(px.w / BLOCK)), gh = Math.max(1, Math.floor(px.h / BLOCK));
    const n = gw * gh;
    const mr = new Float64Array(n), mg = new Float64Array(n), mb = new Float64Array(n), sd = new Float64Array(n);
    for (let by = 0; by < gh; by++) for (let bx = 0; bx < gw; bx++) {
      let r = 0, g = 0, b = 0, l = 0, l2 = 0, c = 0;
      for (let y = by * BLOCK; y < (by + 1) * BLOCK; y++) for (let x = bx * BLOCK; x < (bx + 1) * BLOCK; x++) {
        const i = (y * px.w + x) * 4;
        const lum = 0.2126 * px.d[i] + 0.7152 * px.d[i + 1] + 0.0722 * px.d[i + 2];
        r += px.d[i]; g += px.d[i + 1]; b += px.d[i + 2]; l += lum; l2 += lum * lum; c++;
      }
      const k = by * gw + bx;
      mr[k] = r / c; mg[k] = g / c; mb[k] = b / c;
      sd[k] = Math.sqrt(Math.max(0, l2 / c - (l / c) ** 2));
    }
    // the background colour: the mean of the outer ring of blocks
    let br = 0, bgc = 0, bb = 0, bn = 0;
    for (let by = 0; by < gh; by++) for (let bx = 0; bx < gw; bx++) {
      if (bx > 0 && by > 0 && bx < gw - 1 && by < gh - 1) continue;
      const k = by * gw + bx; br += mr[k]; bgc += mg[k]; bb += mb[k]; bn++;
    }
    br /= bn; bgc /= bn; bb /= bn;
    const dist = new Float64Array(n);
    let maxD = 1e-6, maxS = 1e-6;
    for (let k = 0; k < n; k++) { dist[k] = Math.hypot(mr[k] - br, mg[k] - bgc, mb[k] - bb); maxD = Math.max(maxD, dist[k]); maxS = Math.max(maxS, sd[k]); }
    // the middle of the photo and its focus point: a broad Gaussian around each, so a subject off-centre still counts, less
    const gauss = (u: number, v: number, cu: number, cv: number) => Math.exp(-(((u - cu) ** 2) + ((v - cv) ** 2)) / (2 * 0.3 * 0.3));
    const val = new Float64Array(n);
    let maxV = 0;
    for (let by = 0; by < gh; by++) for (let bx = 0; bx < gw; bx++) {
      const k = by * gw + bx;
      const u = (bx + 0.5) / gw, v = (by + 0.5) / gh;
      const s = 0.5 * (sd[k] / maxS) + 0.5 * (dist[k] / maxD);
      const prior = 0.5 * gauss(u, v, 0.5, 0.5) + 0.5 * gauss(u, v, fx, fy);
      val[k] = s * (0.35 + 0.65 * prior);
      maxV = Math.max(maxV, val[k]);
    }
    const mx = new Float64Array(gw), my = new Float64Array(gh);
    let total = 0;
    for (let by = 0; by < gh; by++) for (let bx = 0; bx < gw; bx++) {
      const w = Math.max(0, val[by * gw + bx] - SALIENT_FLOOR * maxV);
      mx[bx] += w; my[by] += w; total += w;
    }
    if (total > 0) {
      const span = (m: Float64Array): [number, number] => {
        const lo = (1 - SALIENT_MASS) / 2, hi = 1 - lo;
        let acc = 0, a = -1, b = m.length;
        for (let i = 0; i < m.length; i++) {
          acc += m[i];
          if (a < 0 && acc / total >= lo) a = i;
          if (acc / total >= hi) { b = i + 1; break; }
        }
        return [Math.max(0, a) / m.length, b / m.length];
      };
      const [x0, x1] = span(mx), [y0, y1] = span(my);
      out = { x0: r3(x0), y0: r3(y0), x1: r3(x1), y1: r3(y1) };
    }
  }
  boxCache.set(key, out);
  return out;
}

/** The narrowest part a fill may keep along the cut axis: 60% of the photo around its focus point, held inside the photo. */
export function keptWindow(focus: number): [number, number] {
  const keep = 1 - FILL_BUDGET;
  const a = Math.max(0, Math.min(1 - keep, focus - keep / 2));
  return [r3(a), r3(a + keep)];
}

export interface FillChoice {
  /** Fill the slot (a cover crop up to 40%) or keep the photo whole (the dissolve). */
  fill: boolean;
  /** The share of the photo's width or height the cover crop of THIS slot cuts (what filling costs here). */
  cut: number;
  /** Which sides the cut takes: the left and right, or the top and bottom. */
  sides: 'sides' | 'top and bottom';
  /** The share of the saliency box inside the narrowest kept part (null when the picture could not be read). */
  inside: number | null;
  box: UnitBox | null;
  /** fills: the measure said yes; subject-cut: the measure said no; on / off: the person's switch; unread: the picture could not be read (kept whole). */
  why: 'fills' | 'subject-cut' | 'on' | 'off' | 'unread';
}
/**
 * Whether a photo that a cover crop would cut by more than 25% fills its slot (layout `layout`, slot `slot`). Null when the question does not arise: not a full-bleed layout, not a photo, a
 * zoom the person chose, a cover crop within the 25% budget (it fills already) or over 40% (it stays whole), or no known size.
 */
export async function fillChoice(layout: string, slot: Box, ref: PicRef | null, src: string): Promise<FillChoice | null> {
  if (!FILL_LAYOUTS.includes(layout) || !ref || !ref.photo || ref.z > 1 || !ref.w || !ref.h) return null;
  const l = coverLoss(slot, ref);
  if (!l) return null;
  const cut = Math.max(l.w, l.h);
  if (cut <= PHOTO_CROP_BUDGET + 1e-6 || cut > FILL_BUDGET + 1e-6) return null;
  const across = l.w >= l.h; // the cut takes the sides (a photo wider than its slot) or the top and bottom
  const base = { cut: r3(cut), sides: across ? ('sides' as const) : ('top and bottom' as const) };
  const o = fillOverride(ref.id);
  const box = await salientBox(src, ref.fx, ref.fy);
  if (!box) return { ...base, fill: o === 'on', inside: null, box: null, why: o ?? 'unread' };
  const [k0, k1] = keptWindow(across ? ref.fx : ref.fy);
  const [b0, b1] = across ? [box.x0, box.x1] : [box.y0, box.y1];
  const inside = r3(Math.max(0, Math.min(b1, k1) - Math.max(b0, k0)) / Math.max(1e-9, b1 - b0));
  // the person's switch wins; the measure is still reported (the picture row says what the automatic choice would be)
  if (o) return { ...base, fill: o === 'on', inside, box, why: o };
  const ok = inside >= SALIENT_KEEP - 1e-9;
  return { ...base, fill: ok, inside, box, why: ok ? 'fills' : 'subject-cut' };
}

/** The note in plain words for a photo's choice (the picture row and the slide notes). */
export function fillSentence(c: Pick<FillChoice, 'fill' | 'cut' | 'sides' | 'why' | 'inside'>): string {
  const pct = Math.round(c.cut * 100);
  const cutOff = `${pct}% of the ${c.sides} ${pct === 1 ? 'is' : 'are'} cut off.`;
  if (c.fill && c.why === 'on' && c.inside !== null && c.inside < SALIENT_KEEP) return `Fills the slide, as you chose. ${cutOff} Part of what matters in the photo may be cut.`;
  if (c.fill) return `Fills the slide. ${cutOff}`;
  if (c.why === 'off') return 'Shown whole; its edges melt into the slide.';
  if (c.why === 'subject-cut') return `Shown whole: filling the slide would cut ${pct}% of the ${c.sides} and part of what matters in the photo. Its edges melt into the slide.`;
  return 'Shown whole; its edges melt into the slide.';
}
