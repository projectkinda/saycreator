// The preset flavour pass: after the writer's plan comes back, a deterministic pass moves slides whose layout the preset avoids (or that are not among its preferred ones when the
// deck has too few of those) to a preferred layout that can take the slide's text. Presets only: a reference style has no flavour. Rules:
//  - only layouts change: the slides keep the writer's story order and their words;
//  - a swap needs a layout that takes ALL the core (required) text: validateSlideContent and the picker's text mapping decide, and nothing core is ever dropped;
//  - the cover takes the preset's cover layout when the cover's text fits it;
//  - no neighbouring slides in the same layout (or family: stat, list, text, hero; the two numeral layouts are one family), no layout more than twice;
//  - a swap budget (half the slides) keeps the writer's plan recognisable. Every swap is logged.
import type { Look } from './designed';
import type { LayoutId, LayoutStyle } from './layouts';
import { layoutDef } from './layouts';
import type { SlideSpec } from './designLibrary';
import { accentsIn, layoutOptionsFor } from './layoutMap';

/** Layouts that look alike in a row (a deck should not put two of one family side by side). */
export const FAMILY: Partial<Record<LayoutId, string>> = {
  statement: 'hero', 'lead-statement': 'hero', 'big-question': 'hero', 'cta-button': 'hero', 'photo-led': 'hero',
  'big-stat': 'stat', 'stat-bar': 'stat', 'stat-grid': 'stat',
  stepper: 'list', checklist: 'list', 'numbered-list': 'list', timeline: 'list', 'card-grid': 'list', spotlight: 'list',
  'split-text': 'text', 'feature-slider': 'text', quote: 'text', comparison: 'text',
  'step-numeral': 'numeral', 'listicle-numeral': 'numeral',
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

export function flavourPass(specs0: SlideSpec[], style: LayoutStyle, look: Look, name = 'this style'): FlavourResult {
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
  if (fl.cover && specs[0].layout !== fl.cover && swaps.length < cap) {
    const r = tryLayout(0, fl.cover);
    if (r.ok) apply(0, fl.cover, r.fields, r.dropped, `the cover of ${name} is "${fl.cover}"`);
    else kept.push({ slide: 1, layout: specs[0].layout, why: `cover stays: ${r.why}` });
  }
  // the other slides (the closing call to action is left alone unless the preset avoids it)
  for (let i = 1; i < n; i++) {
    const cur = specs[i].layout;
    const bad = avoid.includes(cur);
    const notPreferred = !prefer.includes(cur);
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
