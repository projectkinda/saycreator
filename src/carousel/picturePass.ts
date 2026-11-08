// The picture post-pass: after the writer (which may ignore the pictures it was told about), every picture of the project that no slide would use is given a slide. Deterministic, no model call.
// A slide may change to a picture layout only within its own meaning (a prose or text slide to headline-body-image or art-side-text, a cover to photo-cover or cover-art, a list of 3 or 4 short
// lines to thumb-rows or image-row, a comparison to do-dont), only when the picture layout has enough pictures that fit its slots, and only when NO text is lost (every word of the old slide is in
// the new one). Preference: the earliest slide, the layout that uses the most of the unused pictures; the pictures themselves are placed afterwards by imagePlace (upload order, orientation fit).
import type { Look } from './designed';
import type { SlideSpec } from './designLibrary';
import { layoutOptionsFor, flat } from './layoutMap';
import { placeImages, usedIds } from './imagePlace';
import { fittingPictures, hasEnoughPictures, imagesNeeded, type PicInfo } from './layouts/images';
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
function targetsFor(layout: string, index: number): string[] {
  if (index === 0 && COVERS.includes(layout)) return ['photo-cover', 'cover-art'];
  if (TEXT_SLIDES.includes(layout)) return ['headline-body-image', 'art-side-text', 'photo-cover'];
  if (LISTS.includes(layout)) return ['thumb-rows', 'image-row'];
  if (layout === 'comparison') return ['do-dont'];
  return [];
}
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
    let best: { i: number; to: string; fields: Fields; take: number } | null = null;
    specs.forEach((sp, i) => {
      for (const to of targetsFor(sp.layout, i)) {
        if (!hasEnoughPictures(to, unused)) continue;
        // no neighbour in the same layout, no layout more than twice
        if (specs[i - 1]?.layout === to || specs[i + 1]?.layout === to || specs.filter((q) => q.layout === to).length >= 2) continue;
        const fields = fieldsFor(sp, to, look2);
        if (!fields || !keepsText(sp.fields, fields)) continue;
        const take = Math.min(fittingPictures(to, unused), imagesNeeded(to) === 1 ? 1 : fittingPictures(to, unused));
        if (!best || take > best.take || (take === best.take && i < best.i)) best = { i, to, fields, take };
      }
    });
    if (!best) break;
    const b = best as { i: number; to: string; fields: Fields; take: number };
    swaps.push({ slide: b.i + 1, from: specs[b.i].layout, to: b.to, why: `${unused.length} picture${unused.length === 1 ? ' was' : 's were'} not used: "${specs[b.i].layout}" takes pictures as "${b.to}" without losing any text` });
    specs = specs.map((s, k) => (k === b.i ? { ...s, layout: b.to, fields: b.fields, accents: s.accents, density: undefined, variant: undefined } : s));
  }
  return { specs, swaps };
}
