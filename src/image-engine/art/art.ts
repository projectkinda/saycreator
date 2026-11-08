// The vector art extracted from the style packs (scripts/extract-art.mjs + scripts/build-art.mjs): small SVG items normalised to their own bounding box, coloured with tokens
// ($primary $accent $ink $surface $bg) that are replaced by the palette of the slide they are drawn on. Nothing here is a picture: only paths, rects, circles and gradients.
import indexJson from './index.json';

export type ArtRole = 'corner' | 'divider' | 'frame' | 'sticker' | 'badge' | 'background';
export interface ArtItem {
  name: string;
  pack: string;
  file: string;
  bbox: { w: number; h: number };
  tokens: string[];
  role: ArtRole;
  shape: string;
  source: { slide: string; at: { x: number; y: number; w: number; h: number }; alsoOn: string[] };
}
export interface ArtPalette {
  primary: string;
  accent: string;
  ink: string;
  surface: string;
  bg: string;
}

export const ART_INDEX = indexJson as ArtItem[];
const FILES = import.meta.glob('./*/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
export const artKey = (it: Pick<ArtItem, 'pack' | 'name'>) => `${it.pack}/${it.name}`;
export const artItem = (key: string): ArtItem | undefined => ART_INDEX.find((i) => artKey(i) === key);
/** The raw token SVG of an item (null when the file is missing). */
export const artSource = (it: Pick<ArtItem, 'pack' | 'name'>): string | null => FILES[`./${it.pack}/${it.name}.svg`] ?? null;

/** The item recoloured with a palette: every token replaced by its colour. */
export function recolour(svg: string, pal: ArtPalette): string {
  return svg.replace(/\$(primary|accent|ink|surface|bg)\b/g, (_m, k: keyof ArtPalette) => pal[k]);
}
/**
 * The item as markup to draw inside a slide: a nested <svg> at (x, y, w, h) (aspect kept), recoloured, with its gradient ids made unique (`uid`).
 */
export function artMarkup(it: ArtItem, x: number, y: number, w: number, pal: ArtPalette, uid: string): string | null {
  const src = artSource(it);
  if (!src) return null;
  const h = (w * it.bbox.h) / it.bbox.w;
  let inner = recolour(src, pal).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  inner = inner.replace(/\bid="(g\d+|m\d+_[^"]*)"/g, (_m, id: string) => `id="${uid}-${id}"`).replace(/url\(#(g\d+|m\d+_[^)]*)\)/g, (_m, id: string) => `url(#${uid}-${id})`);
  const r = (n: number) => Math.round(n * 10) / 10;
  return `<svg x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" viewBox="0 0 ${it.bbox.w} ${it.bbox.h}" overflow="visible" data-art="${artKey(it)}">${inner}</svg>`;
}
