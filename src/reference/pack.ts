// Style packs: a style as a set of slide designs, one per slide type, each an SVG slide with text slots (data-role, data-min-size, data-max-lines), graphics in named
// groups and colours as palette names. The model designs them (or the code builds them from a stored style); the renderer fills the slots with each slide's own words
// with no model call. A pack never holds reference pixels.
import type { FontFamily } from '../image-engine/types';
import { FONT_WEIGHTS, loadFonts } from '../image-engine/fonts';
import type { StyleSpec } from '../image-engine/styles/format';
import { activeReference } from './active';
import { templateOfStyle } from './templates';
import { fillRecreate, FONT_NAMES, sanitizeSvg, svgToLayers, textsOf, type RLayer } from './recreate';
import type { ReaderImage, ReferenceReader } from './reader';

export const PACK_TYPES = ['cover', 'step', 'content', 'list', 'stat', 'quote', 'cta'] as const;
export type PackType = (typeof PACK_TYPES)[number];
/** Model calls for making packs in one session (a page load). */
export const PACK_CAP = 3;
export const SIZE = { w: 1080, h: 1350 };

export interface StylePack {
  name: string;
  /** Colour names the designs use ("$bg", "$accent", ...). */
  palette: Record<string, string>;
  fonts: { headline: FontFamily; body: FontFamily };
  motifs: string[];
  /** One design per slide type; "base" is the first slide of a reference, used when a type has none of its own. */
  designs: Partial<Record<PackType | 'base', RLayer[]>>;
  canvas: { w: number; h: number };
  notes: string[];
}

/** The design key for a script slide type. */
export const designKey = (slideType: string): PackType => (slideType === 'checklist' ? 'list' : slideType === 'closing' ? 'cta' : (PACK_TYPES as readonly string[]).includes(slideType) ? (slideType as PackType) : 'content');

export function packFor(styleName: string): StylePack | null {
  if (styleName === 'mine-reference-active') return activeReference()?.pack ?? null;
  return templateOfStyle(styleName)?.pack ?? null;
}

/** The slide's own words in the pack's design for its type: no model call. */
export function packSlide(pack: StylePack, slideType: string, slide: Record<string, unknown>, handle: string) {
  const d = pack.designs[designKey(slideType)] ?? pack.designs.content ?? pack.designs.cover ?? pack.designs.base ?? Object.values(pack.designs)[0];
  if (!d) return { layers: [], notes: ['The pack has no design.'] };
  return fillRecreate({ layers: d, palette: pack.palette, canvas: pack.canvas, notes: [] }, textsOf(slide, handle));
}

// ----- distinct compositions -----

type Box = [number, number, number, number];
const slotBoxes = (layers: RLayer[], c: { w: number; h: number }): Box[] => layers.filter((l) => l.kind === 'text' && ['kicker', 'tag', 'title', 'body', 'caption', 'number'].includes(l.name)).map((l) => [l.x / c.w, l.y / c.h, l.width / c.w, l.height / c.h]);
const near = (a: Box, b: Box, tol: number) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
/** Two designs look alike when every text slot of one has a slot of the other at about the same place and size (within 6% of the slide). */
export function sameComposition(a: Box[], b: Box[], tol = 0.06) {
  return a.length > 0 && Math.abs(a.length - b.length) <= 1 && a.every((x) => b.some((y) => near(x, y, tol))) && b.every((y) => a.some((x) => near(x, y, tol)));
}
export function distinctCheck(pack: StylePack): { ok: boolean; alike: [string, string][] } {
  const keys = Object.keys(pack.designs) as (PackType | 'base')[];
  const alike: [string, string][] = [];
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) if (sameComposition(slotBoxes(pack.designs[keys[i]]!, pack.canvas), slotBoxes(pack.designs[keys[j]]!, pack.canvas))) alike.push([keys[i], keys[j]]);
  return { ok: alike.length === 0, alike };
}

// ----- the prompts -----

const SLOTS: Record<PackType, string> = {
  cover: 'kicker, title, body (a short line under the title)',
  step: 'tag (like "STEP 2"), number, title, body',
  content: 'title, body, caption',
  list: 'title, body (one line per item, up to 6 lines)',
  stat: 'kicker, number (a big figure), title (the label under it), body (a note)',
  quote: 'title (the quote), caption (who said it)',
  cta: 'title, body, kicker (a handle)',
};
const fontLine = () => FONT_NAMES.map((f) => `"${f}" (weights ${FONT_WEIGHTS[f].join(', ')})`).join('; ');

export function buildPackPrompt(o: { kind: 'reference' | 'description'; types: PackType[]; description?: string; firstSvg?: string }): string {
  return [
    '[pack:new] You design a STYLE PACK for carousel slides: one SVG slide design per slide type, all in one look. You are drawing designs, not describing them. Reply with the SVGs only (no code fence, no explanation).',
    o.kind === 'reference'
      ? 'The first picture is the reference slide (the file reference.jpg in the current folder; look at it with your Read tool). The look of the pack must be the reference\'s look: its colours, type, motifs and mood.' + (o.firstSvg ? ` Its first slide design, already drawn, is:\n${o.firstSvg.slice(0, 9000)}` : '')
      : `The look to design, in the person's words: "${(o.description ?? '').slice(0, 400)}".`,
    `Make one <svg> for each of these slide types, in this order: ${o.types.join(', ')}. Each is 1080 x 1350 px: use viewBox="0 0 1080 1350" and put data-type="<type>" on the <svg>. The FIRST <svg> also has data-palette='{"bg":"#...","text":"#...","accent":"#...","accent2":"#...","surface":"#...","muted":"#..."}' naming the pack's colours. In every design use colours ONLY as those names (fill="$accent", stroke="$text"), never hex.`,
    'EVERY slide type must have a different composition from the others: a different arrangement of its text slots (position and size) and of its graphics. Do not repeat one layout with other words or small shifts; a cover, a step, a list and a stat slide look different from each other at a glance (for example: title low and big on the cover, a huge number on the left on a step, a column of items on a list, one giant figure centred on a stat). Keep the same palette, fonts and motifs so they belong together.',
    'Text slots: each <text> has data-role (kicker, tag, title, body, caption or number), data-min-size (px, 32 or more) and data-max-lines, and holds sample words. One <text> per slot; a slot may hold several lines, the code wraps and fits the person\'s words into it, so make each slot as big as its words need. Slots a slide type has:',
    ...o.types.map((t) => `  ${t}: ${SLOTS[t]}`),
    `Fonts: only these bundled ones: ${fontLine()}. If none fits a text, use the nearest and add data-font-wish="the family you wanted".`,
    'Graphics (motifs, shapes, doodles, patterns, dots) are plain shapes and paths; every group of them is a <g id="short-name">. Allowed elements only: svg, g, path, circle, ellipse, rect, line, polyline, polygon, defs, linearGradient, radialGradient, stop, clipPath, mask, pattern, text, tspan. No images, no scripts, no external references. The first element of each design is the full-size background <rect>.',
  ].join('\n');
}

// ----- the answer -----

export interface PackAnswer {
  ok: true;
  pack: StylePack;
  problems: string[];
}
export async function parsePack(text: string, name: string): Promise<PackAnswer | { ok: false; reasons: string[] }> {
  const blocks = text.match(/<svg[\s\S]*?<\/svg>/gi) ?? [];
  if (blocks.length === 0) return { ok: false, reasons: [`The answer has no <svg> designs. The reader said: "${text.replace(/\s+/g, ' ').slice(0, 160)}"`] };
  let palette: Record<string, string> = {};
  const m = /data-palette\s*=\s*'([^']*)'|data-palette\s*=\s*"([^"]*)"/i.exec(blocks[0] ?? "");
  try {
    const p = JSON.parse((m?.[1] ?? m?.[2] ?? '{}').replace(/&quot;/g, '"')) as Record<string, unknown>;
    palette = Object.fromEntries(Object.entries(p).filter(([k, v]) => /^[a-z][a-z0-9]*$/i.test(k) && typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)).map(([k, v]) => [k, (v as string).toUpperCase()]));
  } catch {
    /* no palette */
  }
  if (!palette.bg || !palette.text) return { ok: false, reasons: ['The first design has no usable data-palette (it needs at least "bg" and "text" as #rrggbb).'] };
  await loadFonts();
  const designs: StylePack['designs'] = {};
  const problems: string[] = [];
  const notes: string[] = [];
  for (const b of blocks) {
    const t = /data-type\s*=\s*["']([a-z]+)["']/i.exec(b)?.[1]?.toLowerCase();
    if (!t || !(PACK_TYPES as readonly string[]).includes(t)) {
      problems.push(`A design without a known data-type (${PACK_TYPES.join(', ')}) was left out.`);
      continue;
    }
    const s = sanitizeSvg(b.replace(/data-palette\s*=\s*'[^']*'|data-palette\s*=\s*"[^"]*"/i, ''));
    if (!s.svg) {
      problems.push(`${t}: ${s.reasons.join(' ')}`);
      continue;
    }
    const { layers, notes: n } = svgToLayers(s.svg, SIZE.w, SIZE.h);
    if (layers.length < 2) {
      problems.push(`${t}: nothing drawable was in the picture.`);
      continue;
    }
    designs[t as PackType] = layers;
    notes.push(...n.map((x) => `${t}: ${x}`), ...s.wished.map((w) => `${t}: font wanted ${w.wish}, used ${w.used}.`));
  }
  if (Object.keys(designs).length === 0) return { ok: false, reasons: problems };
  const fonts = (() => {
    const first = Object.values(designs)[0]!.filter((l) => l.kind === 'text') as { style: { font: FontFamily }; name: string }[];
    const h = first.find((l) => l.name === 'title')?.style.font ?? 'Schibsted Grotesk';
    const bo = first.find((l) => l.name === 'body')?.style.font ?? 'Instrument Sans';
    return { headline: h, body: bo };
  })();
  return { ok: true, problems, pack: { name, palette, fonts, motifs: [], designs, canvas: { ...SIZE }, notes } };
}

export async function callPack(reader: ReferenceReader, prompt: string, images: ReaderImage[], signal: AbortSignal): Promise<string> {
  return (await reader.read({ prompt, images }, signal)).text;
}

// ----- a pack from a stored style, built by the code (no model): same colours and fonts, a different composition for each slide type -----

const solid = (v: unknown): string => (typeof v === 'string' ? v : (v as { stops?: { color: string }[] })?.stops?.[0]?.color ?? '#000000');
let uid = 0;
const text = (role: string, x: number, y: number, w: number, h: number, size: number, o: { font?: 'headline' | 'body'; colour?: string; align?: 'left' | 'center' | 'right'; lines?: number; min?: number; sample?: string; lh?: number; weight?: number } = {}, fonts: StylePack['fonts']): RLayer => {
  const font = (o.font ?? 'body') === 'headline' ? fonts.headline : fonts.body;
  const ws = FONT_WEIGHTS[font];
  const weight = o.weight ?? ((o.font ?? 'body') === 'headline' ? ws[ws.length - 1] : ws[Math.floor(ws.length / 2)]);
  return { kind: 'text', id: `${role}${++uid}`, name: role, role: 'content', x: (x / 100) * SIZE.w, y: (y / 100) * SIZE.h, width: (w / 100) * SIZE.w, height: (h / 100) * SIZE.h, rotation: 0, opacity: 1, text: o.sample ?? role, style: { font, weight, size, color: o.colour ?? '$text', align: o.align ?? 'left', valign: 'top', lineHeight: o.lh ?? 1.15 }, autoFit: { minSize: Math.max(32, o.min ?? 32) }, slot: { minSize: Math.max(32, o.min ?? 32), maxLines: o.lines ?? 3 } } as RLayer;
};
const block = (name: string, x: number, y: number, w: number, h: number, fill: string, o: { ellipse?: boolean; radius?: number } = {}): RLayer =>
  ({ kind: 'shape', id: `${name}${++uid}`, name, role: 'decor', x: (x / 100) * SIZE.w, y: (y / 100) * SIZE.h, width: (w / 100) * SIZE.w, height: (h / 100) * SIZE.h, rotation: 0, opacity: 1, shape: o.ellipse ? 'ellipse' : 'rect', fill, ...(o.radius ? { radius: o.radius } : {}) }) as RLayer;

export function packFromStyle(spec: StyleSpec): StylePack {
  const pal0 = Object.values(spec.palettes)[0] as unknown as Record<string, unknown>;
  const palette: Record<string, string> = { bg: solid(pal0.bg), text: solid(pal0.text), accent: solid(pal0.accent), onAccent: solid(pal0.onAccent), surface: solid(pal0.surface), muted: solid(pal0.muted) };
  const fonts = { headline: spec.fonts.headline, body: spec.fonts.body };
  const T = (role: string, x: number, y: number, w: number, h: number, size: number, o: Parameters<typeof text>[6] = {}) => text(role, x, y, w, h, size, o, fonts);
  const bg = () => block('background', 0, 0, 100, 100, '$bg');
  const designs: StylePack['designs'] = {
    cover: [bg(), block('base', 0, 60, 100, 40, '$accent'), T('kicker', 7, 6, 60, 4, 34, { colour: '$muted', lines: 1 }), T('title', 7, 14, 86, 42, 140, { font: 'headline', lines: 4, min: 56, lh: 1.02 }), T('body', 7, 66, 76, 22, 46, { colour: '$onAccent', lines: 4 })],
    step: [bg(), block('tag-pill', 63, 6, 30, 5, '$accent', { radius: 40 }), T('tag', 63, 6.6, 30, 4, 34, { colour: '$onAccent', align: 'center', lines: 1 }), T('number', 7, 7, 34, 22, 300, { font: 'headline', colour: '$accent', lines: 1, min: 120 }), block('rule', 7, 33, 14, 0.6, '$accent'), T('title', 7, 36, 86, 18, 84, { font: 'headline', lines: 3, min: 48 }), T('body', 7, 58, 80, 32, 46, { lines: 8 })],
    content: [bg(), T('title', 7, 7, 86, 12, 72, { font: 'headline', lines: 2, min: 44 }), block('column-rule', 52, 24, 0.5, 60, '$muted'), T('body', 7, 24, 40, 62, 44, { lines: 13 }), T('caption', 57, 24, 36, 24, 38, { colour: '$muted', lines: 5 }), block('corner', 57, 70, 36, 14, '$surface', { radius: 24 })],
    list: [bg(), T('title', 10, 6, 80, 11, 64, { font: 'headline', align: 'center', lines: 2, min: 40 }), block('bullet-1', 7, 25, 2.5, 1.8, '$accent'), block('bullet-2', 7, 38, 2.5, 1.8, '$accent'), block('bullet-3', 7, 51, 2.5, 1.8, '$accent'), block('bullet-4', 7, 64, 2.5, 1.8, '$accent'), block('bullet-5', 7, 77, 2.5, 1.8, '$accent'), T('body', 14, 22, 79, 66, 50, { lines: 6, lh: 2.05 })],
    stat: [bg(), block('panel', 6, 20, 88, 56, '$surface', { radius: 32 }), T('kicker', 7, 6, 70, 4, 34, { colour: '$muted', lines: 1 }), T('number', 6, 25, 88, 28, 320, { font: 'headline', colour: '$accent', align: 'center', lines: 1, min: 120 }), T('title', 10, 56, 80, 10, 60, { font: 'headline', align: 'center', lines: 2, min: 38 }), T('body', 12, 68, 76, 7, 38, { colour: '$muted', align: 'center', lines: 2 })],
    quote: [bg(), T('quotemark', 6, 3, 30, 20, 420, { font: 'headline', colour: '$accent', lines: 1, min: 200, sample: '“' }), T('title', 10, 27, 80, 42, 76, { font: 'headline', lines: 6, min: 40, lh: 1.2 }), T('caption', 10, 74, 80, 6, 38, { colour: '$muted', lines: 2 }), block('foot', 0, 97, 100, 3, '$accent')],
    cta: [bg(), block('top-block', 0, 0, 100, 55, '$accent'), T('title', 7, 11, 86, 36, 112, { font: 'headline', colour: '$onAccent', lines: 4, min: 56, lh: 1.05 }), T('body', 7, 62, 86, 14, 46, { lines: 4 }), block('button', 7, 80, 50, 8, '$accent', { radius: 60 }), T('kicker', 7, 81.4, 50, 5, 40, { colour: '$onAccent', align: 'center', lines: 1 })],
  };
  const pack: StylePack = { name: `${spec.title} pack`, palette, fonts, motifs: [], designs, canvas: { ...SIZE }, notes: [`Built from the ${spec.title} style: its colours and fonts, a different composition for each slide type.`] };
  return pack;
}
