// Round Q: every picture gets a second chance. After the writer's picks, the name match and the Round N shape pass, a picture no slide uses is offered to the slides that can take it, measured on
// the slide as the engine draws it (photoShape.photoFitOf), never by a fixed list. Candidates, in this order:
//   1. a slide whose layout asks for a picture but drew none (an empty picture slot: the writer chose, say, image-row and no picture fitted it), in its own layout or a sibling layout
//      that carries the same words;
//   2. a slide whose words match the picture's name (the stemmed name match of Round 18);
//   3. any other slide with no picture whose words fit a picture layout (every word kept, the layout's own budgets).
// Within a group the picture drawn largest wins (a photo drawn whole on its blurred copy counts for less; a crop over 25% is not a home); ties go to the earlier slide. Rules: one picture per
// slide; never the closing slide or a call-to-action layout; a list (stepper, numbered list, checklist ...) only in a list-with-picture layout; a screenshot never under text, never the
// cover, a tall screenshot at least 22% of the slide's width; the deck's rotation unchanged and at most 2 moved slides in one layout; the person's picked pictures and chosen layouts never
// touched. A picture with no good home stays unused. No model call, no word changed.
import type { Look } from './designed';
import type { SlideSpec } from './designLibrary';
import { pinnedPicture, TALL_SHOT_SMALL, usedIds, withoutImages } from './imagePlace';
import { fieldsFor, keepsText, type PictureSwap } from './picturePass';
import { nameScore, slideText } from './pictureNames';
import { CROP_BUDGET, PHOTO_CROP_BUDGET } from './layouts/pictureFit';
import { IMAGE_LAYOUT_IDS, TEXT_OVER_PICTURE, hasEnoughPictures, imageSlotsOf, imagesNeeded, isScreenshot, makeRef, type PicInfo } from './layouts/images';
import type { Fields } from './layouts';
import { layoutDef } from './layouts/library';
import { validateSlideContent } from './layouts/pick';
import { SHAPE_KEEP_SHARE, SHAPE_SAME_MAX, SHAPE_TARGETS, TALL_SHOT_MIN, TALL_SHOT_TARGETS, isTallShot, photoFitOf, shapeScore, type PhotoFit, type ShapeDraw, type ShapeRotate } from './photoShape';

/** The list layouts: a picture goes with them only as a list-with-picture layout. */
export const RESCUE_LISTS = ['stepper', 'numbered-list', 'checklist', 'numbered-stagger', 'bullet-list', 'pill-stagger', 'step-numeral', 'listicle-numeral'];
export const LIST_WITH_PICTURE = ['list-under-band', 'list-beside-picture'];
/** Never a home for a rescued picture: the closing and the calls to action. */
const isClosing = (layout: string) => /^cta|closing/.test(layout);

export interface RescueRow {
  picture: string;
  /** Where it went (null: it stays unused). */
  slide: number | null;
  from: string | null;
  layout: string | null;
  fit: PhotoFit | null;
  /** 1 an empty picture slot, 2 a name match, 3 a slide whose words fit a picture layout. */
  group: 1 | 2 | 3 | null;
  why: string;
}

const HEADS = ['headline', 'title', 'heading', 'question'];
/**
 * The fix at the cause of an empty picture slot: the writer chose a picture layout (image-row: a headline, a subline and a paragraph) that no picture fits. A sibling picture layout with one
 * headline and one body carries the SAME words: the headline stays the headline, the other lines go into the body, in their order, joined with a space (a line with no end mark gets a full
 * stop). Nothing is cut or reworded; the target layout's own limits are checked. Null when it does not fit.
 */
export function mergeIntoSibling(base: Fields, to: string): Fields | null {
  const def = layoutDef(to);
  if (!def) return null;
  const headKey = HEADS.find((k) => typeof base[k] === 'string' && (base[k] as string).trim());
  if (!headKey || Object.values(base).some((v) => Array.isArray(v))) return null;
  const head = def.fields.find((x) => !x.image && !x.list && HEADS.includes(x.name));
  const body = def.fields.filter((x) => !x.image && !x.list && x !== head).sort((a, b) => b.max - a.max)[0];
  if (!head) return null;
  const rest = Object.entries(base).filter(([k, v]) => k !== headKey && k !== 'accent' && typeof v === 'string' && v.trim()).map(([, v]) => (v as string).trim());
  if (rest.length && !body) return null;
  const joined = rest.map((t) => (/[.!?…:]["”’)]*$/.test(t) ? t : t + '.')).join(' ');
  const out: Fields = { [head.name]: (base[headKey] as string).trim(), ...(rest.length ? { [body!.name]: joined } : {}) };
  return validateSlideContent(to, out).ok ? out : null;
}

/** Is this a good home: the picture fills its slot within the budget, or drawn whole it covers 55% of the slot; a tall screenshot at least 22% of the slide's width. */
function goodHome(fit: PhotoFit, p: PicInfo): boolean {
  if (isTallShot(p)) return fit.widthShare >= TALL_SHOT_MIN;
  if (fit.whole) return fit.slotShare >= SHAPE_KEEP_SHARE;
  return fit.crop <= (isScreenshot(p) ? CROP_BUDGET : PHOTO_CROP_BUDGET) + 1e-6;
}

export async function rescuePass(specs0: SlideSpec[], look: Look, draw: ShapeDraw, rotate: ShapeRotate): Promise<{ specs: SlideSpec[]; swaps: PictureSwap[]; rows: RescueRow[]; moved: number[] }> {
  let specs = specs0.map((s) => ({ ...s }));
  const pics = (look.images ?? []) as PicInfo[];
  const swaps: PictureSwap[] = [];
  const rows: RescueRow[] = [];
  const moved: number[] = [];
  if (!pics.length) return { specs, swaps, rows, moved };
  const used = new Set(specs.flatMap((s) => usedIds(s.fields)));
  const movedTo: Record<string, number> = {};
  for (const p of pics.filter((q) => !used.has(q.id))) {
    const look1: Look = { ...look, images: [p], hasPhoto: true };
    const ref = makeRef({ id: p.id, w: p.width, h: p.height, ...(isTallShot(p) ? { fy: 0.1 } : {}), ...(p.content === 'photo' ? { photo: true } : {}) });
    const rot0 = rotate(specs);
    type Cand = { group: 1 | 2 | 3; i: number; fit: PhotoFit; spec: SlideSpec };
    const cands: Cand[] = [];
    for (let i = 0; i < specs.length; i++) {
      const sp = specs[i];
      if (pinnedPicture(sp) || sp.pin?.layout) continue; // the person's picture or layout, a named or shaped slide
      if (usedIds(sp.fields).length) continue; // one picture per slide
      if (i === specs.length - 1 || isClosing(sp.layout)) continue; // never the closing
      if (i === 0 && isScreenshot(p)) continue; // a screenshot is never the cover
      const emptySlot = (IMAGE_LAYOUT_IDS as readonly string[]).includes(sp.layout);
      const group: 1 | 2 | 3 = emptySlot ? 1 : p.label?.trim() && nameScore(p.label, slideText(sp)) >= 1 ? 2 : 3;
      const isList = RESCUE_LISTS.includes(sp.layout) || LIST_WITH_PICTURE.includes(sp.layout);
      const targets = [...new Set([...(emptySlot ? [sp.layout] : []), ...(isList ? LIST_WITH_PICTURE : [...SHAPE_TARGETS, ...(isTallShot(p) ? TALL_SHOT_TARGETS : [])])])];
      const base: SlideSpec = { ...sp, fields: withoutImages(sp.fields) as Fields };
      for (const to of targets) {
        if (isList && !LIST_WITH_PICTURE.includes(to)) continue;
        if (isScreenshot(p) && TEXT_OVER_PICTURE.includes(to)) continue; // never under text
        if (isTallShot(p) && TALL_SHOT_SMALL.includes(to)) continue;
        if (imagesNeeded(to) !== 1 || imageSlotsOf(to).length !== 1) continue;
        if (to !== sp.layout && (movedTo[to] ?? 0) >= SHAPE_SAME_MAX) continue;
        // (an empty picture slot may also move to a sibling layout with the headline and the other lines in its body: every word kept)
        const f = to === sp.layout ? (base.fields as Fields) : fieldsFor(base, to, look1) ?? (emptySlot ? mergeIntoSibling(base.fields as Fields, to) : null);
        if (!f || !keepsText(base.fields, f)) continue;
        const trial = specs.map((s, k) => (k === i ? ({ ...s, layout: to } as SlideSpec) : s));
        const rot = rotate(trial);
        if ([...rot.repeats.keys()].some((k) => !rot0.repeats.has(k))) continue; // a neighbour in the same layout, or a third use
        const vr = (rot.variants[i] ?? 0) as 0 | 1;
        for (const v of [vr, (1 - vr) as 0 | 1]) {
          if (!hasEnoughPictures(to, [p], v)) continue;
          const slot = imageSlotsOf(to, v)[0];
          const pin = v === vr ? sp.pin : { ...sp.pin, variant: v };
          const spec: SlideSpec = { ...sp, layout: to, fields: { ...withoutImages(f), [slot.field]: ref } as Fields, density: to === sp.layout ? sp.density : undefined, variant: undefined, shaped: p.id, pictureUpgrade: undefined, ...(pin ? { pin } : {}) };
          const im = await draw(spec, i, v, trial.map((s, k) => (k === i ? spec : s)));
          const fit = im ? photoFitOf(im, p.id, to, v) : null;
          if (fit && goodHome(fit, p)) cands.push({ group, i, fit, spec });
        }
      }
    }
    const name = p.label?.trim() ? `"${p.label.trim()}"` : `picture ${pics.indexOf(p) + 1}`;
    if (!cands.length) {
      rows.push({ picture: p.id, slide: null, from: null, layout: null, fit: null, group: null, why: `${name} stays unused: no slide without a picture can show it well with every word kept` });
      continue;
    }
    cands.sort((a, b) => a.group - b.group || shapeScore(b.fit) - shapeScore(a.fit) || a.i - b.i);
    const best = cands[0];
    const from = specs[best.i].layout;
    if (best.spec.layout !== from) movedTo[best.spec.layout] = (movedTo[best.spec.layout] ?? 0) + 1;
    const where = ['', 'its picture slot was empty', 'its words match the name', 'its words fit a picture layout'][best.group];
    const why = `${name} was not used: slide ${best.i + 1} (${where}) shows it as "${best.spec.layout}", ${best.fit.whole ? `whole on ${Math.round(best.fit.slotShare * 100)}% of its slot` : `${Math.round(best.fit.crop * 100)}% cut`}, every word kept`;
    swaps.push({ slide: best.i + 1, from, to: best.spec.layout, why: 'unused picture: ' + why });
    rows.push({ picture: p.id, slide: best.i + 1, from, layout: best.spec.layout, fit: best.fit, group: best.group, why });
    moved.push(best.i);
    specs = specs.map((s, k) => (k === best.i ? best.spec : s));
  }
  return { specs, swaps, rows, moved };
}
