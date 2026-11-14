// Round H part B: the three slides the brand editor shows. Drawn by the real code (applyBrand, then the layout library's own redraw), never a mock.
// The current carousel's first three slides (its stored plan, drawn again with the brand being edited), or, when there is no deck yet, a built-in sample of three.
import { applyBrand, type BrandChange, type BrandResult } from './brandPalette';
import { redrawLibraryDeck, type LibraryReport } from './designLibrary';
import { libraryDeckFromScript } from './libraryFromScript';
import { presetPackFor } from './presets';
import { validateScriptText } from './script';
import type { CarouselScript } from '../image-engine/carousel/types';
import type { Doc } from './doc';

export const SAMPLE_SCRIPT = {
  title: 'Your brand on a few slides',
  slides: [
    { type: 'cover', kicker: 'Your brand', headline: 'A headline that makes people stop', sub: 'And a line that makes them swipe.', highlight: 'stop' },
    { type: 'checklist', headline: 'Three steps', items: ['Paste your text', 'Pick a look', 'Get slides'], highlight: 'steps' },
    { type: 'quote', quote: 'Change a headline and nothing reruns.', by: 'Say Creator', highlight: 'nothing reruns' },
  ],
};

export interface BrandPreview {
  /** SVGs, in order (null: that slide could not be drawn). */
  svgs: (string | null)[];
  changes: BrandChange[];
  result: BrandResult | null;
  /** true: the slides are the person's own; false: the built-in sample. */
  own: boolean;
}

/** The change list as the person reads it: the same sentence is said once (a reason that repeats on several slide backgrounds is one line). */
export interface AdjustedLine { kind: BrandChange['kind']; text: string; more: number; from?: string; to?: string }
export function mergeChanges(changes: BrandChange[]): AdjustedLine[] {
  const by = new Map<string, AdjustedLine>();
  for (const c of changes) {
    const have = by.get(c.text);
    if (have) { have.more++; continue; }
    by.set(c.text, { kind: c.kind, text: c.text, more: 0, from: c.from, to: c.to });
  }
  return [...by.values()];
}

export async function brandPreview(doc: Doc, styleName: string, colours: string[], name: string): Promise<BrandPreview> {
  const base = presetPackFor(styleName, true, null) ?? presetPackFor('style-1', true, null);
  if (!base) return { svgs: [], changes: [], result: null, own: false };
  const result = applyBrand(structuredClone(base), { colours, name });
  const handle = doc.script?.brand.handle || '@yourname';
  const lib = doc.designed?.library as LibraryReport | undefined;
  const specs = lib?.plan?.specs;
  if (lib && specs?.length && doc.designed) {
    const part = { ...lib, plan: { ...lib.plan!, specs: specs.slice(0, 3) } } as LibraryReport;
    const out = await redrawLibraryDeck(part, { pack: result.pack, hasPhoto: (doc.photos?.length ?? 0) > 0, images: [], site: '' }, handle);
    return { svgs: [0, 1, 2].slice(0, Math.min(3, specs.length)).map((i) => out.slides[String(i)]?.built?.svg ?? null), changes: result.changes, result, own: true };
  }
  const script = validateScriptText(JSON.stringify(SAMPLE_SCRIPT), 'carousel').script as CarouselScript;
  const made = await libraryDeckFromScript(script, { pack: result.pack, brief: '', hasPhoto: false, images: [], site: '' }, handle);
  if (!made.ok) return { svgs: [], changes: result.changes, result, own: false };
  return { svgs: script.slides.map((_, i) => made.designed.slides[String(i)]?.built?.svg ?? null), changes: result.changes, result, own: false };
}
