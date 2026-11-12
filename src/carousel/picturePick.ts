// The per-slide picture picker (Round 14), pure code, no model call: "Auto", "None" or one of the project's pictures for ONE slide.
//  - a picture the person picks (or "None") is PINNED on the slide (spec.pin.picture): the placement, the upgrade pass and a restyle never move or remove it;
//  - a slide whose layout cannot take that picture is moved to a layout that can by the same "takes pictures as ..." rule the picture pass uses (every word kept, or nothing happens);
//  - the slide as the deck's own placement made it is kept while a pick is pinned, so "Auto" brings it back;
//  - the same picture may be picked on two slides.
import type { Look } from './designed';
import type { SlideSpec } from './designLibrary';
import { withoutImages } from './imagePlace';
import { ALTERNATIVES, fieldsFor, keepsText, targetsFor } from './picturePass';
import type { Fields } from './layouts';
import { fittingPictures, hasEnoughPictures, imageSlotsOf, imagesNeeded, makeRef, parseRef, type PicInfo } from './layouts/images';

export type PickChoice = 'auto' | 'none' | string;
export type PickResult = { ok: true; spec: SlideSpec; note: string } | { ok: false; why: string };

/** What the slide's pin says: auto, none, or the picture's id. */
export const choiceOf = (spec: { pin?: { picture?: string } }): PickChoice => spec.pin?.picture ?? 'auto';

/** The layouts a slide may take to show ONE picture, best first: its own meaning's targets, the alternatives of its picture layout, then the general ones. */
const CANDIDATES = ['phone-frame', 'split-half', 'photo-full-caption', 'headline-body-image', 'art-side-text', 'photo-cover', 'cover-art', 'title-over-photo'];
function candidatesFor(layout: string, index: number): string[] {
  return [...new Set([layout, ...targetsFor(layout, index), ...(ALTERNATIVES[layout] ?? []), ...CANDIDATES])];
}

export function pickPicture(spec: SlideSpec, index: number, choice: PickChoice, pics: PicInfo[], look: Look): PickResult {
  const pin = spec.pin ?? {};
  // Auto: back to what the deck's own placement made (or just unpinned when there is nothing to go back to)
  if (choice === 'auto') {
    if (pin.picture === undefined) return { ok: true, spec, note: 'This slide is already on Auto.' };
    const { picture: _p, auto, ...rest } = pin;
    const back = auto ? { ...spec, layout: auto.layout, fields: auto.fields, accents: auto.accents } : spec;
    const next: SlideSpec = { ...back, pin: Object.keys(rest).length ? rest : undefined };
    if (!next.pin) delete next.pin;
    return { ok: true, spec: next, note: 'Auto: this slide has the picture the deck gave it.' };
  }
  const keepAuto = pin.picture !== undefined ? pin.auto : { layout: spec.layout, fields: spec.fields, accents: spec.accents };
  const pinned = (s: SlideSpec): SlideSpec => ({ ...s, pin: { ...s.pin, picture: choice, ...(keepAuto ? { auto: keepAuto } : {}) } });
  if (choice === 'none') return { ok: true, spec: pinned({ ...spec, fields: withoutImages(spec.fields) as Fields }), note: 'No picture on this slide.' };
  const pic = pics.find((p) => p.id === choice);
  if (!pic) return { ok: false, why: 'That picture is not in the project.' };
  const ref = makeRef({ id: pic.id, w: pic.width, h: pic.height, ...(pic.width / pic.height <= 0.5 ? { fy: 0.1 } : {}), ...(pic.content === 'photo' ? { photo: true } : {}) });
  const slots = imageSlotsOf(spec.layout);
  // the slide's own layout takes the picture (its shape, and not under text for a screenshot): put it in the first picture slot, the others keep what they have
  if (slots.length && fittingPictures(spec.layout, [pic]) === 1) {
    const have = Object.keys(spec.fields).filter((k) => parseRef(spec.fields[k])).length;
    if (imagesNeeded(spec.layout) <= 1 || have >= imagesNeeded(spec.layout)) {
      return { ok: true, spec: pinned({ ...spec, fields: { ...spec.fields, [slots[0].field]: ref } as Fields }), note: 'This picture is on the slide.' };
    }
  }
  // another layout that shows every word and takes this picture
  const look1: Look = { ...look, images: [pic], hasPhoto: true };
  const base: SlideSpec = { ...spec, fields: withoutImages(spec.fields) as Fields };
  for (const to of candidatesFor(spec.layout, index)) {
    if (imagesNeeded(to) !== 1 || !hasEnoughPictures(to, [pic])) continue;
    const f = to === spec.layout ? base.fields : fieldsFor(base, to, look1);
    if (!f || !keepsText(base.fields, f)) continue;
    const slot = imageSlotsOf(to)[0];
    if (!slot) continue;
    return { ok: true, spec: pinned({ ...spec, layout: to, fields: { ...f, [slot.field]: ref } as Fields, density: undefined }), note: to === spec.layout ? 'This picture is on the slide.' : `This slide now shows the picture as "${to}": every word is kept.` };
  }
  return { ok: false, why: `Slide ${index + 1} cannot show this picture without losing words. The slide is unchanged.` };
}
