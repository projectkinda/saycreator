// Style packs: a style as a set of slide designs, one per slide type, each an SVG slide with text slots (data-role, data-min-size, data-max-lines), graphics in named
// groups and colours as palette names. The model designs them (or the code builds them from a stored style); the renderer fills the slots with each slide's own words
// with no model call. A pack never holds reference pixels.
import type { FontFamily } from '../image-engine/types';
import { FONT_WEIGHTS, loadFonts } from '../image-engine/fonts';
import type { StyleSpec } from '../image-engine/styles/format';
import { activeReference } from './active';
import { templateOfStyle } from './templates';
import { fillRecreate, FONT_NAMES, sanitizeSvg, svgToLayers, textsOf, type RLayer } from './recreate';
import { layoutText } from '../image-engine/draw/text';
import type { Layer, TextLayer } from '../image-engine/types';
import { faithfulSvg, resolveSvgTokens, type FaithfulSlot } from './faithful';
import { extractImageSlots, injectSlots, scrimFor, slotMarkup, type ImageSlot } from '../images/slots';
import { fillsFor, type ImageRequest } from '../images/store';
import type { ReaderImage, ReferenceReader } from './reader';
import type { Detected } from './regions';

export const PACK_TYPES = ['cover', 'step', 'content', 'list', 'stat', 'quote', 'cta'] as const;
export type PackType = (typeof PACK_TYPES)[number];
/** Model calls for making packs in one session (a page load). */
export const PACK_CAP = 3;
export const SIZE = { w: 1080, h: 1350 };

export interface SlotMeta {
  role: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minSize: number;
  maxSize?: number;
  maxLines?: number;
}
export interface SquareDesign {
  layers: RLayer[];
  svg?: string;
  slots?: ImageSlot[];
  slotMeta?: SlotMeta[];
  canvas: { w: number; h: number };
}
export interface StylePack {
  name: string;
  /** Colour names the designs use ("$bg", "$accent", ...). */
  palette: Record<string, string>;
  fonts: { headline: FontFamily; body: FontFamily };
  motifs: string[];
  /** One design per slide type; "base" is the first slide of a reference, used when a type has none of its own. */
  designs: Partial<Record<PackType | 'base', RLayer[]>>;
  /** The sanitised SVG of each design, as drawn (colours as palette names, text slots marked): the faithful form. The layers above are its editable form. */
  svgs?: Partial<Record<PackType | 'base', string>>;
  /** Each design's image slots (where pictures go): kind, box, mask, fit, focal, scrim. Never a picture. */
  imageSlots?: Partial<Record<PackType | 'base', ImageSlot[]>>;
  /** A square (1:1) quote design: quote posts use it instead of the 4:5 one scaled. */
  square?: SquareDesign;
  /** Each design's text slots: role, box (px of the canvas), size limits, line limit. */
  slotMeta?: Partial<Record<PackType | 'base', SlotMeta[]>>;
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
/** Which design a slide type uses: its own, else content, cover, the base slide or any. */
export function designUsed(pack: StylePack, slideType: string): (PackType | 'base') | null {
  const k = designKey(slideType);
  return ([k, 'content', 'cover', 'base'] as const).find((x) => pack.designs[x]) ?? ((Object.keys(pack.designs)[0] as PackType | 'base' | undefined) ?? null);
}

export interface PackSlide {
  layers: Layer[];
  notes: string[];
  slots?: FaithfulSlot[];
  hidden?: number[];
  /** The design's SVG with the slide's words in it, as written (colours resolved); absent when the pack has no SVG for this design. */
  faithful?: string;
  /** The canvas this slide was drawn on (a square quote design is 1080 by 1080). */
  canvas?: { w: number; h: number };
  /** Picture spots nothing fills: never drawn (not in the drawing, not in the export); the editor shows them as an overlay. */
  emptySlots?: { id: string; x: number; y: number; w: number; h: number }[];
}
/** The slide's own words in the pack's design: the editable layers, and the faithful SVG when the pack kept the drawing. No model call. */
export function packSlide(pack: StylePack, slideType: string, slide: Record<string, unknown>, handle: string, opts: { square?: boolean; images?: ImageRequest[]; slide?: number } = {}): PackSlide {
  const p = opts.square && designKey(slideType) === 'quote' && pack.square ? squareView(pack) : pack;
  const r = packLayers(p, slideType, slide, handle);
  const used = designUsed(p, slideType);
  const svg = used ? p.svgs?.[used] : undefined;
  let layers = r.layers;
  let faithful: string | undefined;
  if (svg && r.slots) {
    try {
      faithful = faithfulSvg(resolveSvgTokens(svg, p.palette), p.canvas.w, r.slots, r.hidden ?? []);
    } catch {
      faithful = undefined;
    }
  }
  const slots = slotsFor(p, slideType);
  let emptySlots: NonNullable<PackSlide["emptySlots"]> = [];
  if (slots.length) {
    const fills = fillsFor(opts.images, opts.slide ?? 0, slots, p.palette);
    emptySlots = slots.filter((s) => s.kind !== "background" && fills[s.id].every((x) => !x)).map((s) => ({ id: s.id, x: s.x, y: s.y, w: s.w, h: s.h }));
    const markup: Record<string, string> = {};
    const veils: Record<string, { color: string; amount: number } | null> = {};
    for (const s of slots) {
      // The text over a slot decides the scrim: the contrast safety net darkens (or lightens) the picture until that text keeps 4.5:1.
      const over = layers.filter((l): l is TextLayer => l.kind === 'text' && l.visible !== false && l.x < s.x + s.w && l.x + l.width > s.x && l.y < s.y + s.h && l.y + l.height > s.y).map((l) => String(l.style.color));
      const first = fills[s.id].find(Boolean);
      const scrim = first ? scrimFor(over, first, s.scrim) : null;
      veils[s.id] = scrim;
      markup[s.id] = slotMarkup(s, fills[s.id], { palette: p.palette, scrim });
    }
    if (faithful) faithful = injectSlots(faithful, markup);
    layers = withImageLayers(layers, slots, fills, p.palette, veils);
  }
  return { ...r, layers, canvas: p.canvas, ...(emptySlots.length ? { emptySlots } : {}), ...(faithful ? { faithful } : {}) };
}

/** The pack seen as its square quote design: the quote design, canvas and slots are the square ones. */
function squareView(pack: StylePack): StylePack {
  const sq = pack.square!;
  const svgs = { ...pack.svgs };
  if (sq.svg) svgs.quote = sq.svg;
  else delete svgs.quote;
  return { ...pack, canvas: sq.canvas, designs: { ...pack.designs, quote: sq.layers }, svgs, imageSlots: { ...pack.imageSlots, quote: sq.slots ?? [] } };
}
/** The image slots of the design a slide type uses (the square quote design's when `square`). */
export function slotsFor(pack: StylePack, slideType: string, square = false): ImageSlot[] {
  const p = square && designKey(slideType) === 'quote' && pack.square ? squareView(pack) : pack;
  const used = designUsed(p, slideType);
  return used ? (p.imageSlots?.[used] ?? []) : [];
}
/** The editable form of the slots: each picture as an image layer, a flat veil for the scrim, a soft block for an empty slot (a background slot has none). The mask is only in the faithful drawing. */
function withImageLayers(layers: Layer[], slots: ImageSlot[], fills: Record<string, ({ url: string } | null)[]>, _palette: Record<string, string>, veils: Record<string, { color: string; amount: number } | null>): Layer[] {
  const bg: Layer[] = [];
  const rest: Layer[] = [];
  for (const s of slots) {
    const cells = s.kind === 'strip' ? (s.count ?? 3) : 1;
    const gap = 12;
    const w = (s.w - gap * (cells - 1)) / cells;
    for (let i = 0; i < cells; i++) {
      const base = { rotation: 0, x: s.x + i * (w + gap), y: s.y, width: w, height: s.h, role: 'decor' as const };
      const f = fills[s.id]?.[i];
      const out = s.kind === 'background' ? bg : rest;
      if (f) {
        out.push({ ...base, kind: 'image', id: `${s.id}-img${i}`, name: `image-${s.id}`, opacity: 1, src: f.url, fit: 'cover' } as unknown as Layer);
        const v = veils[s.id];
        if (v) out.push({ ...base, kind: 'shape', id: `${s.id}-veil${i}`, name: `scrim-${s.id}`, opacity: Math.min(0.9, v.amount * 0.8), shape: 'rect', fill: v.color } as unknown as Layer);
      }
    }
  }
  const at = layers.findIndex((l) => l.kind === 'text');
  const head = layers.slice(0, Math.min(1, layers.length));
  const mid = layers.slice(head.length, at < 0 ? layers.length : at);
  const tail = at < 0 ? [] : layers.slice(at);
  return [...head, ...bg, ...mid, ...rest, ...tail];
}

function packLayers(pack: StylePack, slideType: string, slide: Record<string, unknown>, handle: string): PackSlide {
  const used = designUsed(pack, slideType);
  const d = used ? pack.designs[used] : undefined;
  if (!d) return { layers: [], notes: ['The pack has no design.'] };
  const texts = textsOf(slide, handle);
  const key = designKey(slideType);
  if (key === 'list' && texts.body) {
    // A design with a body slot per row: item k goes in row k (top to bottom); extra rows are left empty (hidden with their row); more items than rows share the last row.
    const rows = d.filter((l) => l.kind === 'text' && l.name === 'body').sort((a, b) => a.y - b.y);
    if (rows.length >= 2) {
      const list = texts.body.split('\n').filter(Boolean);
      const renamed = d.map((l) => {
        const k = rows.indexOf(l);
        return k > 0 ? ({ ...l, name: 'body' + (k + 1) } as RLayer) : l;
      });
      const per: Record<string, string> = { body: rows.length === 1 ? list.join('\n') : list[0] ?? '' };
      rows.slice(1).forEach((_, k) => {
        const last = k + 2 === rows.length;
        per['body' + (k + 2)] = last ? list.slice(k + 1).join('\n') : list[k + 1] ?? '';
      });
      return fillRecreate({ layers: renamed, palette: pack.palette, canvas: pack.canvas, notes: [] }, { ...texts, ...per } as typeof texts);
    }
  }
  if (key !== 'list' || !texts.body) return fillRecreate({ layers: d, palette: pack.palette, canvas: pack.canvas, notes: [] }, texts);
  // A list: every item keeps a readable size (40 px at least) and its own line; the slot grows downward, and when it still does not fit the items go in two columns.
  const items = texts.body.split('\n').filter(Boolean);
  const readable = d.map((l) => (l.kind === 'text' && l.name === 'body' ? ({ ...l, style: { ...l.style, lineHeight: Math.max(l.style.lineHeight, 1.5) }, slot: { minSize: Math.max(40, l.slot?.minSize ?? 0), maxLines: Math.max(l.slot?.maxLines ?? 0, items.length * 2) } } as RLayer) : l));
  const r = fillRecreate({ layers: readable, palette: pack.palette, canvas: pack.canvas, notes: [] }, texts);
  const i = r.layers.findIndex((l) => l.kind === 'text' && l.name === 'body');
  const slotAt = r.slots?.findIndex((x) => x.layer.id === (r.layers[i] as TextLayer | undefined)?.id) ?? -1;
  if (i < 0) return r;
  const body = r.layers[i] as TextLayer;
  const bottom = pack.canvas.h * 0.93;
  try {
    const need = layoutText(body).height;
    if (need > body.height) {
      const grown = Math.min(need + body.style.size * 0.3, bottom - body.y);
      if (need <= grown) {
        r.layers[i] = { ...body, height: grown };
        if (slotAt >= 0) r.slots![slotAt] = { ...r.slots![slotAt], layer: r.layers[i] as TextLayer };
        r.notes.push('The list slot was made taller to keep every item readable.');
      } else if (items.length >= 4) {
        const half = Math.ceil(items.length / 2);
        const gap = pack.canvas.w * 0.04;
        const w = (body.width - gap) / 2;
        const colA = { ...body, text: items.slice(0, half).join('\n'), width: w, height: bottom - body.y } as TextLayer;
        const colB = { ...body, id: `${body.id}-2`, text: items.slice(half).join('\n'), x: body.x + w + gap, width: w, height: bottom - body.y } as TextLayer;
        r.layers.splice(i, 1, colA, colB);
        if (slotAt >= 0) r.slots![slotAt] = { ...r.slots![slotAt], layer: colA, more: [colB] };
        r.notes.push('The list is set in two columns so every item stays readable.');
      } else r.notes.push('The list needs more room than its slot has, even at the smallest readable size.');
    }
  } catch {
    /* fonts not ready: leave the slot as it is */
  }
  return r;
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

/** The look-first step: the model lists what the reference shows BEFORE it draws. The block is stripped before parsing (stripInventory). */
const INVENTORY_RULES = [
  'LOOK FIRST, THEN DRAW. Start your answer with ONE block <inventory>...</inventory> (plain text, one line per element), BEFORE any <svg>. Look at the whole reference and list EVERY visible element: photos, cut-out people, illustrations, shapes, lines, text, stickers. For each give: kind (photo | cut-out person | illustration | shape | line | text | sticker); position and size as % of the slide (x, y, width, height); colour; rotation in degrees; and its REAL shape (circle | pill | arch | blob | torn edge | scribble | rectangle | other: say what). Do not skip small things (doodles, dots, tape, arrows, underlines).',
  'Then the SVGs must follow that list item by item: every listed element appears in the drawing at its listed place, size, colour, rotation and shape, and nothing is added that is not listed.',
  'SHAPES: use <rect> ONLY for things that really are rectangles. Everything else is a <path>, <circle>, <ellipse> or <polygon> (a blob, sticker, arch, pill, torn edge, scribble, doodle or cut-out outline is never a <rect>). Photos and cut-out people are image slots (data-image-slot), never drawn shapes.',
].join('\n');

export function buildPackPrompt(o: { kind: 'reference' | 'description'; types: PackType[]; description?: string; firstSvg?: string; retry?: string; /** The block check's message, for the one retry. */ blocks?: string; /** false: the old prompt without the look-first step (measuring only). */ inventory?: boolean }): string {
  const inv = o.kind === 'reference' && o.inventory !== false;
  return [
    '[pack:new] You design a STYLE PACK for carousel slides: one SVG slide design per slide type, all in one look. You are drawing designs, not describing them. ' + (inv ? 'Reply with the <inventory> block and then the SVGs only (no code fence, no other explanation).' : 'Reply with the SVGs only (no code fence, no explanation).'),
    inv ? INVENTORY_RULES : '',
    o.blocks ? `Your previous answer was mostly plain rectangles. ${o.blocks} Redraw the designs with the real shapes from your inventory (paths, circles, ellipses, polygons); keep <rect> only for real rectangles. Make ONLY the slide types listed above again.` : '',
    o.kind === 'reference'
      ? 'The first picture is the reference slide (the file reference.jpg in the current folder; look at it with your Read tool). The look of the pack must be the reference\'s look: its colours, type, motifs and mood.' + (o.firstSvg ? ` Its first slide design, already drawn, is:\n${o.firstSvg.slice(0, 9000)}` : '')
      : `The look to design, in the person's words: "${(o.description ?? '').slice(0, 400)}".`,
    `Make one <svg> for each of these slide types, in this order: ${o.types.join(', ')}. Each is 1080 x 1350 px: use viewBox="0 0 1080 1350" and put data-type="<type>" on the <svg>. The FIRST <svg> also has data-palette='{"bg":"#...","text":"#...","accent":"#...","accent2":"#...","surface":"#...","muted":"#..."}' naming the pack's colours. In every design use colours ONLY as those names (fill="$accent", stroke="$text"), never hex.`,
    'EVERY slide type must have a different composition from the others: a different arrangement of its text slots (position and size) and of its graphics. Do not repeat one layout with other words or small shifts; a cover, a step, a list and a stat slide look different from each other at a glance (for example: title low and big on the cover, a huge number on the left on a step, a column of items on a list, one giant figure centred on a stat). Keep the same palette, fonts and motifs so they belong together.',
    'Text slots: each <text> has data-role (kicker, tag, title, body, caption or number), data-min-size (px, 32 or more) and data-max-lines, and holds sample words. One <text> per slot; a slot may hold several lines, the code wraps and fits the person\'s words into it, so make each slot as big as its words need. Slots a slide type has:',
    ...o.types.map((t) => `  ${t}: ${SLOTS[t]}`),
    `Fonts: only these bundled ones: ${fontLine()}. If none fits a text, use the nearest and add data-font-wish="the family you wanted".`,
    'EVERY design MUST have real <text> elements for its text slots (at least a title or a body, each with data-role). Words drawn as outlines or paths, or text left out, are refused and the design is asked for again.',
    o.retry ? `Your previous answer was refused for: ${o.retry}. Make ONLY the slide types listed above again.` : '',
    'Photos are never drawn as abstract shapes: a photo region is always an image slot. Image slots (optional, where a photo or picture would fit on that slide type, at most 2 per design): draw one as <rect data-image-slot="background|inset|half-bleed|strip|cutout" data-mask="rect|rounded|circle|arch|blob" data-fit="cover|contain" data-scrim="0.4" data-scrim-from="bottom" x=".." y=".." width=".." height=".."/> (a strip also has data-count="2" or "3"). NEVER an <image> and never a link or picture data: the slot stays empty until the person adds a picture. Keep the text slots clear of it or on its scrim.',
    'ALSO make one extra <svg data-type="quote" data-format="square" viewBox="0 0 1080 1080"> after the others: a 1:1 quote post for the same look (data-role title for the quote and caption for who said it), composed for a square, not the 4:5 quote scaled down. It may have a background or inset image slot too.',
    'Use <rect> only for things that really are rectangles; everything else is a <path>, <circle>, <ellipse> or <polygon>. Photos and cut-outs are image slots, never shapes.',
    'Graphics (motifs, shapes, doodles, patterns, dots) are plain shapes and paths; every group of them is a <g id="short-name">. Allowed elements only: svg, g, path, circle, ellipse, rect, line, polyline, polygon, defs, linearGradient, radialGradient, stop, clipPath, mask, pattern, text, tspan. No images, no scripts, no external references. The first element of each design is the full-size background <rect>.',
  ].filter(Boolean).join('\n');
}

// ----- the answer -----

export interface PackAnswer {
  ok: true;
  pack: StylePack;
  problems: string[];
}
export const hasTextSlots = (layers: RLayer[]) => layers.some((l) => l.kind === 'text' && ['kicker', 'tag', 'title', 'body', 'caption', 'number'].includes(l.name));

export const slotMetaOf = (layers: RLayer[]): SlotMeta[] =>
  layers.filter((l): l is RLayer & TextLayer => l.kind === 'text').map((l) => ({ role: l.name, x: Math.round(l.x), y: Math.round(l.y), w: Math.round(l.width), h: Math.round(l.height), minSize: l.slot?.minSize ?? 32, ...(l.slot?.maxSize ? { maxSize: l.slot.maxSize } : {}), ...(l.slot?.maxLines ? { maxLines: l.slot.maxLines } : {}) }));
/** Removes the <inventory> block (the look-first listing) from an answer; an unclosed one is cut at the first <svg>. */
export function stripInventory(text: string): string {
  let t = text.replace(/<inventory\b[^>]*>[\s\S]*?<\/inventory>/gi, '');
  const open = /<inventory\b[^>]*>/i.exec(t);
  if (open) {
    const svgAt = t.indexOf('<svg', open.index);
    t = svgAt < 0 ? t.slice(0, open.index) : t.slice(0, open.index) + t.slice(svgAt);
  }
  return t.trim();
}

/** The "block check" (no model): the share of drawn shapes that are plain <rect>. The full-size background rect and image-slot rects are not counted. */
export function rectShare(text: string): { shapes: number; rects: number; share: number } {
  let shapes = 0;
  let rects = 0;
  for (const b of stripInventory(text).match(/<svg[\s\S]*?<\/svg>/gi) ?? []) {
    let first = true;
    for (const m of b.matchAll(/<(rect|path|circle|ellipse|polygon|polyline)\b([^>]*)>/gi)) {
      const tag = m[1].toLowerCase();
      const attrs = m[2];
      if (first && tag === 'rect') {
        first = false; // the background
        continue;
      }
      first = false;
      if (/data-image-slot/i.test(attrs)) continue;
      shapes++;
      if (tag === 'rect') rects++;
    }
  }
  return { shapes, rects, share: shapes ? rects / shapes : 0 };
}

/** Whether the reference measured as not rectangular (regions.ts): a quarter or more of its photos, shapes and graphics are round, pill, rounded, rings or marks. */
export function notRectangular(d: Detected | null | undefined): boolean {
  if (!d) return false;
  const total = d.photos.length + d.shapes.length + d.graphics.length;
  if (total === 0) return false;
  const odd = d.photos.filter((p) => p.shape === 'circle' || p.shape === 'rounded').length + d.shapes.filter((s) => s.kind !== 'rect' && s.kind !== 'bar').length + d.graphics.length;
  return odd / total >= 0.25;
}

export interface BlockCheck {
  shapes: number;
  rects: number;
  share: number;
  notRect: boolean;
  /** True when a retry is due: more than 60% of the shapes are plain rectangles and the reference is not rectangular. */
  blocky: boolean;
  message: string;
}
export function blockCheck(text: string, detected: Detected | null | undefined): BlockCheck {
  const r = rectShare(text);
  const nr = notRectangular(detected);
  const blocky = r.shapes >= 3 && r.share > 0.6 && nr;
  return { ...r, notRect: nr, blocky, message: `${r.rects} of ${r.shapes} drawn shapes (${Math.round(r.share * 100)}%) were <rect>, but the reference has round, pill, rounded or free-form shapes.` };
}

/** After the first answer: when the block check fails, ONE more draw call with the check result in the prompt (the caller's cap counts it). Returns the text to parse. */
export async function retryIfBlocky(o: { reader: ReferenceReader; text: string; detected: Detected | null | undefined; build: (blocks: string) => string; images: ReaderImage[]; signal: AbortSignal; canRetry: boolean }): Promise<{ text: string; retried: boolean; check: BlockCheck; after?: BlockCheck }> {
  const check = blockCheck(o.text, o.detected);
  if (!check.blocky || !o.canRetry) return { text: o.text, retried: false, check };
  const again = await callPack(o.reader, o.build(check.message), o.images, o.signal);
  const after = blockCheck(again, o.detected);
  // The retry replaces the first answer only when it has designs and is not blockier.
  const better = /<svg/i.test(again) && after.share <= check.share;
  return { text: better ? again : o.text, retried: true, check, after };
}

export async function parsePack(text0: string, name: string, fallbackPalette?: Record<string, string>): Promise<PackAnswer | { ok: false; reasons: string[] }> {
  const text = stripInventory(text0);
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
  if ((!palette.bg || !palette.text) && fallbackPalette) palette = fallbackPalette;
  if (!palette.bg || !palette.text) return { ok: false, reasons: ['The first design has no usable data-palette (it needs at least "bg" and "text" as #rrggbb).'] };
  await loadFonts();
  const designs: StylePack['designs'] = {};
  const svgs: NonNullable<StylePack['svgs']> = {};
  const imageSlots: NonNullable<StylePack['imageSlots']> = {};
  let square: SquareDesign | undefined;
  const slotMeta: NonNullable<StylePack['slotMeta']> = {};
  const problems: string[] = [];
  const notes: string[] = [];
  for (const b of blocks) {
    const t = /data-type\s*=\s*["']([a-z]+)["']/i.exec(b)?.[1]?.toLowerCase();
    if (!t || !(PACK_TYPES as readonly string[]).includes(t)) {
      problems.push(`A design without a known data-type (${PACK_TYPES.join(', ')}) was left out.`);
      continue;
    }
    // Image slots come out first (a marker stays in the drawing); a picture is never kept in the SVG.
    const ex = extractImageSlots(b);
    const isSquare = /data-format\s*=\s*["']square["']/i.test(b);
    const dims = isSquare ? { w: 1080, h: 1080 } : SIZE;
    const s = sanitizeSvg(ex.svg.replace(/data-palette\s*=\s*'[^']*'|data-palette\s*=\s*"[^"]*"/i, ''));
    if (!s.svg) {
      problems.push(`${t}: ${s.reasons.join(' ')}`);
      continue;
    }
    const { layers, notes: n } = svgToLayers(s.svg, dims.w, dims.h);
    if (layers.length < 2) {
      problems.push(`${t}: nothing drawable was in the picture.`);
      continue;
    }
    // A design without text slots cannot take a slide's words: it is left out (and asked for again once).
    if (!hasTextSlots(layers)) {
      problems.push(`${t}: no text slots (<text> elements with data-role), so the design was left out.`);
      continue;
    }
    if (isSquare) {
      if (t === 'quote') {
        square = { layers, svg: s.svg, slots: ex.slots, slotMeta: slotMetaOf(layers), canvas: { w: 1080, h: 1080 } };
        notes.push('quote (square): a 1:1 design for quote posts.');
      }
      continue;
    }
    designs[t as PackType] = layers;
    if (ex.slots.length) imageSlots[t as PackType] = ex.slots;
    svgs[t as PackType] = s.svg;
    slotMeta[t as PackType] = slotMetaOf(layers);
    notes.push(...n.map((x) => `${t}: ${x}`), ...s.wished.map((w) => `${t}: font wanted ${w.wish}, used ${w.used}.`));
  }
  if (Object.keys(designs).length === 0) return { ok: false, reasons: problems };
  const fonts = (() => {
    const first = Object.values(designs)[0]!.filter((l) => l.kind === 'text') as { style: { font: FontFamily }; name: string }[];
    const h = first.find((l) => l.name === 'title')?.style.font ?? 'Schibsted Grotesk';
    const bo = first.find((l) => l.name === 'body')?.style.font ?? 'Instrument Sans';
    return { headline: h, body: bo };
  })();
  return { ok: true, problems, pack: { name, palette, fonts, motifs: [], designs, svgs, slotMeta, ...(Object.keys(imageSlots).length ? { imageSlots } : {}), ...(square ? { square } : {}), canvas: { ...SIZE }, notes } };
}

export async function callPack(reader: ReferenceReader, prompt: string, images: ReaderImage[], signal: AbortSignal): Promise<string> {
  return (await reader.read({ role: 'draw', prompt, images }, signal)).text;
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
    content: [bg(), T('title', 7, 7, 86, 12, 72, { font: 'headline', lines: 2, min: 44 }), block('column-rule', 52, 24, 0.5, 60, '$muted'), T('body', 7, 24, 40, 62, 44, { lines: 13 }), block('corner', 57, 24, 36, 22, '$surface', { radius: 24 }), T('caption', 59.5, 26.5, 31, 17, 38, { colour: '$muted', lines: 4 })],
    list: [bg(), T('title', 10, 6, 80, 11, 64, { font: 'headline', align: 'center', lines: 2, min: 40 }), block('bullet-1', 7, 25, 2.5, 1.8, '$accent'), block('bullet-2', 7, 38, 2.5, 1.8, '$accent'), block('bullet-3', 7, 51, 2.5, 1.8, '$accent'), block('bullet-4', 7, 64, 2.5, 1.8, '$accent'), block('bullet-5', 7, 77, 2.5, 1.8, '$accent'), T('body', 14, 22, 79, 66, 50, { lines: 6, lh: 2.05 })],
    stat: [bg(), block('panel', 6, 20, 88, 56, '$surface', { radius: 32 }), T('kicker', 7, 6, 70, 4, 34, { colour: '$muted', lines: 1 }), T('number', 6, 25, 88, 28, 320, { font: 'headline', colour: '$accent', align: 'center', lines: 1, min: 120 }), T('title', 10, 56, 80, 10, 60, { font: 'headline', align: 'center', lines: 2, min: 38 }), T('body', 12, 68, 76, 7, 38, { colour: '$muted', align: 'center', lines: 2 })],
    quote: [bg(), T('quotemark', 6, 3, 30, 20, 420, { font: 'headline', colour: '$accent', lines: 1, min: 200, sample: '“' }), T('title', 10, 27, 80, 42, 76, { font: 'headline', lines: 6, min: 40, lh: 1.2 }), T('caption', 10, 74, 80, 6, 38, { colour: '$muted', lines: 2 }), block('foot', 0, 97, 100, 3, '$accent')],
    cta: [bg(), block('top-block', 0, 0, 100, 55, '$accent'), T('title', 7, 11, 86, 36, 112, { font: 'headline', colour: '$onAccent', lines: 4, min: 56, lh: 1.05 }), T('body', 7, 62, 86, 14, 46, { lines: 4 }), block('button', 7, 80, 50, 8, '$accent', { radius: 60 }), T('kicker', 7, 81.4, 50, 5, 40, { colour: '$onAccent', align: 'center', lines: 1 })],
  };
  // Image slots (empty until the person adds pictures) and a square quote design, built by the code too.
  const slot = (id: string, kind: ImageSlot['kind'], x: number, y: number, w: number, h: number, mask: ImageSlot['mask'], scrim?: ImageSlot['scrim']): ImageSlot => ({ id, kind, x, y, w, h, mask, fit: 'cover', focal: { x: 0.5, y: 0.5 }, ...(scrim ? { scrim } : {}) });
  const P = (px: number, py: number, pw: number, ph: number): [number, number, number, number] => [px / 10.8, py / 13.5, pw / 10.8, ph / 13.5];
  const sq = {
    layers: [bg(), T('title', ...P(90, 230, 900, 560), 78, { font: 'headline', lines: 7, min: 44, lh: 1.2 }), T('caption', ...P(330, 880, 660, 100), 40, { colour: '$muted', lines: 2 }), block('foot', ...P(0, 1050, 1080, 30), '$accent')],
    slots: [slot('square-bg', 'background', 0, 0, 1080, 1080, 'rect', { amount: 0.4, from: 'all' }), slot('square-inset', 'inset', 90, 840, 190, 190, 'circle')],
    canvas: { w: 1080, h: 1080 },
  } as SquareDesign;
  const imageSlots: StylePack['imageSlots'] = {
    cover: [slot('cover-bg', 'background', 0, 0, 1080, 1350, 'rect', { amount: 0.45, from: 'bottom' })],
    content: [slot('content-inset', 'inset', 616, 675, 389, 405, 'rounded')],
  };
  const pack: StylePack = { name: `${spec.title} pack`, palette, fonts, motifs: [], designs, imageSlots, square: sq, canvas: { ...SIZE }, notes: [`Built from the ${spec.title} style: its colours and fonts, a different composition for each slide type.`] };
  return pack;
}
