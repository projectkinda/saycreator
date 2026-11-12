// The preset flavour pass: after the writer's plan comes back, a deterministic pass moves slides whose layout the preset avoids (or that are not among its preferred ones when the
// deck has too few of those) to a preferred layout that can take the slide's text. Presets only: a reference style has no flavour. Rules:
//  - only layouts change: the slides keep the writer's story order and their words;
//  - a swap needs a layout that takes ALL the core (required) text: validateSlideContent and the picker's text mapping decide, and nothing core is ever dropped;
//  - the cover takes the preset's cover layout when the cover's text fits it;
//  - no neighbouring slides in the same layout (or family: stat, list, text, hero; the two numeral layouts are one family), no layout more than twice;
//  - a swap budget (half the slides) keeps the writer's plan recognisable. Every swap is logged.
import type { Look } from './designed';
import type { LayoutId, LayoutStyle } from './layouts';
import { layoutDef, validateSlideContent } from './layouts';
import type { SlideSpec } from './designLibrary';
import { accentsIn, flat, layoutOptionsFor, toCanon } from './layoutMap';
import { IMAGE_LAYOUT_IDS, hasEnoughPictures, isScreenshot } from './layouts/images';
import { COVER_FORMS, isCoverLayout } from './layouts/coverIds';
import { wordCoverFits } from './layouts/covers';

/** A stable 32-bit hash of a text (FNV-1a): the cover of a deck is chosen from it, never at random. */
export function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/** What the cover is chosen from: the deck's title and the words of its first headline (the same deck always has the same key, whichever cover it is drawn with). */
/** The id of a built-in style from its pack ("preset:style-4" -> "style-4"): the same whatever the title the style shows. */
export const styleIdOf = (pack: { name: string; readKey?: string } | null | undefined): string => (pack?.readKey ?? '').replace(/^preset:/, '') || (pack?.name ?? '').replace(/ pack$/, '');
export function coverKeyOf(title: string, specs: SlideSpec[], styleId = ''): string {
  const f = specs[0]?.fields ?? {};
  const head = String(f.headline ?? f.question ?? f.lead ?? f.heading ?? '');
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).join(' ');
  return norm(title) + '|' + norm(head) + '|' + styleId;
}
/** The layouts a cover may be replaced by: the covers and plain statement forms (a picture cover the person's picture fills is kept as it is). */
const COVER_SWAPPABLE = new Set<string>([...COVER_FORMS, 'big-question', 'statement-question']);

/** Layouts that look alike in a row (a deck should not put two of one family side by side). */
export const FAMILY: Partial<Record<LayoutId, string>> = {
  statement: 'hero', 'lead-statement': 'hero', 'big-question': 'hero', 'cta-button': 'hero', 'photo-led': 'hero',
  'big-stat': 'stat', 'stat-bar': 'stat', 'stat-grid': 'stat',
  stepper: 'list', checklist: 'list', 'numbered-list': 'list', timeline: 'list', 'card-grid': 'list', spotlight: 'list',
  'split-text': 'text', 'feature-slider': 'text', quote: 'text', comparison: 'text',
  'step-numeral': 'numeral', 'listicle-numeral': 'numeral',
  'cover-centred': 'hero', 'cover-index': 'hero', 'cover-block': 'hero', 'cover-sticker': 'hero', 'cover-word': 'hero', 'cover-ruled': 'hero',
  'statement-stacked': 'hero', 'statement-card': 'hero', 'statement-pill': 'hero', 'statement-question': 'hero', 'contact-closing': 'hero', 'cta-pair': 'hero',
  'headline-body-image': 'photo', 'photo-full-caption': 'photo', 'split-half': 'photo', 'title-over-photo': 'photo', 'twin-photos': 'photo', 'photo-grid': 'photo', 'phone-frame': 'photo', 'image-row': 'photo', 'thumb-rows': 'photo', 'cover-art': 'photo', 'photo-cover': 'photo', 'portrait-closing': 'photo', 'art-side-text': 'photo', 'do-dont': 'photo',
  prose: 'text', 'headline-card': 'text', 'numbered-stagger': 'list', 'bullet-list': 'list', 'pill-stagger': 'list',
};
export const familyOf = (l: string): string => FAMILY[l as LayoutId] ?? l;

/**
 * What a layout MEANS beyond its looks. A slide with a meaning-carrying layout only moves to a layout of the same meaning: a stepper is an order, a stat-bar is a figure with its
 * bar, a big-stat is a hero number, a quote is words with a speaker, a comparison is two sides. The open layouts (statement, split-text, checklist ...) swap among themselves.
 */
export const MEANING: Partial<Record<LayoutId, { kind: string; what: string }>> = {
  stepper: { kind: 'order', what: 'an order' }, 'numbered-list': { kind: 'order', what: 'an order' }, timeline: { kind: 'order', what: 'an order' },
  'big-stat': { kind: 'figure', what: 'a figure' }, 'stat-bar': { kind: 'figure', what: 'a figure with its bar' }, 'stat-grid': { kind: 'figure', what: 'a set of figures' },
  'step-numeral': { kind: 'numeral', what: 'a numbered step' }, 'listicle-numeral': { kind: 'numeral', what: 'a numbered entry' },
  quote: { kind: 'quote', what: 'words with a speaker' }, comparison: { kind: 'compare', what: 'two sides' }, spotlight: { kind: 'callouts', what: 'three numbered callouts' },
  'do-dont': { kind: 'compare', what: 'two sides' }, 'portrait-closing': { kind: 'contact', what: 'a closing with a person' },
  prose: { kind: 'prose', what: 'whole paragraphs' }, 'numbered-stagger': { kind: 'order', what: 'an order' }, 'contact-closing': { kind: 'contact', what: 'contact details' },
};
const meaningOf = (l: string) => MEANING[l as LayoutId]?.kind ?? 'open';

export interface FlavourSwap {
  slide: number;
  from: string;
  to: string;
  why: string;
  /** Optional lines (a kicker, a caption, a source note) the new layout does not show; the core text is always kept. */
  droppedOptional: string[];
}
export interface FlavourKept {
  slide: number;
  layout: string;
  why: string;
}
export interface FlavourResult {
  specs: SlideSpec[];
  swaps: FlavourSwap[];
  kept: FlavourKept[];
}

/**
 * A closing the plain text mapping cannot move to a card (a "how it works" card: a headline over one paragraph): the paragraph becomes the card's headline (when it is short enough for a
 * card), the old headline its lead-in and the subline its caption. Only when every required text is still shown; the lines that do not fit are left out (optional ones only).
 */
function closingCard(spec: SlideSpec, layout: string): { layout: LayoutId; fields: SlideSpec['fields']; dropped: string[]; droppedCore: string[]; current: false } | null {
  if (layout !== 'statement-card') return null;
  const own = Object.fromEntries(Object.entries(spec.fields).filter(([k]) => k !== 'accent')) as SlideSpec['fields'];
  const c = toCanon(spec.layout, own);
  const fields: SlideSpec['fields'] = {};
  const body = c.body.trim();
  if (body && body.length <= 70) {
    fields.headline = body;
    if (c.head && c.head.length <= 24) fields.kicker = c.head;
    if (c.sub && c.sub.length <= 60) fields.caption = c.sub;
  } else if (c.head && c.head.length <= 70) {
    fields.headline = c.head;
    if (c.sub && c.sub.length <= 60) fields.caption = c.sub;
  } else return null;
  // a call to action's button text becomes the card's caption (the card says the action; it is not a button)
  if (c.button && !fields.caption && c.button.length <= 60) fields.caption = c.button;
  if (!validateSlideContent('statement-card', fields).ok) return null;
  const shown = flat(fields);
  const lost = (t: string) => !shown.some((u) => u === t || u.includes(t));
  const core = (layoutDef(spec.layout)?.fields ?? []).filter((q) => q.required).flatMap((q) => (Array.isArray(own[q.name]) ? (own[q.name] as string[]) : [String(own[q.name] ?? '')])).map((x) => x.trim()).filter(Boolean);
  const droppedCore = core.filter(lost);
  return { layout: 'statement-card', fields, dropped: flat(own).filter(lost), droppedCore, current: false };
}

export function flavourPass(specs0: SlideSpec[], style: LayoutStyle, look: Look, name = 'this style', deckKey = ''): FlavourResult {
  const fl = style.flavour;
  const specs = specs0.map((s) => ({ ...s }));
  const swaps: FlavourSwap[] = [];
  const kept: FlavourKept[] = [];
  if (!fl || !specs.length) return { specs, swaps, kept };
  const n = specs.length;
  const prefer = (fl.prefer ?? []) as string[];
  const avoid = (fl.avoid ?? []) as string[];
  const cap = Math.ceil(n / 2);
  const want = Math.ceil(0.6 * n);
  const count = (l: string) => specs.filter((s) => s.layout === l).length;
  const preferredCount = () => specs.filter((s) => prefer.includes(s.layout)).length;

  /** A new layout for slide i: needs all core text, no dropped core line, and no clash with the neighbours. Returns why not otherwise. */
  const tryLayout = (i: number, target: string): { ok: true; fields: SlideSpec['fields']; dropped: string[] } | { ok: false; why: string } => {
    if (target === specs[i].layout) return { ok: false, why: 'it is the layout it already has' };
    if (target === 'photo-led' && !look.hasPhoto) return { ok: false, why: 'it needs a photo' };
    const prev = specs[i - 1]?.layout;
    const next = specs[i + 1]?.layout;
    if (prev === target || next === target) return { ok: false, why: `${target} would sit next to the same layout` };
    if (prev && familyOf(prev) === familyOf(target)) return { ok: false, why: `${target} is the same family as the slide before` };
    if (next && familyOf(next) === familyOf(target)) return { ok: false, why: `${target} is the same family as the slide after` };
    if (count(target) >= 2) return { ok: false, why: `${target} is already used twice` };
    // the meaning of the slide stays: an order, a figure, a quote, a comparison only move to a layout that says the same thing
    if (meaningOf(specs[i].layout) !== meaningOf(target)) return { ok: false, why: `${specs[i].layout} carries ${MEANING[specs[i].layout as LayoutId]?.what ?? 'open text'} and ${target} would not` };
    const opt = layoutOptionsFor(specs[i], look, { joinStat: true }).find((o) => o.layout === target);
    if (!opt) return { ok: false, why: `its text does not fit ${target}` };
    if (opt.droppedCore.length) return { ok: false, why: `${target} would drop "${opt.droppedCore[0].slice(0, 30)}"` };
    return { ok: true, fields: opt.fields, dropped: opt.dropped };
  };
  const apply = (i: number, to: string, fields: SlideSpec['fields'], dropped: string[], why: string) => {
    const from = specs[i].layout;
    specs[i] = { ...specs[i], layout: to, fields, accents: accentsIn(specs[i].accents, fields), density: undefined, variant: undefined };
    swaps.push({ slide: i + 1, from, to, why, droppedOptional: dropped });
  };

  // the cover
  const picturedLayout = (l: string) => (IMAGE_LAYOUT_IDS as readonly string[]).includes(l) && !!look.images && hasEnoughPictures(l, look.images);
  // a preset's own cover form is never changed to plain "statement", and a question cover takes the preset's question form (statement-question) when it has one
  const q = fl.coverQuestion;
  const head0 = String(specs[0].fields.headline ?? specs[0].fields.question ?? '').trim();
  if (q && /\?\s*$/.test(head0) && specs[0].layout !== q && swaps.length < cap && !picturedLayout(specs[0].layout)) {
    const r = tryLayout(0, q);
    if (r.ok) apply(0, q, r.fields, r.dropped, `the hook of the cover is a question, so the cover of ${name} is "${q}"`);
    else kept.push({ slide: 1, layout: specs[0].layout, why: `question cover stays: ${r.why}` });
  } else if (style.coverLayouts?.layouts.length && !picturedLayout(specs[0].layout) && COVER_SWAPPABLE.has(specs[0].layout)) {
    // the cover family: the style lists the covers it allows; the deck takes one of them by a stable rule (its key and the style name), a picture cover too when the person added pictures
    const cl0 = style.coverLayouts;
    const avoidC = new Set<string>((cl0.avoid ?? []) as string[]);
    // (a screenshot is never a cover, and a cover the person pinned keeps its picture choice: only photos count for a picture cover)
    const coverPics = specs[0].pin?.picture !== undefined ? [] : (look.images ?? []).filter((q) => !isScreenshot(q));
    const pool = [...(cl0.layouts as string[]), ...(coverPics.length ? ['photo-cover', 'cover-art', 'title-over-photo', 'photo-full-caption'].filter((p) => hasEnoughPictures(p, coverPics)) : [])].filter((l, i, a) => !avoidC.has(l) && a.indexOf(l) === i);
    const h = stableHash(deckKey || coverKeyOf('', specs, name));
    // the covers that can take this headline (a word cover needs three words and no other text, a stacked one two to four words ...): the choice is among them, so a deck is never moved to a cover that cannot show it
    // (the word cover sets the LAST word huge and highlights it: a headline whose highlight is another word is not given that cover)
    const lastW = (String(specs[0].fields.headline ?? '').trim().split(/\s+/).pop() ?? '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
    const wordOk = (t: string) => t !== 'cover-word' || (wordCoverFits(style, String(specs[0].fields.headline ?? '')) && specs[0].accents.every((a) => a.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase() === lastW));
    const eligible = pool.map((target) => ({ target, opt: layoutOptionsFor(specs[0], look, { joinStat: true }).find((o) => o.layout === target) })).filter((x) => x.target === specs[0].layout || (x.opt && wordOk(x.target) && !x.opt.droppedCore.length && !x.opt.dropped.length && specs[1]?.layout !== x.target));
    let done0 = false;
    if (eligible.length) {
      // a sample deck takes the style's signature cover when it can show the headline; a real deck takes one of the allowed covers by the hash
      const sig = look.signatureCover && cl0.signature ? eligible.find((e) => e.target === cl0.signature) : undefined;
      const { target, opt } = sig ?? eligible[h % eligible.length];
      done0 = true;
      if (target !== specs[0].layout && opt) {
        apply(0, target, opt.fields, opt.dropped, `the cover of ${name} is one of its ${pool.length} covers, chosen from the deck: "${target}"`);
        if (isCoverLayout(target)) specs[0] = { ...specs[0], pin: { ...specs[0].pin, variant: ((h >>> 7) & 1) as 0 | 1 } };
      }
    }
    if (!done0) kept.push({ slide: 1, layout: specs[0].layout, why: 'cover stays: none of the covers of the style takes its text' });
  } else if (fl.cover && (!style.coverLayouts?.layouts.length || !COVER_SWAPPABLE.has(specs[0].layout)) && specs[0].layout !== fl.cover && !(q && specs[0].layout === q) && swaps.length < cap && !picturedLayout(specs[0].layout)) {
    const r = tryLayout(0, fl.cover);
    if (r.ok) apply(0, fl.cover, r.fields, r.dropped, `the cover of ${name} is "${fl.cover}"`);
    else kept.push({ slide: 1, layout: specs[0].layout, why: `cover stays: ${r.why}` });
  }
  // the closing slide (library.byType.closing): a preset can say which layout its closing is (and the variant) and which layouts a closing avoids. A closing that carries contact details
  // or a person keeps its layout; any other closing moves to the preset's closing layout when that layout takes ALL of its core text. The variant is pinned (so the rotation keeps it).
  const cl = style.closingLayout;
  if (cl && n >= 2 && specs[n - 1].layout !== cl.layout) {
    const i = n - 1;
    const cur = specs[i].layout;
    if (cur === 'contact-closing' || picturedLayout(cur)) kept.push({ slide: n, layout: cur, why: 'the closing keeps its layout: it carries contact details or a picture' });
    else if (specs[i - 1].layout === cl.layout) kept.push({ slide: n, layout: cur, why: `closing stays: ${cl.layout} would sit next to the same layout` });
    else {
      const opt = layoutOptionsFor(specs[i], look, { joinStat: true }).find((o) => o.layout === cl.layout) ?? closingCard(specs[i], cl.layout);
      if (opt && !opt.droppedCore.length) {
        // a generic call to action ("Save this for later", "Follow for more", "Send this to a friend", "Follow @handle") goes into the card's caption line, in place of the button
        const btn = String(specs[i].fields.button ?? '').trim();
        const generic = cur === 'cta-button' && cl.layout === 'statement-card' && (/^(?:save this for later|follow for more|send this to a friend)$/i.test(btn) || /^follow @[\w.]{2,30}$/i.test(btn));
        apply(i, cl.layout, generic ? { ...opt.fields, caption: btn } : opt.fields, opt.dropped, `the closing of ${name} is ${cl.layout}${(cl.avoid ?? []).includes(cur as LayoutId) ? ` (it avoids ${cur} for a closing)` : ''}`);
        if (cl.variant !== undefined) specs[i] = { ...specs[i], pin: { ...specs[i].pin, variant: cl.variant } };
      } else kept.push({ slide: n, layout: cur, why: opt ? `closing stays: ${cl.layout} would drop "${opt.droppedCore[0].slice(0, 30)}"` : `closing stays: its text does not fit ${cl.layout}` });
    }
  }
  // the other slides (the closing call to action is left alone unless the preset avoids it)
  for (let i = 1; i < n; i++) {
    const cur = specs[i].layout;
    // a layout with picture slots that the project's pictures can fill was chosen on purpose (the writer was told the pictures): the flavour never swaps it out, even a layout the style avoids
    const pictured = picturedLayout(cur);
    const bad = avoid.includes(cur) && !pictured;
    const notPreferred = !prefer.includes(cur) && !pictured;
    if (i === n - 1 && !bad) continue;
    if (!(bad || (notPreferred && preferredCount() < want))) continue;
    if (swaps.length >= cap) {
      kept.push({ slide: i + 1, layout: cur, why: 'swap budget used (half the slides)' });
      continue;
    }
    let done = false;
    let firstWhy = '';
    for (const target of prefer) {
      const r = tryLayout(i, target);
      if (r.ok) {
        apply(i, target, r.fields, r.dropped, bad ? `${name} avoids "${cur}"` : `"${cur}" is not a preferred layout of ${name} (${preferredCount()} of ${n} slides use one)`);
        done = true;
        break;
      }
      if (!firstWhy && !/already|same|itself|it is the layout|photo/.test(r.why)) firstWhy = r.why;
    }
    if (!done) kept.push({ slide: i + 1, layout: cur, why: firstWhy ? `no preferred layout fits: ${firstWhy}` : 'no preferred layout is free here' });
  }
  void layoutDef;
  return { specs, swaps, kept };
}
