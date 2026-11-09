// What a built-in style really looks like, for the cards of step 3 and the Preview panel. No model call.
//   - cardSlides: two small slides under the cover, in the two layouts the style likes most (its flavour's "prefer" list), chosen so that no two styles show the same pair.
//   - previewDeck: a strip of seven sample slides in the style, drawn by the layout library from ONE fixed sample script, by the same code a real pasted script goes through.
// The small slides are drawn with drawOne, the function every deck slide is drawn with; the strip is a deck made by libraryDeckFromScript.
import { drawOne, styleFromPack } from './designLibrary';
import { libraryDeckFromScript } from './libraryFromScript';
import { layoutDef } from './layouts';
import { presetPackFor } from './presets';
import { carouselStyles } from './render';
import { isUserStyle } from '../reference/templates';
import { validateScriptText } from './script';
import type { CarouselScript } from '../image-engine/carousel/types';
import type { Fields } from './layouts/types';

/** The only layouts a card may show under its cover: body layouts. Never prose, a call-to-action or contact closing, a cover form or a picture layout. */
export const BODY_LAYOUTS = ['step-numeral', 'checklist', 'big-stat', 'comparison', 'quote', 'card-grid', 'numbered-list', 'bullet-list', 'pill-stagger', 'spotlight', 'stat-grid', 'split-text', 'listicle-numeral', 'headline-card', 'stat-bar'] as const;
export type CardPick = { layout: string; invert?: 'full' };
const P = (layout: string, invert?: 'full'): CardPick => (invert ? { layout, invert } : { layout });

/** The built-in presets in the order the cards are listed. */
export const presetNames = (): string[] => carouselStyles().map((s) => s.spec.name).filter((n) => !isUserStyle(n) && !!presetPackFor(n, false));

/**
 * The two slides each card shows under its cover, chosen by hand from each style's liked layouts (its flavour's "prefer" list) and kept honest by style-previews.spec.ts, which checks:
 * only body layouts; liked by the style; no two styles with the same pair; no layout on more than 3 styles; a dark style shows at least one dark slide and a light style at least one light one.
 * "full" = the layout drawn on the inverted ground, as a deck does for emphasis. Style 5 likes only two body layouts (quote, split-text), the same two as style 1, so its second slide is a headline card
 * (a body layout it does not avoid); that is the one place the likes list could not give a pair of its own.
 */
const CARD_PICKS: Record<string, [CardPick, CardPick]> = {
  'dark-quiet': [P('split-text'), P('checklist', 'full')],
  'editorial-collage': [P('checklist'), P('listicle-numeral')],
  'film-paper': [P('quote'), P('step-numeral', 'full')],
  'glass-gradient': [P('card-grid'), P('comparison', 'full')],
  'hot-flat': [P('big-stat'), P('stat-bar', 'full')],
  'mono-poster': [P('big-stat'), P('step-numeral', 'full')],
  'object-neon': [P('card-grid'), P('stat-bar', 'full')],
  'style-1': [P('quote'), P('split-text', 'full')],
  'style-2': [P('numbered-list'), P('listicle-numeral')],
  'style-3': [P('bullet-list'), P('numbered-list')],
  'style-4': [P('bullet-list'), P('step-numeral')],
  'style-5': [P('split-text'), P('headline-card')],
  'style-6': [P('numbered-list'), P('comparison')],
  'style-7': [P('pill-stagger'), P('headline-card')],
  'style-8': [P('big-stat'), P('quote')],
};

/** A built-in style that has no entry above (a new preset): its first two liked body layouts. */
const fallbackPicks = (name: string): [CardPick, CardPick] | null => {
  const pack = presetPackFor(name, false);
  if (!pack) return null;
  const liked = ((styleFromPack(pack).style.flavour?.prefer ?? []) as string[]).filter((l) => (BODY_LAYOUTS as readonly string[]).includes(l));
  return liked.length >= 2 ? [P(liked[0]), P(liked[1])] : null;
};
export const cardPicks = (name: string): [CardPick, CardPick] | null => CARD_PICKS[name] ?? fallbackPicks(name);

/** The two layouts of every card (for the checks and the report). */
export function cardPairs(names = presetNames()): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  for (const n of names) {
    const p = cardPicks(n);
    if (p) out[n] = [p[0].layout, p[1].layout];
  }
  return out;
}

/** The words of the sample script ("A habit starts smaller than you think") in each body layout: a card shows a small version of what the Preview panel opens. */
export const HABIT_FIELDS: Record<string, Fields> = {
  'step-numeral': { step: '1', title: 'Make it tiny', body: 'Do the smallest version first, so starting is never a fight.' },
  checklist: { title: 'Before you start', items: ['Pick one habit', 'Set a time', 'Tell a friend'] },
  'big-stat': { number: '66', label: 'days to a new habit', source: 'on average' },
  comparison: { leftLabel: 'Myth', leftText: 'You need big willpower.', rightLabel: 'Fact', rightText: 'You need a small, clear step.' },
  quote: { quote: 'We are what we repeatedly do.', author: 'A wise coach' },
  'card-grid': { title: 'Habits that stick', cardTitles: ['Small', 'Daily', 'Shared', 'Tracked'], cardLines: ['One minute to begin', 'Same time each day', 'Tell a friend', 'Mark it on a calendar'] },
  'numbered-list': { title: 'Three ways to make it stick', items: ['Make it tiny', 'Set a time', 'Tell a friend'] },
  'bullet-list': { title: 'Before you start', items: ['Pick one habit', 'Set a time', 'Tell a friend'] },
  'pill-stagger': { headline: 'Four ways to start', subline: 'Pick the one that fits your day.', items: ['Make it tiny', 'Set a time', 'Tell a friend', 'Track the streak'] },
  spotlight: { subject: 'One small habit', callouts: ['Make it tiny', 'Set a time', 'Tell a friend'] },
  'stat-grid': { title: 'Habits in numbers', numbers: ['66', '1', '3', '7'], labels: ['days to a new habit', 'minute to begin', 'steps to make it stick', 'days for a first streak'] },
  'split-text': { headline: 'A habit starts smaller than you think', paragraph: 'Do the smallest version first, so starting is never a fight.' },
  'listicle-numeral': { numeral: '1', title: 'Make it tiny', body: 'Do the smallest version first, so starting is never a fight.' },
  'headline-card': { headline: 'Start with one small step', subline: 'Three ways to make it stick.', card: 'Do the smallest version first, so starting is never a fight.', paragraph: 'Set a time and tell a friend.', closing: 'Save this for later.' },
  'stat-bar': { number: '66', label: 'days to a new habit', bar: '66', note: 'on average' },
};

/** How light a drawn slide is (0 dark .. 255 light), from the slide's own background colour: a flat colour, or the first colour of its gradient. null when it cannot be told. */
export function slideTone(svg: string): number | null {
  const m = svg.match(/<rect[^>]*id="bg"[^>]*fill="(#[0-9a-fA-F]{6})"/) ?? svg.match(/<stop[^>]*stop-color="(#[0-9a-fA-F]{6})"/);
  if (!m) return null;
  const v = [1, 3, 5].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  return Math.round(0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2]);
}

/** The two small slides of a card as SVG (null for a slide that could not be drawn). */
export async function cardSlides(name: string): Promise<(string | null)[]> {
  const pack = presetPackFor(name, false);
  const picks = cardPicks(name);
  if (!pack || !picks) return [];
  const { style } = styleFromPack(pack);
  const out: (string | null)[] = [];
  for (const pick of picks) {
    try {
      const fields = HABIT_FIELDS[pick.layout] ?? layoutDef(pick.layout)!.samples.normal;
      const variants = (style.flavour?.variants ?? {}) as Record<string, number>;
      const d = await drawOne({ layout: pick.layout, fields, accents: [] }, variants[pick.layout] === 1 ? 1 : 0, style, { handle: '', index: 1, total: 7, cut: 'plain', invert: pick.invert ?? false, density: 'normal' });
      out.push(d.built ? d.built.svg : null);
    } catch {
      out.push(null);
    }
  }
  return out;
}

/** The fixed sample script of the Preview panel: cover, step, checklist, big stat, myth and fact, quote, closing. */
export const PREVIEW_SCRIPT = {
  title: 'How to keep a habit',
  slides: [
    { type: 'cover', kicker: 'Habits', headline: 'A habit starts smaller than you think', sub: 'Three ways to make it stick.', highlight: 'smaller' },
    { type: 'step', number: 1, headline: 'Make it tiny', body: 'Do the smallest version first, so starting is never a fight.', highlight: 'tiny' },
    { type: 'checklist', headline: 'Before you start', items: ['Pick one habit', 'Set a time', 'Tell a friend'], highlight: 'start' },
    { type: 'stat', value: '66', label: 'days to a new habit', note: 'on average' },
    { type: 'beforeafter', beforeLabel: 'Myth', before: 'You need big willpower.', afterLabel: 'Fact', after: 'You need a small, clear step.' },
    { type: 'quote', quote: 'We are what we repeatedly do.', by: 'A wise coach', highlight: 'repeatedly' },
    { type: 'closing', headline: 'Start with one small step', cta: 'Save this for later', highlight: 'small step' },
  ],
};
export const PREVIEW_COUNT = PREVIEW_SCRIPT.slides.length;

/** The seven sample slides of a style, drawn as a deck by the layout library (SVGs, in order). Empty for a style that is not a built-in preset. */
export async function previewDeck(name: string): Promise<{ svg: string | null; layout: string }[]> {
  const pack = presetPackFor(name, false);
  if (!pack) return [];
  const script = validateScriptText(JSON.stringify(PREVIEW_SCRIPT), 'carousel').script as CarouselScript;
  const made = await libraryDeckFromScript(script, { pack, brief: '', hasPhoto: false, images: [], site: '' }, '');
  if (!made.ok) return [];
  const lib = made.designed.library;
  return script.slides.map((_, i) => ({ svg: made.designed.slides[String(i)]?.built?.svg ?? null, layout: lib?.layouts[i] ?? '' }));
}
