// Round N: a photo goes where it looks good. The automatic placement (at generation, and what "Auto" in the picture picker brings back) measures, on the slide the code really draws, how much of
// its slot a photo fills and how much of the photo a cover-crop cuts, for the slide's own layout and for every picture layout that carries the SAME words (every word kept, the layout's own
// budgets and minimum sizes, the deck's rotation rules). A photo that fills its slot within the 25% crop budget, or is drawn whole and still covers 55% of its slot, stays where it is. Otherwise
// the slide moves to the layout where the photo is drawn largest within the budget (a photo drawn whole on its blurred copy counts for less). No model call; a screenshot is never moved by this
// rule; a slide whose picture or layout the person chose is never changed.
import type { Look } from './designed';
import type { SlideSpec } from './designLibrary';
import { TALL_SHOT_SMALL, withoutImages } from './imagePlace';
import { fieldsFor, keepsText, type PictureSwap } from './picturePass';
import { containRect, coverLoss, needsContain, PHOTO_CROP_BUDGET } from './layouts/pictureFit';
import { TEXT_OVER_PICTURE, hasEnoughPictures, imageSlotsOf, imagesNeeded, isScreenshot, makeRef, parseRef, type PicInfo } from './layouts/images';
import type { Fields } from './layouts';
import type { PlanImage } from './layouts/types';

/** A photo drawn whole still looks right when it covers this share of its slot. */
export const SHAPE_KEEP_SHARE = 0.55;
/** A photo drawn whole (on its blurred copy) counts for this much of its size when the layouts are compared. */
export const SHAPE_WHOLE_WEIGHT = 0.85;
/** Two layouts within this share of each other are a tie (the writer's choice wins, then the layout the deck uses least). */
export const SHAPE_TIE = 0.03;
/** The picture layouts a photo slide may move to (each takes one picture). The list is only where to look: the measurement decides. */
export const SHAPE_TARGETS = ['split-half', 'title-over-photo', 'headline-body-image', 'photo-full-caption', 'list-under-band', 'list-beside-picture', 'photo-cover', 'cover-art', 'art-side-text'];
/** A photo drawn whole that still covers 55% of its slot moves only to a layout that fills its slot with it at least this much larger. */
export const SHAPE_BIGGER = 1.15;
/** Round N part 4: a screenshot this narrow (width / height) is a tall screenshot (a phone screen). */
export const TALL_SHOT_ASPECT = 0.62;
/** Round N part 4: a tall screenshot drawn narrower than this share of the slide's width is too small to read: the code never places it so, the picker refuses it. */
export const TALL_SHOT_MIN = 0.22;
/** Round N part 4: the layouts a slide with a tall screenshot may move to (the measurement decides; never a layout with text over the picture). */
export const TALL_SHOT_TARGETS = ['phone-frame', 'split-half', 'list-beside-picture', 'art-side-text', 'headline-body-image', 'photo-full-caption', 'cover-art', 'photo-cover', 'portrait-closing'];
/** Round N part 4: is this picture a tall screenshot? */
export const isTallShot = (p: { width: number; height: number; content?: string }): boolean => isScreenshot(p) && p.width / p.height <= TALL_SHOT_ASPECT;
/** Round N part 4: is the picture `id` drawn under 22% of the slide's width among a built slide's pictures? */
export const tallShotTooSmall = (images: DrawnPicture[] | undefined, id: string): boolean => {
  const fit = photoFitOf(images, id, '', 0);
  return !!fit && fit.widthShare < TALL_SHOT_MIN;
};
/** The message the picker shows when it refuses a tall screenshot for a layout that draws it too small. */
export const TALL_SHOT_REFUSAL = 'A tall screenshot is too small in this layout; try Split or Phone frame.';
/** The marker of a slide the rule left with no picture (a tall screenshot it could not draw large enough anywhere): the placement leaves the slide as it is. */
export const SHAPED_NONE = 'none';
/** At most this many slides moved by this rule may end up in the same layout. */
export const SHAPE_SAME_MAX = 2;

export interface PhotoFit {
  layout: string;
  variant: 0 | 1;
  /** Share of the picture slot the photo covers (1 when it is cover-cropped). */
  slotShare: number;
  /** Share of the slide the photo covers. */
  slideShare: number;
  /** Share of the photo's width or height a cover-crop cuts (0 when drawn whole). */
  crop: number;
  /** Drawn whole, on a blurred copy of itself. */
  whole: boolean;
  /** Round N part 4: the share of the slide's width the picture is drawn at (a tall screenshot needs at least 22%). */
  widthShare: number;
}
const SLIDE = 1080 * 1350;
/** A picture as a built slide holds it (its slot after the chrome moved it). */
export type DrawnPicture = Pick<PlanImage, 'src' | 'x' | 'y' | 'w' | 'h'> & { rx?: number; circle?: boolean };
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** How the photo `id` is drawn among the built slide's pictures (their slots after the chrome moved them), measured from the geometry the engine draws. Null when it is not there. */
export function photoFitOf(images: DrawnPicture[] | undefined, id: string, layout: string, variant: 0 | 1): PhotoFit | null {
  const p = (images ?? []).find((q) => parseRef(q.src)?.id === id);
  const ref = p ? parseRef(p.src) : null;
  if (!p || !ref || !ref.w || !ref.h || p.circle) return null;
  const slot = p.w * p.h;
  if (needsContain(p, ref)) {
    const c = containRect(p, ref, p.rx);
    return { layout, variant, slotShare: r3((c.w * c.h) / slot), slideShare: r3((c.w * c.h) / SLIDE), crop: 0, whole: true, widthShare: r3(c.w / 1080) };
  }
  const l = coverLoss(p, ref);
  return { layout, variant, slotShare: 1, slideShare: r3(slot / SLIDE), crop: r3(l ? Math.max(l.w, l.h) : 0), whole: false, widthShare: r3(p.w / 1080) };
}
/** The rule that keeps the writer's layout: the photo fills its slot within the budget, or drawn whole it still covers 55% of the slot. */
export const looksRight = (f: PhotoFit): boolean => (f.whole ? f.slotShare >= SHAPE_KEEP_SHARE : f.crop <= PHOTO_CROP_BUDGET + 1e-6);
/** What the comparison ranks by: the share of the slide the photo covers, a photo drawn whole counting for less. */
export const shapeScore = (f: PhotoFit): number => f.slideShare * (f.whole ? SHAPE_WHOLE_WEIGHT : 1);

export interface ShapeRow {
  slide: number;
  picture: string;
  before: PhotoFit;
  after: PhotoFit;
  /** What was decided, in plain words. */
  why: string;
}
/** The drawing the pass measures with: the built slide's pictures for a spec in a variant, or null when the slide cannot be drawn (a text that does not fit, a broken minimum size). */
export type ShapeDraw = (spec: SlideSpec, index: number, variant: 0 | 1, deck: SlideSpec[]) => Promise<PlanImage[] | null>;
/** The deck's rotation for a list of slides: each slide's variant, and the slides whose layout the rotation would change (a repeat, a layout used more than twice). */
export type ShapeRotate = (specs: SlideSpec[]) => { variants: (0 | 1)[]; repeats: { has(i: number): boolean; keys(): IterableIterator<number> } };

/**
 * The pass. `specs` are the slides WITH the pictures the placement gave them. A slide that is moved keeps its photo (`shaped` holds its id, so the placement leaves it there). Returns the new
 * specs, the swaps (for the report and the notes) and one row per photo slide.
 */
export async function shapePass(specs0: SlideSpec[], look: Look, draw: ShapeDraw, rotate: ShapeRotate): Promise<{ specs: SlideSpec[]; swaps: PictureSwap[]; rows: ShapeRow[]; moved: number[] }> {
  let specs = specs0.map((s) => ({ ...s }));
  const swaps: PictureSwap[] = [];
  const rows: ShapeRow[] = [];
  const pics = (look.images ?? []) as PicInfo[];
  if (!pics.length) return { specs, swaps, rows, moved: [] };
  const movedTo: Record<string, number> = {};
  const moved: number[] = [];
  // Round N part 4: a tall screenshot drawn under 22% of the slide's width moves to the layout that draws it widest (every word kept, never under text); when none draws it at 22% or more,
  // the slide keeps its text-only form (the code does not put a screenshot where it cannot be read)
  const tallShot = async (i: number, sp: SlideSpec, pic: PicInfo, refStr: string): Promise<ShapeRow | null> => {
    const rot0 = rotate(specs);
    const v0 = rot0.variants[i] ?? 0;
    const im0 = await draw(sp, i, v0, specs);
    const before = im0 ? photoFitOf(im0, pic.id, sp.layout, v0) : null;
    if (!before) return null;
    if (before.widthShare >= TALL_SHOT_MIN && !TALL_SHOT_SMALL.includes(sp.layout)) return { slide: i + 1, picture: pic.id, before, after: before, why: `kept: the tall screenshot is drawn at ${Math.round(before.widthShare * 100)}% of the slide's width` };
    const base: SlideSpec = { ...sp, fields: withoutImages(sp.fields) as Fields };
    const look1: Look = { ...look, images: [pic], hasPhoto: true };
    let pick: { fit: PhotoFit; spec: SlideSpec } | null = null;
    for (const to of TALL_SHOT_TARGETS) {
      if (to === sp.layout || TEXT_OVER_PICTURE.includes(to) || imagesNeeded(to) !== 1 || imageSlotsOf(to).length !== 1 || (movedTo[to] ?? 0) >= SHAPE_SAME_MAX) continue;
      const f = fieldsFor(base, to, look1);
      if (!f || !keepsText(base.fields, f)) continue;
      const trial = specs.map((s, k) => (k === i ? ({ ...s, layout: to } as SlideSpec) : s));
      const rot = rotate(trial);
      if ([...rot.repeats.keys()].some((k) => !rot0.repeats.has(k))) continue;
      const vr = (rot.variants[i] ?? 0) as 0 | 1;
      for (const v of [vr, (1 - vr) as 0 | 1]) {
        if (!hasEnoughPictures(to, [pic], v)) continue;
        const slot = imageSlotsOf(to, v)[0];
        const pin = v === vr ? sp.pin : { ...sp.pin, variant: v };
        const spec: SlideSpec = { ...sp, layout: to, fields: { ...withoutImages(f), [slot.field]: refStr } as Fields, density: undefined, variant: undefined, shaped: pic.id, pictureUpgrade: undefined, ...(pin ? { pin } : {}) };
        const im = await draw(spec, i, v, trial.map((s, k) => (k === i ? spec : s)));
        const fit = im ? photoFitOf(im, pic.id, to, v) : null;
        if (fit && fit.widthShare >= TALL_SHOT_MIN && (!pick || fit.widthShare > pick.fit.widthShare)) pick = { fit, spec };
      }
    }
    const was = `the tall screenshot was drawn at ${Math.round(before.widthShare * 100)}% of the slide's width in "${sp.layout}"`;
    moved.push(i);
    if (pick) {
      const p = pick;
      movedTo[p.spec.layout] = (movedTo[p.spec.layout] ?? 0) + 1;
      const why = `${was}; "${p.spec.layout}" draws it at ${Math.round(p.fit.widthShare * 100)}%, every word kept`;
      swaps.push({ slide: i + 1, from: sp.layout, to: p.spec.layout, why: 'tall screenshot: ' + why });
      specs = specs.map((s, k) => (k === i ? p.spec : s));
      return { slide: i + 1, picture: pic.id, before, after: p.fit, why: 'moved: ' + why };
    }
    const why = `${was}, and no layout that keeps every word draws it at 22% or more: the slide keeps its text-only form`;
    swaps.push({ slide: i + 1, from: sp.layout, to: sp.layout, why: 'tall screenshot: ' + why });
    specs = specs.map((s, k) => (k === i ? { ...base, shaped: SHAPED_NONE } : s));
    return { slide: i + 1, picture: pic.id, before, after: { ...before, slotShare: 0, slideShare: 0, widthShare: 0 }, why: 'removed: ' + why };
  };
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    // the person's choices: a picture they picked (or none), a layout they chose in the Layout tab
    if (sp.pin?.picture !== undefined || sp.pin?.layout) continue;
    const slots = imageSlotsOf(sp.layout);
    if (slots.length !== 1 || imagesNeeded(sp.layout) !== 1) continue;
    const ref = parseRef(sp.fields[slots[0].field]) ?? parseRef(sp.fields[imageSlotsOf(sp.layout, 1)[0]?.field ?? '']);
    const pic = ref ? pics.find((p) => p.id === ref.id) : undefined;
    if (ref && pic && isTallShot(pic) && ref.z <= 1) {
      const t = await tallShot(i, sp, pic, String(sp.fields[slots[0].field]));
      if (t) rows.push(t);
      continue;
    }
    if (!ref || !pic || isScreenshot(pic) || !ref.photo || ref.z > 1) continue;
    const rot0 = rotate(specs);
    const v0 = rot0.variants[i] ?? 0;
    const im0 = await draw(sp, i, v0, specs);
    const before = im0 ? photoFitOf(im0, pic.id, sp.layout, v0) : null;
    if (!before) continue;
    if (looksRight(before) && !before.whole) {
      rows.push({ slide: i + 1, picture: pic.id, before, after: before, why: `kept: it fills its slot with ${Math.round(before.crop * 100)}% cut` });
      continue;
    }
    // a photo drawn whole that still covers 55% of its slot keeps the writer's layout, unless a layout fills its slot within the budget and shows it at least 15% larger
    const keepWhole = looksRight(before);
    // every picture layout that carries the same words, takes this photo, and keeps the deck's rotation as it is
    const base: SlideSpec = { ...sp, fields: withoutImages(sp.fields) as Fields };
    const look1: Look = { ...look, images: [pic], hasPhoto: true };
    const refStr = String(sp.fields[slots[0].field] ?? makeRef({ id: pic.id, w: pic.width, h: pic.height, photo: true }));
    type Cand = { fit: PhotoFit; spec: SlideSpec };
    const cands: Cand[] = [{ fit: before, spec: sp }];
    // each layout in the variant the deck's rotation gives it, and in its other variant (pinned on the slide, as the hero rule pins one)
    for (const to of [sp.layout, ...SHAPE_TARGETS.filter((t) => t !== sp.layout)]) {
      if (imagesNeeded(to) !== 1 || imageSlotsOf(to).length !== 1) continue;
      if (to !== sp.layout && (movedTo[to] ?? 0) >= SHAPE_SAME_MAX) continue;
      const f = to === sp.layout ? (base.fields as Fields) : fieldsFor(base, to, look1);
      if (!f || !keepsText(base.fields, f)) continue;
      const trial = specs.map((s, k) => (k === i ? ({ ...s, layout: to } as SlideSpec) : s));
      const rot = rotate(trial);
      if ([...rot.repeats.keys()].some((k) => !rot0.repeats.has(k))) continue; // a neighbour in the same layout, or a third use: the rotation would change it
      const vr = (rot.variants[i] ?? 0) as 0 | 1;
      for (const v of [vr, (1 - vr) as 0 | 1]) {
        if (to === sp.layout && v === v0) continue;
        if (!hasEnoughPictures(to, [pic], v)) continue;
        const slot = imageSlotsOf(to, v)[0];
        const pin = v === vr ? sp.pin : { ...sp.pin, variant: v };
        const spec: SlideSpec = { ...sp, layout: to, fields: { ...withoutImages(f), [slot.field]: refStr } as Fields, density: to === sp.layout ? sp.density : undefined, variant: undefined, shaped: pic.id, pictureUpgrade: undefined, ...(pin ? { pin } : {}) };
        const im = await draw(spec, i, v, trial.map((s, k) => (k === i ? spec : s)));
        const fit = im ? photoFitOf(im, pic.id, to, v) : null;
        if (!fit || fit.crop > PHOTO_CROP_BUDGET + 1e-6) continue;
        cands.push({ fit, spec });
      }
    }
    if (keepWhole) {
      const bigger = cands.filter((c) => c.spec !== sp && !c.fit.whole && c.fit.slideShare >= before.slideShare * SHAPE_BIGGER);
      if (!bigger.length) {
        rows.push({ slide: i + 1, picture: pic.id, before, after: before, why: `kept: drawn whole it still covers ${Math.round(before.slotShare * 100)}% of its slot, and no layout that keeps every word fills a slot with it at least 15% larger` });
        continue;
      }
      cands.splice(0, cands.length, { fit: before, spec: sp }, ...bigger);
    }
    const uses = (l: string) => specs.filter((q) => q.layout === l).length;
    const best = Math.max(...cands.map((c) => shapeScore(c.fit)));
    // the largest; within a tie, the writer's choice (its layout, then its variant), then the layout the deck uses least
    const top = cands.filter((c) => shapeScore(c.fit) >= best * (1 - SHAPE_TIE));
    const own = (c: Cand) => (c.spec === sp ? 0 : c.spec.layout === sp.layout ? 1 : 2);
    top.sort((a, b) => own(a) - own(b) || uses(a.spec.layout) - uses(b.spec.layout) || shapeScore(b.fit) - shapeScore(a.fit));
    const pick = top[0];
    if (pick.spec === sp) {
      rows.push({ slide: i + 1, picture: pic.id, before, after: before, why: 'kept: no layout that keeps every word shows this photo larger' });
      continue;
    }
    if (pick.spec.layout !== sp.layout) movedTo[pick.spec.layout] = (movedTo[pick.spec.layout] ?? 0) + 1;
    const where = pick.spec.layout === sp.layout ? 'its other variant' : `"${pick.spec.layout}"`;
    const why = `the photo was ${before.whole ? `drawn whole on ${Math.round(before.slotShare * 100)}% of its slot` : `cut by ${Math.round(before.crop * 100)}%`} in "${sp.layout}"; ${where} shows it ${Math.round((pick.fit.slideShare / before.slideShare - 1) * 100)}% larger${pick.fit.whole ? ' (whole)' : `, ${Math.round(pick.fit.crop * 100)}% cut`}, every word kept`;
    swaps.push({ slide: i + 1, from: sp.layout, to: pick.spec.layout, why: 'photo shape: ' + why });
    rows.push({ slide: i + 1, picture: pic.id, before, after: pick.fit, why: 'moved: ' + why });
    moved.push(i);
    specs = specs.map((s, k) => (k === i ? pick.spec : s));
  }
  return { specs, swaps, rows, moved };
}
/** A slide the shape rule moved keeps its photo: the placement treats it as placed. */
export const shapedPicture = (sp: { shaped?: string }): boolean => !!sp.shaped;
