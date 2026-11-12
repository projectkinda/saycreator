// Round 18: pictures the person NAMED go to the slide whose words match the name (pure code, no model call, nothing is added to a slide).
//  - a name is scored against the words of each slide: shared words after lowercasing, removing punctuation and simple stemming (a final s, es, ing or ed is dropped);
//  - a score of 1 or more is a match; the best score wins; ties go to the earlier slide; each picture is used for at most one slide and each slide takes at most one named picture;
//  - the writer may suggest a picture for a slide (`hint`, the picture's number): the suggestion is tried first and kept only when the slide can show that picture with every word kept
//    and every layout rule holding (the same swap the picture picker uses); otherwise the code's own matching decides;
//  - a slide the person pinned (the picker) is never touched; a picture without a name is placed by shape as before.
import type { SlideSpec } from './designLibrary';
import type { PictureSwap } from './picturePass';
import type { Look } from './designed';
import { usedIds, withoutImages } from './imagePlace';
import { pickPicture } from './picturePick';
import { isScreenshot, type PicInfo } from './layouts/images';

const STOP = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'and', 'or', 'my', 'your', 'our', 'is', 'it', 'for', 'at', 'with', 'by']);
/** The lowercase words of a text, without punctuation. */
export const wordsOf = (text: string): string[] => (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w));
/** A word and its simple stems: a final "s", "es", "ing" or "ed" removed (at least 3 letters stay). Two words match when their stems meet ("style" and "styles", "edit" and "editing"). */
export function stemsOf(w: string): string[] {
  const out = new Set([w]);
  for (const end of ['ing', 'es', 'ed', 's']) if (w.endsWith(end) && w.length - end.length >= 3) out.add(w.slice(0, w.length - end.length));
  return [...out];
}
/** How many different words of the name the text shares. */
export function nameScore(name: string, text: string): number {
  const have = new Set(wordsOf(text).flatMap(stemsOf));
  let n = 0;
  for (const w of new Set(wordsOf(name))) if (stemsOf(w).some((s) => have.has(s))) n++;
  return n;
}
/** All the words a slide shows (every text field; picture fields are left out). */
export const slideText = (spec: SlideSpec): string => Object.values(withoutImages(spec.fields)).map((v) => (Array.isArray(v) ? v.join(' ') : String(v ?? ''))).join(' ');

export interface NameResult { specs: SlideSpec[]; swaps: PictureSwap[] }

export function namePass(specs: SlideSpec[], look: Look): NameResult {
  const pics: PicInfo[] = look.images ?? [];
  const named = pics.filter((p) => p.label?.trim());
  if (!named.length) return { specs, swaps: [] };
  const out = specs.slice();
  const usedPic = new Set<string>();
  const takenSlide = new Set<number>();
  const swaps: PictureSwap[] = [];
  // the person's own picks (and "none") are theirs; their pictures count as used
  specs.forEach((sp) => { if (sp.pin?.picture !== undefined) usedIds(sp.fields).forEach((id) => usedPic.add(id)); });
  const free = (i: number) => out[i].pin?.picture === undefined && !takenSlide.has(i);
  const place = (p: PicInfo, i: number, why: string): boolean => {
    if (usedPic.has(p.id) || !free(i)) return false;
    // a screenshot is never the cover (as in the shape placement)
    if (i === 0 && isScreenshot(p)) return false;
    // the deck's rotation sends back a picture layout that repeats the slide before or after it, or that a third slide would use: those layouts are not offered (the writer is never asked again for it)
    const near = [out[i - 1]?.layout, out[i + 1]?.layout].filter((x): x is string => !!x);
    const counts = out.reduce<Record<string, number>>((a, s, k) => (k === i ? a : { ...a, [s.layout]: (a[s.layout] ?? 0) + 1 }), {});
    const avoid = [...near, ...Object.keys(counts).filter((l) => counts[l] >= 2)];
    const r = pickPicture(out[i], i, p.id, pics, look, avoid);
    if (!r.ok) return false;
    const { pin: _pin, ...rest } = r.spec;
    out[i] = { ...rest, ...(out[i].pin ? { pin: out[i].pin } : {}), named: p.id };
    usedPic.add(p.id);
    takenSlide.add(i);
    swaps.push({ slide: i + 1, from: specs[i].layout, to: r.spec.layout, why: `picture ${pics.indexOf(p) + 1} ("${p.label!.trim()}") ${why}` });
    return true;
  };
  // 1. the writer's suggestions, only where the rules allow them
  specs.forEach((sp, i) => {
    if (!sp.hint) return;
    const p = pics[sp.hint - 1];
    if (p?.label?.trim()) place(p, i, 'put there by the writer');
  });
  // 2. the code's own matching: best score first, then the earlier slide, then the earlier picture
  const pairs: { p: PicInfo; i: number; score: number }[] = [];
  for (const p of named) specs.forEach((sp, i) => { const score = nameScore(p.label!, slideText(sp)); if (score >= 1) pairs.push({ p, i, score }); });
  pairs.sort((a, b) => b.score - a.score || a.i - b.i || pics.indexOf(a.p) - pics.indexOf(b.p));
  for (const { p, i, score } of pairs) place(p, i, `matched its name (${score} shared word${score === 1 ? '' : 's'})`);
  return { specs: out, swaps };
}
