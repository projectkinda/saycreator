// Round T: text over a picture is measured on the pixels as drawn. The flat-colour contrast check (faithfulChecks) only knows a flat colour behind a text slot, so text set on a photo, on the
// blurred copy of a photo or on a veil over a photo was never measured. Here the slide is drawn WITHOUT its text (the photo with its crop and zoom, the blurred backdrop, the scrim or veil, a plate:
// everything that is drawn behind the words), and the pixels under every laid-out line of a text slot that crosses a picture are read. Light text is held against a high percentile of the
// background (the 90th: the bright parts are what wash light text out), dark text against a low one (the 10th). The WCAG contrast ratio of the text colour against that luminance must reach 3:1 for
// large text (48 px or more on the 1080-wide slide: every headline) and 4.5:1 for smaller text (body, captions, the page chrome). Nothing here calls a model.
import { layoutText } from '../image-engine/draw/text';
import type { TextLayer } from '../image-engine/types';
import { svgToPng } from '../reference/faithful';
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
interface LineBox { key: unknown; role: string; text: string; ink: string; box: Box; size: number }
/**
 * The page chrome a style's devices draw as text of their own (not a text layer): the side label (the handle set upright along the right edge, devices.ts). Read from the drawing, so the deck and the
 * export renderer measure the same thing. Its box is estimated the way the builder estimates text (0.58 em per character).
 */
export function sideLabelsOfSvg(svg: string): { text: string; ink: string; size: number; box: Box }[] {
  const out: { text: string; ink: string; size: number; box: Box }[] = [];
  for (const m of svg.matchAll(/<text transform="translate\(([\d.]+) ([\d.]+)\) rotate\(-90\)"[^>]*font-size="([\d.]+)"[^>]*fill="(#[0-9A-Fa-f]{6})">([^<]*)<\/text>/g)) {
    const [cx, cy, size] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const len = m[5].length * size * 0.58;
    out.push({ text: m[5].replace(/&amp;/g, '&').replace(/&lt;/g, '<'), ink: m[4], size, box: { x: cx - size * 0.75, y: cy - len / 2, w: size * 0.95, h: len } });
  }
  return out;
}
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
/** The picture boxes of a slide: the plan's, and (Round V) the ones read from the drawing, which reach the slide's edges where a picture bleeds under the page chrome. */
export function pictureBoxesOf(b: Pick<Built, 'images'> & { svg?: string }): Box[] {
  return [...(b.images ?? []).map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h })), ...(b.svg ? pictureBoxesOfSvg(b.svg) : [])];
}
/** The laid-out line boxes of the text slots that cross a picture of the slide (the plan's picture boxes and the ones read from the drawing). */
export function linesOverPictures(b: Pick<Built, 'layers' | 'images'> & { svg?: string }): LineBox[] {
  const pics: Box[] = pictureBoxesOf(b);
  if (!pics.length) return [];
  const out: LineBox[] = [];
  for (const l of b.layers as unknown as TextLayer[]) {
    if (l.kind !== 'text' || l.visible === false || l.role === 'decor' || !l.text?.trim()) continue;
    let block;
    try { block = layoutText(l); } catch { continue; }
    for (const line of block.lines) {
      // Round AE: a word on a marker bar reads on its bar (its own ink), so the line is read in RUNS of the words between the bars: one box spanning a bar would read the bar's colour
      // against the line's ink ("get low or get high" with "low" on a dark-red bar measured 1.77:1 at every scrim level)
      const runs: (typeof line.words)[] = [[]];
      for (const w of line.words) {
        if (w.highlighted) { if (runs[runs.length - 1].length) runs.push([]); continue; }
        runs[runs.length - 1].push(w);
      }
      for (const ws of runs) {
        if (!ws.length) continue;
        const x0 = Math.min(...ws.map((w) => w.x)), x1 = Math.max(...ws.map((w) => w.x + w.width));
        const box = { x: l.x + x0, y: l.y + line.y + block.lineStep * 0.12, w: x1 - x0, h: block.lineStep * 0.8 };
        if (box.w <= 0 || box.h <= 0 || !pics.some((p) => overlaps(p, box))) continue;
        out.push({ key: l, role: l.name ?? 'text', text: l.text.trim().slice(0, 40), ink: l.style?.color ?? '', box, size: block.size });
      }
    }
  }
  if (b.svg) for (const sl of sideLabelsOfSvg(b.svg)) if (pics.some((p) => overlaps(p, sl.box))) out.push({ key: 'side-label', role: 'side-label', text: sl.text, ink: sl.ink, box: sl.box, size: sl.size });
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

/**
 * A headline drawn in a gradient (url(#htext), devices.ts): the colours the gradient takes over one line box. The gradient runs along the line from (x1, y1) to (x2, y2) in slide units with evenly spaced
 * stops; a line shows only the stretch between its box corners' positions on it, sampled at 11 points. null when the slide has no gradient headline.
 */
export function gradientInksOver(svg: string, box: Box): string[] | null {
  const g = /<linearGradient id="htext"([^>]*)>([\s\S]*?)<\/linearGradient>/.exec(svg);
  if (!g) return null;
  const at = new Map([...g[1].matchAll(/(x1|y1|x2|y2)="(-?[\d.]+)"/g)].map((m) => [m[1], Number(m[2])]));
  const stops = [...g[2].matchAll(/stop-color="(#[0-9a-fA-F]{6})"/g)].map((m) => hexRgb(m[1])!).filter(Boolean);
  if (stops.length < 2) return null;
  const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((k) => at.get(k) ?? 0);
  const dx = x2 - x1, dy = y2 - y1, dd = dx * dx + dy * dy || 1;
  const tOf = (x: number, y: number) => Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / dd));
  const ts = [tOf(box.x, box.y), tOf(box.x + box.w, box.y), tOf(box.x, box.y + box.h), tOf(box.x + box.w, box.y + box.h)];
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  const colourAt = (t: number) => {
    const p = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
    return '#' + stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f).toString(16).padStart(2, '0')).join('');
  };
  return Array.from({ length: 11 }, (_, k) => colourAt(t0 + ((t1 - t0) * k) / 10));
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))];

/** Measures every text slot that crosses a picture, on the slide as drawn. A slide with no text over a picture is not drawn at all. */
export async function measurePhotoContrast(b: Pick<Built, 'layers' | 'svg'> & { images?: Built['images'] }): Promise<PhotoContrastReading> {
  const t0 = performance.now();
  const lines = linesOverPictures(b);
  if (!lines.length) return { roles: [], pass: true, ms: 0 };
  const px = await bareSlide(b.svg);
  const byLayer = new Map<unknown, PhotoContrastRole>();
  for (const { key, role, text, ink: ink0, box, size } of lines) {
    // a headline drawn in a gradient is read at every colour the gradient takes over this line: the worst one counts
    const inks = (role === 'title' ? gradientInksOver(b.svg, box) : null) ?? [ink0];
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
    const prev = byLayer.get(key);
    if (!prev || ratio < prev.ratio) byLayer.set(key, { role, text, size: Math.round(size), ink, tone, ratio, threshold, pass: ratio >= threshold });
  }
  const roles = [...byLayer.values()];
  return { roles, pass: roles.every((r) => r.pass), ms: Math.round(performance.now() - t0) };
}

/** The sentence that takes the place of "contrast over gradients ... is not checked" on a slide with text over a picture: the measured result, slot by slot. */
export function photoContrastSentence(m: PhotoContrastReading): string {
  const part = (r: PhotoContrastRole) => `${r.role === 'recurring' ? 'page chrome' : r.role === 'side-label' ? 'side label (page chrome)' : r.role} ${r.ratio.toFixed(2)}:1 (needs ${r.threshold}:1${r.pass ? '' : ', too low'})`;
  return `Text over the picture, measured on the slide as drawn (${LIGHT_PERCENTILE}th percentile of the pixels behind light text, ${100 - LIGHT_PERCENTILE}th behind dark text): ${m.roles.map(part).join('; ')}.`;
}

/** The strongest plate behind a side label (Round T repair): a soft panel in the colour opposite the label's ink, never more opaque than this. */
export const PLATE_MAX = 0.6;
const PLATES = [0.3, 0.45, PLATE_MAX];
export interface SideLabelRepair { svg: string; repair: string; ratio: number; pass: boolean }
/**
 * Round T: a side label (page chrome) that does not read at 4.5:1 over a photo is repaired on the drawing, in this order, stopping at the first that passes: a plate behind the label only (its own
 * ink, 0.3, 0.45 then 0.6 opacity, dark under light ink, light under dark ink), then the other ink of the slide's palette (`inks`: the text and ground colours of the slide), then that ink on a plate.
 * Nothing moves and no word changes. When nothing passes, the best reading is kept (pass false). null: the slide has no side label over a picture.
 */
export async function repairSideLabel(b: Pick<Built, 'layers' | 'svg'> & { images?: Built['images'] }, inks: string[]): Promise<SideLabelRepair | null> {
  const pics: Box[] = pictureBoxesOf(b);
  const label = sideLabelsOfSvg(b.svg).find((sl) => pics.some((p) => overlaps(p, sl.box)));
  if (!label) return null;
  const m = /<text transform="translate\([\d.]+ [\d.]+\) rotate\(-90\)"[^>]*>[^<]*<\/text>/.exec(b.svg);
  if (!m) return null;
  const el = m[0];
  const read = async (svg: string) => (await measurePhotoContrast({ ...b, svg })).roles.find((r) => r.role === 'side-label');
  const withInk = (ink: string) => el.replace(/fill="#[0-9A-Fa-f]{6}"/, `fill="${ink}"`);
  const plate = (ink: string, a: number) => {
    const light = (lumOfHex(ink) ?? 0) > 0.18;
    const p = { x: label.box.x - 10, y: label.box.y - 12, w: label.box.w + 20, h: label.box.h + 24 };
    return `<rect data-role="side-label-plate" x="${Math.round(p.x)}" y="${Math.round(p.y)}" width="${Math.round(p.w)}" height="${Math.round(p.h)}" rx="${Math.round(p.w / 2)}" fill="${light ? '#000000' : '#FFFFFF'}" fill-opacity="${a}"/>`;
  };
  const tries: { svg: string; repair: string }[] = [];
  for (const a of PLATES) tries.push({ svg: b.svg.replace(el, () => plate(label.ink, a) + el), repair: `a ${a} plate behind the side label` });
  const others = [...new Set(inks.map((c) => c.toUpperCase()))].filter((c) => /^#[0-9A-F]{6}$/.test(c) && c !== label.ink.toUpperCase());
  for (const c of others) tries.push({ svg: b.svg.replace(el, () => withInk(c)), repair: `the side label in the other ink (${c})` });
  for (const c of others) for (const a of PLATES) tries.push({ svg: b.svg.replace(el, () => plate(c, a) + withInk(c)), repair: `the side label in the other ink (${c}) on a ${a} plate` });
  let best: SideLabelRepair | null = null;
  for (const t of tries) {
    const r = await read(t.svg);
    if (!r) continue;
    if (r.pass) return { svg: t.svg, repair: t.repair, ratio: r.ratio, pass: true };
    if (!best || r.ratio > best.ratio) best = { svg: t.svg, repair: t.repair, ratio: r.ratio, pass: false };
  }
  return best;
}

/**
 * Round V: page chrome drawn as text of its own (the handle, the page number, the footer: text layers named "recurring") that sits over a photo bleeding to the slide's edges and does not read at
 * 4.5:1 is repaired the way the side label is (Round T), stopping at the first that passes: a plate behind that text only (0.3, 0.45 then 0.6 opacity, dark under light ink, light under dark
 * ink), then the other ink of the slide's palette, then that ink on a plate. Nothing moves and no word changes. null: no such text over a picture, or its drawing could not be found.
 */
export async function repairChromeText(b: Pick<Built, 'layers' | 'svg'> & { images?: Built['images'] }, inks: string[], text: string): Promise<(SideLabelRepair & { layers: Built['layers'] }) | null> {
  const layer = (b.layers as unknown as TextLayer[]).find((l) => l.kind === 'text' && l.name === 'recurring' && (l.text ?? '').trim().slice(0, 40) === text);
  if (!layer) return null;
  const escd = (layer.text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const literal = escd.replace(/[.*+?^$()|[\]\\{}]/g, (c) => '\\' + c);
  const re = new RegExp('<text [^>]*fill="(#[0-9A-Fa-f]{6})"[^>]*>' + literal + '</text>');
  const m = re.exec(b.svg);
  if (!m) return null;
  const el = m[0];
  const ink0 = m[1];
  const key = (layer.text ?? '').trim().slice(0, 40);
  // the check reads a text layer's ink from the layer: a try in another ink changes the layer too
  const layersIn = (ink: string) => (b.layers as unknown as TextLayer[]).map((l) => (l === layer ? { ...l, style: { ...l.style, color: ink } } : l)) as unknown as Built['layers'];
  const read = async (svg: string, ink: string) => (await measurePhotoContrast({ ...b, svg, layers: layersIn(ink) })).roles.find((r) => r.role === 'recurring' && r.text === key);
  const withInk = (ink: string) => el.replace(/fill="#[0-9A-Fa-f]{6}"/, `fill="${ink}"`);
  // the text's own box, from its layer (the builder's estimate), with a little air
  const box = { x: layer.x - 12, y: layer.y - 6, w: layer.width + 24, h: layer.height + 12 };
  const plate = (ink: string, a: number) => {
    const light = (lumOfHex(ink) ?? 0) > 0.18;
    return `<rect data-role="chrome-plate" x="${Math.round(box.x)}" y="${Math.round(box.y)}" width="${Math.round(box.w)}" height="${Math.round(box.h)}" rx="${Math.round(box.h / 2)}" fill="${light ? '#000000' : '#FFFFFF'}" fill-opacity="${a}"/>`;
  };
  const tries: { svg: string; repair: string; ink: string }[] = [];
  for (const a of PLATES) tries.push({ svg: b.svg.replace(el, () => plate(ink0, a) + el), repair: `a ${a} plate behind the page chrome "${key}"`, ink: ink0 });
  const others = [...new Set(inks.map((c) => c.toUpperCase()))].filter((c) => /^#[0-9A-F]{6}$/.test(c) && c !== ink0.toUpperCase());
  for (const c of others) tries.push({ svg: b.svg.replace(el, () => withInk(c)), repair: `the page chrome "${key}" in the other ink (${c})`, ink: c });
  for (const c of others) for (const a of PLATES) tries.push({ svg: b.svg.replace(el, () => plate(c, a) + withInk(c)), repair: `the page chrome "${key}" in the other ink (${c}) on a ${a} plate`, ink: c });
  let best: (SideLabelRepair & { layers: Built['layers'] }) | null = null;
  for (const t of tries) {
    const r = await read(t.svg, t.ink);
    if (!r) continue;
    if (r.pass) return { svg: t.svg, layers: layersIn(t.ink), repair: t.repair, ratio: r.ratio, pass: true };
    if (!best || r.ratio > best.ratio) best = { svg: t.svg, layers: layersIn(t.ink), repair: t.repair, ratio: r.ratio, pass: false };
  }
  return best;
}
