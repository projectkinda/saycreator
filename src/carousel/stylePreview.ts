// What a built-in style really looks like, for the cards of step 3 and the Preview panel. No model call.
//   - cardSlides: two small slides under the cover, in the two layouts the style likes most (its flavour's "prefer" list), chosen so that no two styles show the same pair.
//   - previewDeck: a strip of seven sample slides in the style, drawn by the layout library from ONE fixed sample script, by the same code a real pasted script goes through.
// The small slides are drawn with drawOne, the function every deck slide is drawn with; the strip is a deck made by libraryDeckFromScript.
import { drawOne, styleFromPack } from './designLibrary';
import { libraryDeckFromScript } from './libraryFromScript';
import { IMAGE_LAYOUT_IDS } from './layouts/images';
import { layoutDef } from './layouts';
import { presetPackFor } from './presets';
import { carouselStyles } from './render';
import { isUserStyle } from '../reference/templates';
import { validateScriptText } from './script';
import type { CarouselScript } from '../image-engine/carousel/types';

/** Layouts that make a cover: the card already shows the cover, so the two small slides are never one of these. */
const COVER_LAYOUTS = new Set(['statement', 'statement-stacked', 'statement-card', 'statement-pill', 'lead-statement', 'big-question', 'statement-question', 'photo-led', 'photo-cover', 'cover-art']);
const IMAGES = new Set<string>(IMAGE_LAYOUT_IDS as readonly string[]);

/** The built-in presets in the order the cards are listed. */
export const presetNames = (): string[] => carouselStyles().map((s) => s.spec.name).filter((n) => !isUserStyle(n) && !!presetPackFor(n, false));

const likes = (name: string): string[] => {
  const pack = presetPackFor(name, false);
  if (!pack) return [];
  const prefer = (styleFromPack(pack).style.flavour?.prefer ?? []) as string[];
  return prefer.filter((l) => !COVER_LAYOUTS.has(l) && !IMAGES.has(l) && !!layoutDef(l)?.samples?.normal);
};

/**
 * The two layouts each style shows under its cover. A style shows layouts it likes (its flavour's prefer list, in order); among the pairs it could show, the pair used by no other style
 * and made of the layouts the fewest other styles show comes first, so different styles show different layouts.
 */
export function cardPairs(names = presetNames()): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  const used = new Set<string>();
  const usage: Record<string, number> = {};
  for (const name of names) {
    const c = likes(name);
    let best: { pair: [string, string]; score: number } | null = null;
    for (let i = 0; i < c.length; i++)
      for (let j = i + 1; j < c.length; j++) {
        const key = [c[i], c[j]].sort().join('+');
        if (used.has(key)) continue;
        // fewer shared layouts first; then the layouts the style likes best (lower positions)
        const score = (usage[c[i]] ?? 0) * 100 + (usage[c[j]] ?? 0) * 100 + i + j;
        if (!best || score < best.score) best = { pair: [c[i], c[j]], score };
      }
    if (!best && c.length >= 2) best = { pair: [c[0], c[1]], score: 0 };
    if (!best) continue;
    out[name] = best.pair;
    used.add([...best.pair].sort().join('+'));
    for (const l of best.pair) usage[l] = (usage[l] ?? 0) + 1;
  }
  return out;
}

/** The two small slides of a card as SVG (null for a slide that could not be drawn). */
export async function cardSlides(name: string): Promise<(string | null)[]> {
  const pack = presetPackFor(name, false);
  const pair = cardPairs()[name];
  if (!pack || !pair) return [];
  const { style } = styleFromPack(pack);
  const out: (string | null)[] = [];
  for (const layout of pair) {
    try {
      const fields = layoutDef(layout)!.samples.normal;
      const variants = (style.flavour?.variants ?? {}) as Record<string, number>;
      const d = await drawOne({ layout, fields, accents: [] }, variants[layout] === 1 ? 1 : 0, style, { handle: '', index: 1, total: 7, cut: 'plain', invert: false, density: 'normal' });
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
