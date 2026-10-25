// Turns a script and a loaded style into slide plans. Each slide gets a layout chosen from the style's rules by the slide's
// content and its position in the deck, and a palette chosen by the deck's rhythm. Needs the fonts loaded first.
import type { Layer, Plan } from '../types';
import { progressDots, solidOf, swipeCue } from '../carousel/toolbox';
import { SLIDE, type CarouselScript, type ComposedSlide, type Palette, type SlideScript, type Theme } from '../carousel/types';
import type { LayoutRule, SlideType, StyleSpec, When } from './format';
import { add, type LCtx } from './kit';
import type { LoadedStyle } from './load';
import * as A from './layouts-a';
import * as B from './layouts-b';
import { placeElements, type TestAsset } from './elements';
import { labelText, pageNumber } from './tools';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Layout = (c: LCtx, s: any) => void;
export const LAYOUTS: Record<string, Layout> = {
  'cover-stack': A.coverStack,
  'cover-top': A.coverTop,
  'cover-centre': A.coverCentre,
  'content-stack': A.contentStack,
  'content-bar': A.contentBar,
  'content-columns': A.contentColumns,
  'step-badge': A.stepBadge,
  'step-numeral': A.stepNumeral,
  'step-pill': A.stepPill,
  'stat-giant': B.statGiant,
  'stat-card': B.statCard,
  'checklist-icons': B.checklistIcons,
  'checklist-lines': B.checklistLines,
  'ba-split': B.baSplit,
  'ba-cards': B.baCards,
  'quote-marks': B.quoteMarks_,
  'quote-centre': B.quoteCentre,
  'closing-button': B.closingButton,
  'closing-bar': B.closingBar,
};

export interface StyledSlide extends ComposedSlide {
  style: string;
  /** The layout variant that was used, for example "cover-stack". */
  layout: string;
  /** Which rule of the style picked it (0 is the first). */
  rule: number;
  palette: string;
  /** Why this rule matched, in plain words. */
  because: string;
  /** Library element ids, or test asset names, placed on this slide. */
  elementsUsed: string[];
  /** The slide's element_tags, if the script has them. */
  elementTags?: string[];
  /** For each placed element, whether it links to those tags. */
  elementLinks?: { id: string; related: boolean | null; score: number }[];
  /** The layout variants this style has for this kind of slide (the one in use is `layout`). */
  layoutChoices: string[];
}

const wordCount = (s?: string) => (s ?? '').split(/\s+/).filter(Boolean).length;

interface Facts {
  index: number;
  occurrence: number;
  headlineWords: number;
  bodyWords: number;
  items: number;
  valueChars: number;
  quoteChars: number;
}

function factsOf(s: SlideScript, index: number, occurrence: number): Facts {
  const any = s as unknown as Record<string, unknown>;
  return {
    index,
    occurrence,
    headlineWords: wordCount((any.headline ?? any.quote ?? any.label) as string | undefined),
    bodyWords: wordCount((any.body ?? any.sub ?? any.after ?? any.note) as string | undefined),
    items: Array.isArray(any.items) ? any.items.length : 0,
    valueChars: typeof any.value === 'string' ? any.value.length : 0,
    quoteChars: typeof any.quote === 'string' ? any.quote.length : 0,
  };
}

/** Every condition given must hold. Returns the plain-words reason when it matches, otherwise null. */
export function matches(w: When | undefined, f: Facts): string | null {
  if (!w || Object.keys(w).length === 0) return 'no condition (the fallback rule)';
  const why: string[] = [];
  const need = (ok: boolean, text: string) => {
    if (!ok) return false;
    why.push(text);
    return true;
  };
  if (w.indexMin !== undefined && !need(f.index >= w.indexMin, `slide ${f.index + 1} is at or after position ${w.indexMin + 1}`)) return null;
  if (w.indexMax !== undefined && !need(f.index <= w.indexMax, `slide ${f.index + 1} is at or before position ${w.indexMax + 1}`)) return null;
  if (w.headlineWordsMin !== undefined && !need(f.headlineWords >= w.headlineWordsMin, `the headline has ${f.headlineWords} words (at least ${w.headlineWordsMin})`)) return null;
  if (w.headlineWordsMax !== undefined && !need(f.headlineWords <= w.headlineWordsMax, `the headline has ${f.headlineWords} words (at most ${w.headlineWordsMax})`)) return null;
  if (w.bodyWordsMin !== undefined && !need(f.bodyWords >= w.bodyWordsMin, `the body has ${f.bodyWords} words (at least ${w.bodyWordsMin})`)) return null;
  if (w.bodyWordsMax !== undefined && !need(f.bodyWords <= w.bodyWordsMax, `the body has ${f.bodyWords} words (at most ${w.bodyWordsMax})`)) return null;
  if (w.itemsMin !== undefined && !need(f.items >= w.itemsMin, `the list has ${f.items} items (at least ${w.itemsMin})`)) return null;
  if (w.itemsMax !== undefined && !need(f.items <= w.itemsMax, `the list has ${f.items} items (at most ${w.itemsMax})`)) return null;
  if (w.valueCharsMax !== undefined && !need(f.valueChars <= w.valueCharsMax, `the number is ${f.valueChars} characters (at most ${w.valueCharsMax})`)) return null;
  if (w.quoteCharsMin !== undefined && !need(f.quoteChars >= w.quoteCharsMin, `the quote is ${f.quoteChars} characters (at least ${w.quoteCharsMin})`)) return null;
  if (w.occurrence !== undefined && !need(w.occurrence === 'odd' ? f.occurrence % 2 === 1 : f.occurrence % 2 === 0, `it is the ${f.occurrence}${['th', 'st', 'nd', 'rd'][f.occurrence % 10 > 3 || Math.floor(f.occurrence / 10) === 1 ? 0 : f.occurrence % 10]} slide of this type`)) return null;
  return why.join(', ');
}

export function pickRule(style: StyleSpec, type: SlideType, slide: SlideScript, index: number, occurrence: number): { rule: LayoutRule; at: number; because: string } {
  const f = factsOf(slide, index, occurrence);
  const rules = style.layouts[type];
  for (let i = 0; i < rules.length; i++) {
    const m = matches(rules[i].when, f);
    if (m !== null) return { rule: rules[i], at: i, because: m };
  }
  return { rule: rules[rules.length - 1], at: rules.length - 1, because: 'no rule matched, so the last one was used' };
}

export function asTheme(style: StyleSpec, pal: Palette): Theme {
  return { id: style.name, name: style.title, mood: '', base: pal, hero: pal, fonts: style.fonts, type: style.type, shape: style.shape, spacing: style.spacing, ...(style.bodyLineHeight ? { bodyLineHeight: style.bodyLineHeight } : {}) };
}

export interface StyledOptions {
  width?: number;
  height?: number;
  /** Replace the style's page chrome (for example "none" for a single quote card). */
  chrome?: StyleSpec['chrome'];
  /** The account name for closing slides. */
  handle?: string;
  /** Place illustrative elements as the style asks: from the shippable library, or from the private test assets (test renders only). */
  elements?: 'shippable' | 'test';
  testAssets?: TestAsset[];
  /** "ignore": place as if no slide had element_tags (the old random way), to compare. The tags are still recorded in the plan. */
  elementMatching?: 'tags' | 'ignore';
  /** Per slide (0-based index): a layout variant chosen by hand, a salt that reshuffles the elements, and element swaps (old id to new id). */
  overrides?: Record<number, SlideOverride>;
}

export interface SlideOverride {
  layout?: string;
  salt?: string;
  swaps?: Record<string, string>;
}

function chromeArea(chrome: StyleSpec['chrome'], M: number, H: number) {
  if (chrome === 'dots-swipe') return { top: M, bottom: H - (H > 1200 ? 210 : 180) };
  if (chrome === 'page-number') return { top: M, bottom: H - M - 90 };
  if (chrome === 'strip') return { top: M + 96, bottom: H - M - 20 };
  return { top: M, bottom: H - M };
}

/** Slide plans for one script in one style. A deck has 7 slides; pass `anyCount` for a set of single cards. */
export function composeStyled(script: Pick<CarouselScript, 'id' | 'slides' | 'brand'>, loaded: LoadedStyle, opts: StyledOptions = {}, anyCount = false): StyledSlide[] {
  const style = loaded.spec;
  if (!anyCount && script.slides.length !== 7) throw new Error(`A carousel script needs exactly 7 slides (this one has ${script.slides.length}).`);
  const W = opts.width ?? SLIDE.width;
  const H = opts.height ?? SLIDE.height;
  const chrome = opts.chrome ?? style.chrome;
  const M = style.spacing.margin;
  const seen: Record<string, number> = {};
  return script.slides.map((s, i) => {
    seen[s.type] = (seen[s.type] ?? 0) + 1;
    let { rule, at, because } = pickRule(style, s.type, s, i, seen[s.type]);
    const ov = opts.overrides?.[i];
    const choices = [...new Set(style.layouts[s.type].map((r) => r.use))];
    if (ov?.layout && ov.layout !== rule.use) {
      const j = style.layouts[s.type].findIndex((r) => r.use === ov.layout);
      if (j >= 0) {
        rule = style.layouts[s.type][j];
        at = j;
        because = 'you chose this layout';
      }
    }
    const palName = rule.palette ?? style.byType?.[s.type] ?? style.rhythm[i % style.rhythm.length];
    const pal = style.palettes[palName];
    const area = chromeArea(chrome, M, H);
    const c: LCtx = {
      style, theme: asTheme(style, pal), assets: loaded.assets, pal, palName, W, H, M, top: area.top, bottom: area.bottom, index: i, count: script.slides.length,
      occurrence: seen[s.type], handle: script.brand.handle, layers: [], notes: [], params: rule.params ?? {},
    };
    LAYOUTS[rule.use](c, s);
    // Page chrome, drawn last so it sits on top.
    const cp = c.chromePal ?? pal;
    const theme = asTheme(style, cp);
    const layers: Layer[] = [];
    if (chrome === 'dots-swipe') {
      const mid = H - (H > 1200 ? 112 : 96);
      layers.push(...progressDots(cp, 'dots', M, mid, i, script.slides.length));
      if (i < script.slides.length - 1) layers.push(...swipeCue(theme, cp, 'swipe', W - M, mid));
    } else if (chrome === 'page-number') layers.push(...pageNumber(theme, cp, 'page', W - M, H - M - 36, i, script.slides.length));
    else if (chrome === 'strip') {
      const t = labelText(theme, cp, 'strip-handle', M, M, script.brand.handle, { upper: false, width: W - 2 * M - 300 });
      layers.push(t.layer, ...pageNumber(theme, cp, 'page', W - M, M, i, script.slides.length));
    }
    add(c, ...layers);
    let elementsUsed: string[] = [];
    let elementLinks: StyledSlide['elementLinks'];
    if (opts.elements && style.elements) {
      const id = `${script.id}-${style.name}-${String(i + 1).padStart(2, '0')}${ov?.salt ? '#' + ov.salt : ''}`;
      const placed = placeElements({ spec: style.elements, pal, layers: c.layers, width: W, height: H, type: s.type, seed: id, mode: opts.elements, testAssets: opts.testAssets, paletteName: palName, slideTags: s.element_tags, ignoreTags: opts.elementMatching === 'ignore', swaps: ov?.swaps });
      add(c, ...placed.layers);
      c.notes.push(...placed.notes);
      elementsUsed = placed.used;
      elementLinks = placed.links;
    }
    const plan: Plan = { schema: 1, revision: 1, canvas: { width: W, height: H, background: solidOf(pal.bg) }, layers: c.layers, ...(s.element_tags ? { meta: { elementTags: s.element_tags } } : {}) };
    return { id: `${script.id}-${style.name}-${String(i + 1).padStart(2, '0')}`, type: s.type, plan, notes: c.notes, style: style.name, layout: rule.use, rule: at, palette: palName, because, elementsUsed, layoutChoices: choices, ...(s.element_tags ? { elementTags: s.element_tags } : {}), ...(elementLinks ? { elementLinks } : {}) };
  });
}
