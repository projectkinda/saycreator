// The layout gallery: layouts made by designers, kept as boxes only (see free-spec.ts). The data is a TEST SET read from a local file by the dev
// server: it is never part of a build, and nothing here holds a picture or a template's words.
import { MARK_KINDS } from '../image-engine/styles/marks-spec';
import { SLIDE_TYPES } from '../image-engine/styles/format';
import { validateFree, type FreeLayout } from '../image-engine/styles/free-spec';

export interface GalleryLayout {
  id: string;
  /** Where it came from, as a short id (never a link to a picture). */
  from: string;
  format: string;
  category: string;
  /** The template's own size in px; boxes are percent of exactly this shape. */
  w: number;
  h: number;
  /** The shape in words: 16:9, 4:5, 1:1, 9:16 or the size when it is none of those. */
  ratio: string;
  keywords: string[];
  textCount: number;
  photoCount: number;
  free: FreeLayout;
  /** How many near-identical layouts were folded into this one. */
  similar?: number;
}
export interface GalleryFile {
  label: string;
  source: string;
  made: string;
  chosen: number;
  afterDedupe: number;
  layouts: GalleryLayout[];
}

/** Where the dev server serves the test set from. A built app has no such address, so the screen says there is nothing to show. */
export const LAYOUT_DATA_URL = '/__layouts/crello';
export const LONGEST_TEXT = 40;
/** The notes about what a layout cannot do are sentences of ours, not template text. */
export const LONGEST_NOTE = 140;

/** Plain-language problems with one gallery layout (none when it is good). It also refuses anything that looks like a picture or a long text. */
export function checkGalleryLayout(l: GalleryLayout): string[] {
  const problems: string[] = [];
  validateFree({ cover: l.free }, SLIDE_TYPES, MARK_KINDS, (m) => problems.push(m));
  if (!(l.w > 0 && l.h > 0)) problems.push('The size is missing.');
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'string') {
      if (v.length > (path.includes('.missing[') ? LONGEST_NOTE : LONGEST_TEXT)) problems.push(`${path} is a long text (${v.length} characters).`);
      if (/^(data:|https?:)/i.test(v)) problems.push(`${path} looks like a picture or a link.`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(l, 'layout');
  return problems;
}

/** The aspect ratio as a number (width over height). */
export const aspectOf = (l: Pick<GalleryLayout, 'w' | 'h'>) => l.w / l.h;
/** True when the shape is the carousel's own 4:5 (to within 6%): the only shape a carousel slide can draw a stored layout at without stretching it. */
export const isCarouselShape = (l: Pick<GalleryLayout, 'w' | 'h'>) => Math.abs(aspectOf(l) / 0.8 - 1) < 0.06;
