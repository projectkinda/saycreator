// Shared helpers for the layout catalogue. A layout is a function that adds layers to a slide using the style's tokens.
import { glueWords, layoutText } from '../draw/text';
import type { Highlight, Layer, Plan } from '../types';
import { background, buildText, marker, sticker, type Built } from '../carousel/toolbox';
import type { Palette, Theme } from '../carousel/types';
import type { StyleSpec } from './format';
import { assetLayers, type SvgAsset } from './svg';
import { labelText, outlinePill } from './tools';

export interface LCtx {
  style: StyleSpec;
  /** The style as a carousel theme, with the current palette as both of its palettes. */
  theme: Theme;
  assets: Record<string, SvgAsset>;
  pal: Palette;
  palName: string;
  W: number;
  H: number;
  M: number;
  /** The content area, below any strip at the top and above any dots or page number at the bottom. */
  top: number;
  bottom: number;
  index: number;
  count: number;
  /** Palette for the page chrome when a layout changes the colours at the bottom (a split slide). */
  chromePal?: Palette;
  /** The account name shown on the last slide. */
  handle: string;
  /** 1 for the first slide of this type in the deck, 2 for the second... */
  occurrence: number;
  layers: Layer[];
  notes: string[];
  /** Areas a layout wants kept free of pictures (a split line and its arrow button). Pictures are never placed there, and the check fails if one is. */
  keepClear: NonNullable<NonNullable<Plan['meta']>['keepClear']>;
  params: Record<string, string | number | boolean>;
}

export const add = (c: LCtx, ...l: Layer[]) => c.layers.push(...l);
export const bg = (c: LCtx) => add(c, background(c.pal, c.W, c.H));

export function cased(c: LCtx, s: string): string {
  return c.style.caseStyle === 'upper' ? s.toUpperCase() : c.style.caseStyle === 'lower' ? s.toLowerCase() : s;
}


export interface HeadOpts {
  /** The area the text may use, top and bottom y. */
  region: [number, number];
  anchor?: 'top' | 'bottom' | 'middle';
  x?: number;
  width?: number;
  size?: number;
  min?: number;
  align?: 'left' | 'center' | 'right';
  /** Marked words in the style's marker (box, underline or brush), per-line bars on the last line or every line, or nothing. */
  mark?: 'words' | 'last-line' | 'all-lines' | 'none';
  words?: string[];
  color?: string;
  pal?: Palette;
  /** Keep the text as written instead of applying the style's upper or lower case. */
  asWritten?: boolean;
  /** Measure only: add nothing to the slide. */
  dry?: boolean;
}

function bars(c: LCtx, pal: Palette): Highlight {
  return { words: [], color: pal.marker, textColor: pal.onMarker, paddingX: 12, paddingY: 0, radius: Math.round(c.style.shape.radius / 4), hugLine: c.style.headlineLineHeight < 1.1 };
}

/** A headline in the style's voice. Adds the text (and any marker layers) and returns the measurement. */
export function head(c: LCtx, id: string, text: string, o: HeadOpts): Built {
  const t = c.theme;
  const pal = o.pal ?? c.pal;
  const x = o.x ?? c.M;
  const width = o.width ?? c.W - 2 * c.M;
  const written = o.asWritten ? text : cased(c, text);
  const size0 = o.size ?? t.type.headline;
  // A highlighted phrase stays on one line when it fits, so its bar is one block.
  const glued = o.words?.length && (o.mark ?? 'words') === 'words' ? glueWords(written, o.words, width, t.fonts.headline, t.fonts.headlineWeight, size0) : written;
  const built = buildText({
    id, x, y: o.region[0], width, text: glued, font: t.fonts.headline, weight: t.fonts.headlineWeight,
    size: o.size ?? t.type.headline, minSize: o.min ?? 64, maxHeight: o.region[1] - o.region[0], color: o.color ?? pal.text, lineHeight: c.style.headlineLineHeight, align: o.align ?? 'left',
  });
  c.notes.push(...built.notes);
  const [y0, y1] = o.region;
  const y = o.anchor === 'bottom' ? y1 - built.height : o.anchor === 'middle' ? y0 + (y1 - y0 - built.height) / 2 : y0;
  built.layer.y = Math.round(y * 10) / 10;
  if (o.dry) return built;
  const mode = o.mark ?? (o.words?.length ? 'words' : 'none');
  if (mode === 'words' && o.words?.length) {
    const m = marker(t, pal, built.layer, o.words, `${id}-marker`);
    add(c, ...m.behind, { ...built.layer, ...(m.highlight ? { highlight: { ...m.highlight, hugLine: c.style.headlineLineHeight < 1.1 } } : {}) });
  } else if (mode === 'last-line' || mode === 'all-lines') {
    const block = layoutText(built.layer);
    const hl = bars(c, pal);
    hl.lines = mode === 'all-lines' ? block.lines.map((_, i) => i) : [block.lines.length - 1];
    add(c, { ...built.layer, highlight: hl });
  } else add(c, built.layer);
  return built;
}

export interface BodyOpts {
  x?: number;
  y: number;
  width?: number;
  size?: number;
  min?: number;
  maxH?: number;
  color?: string;
  pal?: Palette;
  align?: 'left' | 'center' | 'right';
  font?: 'body' | 'headline';
  /** Measure only, do not add. */
  dry?: boolean;
  asWritten?: boolean;
}

export function body(c: LCtx, id: string, text: string, o: BodyOpts): Built {
  const t = c.theme;
  const pal = o.pal ?? c.pal;
  const b = buildText({
    id, x: o.x ?? c.M, y: o.y, width: o.width ?? c.W - 2 * c.M, text: o.asWritten === false ? cased(c, text) : text, font: o.font === 'headline' ? t.fonts.headline : t.fonts.body,
    weight: o.font === 'headline' ? t.fonts.headlineWeight : t.fonts.bodyWeight, size: o.size ?? t.type.body, minSize: o.min ?? Math.min(o.size ?? t.type.body, 32), maxHeight: o.maxH, color: o.color ?? pal.text, lineHeight: t.bodyLineHeight ?? 1.3, align: o.align ?? 'left',
  });
  c.notes.push(...b.notes);
  if (!o.dry) add(c, b.layer);
  return b;
}

/** The small first line of a slide: a sticker, an outlined pill or a plain label, as the layout asks. Returns its height. */
export function kicker(c: LCtx, text: string, x: number, y: number): number {
  const mode = String(c.params.kicker ?? 'label');
  if (mode === 'sticker') {
    const k = sticker(c.theme, c.pal, 'kicker', x, y, text);
    add(c, ...k.layers);
    return k.height;
  }
  if (mode === 'pill') {
    const k = outlinePill(c.theme, c.pal, 'kicker', x, y, text);
    add(c, ...k.layers);
    return k.height;
  }
  const t = labelText(c.theme, c.pal, 'kicker', x, y, `${c.params.prefix ?? ''}${text}`, { color: c.pal.accent === c.pal.bg ? c.pal.muted : c.pal.muted });
  add(c, t.layer);
  return t.height;
}

/** A style asset as layers, if the style has it. */
export function asset(c: LCtx, name: unknown, id: string, x: number, y: number, width: number, o: { strokeScale?: number } = {}): { height: number } {
  const a = typeof name === 'string' ? c.assets[name] : undefined;
  if (!a) return { height: 0 };
  add(c, ...assetLayers(a, id, x, y, width, c.pal, 'decor', o.strokeScale));
  return { height: (a.height * width) / a.width };
}

export const num = (c: LCtx, k: string, d: number) => (typeof c.params[k] === 'number' ? (c.params[k] as number) : d);
