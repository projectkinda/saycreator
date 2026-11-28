// Round AL part 2: the layout picker by PURPOSE. A person picks what the slide should do ("Big statement", "Photo on the side", "Numbered step"), not one of 53 layouts:
// the grid shows the best layout of each purpose that fits the slide, the slide's own layout first ("Now"); "More like this" opens the other layouts of that purpose in place;
// the purposes with no layout that fits go under "Why not the others" with a plain reason. The two looks of a layout (its variants) are a plain toggle under the grid.
// UI only: the writer prompt, LAYOUT_IDS and the menu never read this file.
import { layoutDef, type LayoutId } from './layouts';
import { plainVariant } from './plainWords';

export interface Purpose { id: string; name: string; layouts: LayoutId[] }
/** Every layout of the library in exactly one purpose, best first (the first that fits is the purpose's tile). */
export const PURPOSES: Purpose[] = [
  { id: 'statement', name: 'Big statement', layouts: ['statement', 'statement-card', 'statement-pill', 'lead-statement', 'statement-stacked'] },
  { id: 'question', name: 'Question', layouts: ['big-question', 'statement-question'] },
  { id: 'paragraph', name: 'Headline and paragraph', layouts: ['split-text', 'prose', 'headline-card'] },
  { id: 'photo-side', name: 'Photo on the side', layouts: ['split-half', 'art-side-text'] },
  { id: 'photo-stack', name: 'Photo above or below', layouts: ['headline-body-image', 'photo-cover', 'image-row'] },
  { id: 'photo-full', name: 'Full photo', layouts: ['title-over-photo', 'photo-full-caption', 'photo-led', 'photo-grid', 'twin-photos'] },
  { id: 'cover', name: 'Cover', layouts: ['cover-art', 'cover-centred', 'cover-index', 'cover-block', 'cover-sticker', 'cover-word', 'cover-ruled'] },
  { id: 'step', name: 'Numbered step', layouts: ['listicle-numeral', 'step-numeral'] },
  { id: 'list', name: 'List', layouts: ['checklist', 'numbered-list', 'numbered-stagger', 'bullet-list', 'pill-stagger', 'stepper', 'thumb-rows', 'list-under-band', 'list-beside-picture'] },
  { id: 'number', name: 'Number', layouts: ['big-stat', 'stat-bar', 'stat-grid'] },
  { id: 'quote', name: 'Quote', layouts: ['quote'] },
  { id: 'cta', name: 'Call to action', layouts: ['cta-button', 'cta-pair', 'contact-closing', 'portrait-closing'] },
  { id: 'compare', name: 'Compare', layouts: ['comparison'] },
  { id: 'do-dont', name: 'Do and do not', layouts: ['do-dont'] },
  { id: 'timeline', name: 'Timeline', layouts: ['timeline'] },
  { id: 'spotlight', name: 'Spotlight', layouts: ['spotlight'] },
  { id: 'feature', name: 'Feature slider', layouts: ['feature-slider'] },
  { id: 'cards', name: 'Cards', layouts: ['card-grid'] },
  { id: 'phone', name: 'Phone screen', layouts: ['phone-frame'] },
] as Purpose[];

/** What tells a layout apart inside its purpose, in a few plain words ('' when the purpose has one layout). */
const DETAIL: Record<string, string> = {
  statement: 'headline alone', 'statement-card': 'on a card', 'statement-pill': 'with a pill', 'lead-statement': 'with a lead-in line', 'statement-stacked': 'stacked big words',
  'big-question': 'big question mark', 'statement-question': 'under a rule',
  'split-text': 'side by side', prose: 'longer text', 'headline-card': 'text on a card',
  'split-half': 'half and half', 'art-side-text': 'picture beside the text',
  'headline-body-image': 'picture with the text', 'photo-cover': 'wide photo', 'image-row': 'row of pictures',
  'title-over-photo': 'headline on the photo', 'photo-full-caption': 'caption panel', 'photo-led': 'photo first', 'photo-grid': 'grid of photos', 'twin-photos': 'two photos',
  'cover-art': 'with a picture', 'cover-centred': 'centred', 'cover-index': 'big page number', 'cover-block': 'headline in a block', 'cover-sticker': 'on a sticker', 'cover-word': 'one big word', 'cover-ruled': 'between lines',
  'listicle-numeral': 'big number', 'step-numeral': 'step number',
  checklist: 'ticks', 'numbered-list': 'numbered', 'numbered-stagger': 'staggered', 'bullet-list': 'bullets', 'pill-stagger': 'pills', stepper: 'steps in a row', 'thumb-rows': 'with small pictures', 'list-under-band': 'under a picture', 'list-beside-picture': 'beside a picture',
  'big-stat': 'one big number', 'stat-bar': 'with a bar', 'stat-grid': 'several numbers',
  'cta-button': 'one button', 'cta-pair': 'two buttons', 'contact-closing': 'contact details', 'portrait-closing': 'with a portrait',
};
/** The two looks of a layout in plain words, where the library's own names are design words. */
const LOOKS: Record<string, [string, string]> = {
  'listicle-numeral': ['Number on the left', 'Number on top'],
  'step-numeral': ['Number on the left', 'Number on the right'],
  'numbered-list': ['Numbers on the left', 'Numbers in badges'],
  'lead-statement': ['Small line over a huge headline', 'Light lead-in over a heavy headline'],
  'cover-art': ['Round picture', 'Wide picture'],
  'statement-card': ['Plain card', 'Coloured card'],
  'headline-card': ['Plain card', 'Coloured card'],
  'card-grid': ['Two by two', 'Stacked'],
  'split-half': ['Photo on the right (or on top)', 'Photo on the left (or below)'],
  'split-text': ['Divider line', 'Coloured bar'],
  'photo-grid': ['Headline above', 'Headline below'],
  stepper: ['Steps down the slide', 'Steps as numbered dots'],
  'list-under-band': ['Numbers', 'Dots'],
  'numbered-stagger': ['Numbers in the text', 'Big numbers'],
  'stat-grid': ['Main number on the left', 'Main number on top'],
  'twin-photos': ['Captions under', 'Captions under, taller photos'],
};

export const purposeOf = (layout: string): Purpose | undefined => PURPOSES.find((p) => (p.layouts as string[]).includes(layout));
const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
/** The detail of a layout inside its purpose ("on a card"); '' when its purpose has only this one. */
export const layoutDetail = (layout: string): string => ((purposeOf(layout)?.layouts.length ?? 1) > 1 ? DETAIL[layout] ?? '' : '');
/** The name a person reads for a layout: "Big statement, on a card"; "Quote". */
export const purposeLabel = (layout: string): string => {
  const p = purposeOf(layout);
  if (!p) return layoutDef(layout as LayoutId)?.label ?? 'another layout';
  const d = layoutDetail(layout);
  return d ? `${p.name}, ${d}` : p.name;
};
/** The two looks of a layout, as the Arrangement buttons read them. */
export const looksOf = (layout: string): [string, string] => {
  const own = LOOKS[layout];
  if (own) return own;
  const v = layoutDef(layout as LayoutId)?.variants ?? ['first look', 'second look'];
  const a = cap(plainVariant(v[0])), b = cap(plainVariant(v[1]));
  return a === b ? [a, `${b} (second look)`] : [a, b];
};

/** The part of a gallery entry the grid needs. */
export interface PurposeEntry { layout: string; enabled: boolean; current: boolean; reason?: string; fit?: 'clean' | 'change' | 'off'; change?: { drops?: string[] } }
export interface PurposeTile {
  purpose: Purpose;
  /** The layout shown on the purpose's tile: the slide's own layout for its purpose, else the first that fits as it is, else the first that fits with a change. */
  best: string;
  /** The other layouts of the purpose that fit, in order ("More like this"): those that fit as they are, then those that fit with a change. */
  more: string[];
  current: boolean;
  /** Round AM: 'change' when the tile's layout fits only with a change its badges name (the tile sits after the clean ones). */
  fit: 'clean' | 'change';
}
export interface PurposeGrid { tiles: PurposeTile[]; /** Purposes with no layout that can work for this slide, each with one plain reason. */ off: { purpose: Purpose; reason: string }[] }
/** Round AM: the reason of a layout the code could not draw at the text rules' sizes (minimum sizes, margins, contrast). */
export const NOT_DRAWN = 'The words do not fit this layout at a readable size.';
/**
 * The grid of one slide: a tile per purpose with at least one layout that can work (the slide's own purpose first, then the purposes that fit as they are, then those that fit with a
 * change: a number before the headline, a line left out, a photo another slide also shows), the rest under "Why not the others". `failed`: layouts whose picture the code could
 * not draw (the text rules): they cannot work.
 */
export function purposeGrid(entries: PurposeEntry[], failed: ReadonlySet<string> = new Set()): PurposeGrid {
  const by = new Map(entries.map((e) => [e.layout, e]));
  const tiles: PurposeTile[] = [];
  const off: PurposeGrid['off'] = [];
  const fitOf = (l: string): 'clean' | 'change' | 'off' => {
    const e = by.get(l);
    if (!e?.enabled) return 'off';
    if (e.current) return 'clean';
    if (failed.has(l)) return 'off';
    return e.fit ?? 'clean';
  };
  for (const p of PURPOSES) {
    const clean = p.layouts.filter((l) => fitOf(l) === 'clean');
    const change = p.layouts.filter((l) => fitOf(l) === 'change');
    if (!clean.length && !change.length) {
      const near = p.layouts.find((l) => by.get(l)?.enabled);
      const why = near && failed.has(near) ? NOT_DRAWN : (near ? by.get(near)?.reason : undefined) ?? p.layouts.map((l) => by.get(l)?.reason).find(Boolean) ?? 'This slide\'s text does not fit it.';
      off.push({ purpose: p, reason: why });
      continue;
    }
    const cur = clean.find((l) => by.get(l)?.current);
    // a change that keeps every word comes before one that leaves a line out, and one that leaves out less before one that leaves out more (Round AM part 2)
    const lostOf = (l: string) => by.get(l)?.change?.drops?.length ?? 0;
    const changes = change.map((l, k) => [l, k] as const).sort((a, b) => lostOf(a[0]) - lostOf(b[0]) || a[1] - b[1]).map(([l]) => l);
    const all = [...clean, ...changes];
    const best = cur ?? all[0];
    tiles.push({ purpose: p, best, more: all.filter((l) => l !== best), current: !!cur, fit: clean.includes(best) ? 'clean' : 'change' });
  }
  const rank = (t: PurposeTile) => (t.current ? 0 : t.fit === 'clean' ? 1 : 2);
  tiles.sort((a, b) => rank(a) - rank(b));
  return { tiles, off };
}
