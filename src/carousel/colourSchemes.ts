// Round H part A: the colour scheme a carousel is drawn with. Stored on the Doc as `scheme` (optional):
//   absent        the style's own colours (every old document, and the default)
//   kind 'brand'  { id, name, colours }: the person's brand. The colours are a copy taken when it was applied; while the brand still exists its CURRENT colours are used.
//   kind 'combo'  { id, name, colours }: one of the ready-made combinations (image-engine/styles/colourCombinations.ts).
import { COLOUR_COMBINATIONS } from '../image-engine/styles/colourCombinations';
import { loadBrands, normaliseHex, type SavedBrand } from './brandStore';

export type ColourScheme =
  | { kind: 'brand'; id: string; name: string; colours: string[] }
  | { kind: 'combo'; id: string; name: string; colours: string[] };

/** A scheme read from a saved document: anything that does not fit is "the style's own colours" (undefined). */
export function cleanScheme(raw: unknown): ColourScheme | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  if ((s.kind !== 'brand' && s.kind !== 'combo') || typeof s.id !== 'string' || !Array.isArray(s.colours)) return undefined;
  const colours = s.colours.map(normaliseHex).filter((c): c is string => !!c).slice(0, 3);
  if (!colours.length) return undefined;
  return { kind: s.kind, id: s.id, name: typeof s.name === 'string' ? s.name.slice(0, 40) : '', colours };
}

export const schemeOfBrand = (b: SavedBrand): ColourScheme => ({ kind: 'brand', id: b.id, name: b.name, colours: [...b.colours] });
export const schemeOfCombo = (id: string): ColourScheme | undefined => {
  const c = COLOUR_COMBINATIONS.find((x) => x.id === id);
  return c ? { kind: 'combo', id: c.id, name: c.name, colours: [...c.colours] } : undefined;
};

/** The scheme to draw with: a brand that still exists gives its current colours and name, otherwise the stored copy. */
export function effectiveScheme(scheme: ColourScheme | undefined | null, brands: SavedBrand[] = loadBrands().brands): ColourScheme | null {
  if (!scheme) return null;
  if (scheme.kind === 'brand') {
    const b = brands.find((x) => x.id === scheme.id);
    if (b && b.colours.length) return schemeOfBrand(b);
  }
  return scheme;
}

export const sameColours = (a: string[] | undefined, b: string[] | undefined): boolean => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/** The scheme a new carousel starts with: the active brand, else the style's own colours. */
export function startScheme(): ColourScheme | undefined {
  const s = loadBrands();
  const b = s.brands.find((x) => x.id === s.activeId);
  return b && b.colours.length ? schemeOfBrand(b) : undefined;
}
