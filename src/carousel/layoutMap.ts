// Moving a slide's text between layouts: the text is MAPPED (never invented). Used by the layout picker and by the preset flavour pass.
import type { Look } from './designed';
import { LAYOUT_IDS, layoutDef, validateSlideContent, type Fields, type LayoutId } from './layouts';
import { IMAGE_LAYOUT_IDS, fittingPictures, hasEnoughPictures, imageSlotsOf, imagesNeeded, isImageKey, type PicInfo } from './layouts/images';
import type { SlideSpec } from './designLibrary';
import { fieldSubject, plainProblem } from './plainWords';

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** The text of a slide by meaning, whatever layout holds it. */
interface Canon {
  head: string;
  kicker: string;
  sub: string;
  body: string;
  number: string;
  label: string;
  bar: string;
  quote: string;
  author: string;
  button: string;
  items: string[];
  lines: string[];
  numbers: string[];
  labels: string[];
  /** Layouts whose fields cannot be mapped (a comparison keeps its four texts): only the same layout takes them. */
  own?: { layout: string; fields: Fields };
}
const txt = (f: Fields, k: string) => (typeof f[k] === 'string' ? (f[k] as string).trim() : '');
const lst = (f: Fields, k: string) => (Array.isArray(f[k]) ? (f[k] as string[]).map((x) => x.trim()).filter(Boolean) : []);
const empty = (): Canon => ({ head: '', kicker: '', sub: '', body: '', number: '', label: '', bar: '', quote: '', author: '', button: '', items: [], lines: [], numbers: [], labels: [] });

export function toCanon(layout: string, f: Fields): Canon {
  const c = empty();
  switch (layout) {
    case 'statement': return { ...c, head: txt(f, 'headline'), kicker: txt(f, 'kicker'), sub: txt(f, 'caption') };
    case 'lead-statement': return { ...c, kicker: txt(f, 'lead'), head: txt(f, 'headline') };
    case 'big-question': return { ...c, head: txt(f, 'question'), sub: txt(f, 'line') };
    case 'photo-led': return { ...c, head: txt(f, 'headline'), kicker: txt(f, 'kicker') };
    case 'split-text': return { ...c, head: txt(f, 'headline'), body: txt(f, 'paragraph') };
    case 'big-stat': return { ...c, number: txt(f, 'number'), label: txt(f, 'label'), sub: txt(f, 'source') };
    case 'stat-bar': return { ...c, number: txt(f, 'number'), label: txt(f, 'label'), bar: txt(f, 'bar'), sub: txt(f, 'note') };
    case 'stepper': return { ...c, head: txt(f, 'title'), items: lst(f, 'steps') };
    case 'step-numeral': return { ...c, number: txt(f, 'step'), head: txt(f, 'title'), body: txt(f, 'body') };
    case 'listicle-numeral': return { ...c, number: txt(f, 'numeral'), head: txt(f, 'title'), body: txt(f, 'body') };
    case 'checklist': case 'numbered-list': return { ...c, head: txt(f, 'title'), items: lst(f, 'items') };
    case 'quote': return { ...c, quote: txt(f, 'quote'), author: txt(f, 'author'), head: txt(f, 'quote'), sub: txt(f, 'author') };
    case 'cta-button': return { ...c, head: txt(f, 'headline'), button: txt(f, 'button'), sub: txt(f, 'sub') };
    case 'feature-slider': return { ...c, head: txt(f, 'title'), body: txt(f, 'body'), own: { layout, fields: f } };
    case 'card-grid': return { ...c, head: txt(f, 'title'), items: lst(f, 'cardTitles'), lines: lst(f, 'cardLines') };
    case 'stat-grid': return { ...c, head: txt(f, 'title'), numbers: lst(f, 'numbers'), labels: lst(f, 'labels') };
    case 'timeline': return { ...c, head: txt(f, 'title'), labels: lst(f, 'labels'), items: lst(f, 'events') };
    case 'spotlight': return { ...c, head: txt(f, 'subject'), items: lst(f, 'callouts') };
    case 'comparison': return { ...c, head: txt(f, 'title'), own: { layout, fields: f } };
    case 'prose': return { ...c, head: txt(f, 'heading'), body: txt(f, 'p1'), own: { layout, fields: f } };
    case 'statement-stacked': return { ...c, head: txt(f, 'headline'), sub: txt(f, 'caption') };
    case 'cover-centred': case 'cover-index': case 'cover-block': case 'cover-sticker': case 'cover-ruled': return { ...c, head: txt(f, 'headline'), kicker: txt(f, 'kicker'), sub: txt(f, 'caption') };
    case 'cover-word': return { ...c, head: txt(f, 'headline') };
    case 'statement-card': return { ...c, head: txt(f, 'headline'), kicker: txt(f, 'kicker'), sub: txt(f, 'caption') };
    case 'statement-pill': return { ...c, head: txt(f, 'headline'), kicker: txt(f, 'kicker'), sub: txt(f, 'caption') };
    case 'statement-question': return { ...c, head: txt(f, 'question'), sub: txt(f, 'line') };
    case 'contact-closing': case 'cta-pair': return { ...c, head: txt(f, 'headline'), own: { layout, fields: f } };
    case 'numbered-stagger': return { ...c, head: txt(f, 'title'), items: lst(f, 'items') };
    case 'bullet-list': return { ...c, head: txt(f, 'title'), items: lst(f, 'items') };
    case 'pill-stagger': return { ...c, head: txt(f, 'headline'), sub: txt(f, 'subline'), items: lst(f, 'items') };
    case 'headline-card': return { ...c, head: txt(f, 'headline'), sub: txt(f, 'subline'), body: txt(f, 'card'), own: { layout, fields: f } };
    case 'headline-body-image': return { ...c, head: txt(f, 'headline'), body: txt(f, 'body') };
    case 'image-row': return { ...c, head: txt(f, 'headline'), body: txt(f, 'paragraph'), sub: txt(f, 'subline') };
    case 'thumb-rows': case 'list-under-band': case 'list-beside-picture': return { ...c, head: txt(f, 'title'), items: lst(f, 'items') };
    case 'cover-art': return { ...c, head: txt(f, 'headline'), sub: txt(f, 'subtitle') };
    case 'photo-full-caption': case 'title-over-photo': return { ...c, head: txt(f, 'headline'), sub: txt(f, 'line') };
    case 'split-half': case 'phone-frame': return { ...c, head: txt(f, 'headline'), body: txt(f, 'body') };
    case 'twin-photos': return { ...c, head: txt(f, 'headline'), own: { layout, fields: f } };
    case 'photo-grid': return { ...c, head: txt(f, 'headline'), sub: txt(f, 'line') };
    case 'photo-cover': return { ...c, head: txt(f, 'headline'), body: txt(f, 'intro') };
    case 'art-side-text': return { ...c, head: txt(f, 'heading'), body: txt(f, 'paragraph') };
    case 'portrait-closing': return { ...c, head: txt(f, 'headline'), own: { layout, fields: f } };
    case 'do-dont': return { ...c, head: txt(f, 'title'), own: { layout, fields: f } };
    default: return c;
  }
}
const put = (o: Fields, k: string, v: string | string[]) => {
  if (Array.isArray(v) ? v.length : v) o[k] = v;
};
/** The fields a layout would get from the text, or null when the text does not have what the layout needs (nothing is made up to fill it). */
export function fromCanon(layout: string, c: Canon, hasPhoto: boolean, images?: PicInfo[]): Fields | null {
  const o: Fields = {};
  const head = c.head || c.quote;
  // the layouts with a picture field are for a deck that has a picture
  if ((IMAGE_LAYOUT_IDS as readonly string[]).includes(layout) && (images ? !hasEnoughPictures(layout, images) : !hasPhoto)) return null;
  switch (layout) {
    case 'statement': put(o, 'headline', head); put(o, 'kicker', c.kicker); put(o, 'caption', c.sub || (words(c.body) <= 10 ? c.body : '')); break;
    case 'lead-statement': put(o, 'lead', c.kicker || c.sub); put(o, 'headline', head); break;
    case 'big-question': put(o, 'question', head); put(o, 'line', c.sub); break;
    case 'photo-led': if (!hasPhoto) return null; put(o, 'headline', head); put(o, 'kicker', c.kicker); break;
    case 'split-text': put(o, 'headline', head); put(o, 'paragraph', c.body || c.sub); break;
    case 'big-stat': put(o, 'number', c.number); put(o, 'label', c.label); put(o, 'source', c.sub); break;
    case 'stat-bar': if (!c.bar) return null; put(o, 'number', c.number); put(o, 'label', c.label); put(o, 'bar', c.bar); put(o, 'note', c.sub); break;
    case 'stepper': put(o, 'title', head); put(o, 'steps', c.items); break;
    case 'step-numeral': put(o, 'step', c.number); put(o, 'title', head); put(o, 'body', c.body || c.sub); break;
    case 'listicle-numeral': put(o, 'numeral', c.number); put(o, 'title', head); put(o, 'body', c.body || c.sub); break;
    case 'checklist': case 'numbered-list': put(o, 'title', head); put(o, 'items', c.items); break;
    case 'quote': put(o, 'quote', c.quote || head); put(o, 'author', c.author || c.sub); break;
    case 'cta-button': if (!c.button) return null; put(o, 'headline', head); put(o, 'button', c.button); put(o, 'sub', c.sub); break;
    case 'card-grid': if (!c.lines.length) return null; put(o, 'title', head); put(o, 'cardTitles', c.items); put(o, 'cardLines', c.lines); break;
    case 'stat-grid': if (!c.numbers.length) return null; put(o, 'title', head); put(o, 'numbers', c.numbers); put(o, 'labels', c.labels); break;
    case 'timeline': if (!c.labels.length || !c.items.length) return null; put(o, 'title', head); put(o, 'labels', c.labels); put(o, 'events', c.items); break;
    case 'spotlight': put(o, 'subject', head); put(o, 'callouts', c.items); break;
    case 'statement-stacked': if (words(head) > 4 || words(head) < 2) return null; put(o, 'headline', head); put(o, 'caption', c.sub || (words(c.body) <= 14 ? c.body : '')); break;
    case 'cover-centred': case 'cover-index': case 'cover-block': case 'cover-sticker': case 'cover-ruled': put(o, 'headline', head); put(o, 'kicker', c.kicker); put(o, 'caption', c.sub || (words(c.body) <= 10 ? c.body : '')); break;
    // one word set huge: three words or more, the last word 3 to 9 letters, and no other text on the cover (the word and the rest of the headline are the whole slide)
    case 'cover-word': { const ws = head.split(/\s+/).filter(Boolean); const lw = (ws[ws.length - 1] ?? '').replace(/[^\p{L}\p{N}]/gu, ''); if (ws.length < 3 || lw.length < 3 || lw.length > 9 || c.kicker || c.sub || c.body) return null; put(o, 'headline', head); break; }
    case 'statement-card': put(o, 'headline', head); put(o, 'kicker', c.kicker); put(o, 'caption', c.sub || (words(c.body) <= 10 ? c.body : '')); break;
    case 'statement-pill': if (!c.sub) return null; put(o, 'headline', head); put(o, 'kicker', c.kicker); put(o, 'caption', c.sub); break;
    case 'statement-question': put(o, 'question', head); put(o, 'line', c.sub); break;
    case 'numbered-stagger': if (c.items.length < 2 || c.items.length > 3) return null; put(o, 'title', head); put(o, 'items', c.items); break;
    case 'bullet-list': put(o, 'title', head); put(o, 'items', c.items); break;
    case 'pill-stagger': put(o, 'headline', head); put(o, 'subline', c.sub); put(o, 'items', c.items); break;
    case 'headline-body-image': if (!(c.body || c.sub)) return null; put(o, 'headline', head); put(o, 'body', c.body || c.sub); break;
    case 'image-row': if (!(c.body || c.sub)) return null; put(o, 'headline', head); put(o, 'paragraph', c.body || c.sub); if (c.body && c.sub) put(o, 'subline', c.sub); break;
    case 'thumb-rows': if (c.items.length < 3 || c.items.length > 4) return null; put(o, 'title', head); put(o, 'items', c.items); break;
    case 'list-under-band': case 'list-beside-picture': if (c.items.length < 2 || c.items.length > 5 || !head || c.body || c.sub) return null; put(o, 'title', head); put(o, 'items', c.items); break;
    case 'cover-art': put(o, 'headline', head); put(o, 'subtitle', c.sub); break;
    case 'photo-full-caption': case 'title-over-photo': if (head.length > 48) return null; put(o, 'headline', head); put(o, 'line', c.sub || (words(c.body) <= 8 ? c.body : '')); break;
    case 'split-half': if (!(c.body || c.sub)) return null; put(o, 'headline', head); put(o, 'body', c.body || c.sub); break;
    case 'phone-frame': put(o, 'headline', head); put(o, 'body', c.body || c.sub); break;
    case 'photo-grid': if (c.body || c.kicker) return null; put(o, 'headline', head); put(o, 'line', c.sub); break;
    case 'twin-photos': return c.own?.layout === layout ? { ...c.own.fields } : null;
    case 'photo-cover': if (!(c.body || c.sub)) return null; put(o, 'headline', head); put(o, 'intro', c.body || c.sub); break;
    case 'art-side-text': if (!(c.body || c.sub)) return null; put(o, 'heading', head); put(o, 'paragraph', c.body || c.sub); break;
    case 'portrait-closing': case 'do-dont': return c.own?.layout === layout ? { ...c.own.fields } : null;
    case 'prose': if (c.own?.layout === layout) return { ...c.own.fields }; if (!c.body) return null; put(o, 'p1', c.body); put(o, 'heading', head); break;
    case 'feature-slider': case 'comparison': case 'contact-closing': case 'cta-pair': case 'headline-card': return c.own?.layout === layout ? { ...c.own.fields } : null;
    default: return null;
  }
  return o;
}

export interface LayoutOption {
  layout: LayoutId;
  /** The REQUIRED text of the slide that this layout would not show (empty: nothing core is lost). */
  droppedCore: string[];
  /** The slide's fields in this layout (without accents). */
  fields: Fields;
  /** The texts of the slide this layout would not show. */
  dropped: string[];
  current: boolean;
}
export const flat = (f: Fields): string[] => Object.entries(f).filter(([k]) => k !== 'accent' && !isImageKey(k)).flatMap(([, v]) => (Array.isArray(v) ? v : [v])).map((x) => String(x).trim()).filter(Boolean);

/** Every layout that can take this slide's text, the slide's own layout first: the LAYOUT PICKER's list (Round AL part 4: with the picker's own moves, see pickerCanon). */
export const layoutOptions = (spec: SlideSpec, look: Look): LayoutOption[] => layoutOptionsFor(spec, look, { picker: true });
/** The layouts that hold a number in a field of their own. */
const NUMBER_SLOT = ['big-stat', 'stat-bar', 'step-numeral', 'listicle-numeral'];
/**
 * Round AL part 4: two moves the PERSON may make in the layout picker (never the deck passes: the flavour pass, the picture pass and the rescue call layoutOptionsFor without `picker`,
 * so the decks they draw are unchanged). Every word stays; nothing is made up:
 *  - a numbered item (listicle-numeral, step-numeral with a 1 or 2 digit number) on a layout with no number field: the number goes in front of the headline with a no-break space,
 *    "1. Shoot at golden hour" (the form Round AI already gives an item of a numbered list);
 *  - two buttons (cta-pair) on one button (cta-button): the first button is the button and the line under the headline the line below; the second button's words must be in that
 *    line, or the move would leave them out and is not offered (the required-text rule below).
 */
function pickerCanon(from: string, own: Fields, c: Canon, to: string): Canon {
  if ((from === 'listicle-numeral' || from === 'step-numeral') && /^\d{1,2}$/.test(c.number) && c.head && !NUMBER_SLOT.includes(to) && !new RegExp(`^\\s*${c.number}(?:[.)]|\\s)`).test(c.head))
    return { ...c, head: `${c.number}. ${c.head}`, number: '' };
  if (from === 'cta-pair' && to === 'cta-button') {
    const b = txt(own, 'button1');
    return b ? { ...c, button: b, sub: txt(own, 'line2') } : c;
  }
  return c;
}
/**
 * Round AM: the number a picker move put in front of the headline ("1"), or '' (the move of pickerCanon: a numbered item on a layout with no number of its own). Reads the option,
 * never changes it.
 */
export function addedNumber(spec: SlideSpec, opt: LayoutOption): string {
  if (opt.current || NUMBER_SLOT.includes(opt.layout)) return '';
  const own = Object.fromEntries(Object.entries(spec.fields).filter(([k]) => k !== 'accent')) as Fields;
  const n = toCanon(spec.layout, own).number;
  if ((spec.layout !== 'listicle-numeral' && spec.layout !== 'step-numeral') || !/^\d{1,2}$/.test(n)) return '';
  return flat(opt.fields).some((t) => t.startsWith(`${n}. `)) ? n : '';
}
/**
 * `joinStat`: a stat slide (number + label) may become a headline "10 seconds to flip it" (used by the flavour pass). `picker`: the layout picker's list, with the moves of pickerCanon.
 */
export function layoutOptionsFor(spec: SlideSpec, look: Look, o: { joinStat?: boolean; picker?: boolean } = {}): LayoutOption[] {
  const own = Object.fromEntries(Object.entries(spec.fields).filter(([k]) => k !== 'accent')) as Fields;
  const c = toCanon(spec.layout, own);
  if (o.joinStat && !c.head && c.number && c.label) c.head = c.number + ' ' + c.label;
  const have = flat(own);
  const core = (layoutDef(spec.layout)?.fields ?? []).filter((f) => f.required).flatMap((f) => (Array.isArray(own[f.name]) ? (own[f.name] as string[]) : [String(own[f.name] ?? '')])).map((x) => x.trim()).filter(Boolean);
  const out: LayoutOption[] = [{ layout: spec.layout as LayoutId, fields: own, dropped: [], droppedCore: [], current: true }];
  for (const id of LAYOUT_IDS) {
    if (id === spec.layout) continue;
    const f = fromCanon(id, o.picker ? pickerCanon(spec.layout, own, c, id) : c, !!look.hasPhoto, look.images);
    if (!f || !validateSlideContent(id, f).ok) continue;
    const shown = flat(f);
    const lost = (t: string) => !shown.some((u) => u === t || u.includes(t));
    // a layout that would not show all the slide's required text (a stepper's steps, a stat's number) is never offered: only optional lines may be left out
    if (core.some(lost)) continue;
    out.push({ layout: id, fields: f, dropped: have.filter(lost), droppedCore: [], current: false });
  }
  return out;
}
/**
 * Round AM part 2: the layouts the PERSON may pick that leave out words the slide's own layout requires (a closing's buttons, the sentence of a headline + sentence slide), for the
 * layout picker only: a tile that says what it leaves out and asks first. layoutOptionsFor() never offers these and no deck pass calls this. Same mapping and the same rules as the
 * picker's list (fromCanon with pickerCanon, validateSlideContent): nothing is made up. Never left out: the headline (or the question or quote that stands for it), a number, a list's
 * items, a stat's numbers and labels, a bar's value. Not in the list: the layouts layoutOptions() offers.
 */
export function nearOptions(spec: SlideSpec, look: Look): LayoutOption[] {
  const offered = new Set(layoutOptions(spec, look).map((o) => o.layout as string));
  const own = Object.fromEntries(Object.entries(spec.fields).filter(([k]) => k !== 'accent')) as Fields;
  const c = toCanon(spec.layout, own);
  const head = c.head || c.quote;
  if (!head) return [];
  const keep = [head, c.number, c.label, c.bar, ...c.items, ...c.numbers, ...c.labels].map((x) => x.trim()).filter(Boolean);
  const have = flat(own);
  const core = (layoutDef(spec.layout)?.fields ?? []).filter((f) => f.required).flatMap((f) => (Array.isArray(own[f.name]) ? (own[f.name] as string[]) : [String(own[f.name] ?? '')])).map((x) => x.trim()).filter(Boolean);
  const out: LayoutOption[] = [];
  for (const id of LAYOUT_IDS) {
    if (id === spec.layout || offered.has(id)) continue;
    const f = fromCanon(id, pickerCanon(spec.layout, own, c, id), !!look.hasPhoto, look.images);
    if (!f || !validateSlideContent(id, f).ok) continue;
    const shown = flat(f);
    const lost = (t: string) => !shown.some((u) => u === t || u.includes(t));
    if (keep.some(lost)) continue;
    const droppedCore = core.filter(lost);
    if (!droppedCore.length) continue;
    out.push({ layout: id, fields: f, dropped: have.filter(lost), droppedCore, current: false });
  }
  return out;
}
// Round AL part 1: what a layout needs, in plain words (no field ids)
const CANON_WORDS: Record<string, string> = { head: 'a headline', kicker: 'a small line above the headline', sub: 'a line below the headline', body: 'a paragraph', number: 'a number', label: 'a short label', bar: 'a value for the bar', quote: 'a quote', author: 'an author', button: 'a button', items: 'a list', lines: 'a line for each card', numbers: 'numbers', labels: 'labels for the items' };
const clipText = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
/**
 * Round AM part 4: what each layout that only takes text written for it is made for, in plain words (it was "Works only with text written for it." for all of them). By purpose
 * (layoutPurpose.ts): Compare, Do and do not, Feature slider, Call to action (two buttons, contact details, with a portrait), Headline and paragraph (text on a card, longer text),
 * Full photo (two photos).
 */
const MADE_FOR: Record<string, string> = {
  comparison: 'Made for a side-by-side comparison of two things; this slide isn\'t one.',
  'do-dont': 'Made for a do and a don\'t side by side; this slide isn\'t one.',
  'feature-slider': 'Made for one feature with a slider that shows how much; this slide isn\'t one.',
  'cta-pair': 'Made for a closing with two buttons; this slide isn\'t one.',
  'contact-closing': 'Made for a closing with your contact details; this slide isn\'t one.',
  'portrait-closing': 'Made for a closing with your portrait and a few lines about you; this slide isn\'t one.',
  'headline-card': 'Made for a headline with a card of text under it; this slide isn\'t one.',
  'twin-photos': 'Made for two photos, each with its own caption; this slide isn\'t one.',
  prose: 'Made for a few paragraphs of text; this slide has none.',
};
/** Round AM part 4: a field of another layout in plain words, where its own name would read oddly for the person's slide ("the author" is the name under a quote). */
const BECOMES: Record<string, string> = { author: 'the name under the quote', quote: 'the quote', question: 'the question', lead: 'the small line above the headline', kicker: 'the small line above the headline', button: 'the button' };
/**
 * Round AM part 4: a length refusal in plain words for the slide in front of the person. When the text that is too long is one of the slide's lines that would go into a part
 * of the other layout with another name, it says both: "The line below the headline that would become the name under the quote is 57 letters long; this layout holds 40." (it said
 * "The author is 57 letters long", and the slide has no author).
 */
function limitReason(err: string, id: string, f: Fields, spec: SlideSpec, own: Fields): string {
  const base = plainProblem(err, id);
  const m = /^(?:[\w-]+: )?"(\w+)" (?:is (\d+) characters; the most is (\d+)|has (\d+) words; the most is (\d+))/.exec(err);
  if (!m) return base;
  const v = f[m[1]];
  if (typeof v !== 'string') return base;
  const src = Object.entries(own).find(([k, x]) => k !== 'accent' && typeof x === 'string' && x.trim() === v.trim())?.[0];
  if (!src) return base;
  const from = fieldSubject(spec.layout, src);
  const to = fieldSubject(id, m[1]);
  if (from === to) return base;
  const what = from.replace(/^The /, '');
  const target = BECOMES[m[1]] ?? to.replace(/^The /, 'the ');
  return m[2] ? `The ${what} that would become ${target} is ${m[2]} letters long; this layout holds ${m[3]}.` : `The ${what} that would become ${target} has ${m[4]} words; this layout holds ${m[5]}.`;
}
/** Layouts that only take the text written for them (their fields do not map to any other layout's). */
const OWN_ONLY = ['feature-slider', 'comparison', 'contact-closing', 'cta-pair', 'headline-card', 'twin-photos', 'portrait-closing', 'do-dont'];
/**
 * Round AL part 1: the real reason when no missing kind of text explains a refusal (it was "Only its own layout can draw this text." for every one of them). It reads the same rules
 * as fromCanon: a word count, a list length, a headline length, text the layout has no place for.
 */
function ruleReason(id: string, c: Canon): string {
  const head = c.head || c.quote;
  const hw = words(head);
  const n = c.items.length;
  const items = (lo: number, hi: number) => `Needs a list of ${lo} to ${hi} items; this slide has ${n === 0 ? 'none' : n}.`;
  if (OWN_ONLY.includes(id) || (id === 'prose' && c.own)) return MADE_FOR[id] ?? 'Made for text written for it; this slide isn\'t.';
  if (!head && ['statement-stacked', 'cover-word', 'photo-full-caption', 'title-over-photo'].includes(id)) return 'Needs a headline, which this slide does not have.';
  switch (id) {
    case 'statement-stacked': return `The headline has ${hw} ${hw === 1 ? 'word' : 'words'}; this layout takes 2 to 4.`;
    case 'cover-word': {
      if (c.kicker || c.sub || c.body) return 'Takes a headline only, and this slide has more text.';
      if (hw < 3) return 'Needs a headline of 3 words or more.';
      return 'The last word of the headline must be 3 to 9 letters long.';
    }
    case 'numbered-stagger': return items(2, 3);
    case 'thumb-rows': return items(3, 4);
    case 'list-under-band': case 'list-beside-picture':
      if (n < 2 || n > 5) return items(2, 5);
      if (!head) return 'Needs a headline above the list.';
      return 'Takes a headline and a list only, and this slide has more text.';
    case 'photo-full-caption': case 'title-over-photo': return `The headline is ${head.length} letters long; this layout holds 48.`;
    case 'photo-grid': return 'Takes a headline and one short line only, and this slide has more text.';
    default: return 'This slide\'s text does not fit this layout.';
  }
}
/**
 * Why each layout that layoutOptions() does NOT offer cannot take this slide, in one plain line (a layout id to a reason). Driven by the registry: the layouts come
 * from LAYOUT_IDS and the reason from asking fromCanon / validateSlideContent, so a layout added later gets its reason with no per-layout code.
 */
export function layoutRefusals(spec: SlideSpec, look: Look): Record<string, string> {
  const offered = new Set(layoutOptions(spec, look).map((o) => o.layout as string));
  const own = Object.fromEntries(Object.entries(spec.fields).filter(([k]) => k !== 'accent')) as Fields;
  const c = toCanon(spec.layout, own);
  const out: Record<string, string> = {};
  for (const id of LAYOUT_IDS) {
    if (offered.has(id)) continue;
    // Round AM part 2: the text the picker would move (pickerCanon: a numbered item with "1." before its headline), so the reason is the real one
    const pc = pickerCanon(spec.layout, own, c, id);
    const f = fromCanon(id, pc, !!look.hasPhoto, look.images);
    if (!f) {
      // a layout with picture slots: the text maps, the pictures are what is missing (how many it needs, how many of the project's fit)
      if ((IMAGE_LAYOUT_IDS as readonly string[]).includes(id) && fromCanon(id, pc, true)) {
        const need = imagesNeeded(id);
        const have = look.images ? fittingPictures(id, look.images) : 0;
        const shape = [...new Set(imageSlotsOf(id).flatMap((s) => s.accepts))].join(' or ');
        out[id] = look.images ? `Needs ${need} ${need === 1 ? 'picture' : 'pictures'} (${shape}); this deck has ${have} that ${have === 1 ? 'fits' : 'fit'}.` : 'Needs a picture, and this deck has none.';
        continue;
      }
      if (!look.hasPhoto && fromCanon(id, pc, true)) {
        out[id] = 'Needs a picture, and this deck has none.';
        continue;
      }
      // what is missing: add the kinds of text one by one until the layout can take them
      const base = pc as unknown as Record<string, string | string[]>;
      const withKeys = (ks: string[]) => ({ ...base, ...Object.fromEntries(ks.map((k) => [k, Array.isArray(base[k]) ? ['x'] : 'x'])) }) as unknown as Canon;
      const empties = Object.keys(CANON_WORDS).filter((k) => !(Array.isArray(base[k]) ? base[k].length : base[k]));
      let need = empties.filter((k) => fromCanon(id, withKeys([k]), true)).slice(0, 1);
      if (!need.length) {
        need = [...empties];
        if (fromCanon(id, withKeys(need), true)) need = need.filter((k) => { const rest = need.filter((x) => x !== k); return !fromCanon(id, withKeys(rest), true); });
        else need = [];
      }
      out[id] = need.length ? `Needs ${need.map((k) => CANON_WORDS[k]).join(' and ')}, which this slide does not have.` : ruleReason(id, pc);
      continue;
    }
    const v = validateSlideContent(id, f);
    if (!v.ok) {
      out[id] = limitReason(v.errors[0], id, f, spec, own);
      continue;
    }
    const core = (layoutDef(spec.layout)?.fields ?? []).filter((x) => x.required).flatMap((x) => (Array.isArray(own[x.name]) ? (own[x.name] as string[]) : [String(own[x.name] ?? '')])).map((x) => x.trim()).filter(Boolean);
    const shown = flat(f);
    const lost = core.find((t) => !shown.some((u) => u === t || u.includes(t)));
    out[id] = lost ? (/^\d{1,3}$/.test(lost) ? `Has no place for the number ${lost}.` : `Would leave out "${clipText(lost, 28)}".`) : 'This slide\'s text does not fit this layout.';
  }
  return out;
}
/** The accent phrases that still stand in the new text. */
export const accentsIn = (accents: string[], f: Fields): string[] => {
  const t = flat(f).join(' \n ').toLowerCase();
  return accents.filter((a) => t.includes(a.toLowerCase()));
};

