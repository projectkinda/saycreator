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
export interface PurposeEntry { layout: string; enabled: boolean; current: boolean; reason?: string }
export interface PurposeTile { purpose: Purpose; /** The layout shown on the purpose's tile: the slide's own layout for its purpose, else the first that fits. */ best: string; /** The other layouts of the purpose that fit, in order ("More like this"). */ more: string[]; current: boolean }
export interface PurposeGrid { tiles: PurposeTile[]; /** Purposes with no layout that fits this slide, each with one plain reason. */ off: { purpose: Purpose; reason: string }[] }
/** The grid of one slide: a tile per purpose with at least one layout that fits (the slide's own purpose first), the rest under "Why not the others". */
export function purposeGrid(entries: PurposeEntry[]): PurposeGrid {
  const by = new Map(entries.map((e) => [e.layout, e]));
  const tiles: PurposeTile[] = [];
  const off: PurposeGrid['off'] = [];
  for (const p of PURPOSES) {
    const fit = p.layouts.filter((l) => by.get(l)?.enabled);
    if (!fit.length) {
      const why = p.layouts.map((l) => by.get(l)?.reason).find(Boolean) ?? 'This slide\'s text does not fit it.';
      off.push({ purpose: p, reason: why });
      continue;
    }
    const cur = fit.find((l) => by.get(l)?.current);
    const best = cur ?? fit[0];
    tiles.push({ purpose: p, best, more: fit.filter((l) => l !== best), current: !!cur });
  }
  tiles.sort((a, b) => Number(b.current) - Number(a.current));
  return { tiles, off };
}
