// Placing the project's pictures into the picture slots of a deck, by code (no model call, no pixels read): the writer only chooses layouts. For each slide whose layout has picture slots,
// each slot takes the unused picture that fits it best (the orientation its slot accepts, then the nearest shape, then the order the pictures were added); a picture is used at most once in
// the deck; a layout that cannot get enough fitting pictures is left with no picture field, so the slide is drawn in the layout's text-only form (never an empty box).
// A picture is stored as a reference ("picture:<id>#w=..&h=..&fx=..&fy=..&z=..": the natural size, the focus point and the zoom): the spec stays small, and the pictures themselves stay in the browser's storage.
import './layouts/library'; // the registry loads first (images.ts and library.ts import each other)
import { IMAGE_KEYS, imageSlotsOf, imagesNeeded, makeRef, parseRef, picAspect, picOrientation, type PicInfo } from './layouts/images';
import type { Fields } from './layouts';

export interface PlaceableSpec {
  layout: string;
  fields: Fields;
}
const cost = (p: PicInfo, aspect: number, accepts: string[], orientation: string) => Math.abs(Math.log(picAspect(p) / aspect)) + (accepts.includes(picOrientation(p)) ? 0 : 5) + (picOrientation(p) === orientation ? 0 : 0.15);
/** How far a picture's shape may be from its slot's before the cover crop is called bad: ln(ratio) 0.6 keeps at least 55% of the picture. */
export const CROP_OK = 0.6;
const acceptable = (p: PicInfo, s: { aspect: number; accepts: string[] }) => s.accepts.includes(picOrientation(p)) && Math.abs(Math.log(picAspect(p) / s.aspect)) <= CROP_OK;

/** The fields of a slide without its picture fields. */
export const withoutImages = (f: Fields): Fields => Object.fromEntries(Object.entries(f).filter(([k]) => !(IMAGE_KEYS as readonly string[]).includes(k))) as Fields;
/** The ids of the project pictures a slide uses. */
export const usedIds = (f: Fields): string[] => (IMAGE_KEYS as readonly string[]).map((k) => parseRef(f[k])?.id).filter((x): x is string => !!x);

/**
 * The picture fields for ONE slide: slots take pictures from `free` (in the order the pictures were added). Upload order is honoured: a slot takes the FIRST free picture that is acceptable
 * for it (an orientation the slot accepts, and a shape that does not crop badly); only when none is acceptable does it take the best fit (orientation first, then the nearest shape).
 * A slide with several slots prefers pictures of ONE orientation (a pair of portraits, a row of three landscapes) when such a set exists. Null when fewer than the layout needs fit
 * (the slide then has no picture field).
 */
export function placeOne(layout: string, variant: 0 | 1, free: PicInfo[]): Fields | null {
  const slots = imageSlotsOf(layout, variant);
  if (!slots.length) return null;
  const need = imagesNeeded(layout);
  const fill = (pool: PicInfo[]): { picked: string[]; fields: Fields } => {
    const left = [...pool];
    const picked: string[] = [];
    const fields: Fields = {};
    for (const s of slots) {
      let best = left.find((p) => acceptable(p, s));
      if (!best) {
        const ranked = left.map((p, order) => ({ p, order, c: cost(p, s.aspect, s.accepts, s.orientation) })).filter((q) => q.c < 5).sort((x, y) => x.c - y.c || x.order - y.order);
        best = ranked[0]?.p;
      }
      if (!best) break;
      left.splice(left.indexOf(best), 1);
      fields[s.field] = makeRef({ id: best.id, w: best.width, h: best.height });
      picked.push(best.id);
    }
    return { picked, fields };
  };
  const mix = fill(free);
  // several slots: a set of one orientation first (the earliest-added set), when it fills as many slots as the mix would and every picture in it is acceptable for its slot
  if (slots.length >= 2) {
    const groups = (['landscape', 'portrait', 'square'] as const).map((o) => free.filter((p) => picOrientation(p) === o)).filter((g) => g.length >= need);
    groups.sort((x, y) => free.indexOf(x[0]) - free.indexOf(y[0]));
    for (const g of groups) {
      const r = fill(g);
      if (r.picked.length >= need && r.picked.length >= mix.picked.length && r.picked.every((id, i) => acceptable(g.find((q) => q.id === id)!, slots[i]))) return r.fields;
    }
  }
  return mix.picked.length >= need ? mix.fields : null;
}

/** Assigns pictures to every picture slide of the deck, in slide order; slides that cannot get enough pictures keep none. Returns new specs. */
export function placeImages<T extends PlaceableSpec>(specs: T[], variants: (0 | 1)[], pics: PicInfo[]): T[] {
  const used = new Set<string>();
  return specs.map((sp, i) => {
    const base = withoutImages(sp.fields);
    if (!imageSlotsOf(sp.layout).length) return sp;
    const got = placeOne(sp.layout, variants[i] ?? 0, pics.filter((p) => !used.has(p.id)));
    if (!got) return { ...sp, fields: base };
    usedIds(got).forEach((id) => used.add(id));
    return { ...sp, fields: { ...base, ...got } };
  });
}

/** The pictures no slide of the deck uses (candidates for a replacement), in the order they were added. */
export const unusedPictures = (specs: PlaceableSpec[], pics: PicInfo[], exceptSlide = -1): PicInfo[] => {
  const used = new Set(specs.flatMap((s, i) => (i === exceptSlide ? [] : usedIds(s.fields))));
  return pics.filter((p) => !used.has(p.id));
};
/** A deck without the references to pictures that are gone from the project (a removed picture): the slide goes back to its text-only form. */
export function dropMissing<T extends PlaceableSpec>(specs: T[], exists: (id: string) => boolean): T[] {
  return specs.map((sp) => {
    const ids = usedIds(sp.fields);
    return ids.length && ids.some((id) => !exists(id)) ? { ...sp, fields: withoutImages(sp.fields) } : sp;
  });
}
