// Round R: photo slides. When the writer made fewer slides than the person asked for and photos are still unused after every placement pass (the writer's picks, the name match, the
// picture pass, the shape pass, the rescue), the code adds picture-only slides (layouts/photoOnly.ts) for them: at most as many as the slides that were not made, never past the platform's
// cap or the app's maximum of 10. A photo slide carries no text at all. Pure code, no model call.
//  - Which photos: the unused photos (never a screenshot: a screenshot goes on a photo slide only when the person pins it there), in the order they were added, grouped by shape.
//  - Which layout: measured on the cells each layout gives the photos (photoOnly.photoCells): every cell cover-crops its photo inside the 25% budget and covers at least 90% of its share of the
//    photo area. Of the plans that are measured to work, the one that uses the most photos wins, then the one with the fewest slides, then the one that shows the photos largest.
//    (Two landscape photos fill a pair; two portrait photos do not (each covers 56% of its half), so each gets its own slide or, with three or more, a grid.)
//  - Where: never slide 1 and never after the closing; not next to another picture slide where that can be avoided; next to the slide whose words match a photo's name (the stemmed name
//    match of Round 18); otherwise spread evenly between the text slides.
import type { SlideSpec } from './designLibrary';
import { usedIds } from './imagePlace';
import { nameScore, slideText } from './pictureNames';
import { isScreenshot, makeRef, picAspect, picOrientation, type PicInfo } from './layouts/images';
import { PHOTO_ONLY_COUNT, isPhotoOnly, photoCells, type PhotoOnlyId } from './layouts/photoOnly';
import { photoFitOf, type DrawnPicture } from './photoShape';
import { PHOTO_CROP_BUDGET } from './layouts/pictureFit';
import type { LayoutStyle } from './layouts';

/** A photo must cover at least this share of its part of the photo area (a portrait photo in a landscape half covers 56%: no). */
export const PHOTO_CELL_FILL = 0.9;
/** The app's maximum number of slides. */
export const SLIDES_MAX = 10;
const SLIDE = 1080 * 1350;
const KEYS = ['image', 'image2', 'image3', 'image4'];

export interface PhotoSlideAdded {
  /** Where the slide is in the final deck (1-based). */
  slide: number;
  layout: PhotoOnlyId;
  /** The pictures on it (ids, in the order they were added) and the names the person gave them ("picture N" for a picture with no name). */
  pictures: string[];
  names: string[];
  /** Share of the slide each photo covers, and the crop of each (share of its width or height cut). */
  shares: number[];
  crops: number[];
  /** Why it sits there. */
  why: string;
}
interface Option { layout: PhotoOnlyId; pics: PicInfo[]; share: number }
/** The plan of one photo slide for these photos, measured: null when a cell crops over the budget or covers less than 90% of its share of the photo area. */
export function measureOption(layout: PhotoOnlyId, pics: PicInfo[], st: LayoutStyle): Option | null {
  const [lo, hi] = PHOTO_ONLY_COUNT[layout];
  if (pics.length < lo || pics.length > hi) return null;
  const cells = photoCells(layout, pics.map(picAspect), st);
  if (cells.length !== pics.length) return null;
  let share = 0;
  for (let i = 0; i < pics.length; i++) {
    const { cell, box } = cells[i];
    const a = picAspect(pics[i]), c = cell.w / cell.h;
    const crop = c > a ? 1 - a / c : 1 - c / a;
    if (crop > PHOTO_CROP_BUDGET + 1e-6) return null;
    if ((cell.w * cell.h) / (box.w * box.h) < PHOTO_CELL_FILL) return null;
    share += (cell.w * cell.h) / SLIDE;
  }
  return { layout, pics, share };
}
/** The best set of photo slides for the photos left, at most `spare` slides: the most photos, then the fewest slides, then the largest photos. Photos of one shape go together, in upload order. */
export function choosePhotoSlides(left: PicInfo[], spare: number, st: LayoutStyle): Option[] {
  if (spare <= 0 || !left.length) return [];
  const groups: PicInfo[][] = [];
  for (const p of left) {
    const g = groups.find((x) => picOrientation(x[0]) === picOrientation(p));
    if (g) g.push(p); else groups.push([p]);
  }
  type Best = { used: number; slides: number; share: number; plan: Option[] };
  const better = (a: Best, b: Best | null) => !b || a.used > b.used || (a.used === b.used && (a.slides < b.slides || (a.slides === b.slides && a.share > b.share + 1e-9)));
  let best: Best | null = null;
  const search = (rest: PicInfo[][], slides: number, plan: Option[]) => {
    const now: Best = { used: plan.reduce((s, o) => s + o.pics.length, 0), slides: plan.length, share: plan.reduce((s, o) => s + o.share, 0), plan };
    if (better(now, best)) best = now;
    if (slides <= 0) return;
    rest.forEach((g, gi) => {
      if (!g.length) return;
      for (const layout of ['photo-full', 'photo-pair', 'photo-quad'] as PhotoOnlyId[]) {
        for (let k = PHOTO_ONLY_COUNT[layout][0]; k <= Math.min(PHOTO_ONLY_COUNT[layout][1], g.length); k++) {
          const o = measureOption(layout, g.slice(0, k), st);
          if (o) search(rest.map((x, j) => (j === gi ? x.slice(k) : x)), slides - 1, [...plan, o]);
        }
      }
    });
  };
  search(groups, spare, []);
  const order = (o: Option) => left.indexOf(o.pics[0]);
  return [...(best as Best | null)?.plan ?? []].sort((a, b) => order(a) - order(b));
}
const isPictureSlide = (s: SlideSpec) => usedIds(s.fields).length > 0;
/**
 * Where each photo slide goes in a deck of `specs` (the closing last): the gap after slide g (0 .. n-2). `beforeClosing` puts them all just before the closing (the "Add as photo slide" button).
 */
export function photoSlideGaps(specs: SlideSpec[], opts: Option[], names: (p: PicInfo) => string, beforeClosing = false): { gap: number; why: string }[] {
  const n = specs.length;
  const out: { gap: number; why: string }[] = [];
  if (n < 2) return [];
  if (beforeClosing) return opts.map(() => ({ gap: n - 2, why: 'before the closing slide' }));
  const taken = new Map<number, number>();
  opts.forEach((o, t) => {
    const ideal = ((t + 1) * (n - 1)) / (opts.length + 1) - 0.5;
    // the text slides whose words match a photo's name
    const match = specs.map((s, k) => ({ k, score: Math.max(...o.pics.map((p) => (p.label?.trim() ? nameScore(p.label, slideText(s)) : 0))) })).filter((m) => m.score >= 1 && !isPhotoOnly(specs[m.k].layout));
    const near = new Set(match.flatMap((m) => [m.k - 1, m.k]).filter((g) => g >= 0 && g <= n - 2));
    let bestG = -1, bestC = Infinity;
    for (let g = 0; g <= n - 2; g++) {
      const pics = (isPictureSlide(specs[g]) ? 1 : 0) + (isPictureSlide(specs[g + 1]) ? 1 : 0);
      const cost = (taken.get(g) ?? 0) * 100 + (near.size && !near.has(g) ? 50 : 0) + pics * 10 + Math.abs(g - ideal);
      if (cost < bestC - 1e-9) { bestC = cost; bestG = g; }
    }
    taken.set(bestG, (taken.get(bestG) ?? 0) + 1);
    const pics = (isPictureSlide(specs[bestG]) ? 1 : 0) + (isPictureSlide(specs[bestG + 1]) ? 1 : 0);
    out.push({ gap: bestG, why: near.has(bestG) ? `next to the slide whose words match "${o.pics.map(names).join('", "')}"` : pics ? 'spread between the text slides (every place left is next to a picture slide)' : 'spread between the text slides' });
  });
  return out;
}
/** A photo slide's spec: only the pictures (no text field), kept where the code put them (the placement and the passes leave it alone). */
export const photoSlideSpec = (o: { layout: PhotoOnlyId; pics: PicInfo[] }): SlideSpec => ({
  layout: o.layout,
  fields: Object.fromEntries(o.pics.map((p, i) => [KEYS[i], makeRef({ id: p.id, w: p.width, h: p.height, photo: true })])),
  accents: [],
  shaped: o.pics[0].id,
  photoSlide: true,
});
export type PhotoDraw = (sp: SlideSpec, i: number, deck: SlideSpec[]) => Promise<DrawnPicture[] | null>;
/**
 * Adds the photo slides to a deck. `spare` is how many slides may be added; `draw` draws a slide of the new deck (its pictures as drawn, or null): a slide whose photo the drawing shows whole
 * or cropped over the budget is not added (its photos stay unused). The person's own words are never touched; the closing stays last.
 */
export async function addPhotoSlides(specs: SlideSpec[], pics: PicInfo[], spare: number, st: LayoutStyle, draw: PhotoDraw, opts: { beforeClosing?: boolean; only?: string[] } = {}): Promise<{ specs: SlideSpec[]; added: PhotoSlideAdded[] }> {
  const used = new Set(specs.flatMap((s) => usedIds(s.fields)));
  const photos = pics.filter((p) => !isScreenshot(p));
  const left = photos.filter((p) => !used.has(p.id) && (!opts.only || opts.only.includes(p.id)));
  const nameOf = (p: PicInfo) => p.label?.trim() || `picture ${pics.indexOf(p) + 1}`;
  let chosen = choosePhotoSlides(left, Math.min(spare, SLIDES_MAX - specs.length), st);
  for (let guard = 0; guard < 4 && chosen.length; guard++) {
    const gaps = photoSlideGaps(specs, chosen, nameOf, opts.beforeClosing);
    // insert from the last gap back, so earlier gaps keep their place; photo slides in one gap keep their order
    const order = chosen.map((o, t) => ({ o, t, g: gaps[t] })).sort((a, b) => b.g.gap - a.g.gap || b.t - a.t);
    let deck = [...specs];
    for (const x of order) deck.splice(x.g.gap + 1, 0, photoSlideSpec(x.o));
    const added: PhotoSlideAdded[] = [];
    const bad: Option[] = [];
    for (const x of [...order].sort((a, b) => a.t - b.t)) {
      const at = deck.findIndex((s) => s.photoSlide && s.shaped === x.o.pics[0].id && usedIds(s.fields).join() === x.o.pics.map((p) => p.id).join());
      const imgs = await draw(deck[at], at, deck);
      const fits = x.o.pics.map((p) => photoFitOf(imgs ?? undefined, p.id, x.o.layout, 0));
      if (!imgs || fits.some((f) => !f || f.whole || f.crop > PHOTO_CROP_BUDGET + 1e-6)) { bad.push(x.o); continue; }
      added.push({ slide: at + 1, layout: x.o.layout, pictures: x.o.pics.map((p) => p.id), names: x.o.pics.map(nameOf), shares: fits.map((f) => f!.slideShare), crops: fits.map((f) => f!.crop), why: x.g.why });
    }
    if (!bad.length) return { specs: deck, added: added.sort((a, b) => a.slide - b.slide) };
    chosen = chosen.filter((o) => !bad.includes(o));
  }
  return { specs, added: [] };
}
/** Round R: the photo slides of a deck as it is now (for report.json): how many, and on each its slide number, layout and the pictures by the names the person typed ("picture N" with no name). */
export function photoSlidesOf(specs: SlideSpec[], metas: { id: string; kind?: string; label?: string }[]): { count: number; slides: { slide: number; layout: string; pictures: string[] }[] } {
  const photos = metas.filter((m) => m.kind !== 'object');
  const name = (id: string) => { const k = photos.findIndex((p) => p.id === id); return k < 0 ? id : photos[k].label?.trim() || `picture ${k + 1}`; };
  const slides = specs.map((s, i) => ({ s, i })).filter(({ s }) => s.photoSlide).map(({ s, i }) => ({ slide: i + 1, layout: s.layout, pictures: usedIds(s.fields).map(name) }));
  return { count: slides.length, slides };
}
