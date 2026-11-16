// Round T: text over a picture is measured on the pixels as drawn. The flat-colour contrast check (faithfulChecks) only knows a flat colour behind a text slot, so text set on a photo, on the
// blurred copy of a photo or on a veil over a photo was never measured. Here the slide is drawn WITHOUT its text (the photo with its crop and zoom, the blurred backdrop, the scrim or veil, a plate:
// everything that is drawn behind the words), and the pixels under every laid-out line of a text slot that crosses a picture are read. Light text is held against a high percentile of the
// background (the 90th: the bright parts are what wash light text out), dark text against a low one (the 10th). The WCAG contrast ratio of the text colour against that luminance must reach 3:1 for
// large text (48 px or more on the 1080-wide slide: every headline) and 4.5:1 for smaller text (body, captions, the page chrome). Nothing here calls a model.
import { layoutText } from '../image-engine/draw/text';
import type { TextLayer } from '../image-engine/types';
import { svgToPng } from '../reference/faithful';
import { along, gradientStopsOf } from '../reference/faithfulChecks';
import type { Built } from './layouts';

/** The text size (px at 1080 wide) from which a slot counts as large text (3:1); under it, 4.5:1. */
export const LARGE_TEXT_PX = 48;
export const LARGE_MIN = 3;
export const SMALL_MIN = 4.5;
/** The percentile of the background luminance read against light text (dark text: 100 minus it). */
export const LIGHT_PERCENTILE = 90;
/** The width the bare slide is drawn at for the reading (half the 1080 slide: a line of 48 px text is still 24 px tall). */
export const READ_WIDTH = 540;

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const lumOf = (r: number, g: number, b: number) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
export const ratioOf = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const hexRgb = (h: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{6})/i.exec(h.trim());
  return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : null;
};
export const lumOfHex = (h: string): number | null => { const c = hexRgb(h); return c ? lumOf(...c) : null; };

export interface Box { x: number; y: number; w: number; h: number }
/** One text slot that crosses a picture, as measured. */
export interface PhotoContrastRole {
  /** The slot: title, body, kicker ... or `recurring` (the page chrome: page number, handle, swipe cue). */
  role: string;
  /** The first words of the slot (for the report). */
  text: string;
  /** The laid-out text size (px at 1080 wide). */
  size: number;
  ink: string;
  /** light text is read against the 90th percentile of the background, dark text against the 10th. */
  tone: 'light' | 'dark';
  /** The measured contrast ratio of the worst line (2 decimals). */
  ratio: number;
  threshold: number;
  pass: boolean;
  /** The repair that made it pass (Round T part 2), when one was needed. */
  repair?: string;
}
export interface PhotoContrastReading {
  roles: PhotoContrastRole[];
  /** Every role reaches its threshold (true when no text crosses a picture). */
  pass: boolean;
  /** The time the reading took (ms). */
  ms: number;
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
interface LineBox { layer: TextLayer; box: Box; size: number }
/**
 * The pictures of a drawn slide, read from its drawing: every picture the layout engine draws is clipped by a clipPath with id "pic<slide>x<n>" (build.ts), a rectangle or a circle. Used where only
 * the drawing is at hand (the export renderer); the deck code passes the plan's own boxes.
 */
export function pictureBoxesOfSvg(svg: string): Box[] {
  const out: Box[] = [];
  for (const m of svg.matchAll(/<clipPath id="pic\d+x\d+s?">\s*<(rect|circle)\b([^>]*)\/?>/g)) {
    const attrs = new Map([...m[2].matchAll(/([a-z]+)="(-?[\d.]+)"/g)].map((x) => [x[1], Number(x[2])]));
    const a = (k: string) => attrs.get(k) ?? NaN;
    const b = m[1] === 'rect' ? { x: a('x'), y: a('y'), w: a('width'), h: a('height') } : { x: a('cx') - a('r'), y: a('cy') - a('r'), w: 2 * a('r'), h: 2 * a('r') };
    if ([b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0) out.push(b);
  }
  return out;
}
/** The laid-out line boxes of the text slots that cross a picture of the slide (the plan's picture boxes, else the ones read from the drawing). */
export function linesOverPictures(b: Pick<Built, 'layers' | 'images'> & { svg?: string }): LineBox[] {
  const pics: Box[] = b.images?.length ? b.images.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h })) : b.svg ? pictureBoxesOfSvg(b.svg) : [];
  if (!pics.length) return [];
  const out: LineBox[] = [];
  for (const l of b.layers as unknown as TextLayer[]) {
    if (l.kind !== 'text' || l.visible === false || l.role === 'decor' || !l.text?.trim()) continue;
    let block;
    try { block = layoutText(l); } catch { continue; }
    for (const line of block.lines) {
      const ws = line.words.filter((w) => !w.highlighted);
      if (!ws.length) continue;
      const x0 = Math.min(...ws.map((w) => w.x)), x1 = Math.max(...ws.map((w) => w.x + w.width));
      const box = { x: l.x + x0, y: l.y + line.y + block.lineStep * 0.12, w: x1 - x0, h: block.lineStep * 0.8 };
      if (box.w <= 0 || box.h <= 0 || !pics.some((p) => overlaps(p, box))) continue;
      out.push({ layer: l, box, size: block.size });
    }
  }
  return out;
}
/** Whether a slide has any text over a picture (no drawing needed). */
export const hasTextOverPicture = (b: Pick<Built, 'layers' | 'images'> & { svg?: string }): boolean => linesOverPictures(b).length > 0;

/** The slide drawn without its text, as pixels (`READ_WIDTH` wide). */
export async function bareSlide(svg: string): Promise<{ g: OffscreenCanvasRenderingContext2D; k: number; w: number; h: number }> {
  const bare = svg.replace(/<text\b[\s\S]*?<\/text>/g, '');
  const blob = await svgToPng(bare, READ_WIDTH);
  const bm = await createImageBitmap(blob);
  const c = new OffscreenCanvas(bm.width, bm.height);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bm, 0, 0);
  return { g, k: bm.width / 1080, w: bm.width, h: bm.height };
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))];

/** Measures every text slot that crosses a picture, on the slide as drawn. A slide with no text over a picture is not drawn at all. */
export async function measurePhotoContrast(b: Pick<Built, 'layers' | 'svg'> & { images?: Built['images'] }): Promise<PhotoContrastReading> {
  const t0 = performance.now();
  const lines = linesOverPictures(b);
  if (!lines.length) return { roles: [], pass: true, ms: 0 };
  const px = await bareSlide(b.svg);
  // a headline drawn in a gradient (url(#htext)) is read at every colour along its gradient: the worst one counts
  const stops = gradientStopsOf(b.svg);
  const byLayer = new Map<TextLayer, PhotoContrastRole>();
  for (const { layer, box, size } of lines) {
    const inks = layer.name === 'title' && stops ? along(stops) : [layer.style?.color ?? ''];
    const lumsInk = inks.map((c) => ({ c, l: lumOfHex(c) })).filter((x): x is { c: string; l: number } => x.l !== null);
    if (!lumsInk.length) continue;
    const x0 = Math.max(0, Math.floor(box.x * px.k)), x1 = Math.min(px.w, Math.ceil((box.x + box.w) * px.k));
    const y0 = Math.max(0, Math.floor(box.y * px.k)), y1 = Math.min(px.h, Math.ceil((box.y + box.h) * px.k));
    if (x1 <= x0 || y1 <= y0) continue;
    const d = px.g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const lums: number[] = [];
    for (let i = 0; i < d.length; i += 4) lums.push(lumOf(d[i], d[i + 1], d[i + 2]));
    lums.sort((a, c) => a - c);
    let worst: { ink: string; tone: 'light' | 'dark'; ratio: number } | null = null;
    for (const { c, l: inkLum } of lumsInk) {
      const tone: 'light' | 'dark' = inkLum > pct(lums, 50) ? 'light' : 'dark';
      const bgLum = pct(lums, tone === 'light' ? LIGHT_PERCENTILE : 100 - LIGHT_PERCENTILE);
      const ratio = Math.round(ratioOf(inkLum, bgLum) * 100) / 100;
      if (!worst || ratio < worst.ratio) worst = { ink: c, tone, ratio };
    }
    const { ink, tone, ratio } = worst!;
    const threshold = size >= LARGE_TEXT_PX - 0.5 ? LARGE_MIN : SMALL_MIN;
    const prev = byLayer.get(layer);
    if (!prev || ratio < prev.ratio) byLayer.set(layer, { role: layer.name ?? 'text', text: layer.text.trim().slice(0, 40), size: Math.round(size), ink, tone, ratio, threshold, pass: ratio >= threshold });
  }
  const roles = [...byLayer.values()];
  return { roles, pass: roles.every((r) => r.pass), ms: Math.round(performance.now() - t0) };
}

/** The sentence that takes the place of "contrast over gradients ... is not checked" on a slide with text over a picture: the measured result, slot by slot. */
export function photoContrastSentence(m: PhotoContrastReading): string {
  const part = (r: PhotoContrastRole) => `${r.role === 'recurring' ? 'page chrome' : r.role} ${r.ratio.toFixed(2)}:1 (needs ${r.threshold}:1${r.pass ? '' : ', too low'})`;
  return `Text over the picture, measured on the slide as drawn (${LIGHT_PERCENTILE}th percentile of the pixels behind light text, ${100 - LIGHT_PERCENTILE}th behind dark text): ${m.roles.map(part).join('; ')}.`;
}
