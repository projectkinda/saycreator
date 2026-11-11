// The picture post-pass: after the writer (which may ignore the pictures it was told about), every picture of the project that no slide would use is given a slide. Deterministic, no model call.
// A slide may change to a picture layout only within its own meaning (a prose or text slide to headline-body-image or art-side-text, a cover to photo-cover or cover-art, a list of 3 or 4 short
// lines to thumb-rows or image-row, a comparison to do-dont), only when the picture layout has enough pictures that fit its slots, and only when NO text is lost (every word of the old slide is in
// the new one). Preference: the earliest slide, the layout that uses the most of the unused pictures; the pictures themselves are placed afterwards by imagePlace (upload order, orientation fit).
import type { Look } from './designed';
import type { SlideSpec } from './designLibrary';
import { layoutOptionsFor, flat } from './layoutMap';
import { placeImages, usedIds, withoutImages } from './imagePlace';
import { HERO_BAND_H, IMAGE_LAYOUT_IDS, PANEL_H, PANEL_W, fittingPictures, hasEnoughPictures, imagesNeeded, shapeOf, type PicInfo } from './layouts/images';
import type { Fields } from './layouts';

export interface PictureSwap {
  slide: number;
  from: string;
  to: string;
  why: string;
}

/** Which picture layouts a slide of each layout may become (in order of preference). The cover is slide 1. */
const TEXT_SLIDES = ['split-text', 'prose', 'headline-card'];
const COVERS = ['statement', 'statement-card', 'statement-stacked', 'statement-pill', 'lead-statement', 'big-question', 'statement-question'];
const LISTS = ['checklist', 'bullet-list', 'pill-stagger'];
export function targetsFor(layout: string, index: number): string[] {
  if (index === 0 && COVERS.includes(layout)) return ['photo-cover', 'cover-art'];
  // a statement in the middle of the deck (a headline and an optional line) can carry a picture as a cover-art slide
  if (COVERS.includes(layout)) return ['cover-art', 'photo-cover'];
  if (TEXT_SLIDES.includes(layout)) return ['headline-body-image', 'art-side-text', 'photo-cover'];
  if (LISTS.includes(layout)) return ['thumb-rows', 'image-row'];
  if (layout === 'comparison') return ['do-dont'];
  // a quote carries a picture as a last resort: the same words in a headline and a line with the picture (a figure or an order has no picture layout that keeps its look and its words)
  if (layout === 'quote') return ['art-side-text', 'headline-body-image', 'cover-art'];
  return [];
}
/** How much a slide changes when it takes a picture layout (0 = a text slide, 1 = a list, a quote or a comparison): the least change goes first. */
const changeRank = (layout: string): number => (TEXT_SLIDES.includes(layout) || COVERS.includes(layout) ? 0 : LISTS.includes(layout) || layout === 'quote' || layout === 'comparison' ? 1 : 2);
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
/** Every word of the old slide's text is in the new fields. */
const keepsText = (oldF: Fields, newF: Fields) => {
  const have = new Set(flat(newF).flatMap(norm));
  return flat(oldF).flatMap(norm).every((w) => have.has(w));
};

/** A comparison as a do-dont: the two sides keep their labels in front of their lines ("Before: Two bags"), so nothing is lost. */
function comparisonToDoDont(f: Fields): Fields | null {
  const s = (k: string) => (typeof f[k] === 'string' ? (f[k] as string).trim() : '');
  const [ll, lt, rl, rt] = [s('leftLabel'), s('leftText'), s('rightLabel'), s('rightText')];
  if (!lt || !rt) return null;
  const wrong = ll ? `${ll}: ${lt}` : lt;
  const right = rl ? `${rl}: ${rt}` : rt;
  if (wrong.length > 50 || right.length > 50) return null;
  const title = s('title') || [ll, rl].filter(Boolean).join(' or ').slice(0, 40) || '';
  if (!title) return null;
  return { title, wrong, right };
}

function fieldsFor(spec: SlideSpec, target: string, look: Look): Fields | null {
  if (spec.layout === 'comparison') return target === 'do-dont' ? comparisonToDoDont(spec.fields) : null;
  const opt = layoutOptionsFor(spec, look).find((o) => o.layout === target);
  if (!opt || opt.droppedCore.length || opt.dropped.length) return null;
  return opt.fields;
}

export function picturePass(specs0: SlideSpec[], look: Look): { specs: SlideSpec[]; swaps: PictureSwap[] } {
  const imgs = (look.images ?? []) as PicInfo[];
  let specs = specs0.map((s) => ({ ...s }));
  const swaps: PictureSwap[] = [];
  if (!imgs.length) return { specs, swaps };
  for (let guard = 0; guard < 8; guard++) {
    const placed = placeImages(specs, specs.map(() => 0 as 0 | 1), imgs);
    const used = new Set(placed.flatMap((s) => usedIds(s.fields)));
    const unused = imgs.filter((p) => !used.has(p.id));
    if (!unused.length) break;
    const look2: Look = { ...look, images: unused };
    let best: { i: number; to: string; fields: Fields; take: number; rank: number } | null = null;
    specs.forEach((sp, i) => {
      for (const to of targetsFor(sp.layout, i)) {
        if (!hasEnoughPictures(to, unused)) continue;
        // no neighbour in the same layout, no layout more than twice
        if (specs[i - 1]?.layout === to || specs[i + 1]?.layout === to || specs.filter((q) => q.layout === to).length >= 2) continue;
        const fields = fieldsFor(sp, to, look2);
        if (!fields || !keepsText(sp.fields, fields)) continue;
        const take = Math.min(fittingPictures(to, unused), imagesNeeded(to) === 1 ? 1 : fittingPictures(to, unused));
        const rank = changeRank(sp.layout);
        if (!best || take > best.take || (take === best.take && (rank < best.rank || (rank === best.rank && i < best.i)))) best = { i, to, fields, take, rank };
      }
    });
    if (!best) break;
    const b = best as { i: number; to: string; fields: Fields; take: number; rank: number };
    swaps.push({ slide: b.i + 1, from: specs[b.i].layout, to: b.to, why: `${unused.length} picture${unused.length === 1 ? ' was' : 's were'} not used: "${specs[b.i].layout}" takes pictures as "${b.to}" without losing any text` });
    specs = specs.map((s, k) => (k === b.i ? { ...s, layout: b.to, fields: b.fields, accents: s.accents, density: undefined, variant: undefined, pictureUpgrade: true } : s));
  }
  return { specs, swaps };
}

// ----- the other passes: the same picture layout twice in a row, and the hero (a picture over half of the slide) -----
/** The picture layouts a slide may take instead of its own (the same words), when two neighbours would have the same one. */
const ALTERNATIVES: Record<string, string[]> = {
  'headline-body-image': ['photo-cover', 'art-side-text'], 'photo-cover': ['headline-body-image', 'art-side-text'], 'art-side-text': ['headline-body-image', 'photo-cover'],
  'cover-art': ['photo-cover', 'headline-body-image'], 'thumb-rows': ['image-row'], 'image-row': ['thumb-rows'],
};
const isPictureLayout = (l: string) => (IMAGE_LAYOUT_IDS as readonly string[]).includes(l);

/**
 * Never the same picture layout on two slides in a row when another picture layout takes the slide's words: the second slide moves to the nearest one (a swap, no text lost, logged).
 */
export function separatePictureRuns(specs0: SlideSpec[], look: Look): { specs: SlideSpec[]; swaps: PictureSwap[] } {
  let specs = specs0.map((s) => ({ ...s }));
  const swaps: PictureSwap[] = [];
  const imgs = (look.images ?? []) as PicInfo[];
  if (!imgs.length) return { specs, swaps };
  for (let i = 1; i < specs.length; i++) {
    const cur = specs[i].layout;
    if (!isPictureLayout(cur) || specs[i - 1].layout !== cur) continue;
    for (const to of ALTERNATIVES[cur] ?? []) {
      if (specs[i - 1].layout === to || specs[i + 1]?.layout === to || !hasEnoughPictures(to, imgs)) continue;
      const base = { ...specs[i], fields: withoutImages(specs[i].fields) };
      const fields = fieldsFor(base, to, look);
      if (!fields || !keepsText(base.fields, fields)) continue;
      swaps.push({ slide: i + 1, from: cur, to, why: `two slides in a row had "${cur}": this one takes the pictures as "${to}" without losing any text` });
      specs = specs.map((s, k) => (k === i ? { ...s, layout: to, fields, accents: s.accents, density: undefined, variant: undefined } : s));
      break;
    }
  }
  return { specs, swaps };
}

/** Layouts that show a tall or portrait picture as a half-and-half split (the picture over 50% of the slide). */
const SPLIT_LAYOUTS = ['headline-body-image', 'photo-cover', 'cover-art'];
/** Layouts whose variant 2 ("picture above") puts a landscape picture in a hero band (50% of the slide). */
const BAND_LAYOUTS = ['headline-body-image', 'photo-cover'];
/** The largest share of the slide a picture of this layout covers: a split panel 50%, a hero band 50% (variant 2); every other picture layout less than half. */
export function heroShare(layout: string, variant: 0 | 1, picture: string): number {
  const k = shapeOf(picture)?.kind;
  // the hero band ("picture above", any shape: a tall picture shows its top); the split panel of a tall picture is at most 45% of the width, so it is not a hero
  // (a cover-art slide with a tall or portrait picture is drawn by headline-body-image, so it has the band too)
  if ((BAND_LAYOUTS.includes(layout) || (layout === 'cover-art' && (k === 'tall' || k === 'portrait'))) && variant === 1) return (1080 * HERO_BAND_H) / (1080 * 1350);
  if ((k === 'tall' || k === 'portrait') && SPLIT_LAYOUTS.includes(layout)) return (PANEL_W * PANEL_H) / (1080 * 1350);
  // a wide picture (2:1 or wider) on art-side-text is drawn as the hero band
  if (layout === 'art-side-text' && (shapeOf(picture)?.aspect ?? 0) >= 2) return (1080 * HERO_BAND_H) / (1080 * 1350);
  return 0;
}
/**
 * The hero: when the deck has pictures, at least one picture slide gives its picture 50% or more of the slide (a half-and-half split for a tall or portrait picture, the hero band
 * for a landscape one), unless every picture is tiny (under 400 px on its long side). A picture slide that can be one becomes it (its "picture above" variant is pinned); otherwise a picture
 * slide whose words fit a hero layout moves to it. Deterministic, no text lost.
 */
export function heroPass(specs0: SlideSpec[], look: Look): { specs: SlideSpec[]; swaps: PictureSwap[]; hero: number | null } {
  let specs = specs0.map((s) => ({ ...s }));
  const swaps: PictureSwap[] = [];
  const imgs = (look.images ?? []) as PicInfo[];
  if (!imgs.length || imgs.every((p) => Math.max(p.width, p.height) < 400)) return { specs, swaps, hero: null };
  const placed = placeImages(specs, specs.map(() => 0 as 0 | 1), imgs);
  const pic = (i: number) => String(placed[i].fields.image ?? '');
  const withPic = specs.map((_, i) => i).filter((i) => isPictureLayout(specs[i].layout) && pic(i));
  for (const i of withPic) if (heroShare(specs[i].layout, (specs[i].pin?.variant ?? 0) as 0 | 1, pic(i)) >= 0.5) return { specs, swaps, hero: i };
  // a picture slide of a hero layout: pin its "picture above" variant
  for (const i of withPic) {
    if (heroShare(specs[i].layout, 1, pic(i)) >= 0.5) {
      specs = specs.map((s, k) => (k === i ? { ...s, pin: { ...s.pin, variant: 1 as const } } : s));
      swaps.push({ slide: i + 1, from: specs[i].layout, to: specs[i].layout, why: 'the hero: the picture runs edge to edge over more than half of the slide ("picture above")' });
      return { specs, swaps, hero: i };
    }
  }
  // a picture slide of another layout moves to a hero layout when its words fit
  for (const i of withPic) {
    for (const to of ['photo-cover', 'headline-body-image', 'art-side-text']) {
      if (to === specs[i].layout || specs[i - 1]?.layout === to || specs[i + 1]?.layout === to) continue;
      const base = { ...specs[i], fields: withoutImages(specs[i].fields) };
      const fields = fieldsFor(base, to, look);
      if (!fields || !keepsText(base.fields, fields)) continue;
      const next = { ...specs[i], layout: to, fields, density: undefined, variant: undefined, pin: { ...specs[i].pin, variant: 1 as const } };
      if (heroShare(to, 1, pic(i)) < 0.5 && heroShare(to, 0, pic(i)) < 0.5) continue;
      swaps.push({ slide: i + 1, from: specs[i].layout, to, why: 'the hero: this slide takes its picture as a picture over more than half of the slide, without losing any text' });
      specs = specs.map((s, k) => (k === i ? next : s));
      return { specs, swaps, hero: i };
    }
  }
  return { specs, swaps, hero: null };
}
