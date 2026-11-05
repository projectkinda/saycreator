// DESIGNED mode: one model call returns the story (the usual script) AND an SVG design for every slide. Each design is checked (sanitiser, the words,
// the phone checks from its slot data); a slide that still fails after one retry falls back to the pack or template design and says so.
// A designed slide is stored as a one-design pack, so the faithful renderer, the slots (text edits refit with no model call), "Make editable" and the picture slots all work as for packs.
import type { CarouselScript } from '../image-engine/carousel/types';
import { designKey, packFromStyle, parsePack, slotMetaOf, type StylePack } from '../reference/pack';
import { FONT_NAMES, textsOf } from '../reference/recreate';
import { FONT_WEIGHTS } from '../image-engine/fonts';
import type { FontFamily, Layer } from '../image-engine/types';
import { WriterError, type GenerateResult, type WriteProvider } from './writer';
import { cleanPaste, validateScriptText } from './script';
import { buildRetryPrompt, buildWritePrompt, type WriteRequest } from './writerPrompt';

/** A recurring item (page number, handle, swipe cue): plain text kept outside the slots. */
export interface Recurring {
  x: number;
  y: number;
  size: number;
  font: string;
  weight: number;
  fill: string;
  anchor: 'start' | 'middle' | 'end';
  text: string;
}
export interface DesignedSlide {
  pack: StylePack;
  recurring?: Recurring[];
}
export interface Designed {
  /** By slide number ("0" is the first). A slide that has none uses the pack or template design. */
  slides: Record<string, DesignedSlide>;
  /** Why a slide fell back, by slide number. */
  fallbacks: Record<string, string>;
  /** Deck-level remarks (for example the slides look too alike). */
  notes: string[];
  calls: number;
  ms: number;
}
/** The look the designs follow: a chosen pack, or a short brief in words. */
export interface Look {
  pack?: StylePack | null;
  brief?: string;
}

// ----- the estimate, shown before anything runs -----
const BASE_SECONDS = 25;
const SECONDS_PER_SLIDE = 9;
export function designEstimate(slides: number): { calls: 1; maxCalls: 2; seconds: number; maxSeconds: number; text: string } {
  const seconds = BASE_SECONDS + SECONDS_PER_SLIDE * slides;
  const maxSeconds = seconds + 20 + 6 * Math.ceil(slides / 2);
  return { calls: 1, maxCalls: 2, seconds, maxSeconds, text: `About 1 model call and about ${seconds} seconds for ${slides} slides (a second call, up to about ${maxSeconds} seconds, only if some designs need fixing).` };
}

// ----- the prompt -----
const ROLE_RULE = 'title = the slide\'s headline (or its quote, or the stat label); kicker = its "kicker" (or the handle); tag = "STEP n" on a step slide; number = the step number or the stat value; body = its body, sub, note or cta (checklist items one per line); caption = the label next to a value, or the first checklist item';

function lookText(look: Look): string {
  if (look.pack) {
    const p = look.pack;
    const sample = Object.values(p.svgs ?? {})[0];
    return [
      `Look: the chosen pack "${p.name}". Use its colours ONLY as these names (fill="$accent", stroke="$text", never hex): ${JSON.stringify(p.palette)}. Fonts: headline "${p.fonts.headline}", body "${p.fonts.body}". Its motifs and mood come from this sample design, which you extend and recompose for each slide:`,
      sample ? sample.slice(0, 3500) : '(no sample)',
    ].join('\n');
  }
  return `Look: ${look.brief?.trim() ? `in the person's words: "${look.brief.trim().slice(0, 300)}"` : 'a clean, confident look that suits the text and tone'}. Choose ONE palette and ONE pair of fonts for the whole deck and name the colours on every <svg> as data-palette='{"bg":"#...","text":"#...","accent":"#...","accent2":"#...","surface":"#...","muted":"#..."}' (the same on every slide). Use colours ONLY as those names (fill="$accent", stroke="$text"), never hex.`;
}

function designRules(look: Look, handle: string, n: number): string {
  return [
    '',
    '=== PART 2: design every slide ===',
    `After the JSON object, on new lines, write ONE <svg> for each of the ${n} slides, in order. No code fence, no explanation. Each is 4:5: viewBox="0 0 1080 1350", with data-slide="<number from 1>" and data-type="<that slide's type>". Keep each under 3500 characters.`,
    lookText(look),
    `Fonts: only these bundled ones: ${FONT_NAMES.join(', ')}.`,
    'Composition: decide each slide\'s composition from its own content (a hook low and big on the cover, a huge number on a stat, a column on a checklist, a quote with a giant mark...). The slides must NOT all share one composition: at least three clearly different arrangements across the deck. Same palette, fonts and margins (at least 48 px) on every slide.',
    'Graphics: draw small icons or graphics that relate to what THAT slide says (a clock for time, a bar for a stat, a check for a checklist), as plain shapes and paths, each group a <g id="short-name">. A checklist slide has ONE body text slot PER ITEM, each in its own row (data-role="body", rows top to bottom, up to 5; the code puts item 1 in the first, item 2 in the second...; an unused row is hidden), never one slot holding all items. Allowed elements only: svg, g, path, circle, ellipse, rect, line, polyline, polygon, defs, linearGradient, radialGradient, stop, clipPath, mask, pattern, text, tspan. No images, scripts or links. The first element is the full-size background <rect>.',
    `Text: real <text> elements, never outlines. Each slot has data-role (kicker, tag, title, body, caption or number), data-min-size (32 or more) and data-max-lines, and holds THAT slide's own words from the JSON (${ROLE_RULE}). Use only words that are in the slide's JSON: no new words, facts or numbers. One <text> per slot; the code refits the words into it, so make each slot big enough for its words (at least 32 px type).`,
    `Recurring items the same on every slide, same place, same size, as plain <text> (at least 28 px) with NO data-role: the page number ("1 / ${n}", "2 / ${n}"...), the handle "${handle || '@yourname'}", and a swipe cue "swipe →" on every slide except the last.`,
    'Visual weight: every slide needs at least 3 visual elements beyond its text, for example a large numeral, a pattern or shape cluster, a framed quote, an icon with a backing shape, or a divider. A lone icon or line on empty space is not enough. A stat slide with a real "value" draws it as a HUGE number (data-role="number", at least 200 px) with its label and note around it.',
    'Photos: when a slide has a "photo_hint", leave a photo region as an image slot, never as abstract shapes: <rect data-image-slot="background|inset|half-bleed|strip|cutout" data-mask="rect|rounded|circle|arch|blob" data-fit="cover" data-scrim="0.4" data-scrim-from="bottom" x=".." y=".." width=".." height=".."/>. NEVER an <image>. At most 2 per slide; keep text clear of it or on its scrim.',
  ].join('\n');
}

export function buildDesignPrompt(req: WriteRequest, look: Look, handle: string): string {
  const [lo, hi] = req.format === 'carousel' ? [3, 10] : [1, 7];
  const n = Math.min(hi, Math.max(lo, req.slides));
  const story = buildWritePrompt(req).replace('Reply with ONE JSON object and nothing else (no code fence, no explanation). Format:', 'Reply with ONE JSON object first (PART 1: the story, no code fence, no explanation), then PART 2 below. The JSON format:');
  return [`[carousel:designed]`, story, designRules(look, handle, n)].join('\n');
}

function buildSvgRetry(first: string, script: CarouselScript, problems: Record<number, string[]>): string {
  const lines = Object.entries(problems).flatMap(([i, ps]) => ps.slice(0, 6).map((p) => `- slide ${Number(i) + 1}: ${p}`));
  return [
    first,
    '',
    'The story (JSON) below is fixed. Do NOT change it:',
    JSON.stringify(script),
    '',
    'These slide designs could not be used, for these reasons:',
    ...lines,
    '',
    `Reply with ONLY the corrected <svg> for slides ${Object.keys(problems).map((i) => Number(i) + 1).join(', ')}, each with its data-slide number. No JSON, no code fence, no explanation.`,
  ].join('\n');
}

// ----- reading the answer -----
const jsonPart = (t: string) => (t.search(/<svg/i) >= 0 ? t.slice(0, t.search(/<svg/i)) : t);
/** The slide designs of an answer, by slide index (data-slide, else in order). */
export function svgsOf(text: string): Map<number, string> {
  const out = new Map<number, string>();
  const at = text.search(/<svg/i);
  const blocks = at < 0 ? [] : (text.slice(at).match(/<svg[\s\S]*?<\/svg>/gi) ?? []);
  blocks.forEach((b, k) => {
    const n = /data-slide\s*=\s*["']?(\d+)/i.exec(b)?.[1];
    out.set(n ? Number(n) - 1 : k, b);
  });
  return out;
}
const PALETTE_RE = /data-palette\s*=\s*'[^']*'|data-palette\s*=\s*"[^"]*"/i;
function setType(block: string, key: string): string {
  return /data-type\s*=\s*["'][a-z]*["']/i.test(block) ? block.replace(/data-type\s*=\s*["'][a-z]*["']/i, `data-type="${key}"`) : block.replace(/<svg/i, `<svg data-type="${key}"`);
}
function extras(text: string): { style: string | null; note: string | null } {
  try {
    const j = JSON.parse(cleanPaste(jsonPart(text))) as { style?: unknown; note?: unknown };
    return { style: typeof j.style === 'string' ? j.style : null, note: typeof j.note === 'string' && j.note.trim() ? j.note.trim() : null };
  } catch {
    return { style: null, note: null };
  }
}

// ----- the checks -----
const tokens = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
function wordsOf(v: unknown, out: Set<string>, skip = false) {
  if (typeof v === 'string') {
    if (!skip) tokens(v).forEach((t) => out.add(t));
  } else if (Array.isArray(v)) v.forEach((x) => wordsOf(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) wordsOf(x, out, ['type', 'element_tags', 'photo', 'photo_hint', 'style'].includes(k));
}
/** How many drawn shapes a design has beyond its text and its background (picture spots and definitions are not counted). */
export function visualElements(block: string): number {
  const body = block.replace(/<defs[\s\S]*?<\/defs>/gi, '');
  const shapes = [...body.matchAll(/<(rect|circle|ellipse|path|line|polyline|polygon)\b([^>]*)>/gi)].filter((m) => !/data-image-slot/i.test(m[2]));
  return Math.max(0, shapes.length - 1);
}
/** Every text element of a design: its role (none for the recurring items) and its words. */
export function textsInSvg(block: string): { role: string | null; text: string; size: number }[] {
  return [...block.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)].map((m) => ({
    size: Number(/font-size\s*=\s*["']?([\d.]+)/i.exec(m[1])?.[1]) || 0,
    role: /data-role\s*=\s*["']([a-z]+)["']/i.exec(m[1])?.[1]?.toLowerCase() ?? null,
    text: m[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
}

/** Problems with one slide's design, in plain words. Empty: usable. */
export function checkDesign(slide: Record<string, unknown>, handle: string, n: number, block: string, pack: StylePack | null, parseReasons: string[]): string[] {
  const out: string[] = [...parseReasons];
  const allowed = new Set<string>(['step']);
  wordsOf(slide, allowed);
  tokens(handle || '@yourname').forEach((t) => allowed.add(t));
  const texts = textsInSvg(block);
  const extra = new Set<string>();
  for (const t of texts) {
    // Role text takes the script's own words when drawn, but the design must have been written with them; the recurring items carry only the handle, a page number and a swipe cue.
    const ok = t.role ? allowed : new Set<string>(['swipe', 'next', 'of', ...tokens(handle || '@yourname')]);
    for (const w of tokens(t.text)) if (!/^\d+$/.test(w) && !ok.has(w)) extra.add(w);
  }
  if (visualElements(block) < 3) out.push('the design has too little to look at: it needs at least 3 visual elements beyond its text (a large numeral, a pattern or shape cluster, a framed quote, an icon with a backing shape, a divider). A lone icon or line on empty space is not enough.');
  if (slide.type === 'stat' && !isPlaceholder(slide.value) && !texts.some((t) => t.role === 'number' && t.size >= 160)) out.push('the stat slide has a real value, so it must be drawn as a HUGE number: put it in a data-role="number" text of at least 160 px.');
  if (extra.size) out.push(`the design uses words that are not in this slide's script: ${[...extra].slice(0, 8).join(', ')}. Use only the slide's own words (plus the page number, the handle and "swipe").`);
  if (pack) {
    const key = designKey(String(slide.type));
    const meta = pack.slotMeta?.[key] ?? slotMetaOf(pack.designs[key] ?? []);
    // Only a slot that is truly off the slide (or has no box) rejects the design; a box that runs past the margins is clamped inside them (see clampSlots).
    for (const m of meta) {
      if (!(m.w > 0) || !(m.h > 0) || m.x >= 1080 || m.y >= 1350 || m.x + m.w <= 0 || m.y + m.h <= 0) out.push('the ' + m.role + ' slot has no box on the slide (it is off the 1080 x 1350 slide or has no size).');
    }
    if (key === 'list') {
      const items = Array.isArray(slide.items) ? slide.items.length : 0;
      const bodies = meta.filter((m) => m.role === 'body').length;
      if (items >= 2 && bodies < items) out.push('this checklist has ' + items + ' items but only ' + bodies + ' body text slot' + (bodies === 1 ? '' : 's') + ': draw one body slot per item row (each its own row with data-role="body"), so every item lands in its own row.');
    }
    if (n > 0 && !meta.some((m) => m.role === 'title' || m.role === 'body' || m.role === 'number')) out.push('the design has no title, body or number text slot.');
  }
  return out;
}

const MARGIN = 48;
const TOLERANCE = 22; // about 2% of the slide width
/** A slot box that runs past the margins (by more than the tolerance) is pulled inside them instead of the slide being rejected. Measured on the box, never on the sample text's width. */
export function clampSlots(pack: StylePack, key: keyof StylePack['designs']): StylePack {
  const layers = pack.designs[key];
  if (!layers) return pack;
  let moved = 0;
  const next = layers.map((l) => {
    if (l.kind !== 'text') return l;
    let x0 = l.x;
    let x1 = l.x + l.width;
    let y0 = l.y;
    let y1 = l.y + l.height;
    if (x0 < MARGIN - TOLERANCE) x0 = MARGIN;
    if (x1 > 1080 - MARGIN + TOLERANCE) x1 = 1080 - MARGIN;
    if (y0 < MARGIN - TOLERANCE) y0 = MARGIN;
    if (y1 > 1350 - MARGIN + TOLERANCE) y1 = 1350 - MARGIN;
    const minH = Math.ceil((l.style.size || 32) * 1.2);
    if (x1 - x0 < 120) x0 = Math.max(MARGIN, x1 - 120);
    if (y1 - y0 < minH) y0 = Math.max(MARGIN, y1 - minH);
    if (x0 === l.x && x1 === l.x + l.width && y0 === l.y && y1 === l.y + l.height) return l;
    moved += 1;
    return { ...l, x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  });
  if (!moved) return pack;
  const designs = { ...pack.designs, [key]: next };
  return { ...pack, designs, slotMeta: { ...pack.slotMeta, [key]: slotMetaOf(next) }, notes: [...pack.notes, key + ': ' + moved + ' text slot' + (moved === 1 ? ' was' : 's were') + ' moved inside the slide margins.'] };
}

interface Checked {
  pack: StylePack | null;
  problems: string[];
  recurring?: Recurring[];
}

const attr = (a: string, n: string) => new RegExp('\\b' + n + '\\s*=\\s*["\']([^"\']*)["\']', 'i').exec(a)?.[1];
/** Takes the plain texts (no data-role) out of a design: they are the recurring items, kept outside the slots so the fill never overwrites them. */
export function splitRecurring(block: string): { block: string; recurring: Recurring[] } {
  const recurring: Recurring[] = [];
  const out = block.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi, (all, a: string, inner: string) => {
    if (/data-role\s*=/i.test(a)) return all;
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim().slice(0, 60);
    const family = (attr(a, 'font-family') ?? '').split(',')[0].replace(/["']/g, '').trim();
    const font = (FONT_NAMES as string[]).includes(family) ? family : '';
    const anchor = attr(a, 'text-anchor');
    const fill = attr(a, 'fill') ?? '';
    if (text) recurring.push({ x: Number(attr(a, 'x')) || 0, y: Number(attr(a, 'y')) || 0, size: Math.min(80, Math.max(28, Number(attr(a, 'font-size')) || 30)), font, weight: Number(attr(a, 'font-weight')) || 400, fill: /^(\$[a-z0-9]+|#[0-9a-f]{6})$/i.test(fill) ? fill : '$muted', anchor: anchor === 'middle' || anchor === 'end' ? anchor : 'start', text });
    return '';
  });
  return { block: out, recurring };
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** The recurring items as SVG text (colour names still unresolved), added to the filled drawing. */
export function recurringMarkup(rec: Recurring[] | undefined, pack: StylePack): string {
  return (rec ?? []).map((r) => '<text x="' + r.x + '" y="' + r.y + '" font-size="' + r.size + '" font-family="' + (r.font || pack.fonts.body) + '" font-weight="' + r.weight + '" fill="' + r.fill + '" text-anchor="' + r.anchor + '">' + esc(r.text) + '</text>').join('');
}
/** The recurring items as text layers (for the editable form). */
export function recurringLayers(rec: Recurring[] | undefined, pack: StylePack, id: string): Layer[] {
  return (rec ?? []).map((r, k) => {
    const font = ((FONT_NAMES as string[]).includes(r.font) ? r.font : pack.fonts.body) as FontFamily;
    const ws = FONT_WEIGHTS[font];
    const weight = ws.reduce((b, w) => (Math.abs(w - r.weight) < Math.abs(b - r.weight) ? w : b), ws[0]);
    const width = Math.ceil(r.text.length * r.size * 0.62) + 8;
    const x = r.anchor === 'middle' ? r.x - width / 2 : r.anchor === 'end' ? r.x - width : r.x;
    const hex = r.fill.startsWith('$') ? pack.palette[r.fill.slice(1)] ?? '#888888' : r.fill;
    return { kind: 'text', id: id + '-recurring' + k, name: 'recurring', role: 'content', x, y: r.y - r.size * 0.82, width, height: Math.ceil(r.size * 1.3), rotation: 0, opacity: 1, text: r.text, style: { font, weight, size: r.size, color: hex, align: r.anchor === 'middle' ? 'center' : r.anchor === 'end' ? 'right' : 'left', valign: 'top', lineHeight: 1.15 } } as unknown as Layer;
  });
}
async function checkOne(i: number, script: CarouselScript, block: string | undefined, look: Look, deckPalette: Record<string, string> | null): Promise<Checked> {
  const slide = script.slides[i] as unknown as Record<string, unknown>;
  if (!block) return { pack: null, problems: ['no design was given for this slide.'] };
  const key = designKey(String(slide.type));
  const forced = look.pack?.palette ?? deckPalette ?? undefined;
  const split = splitRecurring(block);
  const typed = setType(forced ? split.block.replace(PALETTE_RE, '') : split.block, key);
  const r = await parsePack(typed, `Slide ${i + 1}`, forced);
  if (!r.ok) return { pack: null, problems: checkDesign(slide, script.brand.handle, script.slides.length, block, null, r.reasons) };
  const pack = { ...r.pack, ...(forced ? { palette: forced } : {}) };
  const problems = checkDesign(slide, script.brand.handle, script.slides.length, block, pack, r.problems.filter((p) => !/left out/.test(p)));
  return { pack: problems.length ? null : clampSlots(pack, key), problems, recurring: split.recurring };
}
function deckPaletteOf(blocks: Iterable<string>): Record<string, string> | null {
  for (const b of blocks) {
    const m = /data-palette\s*=\s*'([^']*)'|data-palette\s*=\s*"([^"]*)"/i.exec(b);
    try {
      const p = JSON.parse((m?.[1] ?? m?.[2] ?? '').replace(/&quot;/g, '"')) as Record<string, string>;
      if (/^#[0-9a-f]{6}$/i.test(p.bg ?? '') && /^#[0-9a-f]{6}$/i.test(p.text ?? '')) return Object.fromEntries(Object.entries(p).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(v)).map(([k, v]) => [k, v.toUpperCase()]));
    } catch {
      /* none */
    }
  }
  return null;
}
/** Slides that all share one composition: the title slot is in the same place on (nearly) every slide. */
export function alikeNote(slides: Record<string, DesignedSlide>): string | null {
  const boxes = Object.values(slides).map((d) => {
    const m = Object.values(d.pack.slotMeta ?? {})[0]?.find((s) => s.role === 'title');
    return m ? `${Math.round(m.x / 90)}|${Math.round(m.y / 120)}|${Math.round(m.w / 180)}` : '';
  });
  return boxes.length >= 4 && new Set(boxes).size < 3 ? 'The designed slides are quite alike: their titles sit in nearly the same place. Use "Redesign this slide" on a few for more variety.' : null;
}

/** A stat value that is a placeholder ("X", "?", empty), not a real figure. */
export const isPlaceholder = (v: unknown) => typeof v !== 'string' || /^\s*(x+|\?+|n\/?a|tbd|\.+|…)?\s*$/i.test(v);

// ----- fallback slides take the deck's colours and fonts -----
const fallbackCache = new Map<string, StylePack>();
/** The standard layouts of a style, recoloured with the palette and fonts of the designed slides, so a slide that fell back still matches the deck. */
export function deckFallbackPack(spec: Parameters<typeof packFromStyle>[0], deck: StylePack): StylePack {
  const key = spec.name + JSON.stringify(deck.palette) + JSON.stringify(deck.fonts);
  const hit = fallbackCache.get(key);
  if (hit) return hit;
  const p = deck.palette;
  const pal = { bg: p.bg, text: p.text, accent: p.accent ?? p.text, onAccent: p.onAccent ?? p.bg, surface: p.surface ?? p.bg, muted: p.muted ?? p.text };
  const pack = packFromStyle({ ...spec, fonts: { ...spec.fonts, headline: deck.fonts.headline, body: deck.fonts.body }, palettes: { deck: pal } } as unknown as Parameters<typeof packFromStyle>[0]);
  const out = { ...pack, palette: { ...deck.palette, onAccent: pal.onAccent, accent: pal.accent, surface: pal.surface, muted: pal.muted }, fonts: { ...deck.fonts } };
  fallbackCache.set(key, out);
  return out;
}
/** The recurring items of a designed slide for slide i of n: the page number is renumbered, and the swipe cue is left off the last slide. */
export function recurringFor(rec: Recurring[] | undefined, i: number, n: number): Recurring[] | undefined {
  const pad = (v: number, w: number) => String(v).padStart(w, '0');
  return rec?.filter((r) => !(i === n - 1 && /swipe/i.test(r.text))).map((r) => ({ ...r, text: r.text.replace(/^(\d+)(\s*\/\s*)(\d+)$/, (_m, a: string, sep: string, b: string) => pad(i + 1, a.length) + sep + pad(n, b.length)) }));
}

// ----- the whole deck: one call, one retry -----
export async function designDeck(req: WriteRequest, look: Look, handle: string, p: WriteProvider, signal: AbortSignal, onPhase: (ph: 'writing' | 'retrying') => void = () => undefined): Promise<GenerateResult & { designed: Designed }> {
  const first = buildDesignPrompt(req, look, handle);
  let calls = 0;
  let ms = 0;
  const ask = async (prompt: string) => {
    onPhase(calls === 0 ? 'writing' : 'retrying');
    const a = await p.write(prompt, signal, 'draw');
    calls += 1;
    ms += a.ms;
    return a.text;
  };
  let text = await ask(first);
  let v = validateScriptText(jsonPart(text), req.format);
  if (!v.script) {
    const again = buildRetryPrompt(first, jsonPart(text), v.errors.map((e) => e.message)).replace('(the complete script, no code fence, no explanation)', '(the complete JSON, then all the slide designs again, no code fence)');
    text = await ask(again);
    v = validateScriptText(jsonPart(text), req.format);
  }
  if (!v.script) throw new WriterError('invalid', 'The writer answered twice, but neither answer could be used as a script.', v.errors);
  const script = v.script;
  const withHandle = { ...script, brand: { ...script.brand, handle: handle.trim() || script.brand.handle } };
  const svgs = svgsOf(text);
  const palette = look.pack ? null : deckPaletteOf(svgs.values());
  const done = new Map<number, Checked>();
  for (let i = 0; i < script.slides.length; i++) done.set(i, await checkOne(i, withHandle, svgs.get(i), look, palette));
  let bad = [...done].filter(([, c]) => !c.pack).map(([i]) => i);
  if (bad.length && calls === 1) {
    const retryText = await ask(buildSvgRetry(first, script, Object.fromEntries(bad.map((i) => [i, done.get(i)!.problems]))));
    const more = svgsOf(retryText);
    for (const i of bad) if (more.has(i)) done.set(i, await checkOne(i, withHandle, more.get(i), look, palette ?? deckPaletteOf(more.values())));
    bad = [...done].filter(([, c]) => !c.pack).map(([i]) => i);
  }
  const designed: Designed = { slides: {}, fallbacks: {}, notes: [], calls, ms };
  for (const [i, c] of done) {
    if (c.pack) designed.slides[String(i)] = { pack: c.pack, ...(c.recurring?.length ? { recurring: c.recurring } : {}) };
    else designed.fallbacks[String(i)] = c.problems[0] ?? 'the design could not be used';
  }
  const alike = alikeNote(designed.slides);
  if (alike) designed.notes.push(alike);
  script.slides.forEach((s, i) => {
    if (s.type === 'stat' && isPlaceholder((s as unknown as Record<string, unknown>).value)) designed.notes.push('Slide ' + (i + 1) + ' is a stat slide with a placeholder value. Type your own figure into its value field.');
  });
  return { script, ...extras(text), attempts: calls > 1 ? 2 : 1, ms, warnings: v.warnings, provider: p.id, designed };
}

// ----- one slide again -----
export function buildRedesignPrompt(slide: Record<string, unknown>, index: number, total: number, handle: string, look: Look, neighbours: string[], words: string, problems?: string[]): string {
  const t = textsOf(slide as never, handle);
  return [
    `[carousel:redesign] Redesign ONE slide of a ${total}-slide carousel (slide ${index + 1}). Reply with the single <svg> only (data-slide="${index + 1}", data-type="${String(slide.type)}", 4:5, viewBox="0 0 1080 1350"); no code fence, no explanation.`,
    `The slide's words (use only these): ${JSON.stringify(slide)}`,
    `Its text slots would hold: ${JSON.stringify(t)}`,
    words.trim() ? `The person asks: "${words.trim().slice(0, 300)}".` : 'Make it clearly different from its current design, still the same look as its neighbours.',
    neighbours.length ? `Match the style of its neighbours (same palette, fonts and margins). Their designs:\n${neighbours.map((n) => n.slice(0, 2500)).join('\n---\n')}` : '',
    designRules(look, handle, total).split('\n').filter((l) => !l.startsWith('After the JSON') && !l.startsWith('Composition')).join('\n'),
    problems?.length ? `Your previous answer was refused for: ${problems.join(' ')} Fix those.` : '',
  ].filter(Boolean).join('\n');
}

/** Redesigns one slide: a small call, one retry with the problems. Returns the new design, or the reasons it could not be made. */
export async function redesignSlide(script: CarouselScript, index: number, designed: Designed | undefined, look: Look, words: string, p: WriteProvider, signal: AbortSignal): Promise<{ ok: true; pack: StylePack; recurring?: Recurring[]; calls: number } | { ok: false; reasons: string[]; calls: number }> {
  const slide = script.slides[index] as unknown as Record<string, unknown>;
  const near = [index - 1, index + 1].map((i) => designed?.slides[String(i)]?.pack).filter(Boolean).map((pk) => Object.values(pk!.svgs ?? {})[0] ?? '');
  const palette = look.pack ? null : Object.values(designed?.slides ?? {})[0]?.pack.palette ?? null;
  let problems: string[] | undefined;
  let calls = 0;
  for (let tryNo = 0; tryNo < 2; tryNo++) {
    const a = await p.write(buildRedesignPrompt(slide, index, script.slides.length, script.brand.handle, look, near, words, problems), signal, 'draw');
    calls += 1;
    const block = svgsOf(a.text).get(index) ?? svgsOf(a.text).get(0);
    const c = await checkOne(index, script, block, look, palette);
    if (c.pack) return { ok: true, pack: c.pack, recurring: c.recurring, calls };
    problems = c.problems;
  }
  return { ok: false, reasons: problems ?? [], calls };
}

/** The designed slides as one reusable pack: one design per slide type (the first slide of each type), the deck's palette and fonts. */
export function packFromDesigned(designed: Designed, script: CarouselScript, name: string): StylePack | null {
  const order = Object.keys(designed.slides).map(Number).sort((a, b) => a - b);
  if (!order.length) return null;
  const first = designed.slides[String(order[0])].pack;
  const pack: StylePack = { name, palette: first.palette, fonts: first.fonts, motifs: [], designs: {}, svgs: {}, slotMeta: {}, imageSlots: {}, canvas: { ...first.canvas }, notes: [`Saved from a designed carousel: ${order.length} slide designs, one for each slide type used.`] };
  for (const i of order) {
    const key = designKey(String(script.slides[i]?.type));
    const d = designed.slides[String(i)].pack;
    const used = Object.keys(d.designs)[0] as keyof StylePack['designs'] | undefined;
    if (!used || pack.designs[key]) continue;
    pack.designs[key] = d.designs[used];
    if (d.svgs?.[used]) pack.svgs![key] = d.svgs[used];
    if (d.slotMeta?.[used]) pack.slotMeta![key] = d.slotMeta[used];
    if (d.imageSlots?.[used]) pack.imageSlots![key] = d.imageSlots[used];
  }
  return pack;
}
