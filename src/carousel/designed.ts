// DESIGNED mode: one model call returns the story (the usual script) AND an SVG design for every slide. Each design is checked (sanitiser, the words,
// the phone checks from its slot data); a slide that still fails after one retry falls back to the pack or template design and says so.
// A designed slide is stored as a one-design pack, so the faithful renderer, the slots (text edits refit with no model call), "Make editable" and the picture slots all work as for packs.
import type { CarouselScript } from '../image-engine/carousel/types';
import { designKey, packFromStyle, parsePack, signatureDevices, slotMetaOf, styleBriefOf, type SignatureDevices, type StylePack } from '../reference/pack';
import { activeReference } from '../reference/active';
import { FONT_NAMES, fillRecreate, textsOf, type RLayer } from '../reference/recreate';
import { layoutText, measureWidth } from '../image-engine/draw/text';
import { FONT_WEIGHTS } from '../image-engine/fonts';
import type { FontFamily, Layer, TextLayer } from '../image-engine/types';
import { WriterError, type GenerateResult, type WriteProvider } from './writer';
import type { LibraryReport } from './designLibrary';
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
  /** A drawn part of the profile header instead of text: the avatar circle or the verified tick (x, y is the centre, size the radius). */
  shape?: 'avatar' | 'tick';
}
export interface DesignedSlide {
  pack: StylePack;
  recurring?: Recurring[];
  /** A slide drawn by the layout library (the default route): the finished drawing and its layers. The slide is drawn from this, not from the pack. */
  built?: { svg: string; layers: Layer[]; bg: string; /** The pictures drawn on a library slide (an image field was set): their slots on the 1080 x 1350 slide. */ images?: { src: string; x: number; y: number; w: number; h: number }[]; /** The generic devices drawn on a library slide, with their boxes (checks and tests read them). */ devices?: { id: string; kind: string; box: { x: number; y: number; w: number; h: number }; ink?: string }[] };
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
  /** The layout tag each slide came back with (by slide number), for the variety rule and the report. */
  layouts?: Record<string, string | null>;
  /** Tokens the design calls used (when the writer reports them). */
  tokens?: { input: number; output: number };
  /** What the first design call sent: picture sizes, prompt and body bytes. */
  requestBytes?: RequestBytes;
  /** The library route (the default): layouts, cuts, retries, fallbacks, tokens (see designLibrary.ts). */
  library?: LibraryReport;
}
/**
 * Which route makes the slides. A reference style that is active (a pack from a reference) makes Designed the default: one model call writes the story and designs every
 * slide from the style brief and the inspiration pictures. The template fill ("pack") is for Quick, for ready-made slide text (no model), for a style that is not the
 * active reference, and as the fallback when Designed fails. `reason` says in words which and why, and goes into report.json.
 */
export function chooseRoute(o: { style: string; activeStyle: string; pack: StylePack | null; mode?: 'designed' | 'quick'; slideText?: boolean; /** The library pack of a built-in preset (null when the style is not a preset, or the template route flag is on). */ presetPack?: StylePack | null; format?: 'carousel' | 'quote' }): { route: 'designed' | 'pack'; reason: string } {
  if (o.slideText) return { route: 'pack', reason: 'Ready-made slide text was used as it is: no model was called.' };
  if (o.style !== o.activeStyle && o.presetPack) {
    if (o.mode === 'quick') return { route: 'pack', reason: 'Quick was chosen: the preset\'s templates fill the slides, no design call.' };
    if (o.format === 'quote') return { route: 'pack', reason: 'Square quote cards use the preset\'s templates (the layout library draws 1080x1350 only).' };
    return { route: 'designed', reason: 'A built-in style ("' + o.style + '") is chosen, so the layout library draws it (the template route is behind the creator.templateRoute flag).' };
  }
  if (o.style !== o.activeStyle) return { route: 'pack', reason: 'No reference style is active (style: ' + o.style + '), so that style\'s templates fill the slides.' };
  if (!o.pack) return { route: 'pack', reason: 'The active reference has no pack to design from, so the template fill ran.' };
  if (o.mode === 'quick') return { route: 'pack', reason: 'Quick was chosen: templates fill the slides, no design call.' };
  return { route: 'designed', reason: 'A reference style is active ("' + o.pack.name + '"), so Designed mode is the default.' };
}

/** The size of what one design call sends: each picture (bytes as sent, format), the prompt (characters) and the whole request body (bytes of the JSON). */
export interface RequestBytes {
  images: { bytes: number; format: 'jpeg' | 'png' }[];
  prompt: number;
  body: number;
}
let lastRequest: RequestBytes | null = null;
/** The size of the last request a design call tried to send (also when it failed), for the error message and the report. */
export const lastRequestBytes = (): RequestBytes | null => lastRequest;
/** The message the person sees when Designed mode fails: the real reason, and how big the request was. */
export function designFailureMessage(reason: string, req: RequestBytes | null): string {
  const kb = (n: number) => Math.round(n / 1000) + ' KB';
  const size = req ? ' The request was ' + kb(req.body) + ' (' + req.images.length + ' picture' + (req.images.length === 1 ? '' : 's') + (req.images.length ? ': ' + req.images.map((i) => kb(i.bytes)).join(', ') : '') + ').' : '';
  return 'Designed mode failed: ' + reason.replace(/\s+/g, ' ').trim() + size + ' Nothing was replaced and no template fill was run. Retry, or use the quick templates instead.';
}
/** Re-encodes a JPEG (base64): longest side at most maxSide px, the given quality. The inspiration pictures stay small (about 100 KB each). */
export async function compressJpeg(base64: string, maxSide = 700, quality = 0.7): Promise<string> {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const bm = await createImageBitmap(new Blob([bytes]));
  const k = Math.min(1, maxSide / Math.max(bm.width, bm.height));
  const c = new OffscreenCanvas(Math.max(1, Math.round(bm.width * k)), Math.max(1, Math.round(bm.height * k)));
  c.getContext('2d')!.drawImage(bm, 0, 0, c.width, c.height);
  bm.close();
  const out = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality })).arrayBuffer());
  let s = '';
  for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The look the designs follow: a chosen pack, or a short brief in words. */
export interface Look {
  pack?: StylePack | null;
  brief?: string;
  /** The person has a photo of their own to put in the slides. Without one, no slide uses the photo-led layout and no empty picture frame is drawn. */
  hasPhoto?: boolean;
  /** The project's pictures as metadata only (id, pixel size): no pixels. The layouts with picture slots are offered only when enough of them fit; the code places them. */
  images?: { id: string; width: number; height: number }[];
}

// ----- the estimate, shown before anything runs -----
const BASE_SECONDS = 25;
const SECONDS_PER_SLIDE = 9;
export function designEstimate(slides: number): { calls: 1; maxCalls: 3; seconds: number; maxSeconds: number; text: string } {
  const seconds = BASE_SECONDS + SECONDS_PER_SLIDE * slides;
  const maxSeconds = seconds + 20 + 6 * Math.ceil(slides / 2);
  return { calls: 1, maxCalls: 3, seconds, maxSeconds, text: `About 1 model call and about ${seconds} seconds for ${slides} slides (a second call, up to about ${maxSeconds} seconds, only if some designs need fixing).` };
}

// ----- the prompt -----
const ROLE_RULE = 'title = the slide\'s headline (or its quote, or the stat label); kicker = its "kicker" (or the handle); tag = "STEP n" on a step slide; number = the step number or the stat value; body = its body, sub, note or cta (checklist items one per line); caption = the label next to a value, or the first checklist item';

/** The layouts a slide can take. The model tags each slide with one of these (data-layout on the <svg>). */
export const LAYOUTS = ['statement', 'stepper', 'checklist', 'big-stat', 'segment-bar', 'slider', 'comparison', 'quote', 'cta-button', 'split-text', 'photo-led'] as const;
export type LayoutTag = (typeof LAYOUTS)[number];
/** Layouts that are plain type: they need only one decorative element from the style, not three. */
const PLAIN = new Set<string>(['statement', 'quote', 'split-text']);
export const layoutOf = (block?: string): LayoutTag | null => {
  const t = (/data-layout\s*=\s*["']([a-z-]+)["']/i.exec(block ?? '')?.[1] ?? '').toLowerCase();
  return (LAYOUTS as readonly string[]).includes(t) ? (t as LayoutTag) : null;
};
/** The variety rule: no two consecutive slides share a layout, no layout is used more than twice, every slide has a valid tag. Returns the offending slides with the reason. */
export function layoutOffenders(tags: (string | null)[], opts: { photo?: boolean; blocks?: (string | undefined)[] } = {}): Map<number, string> {
  const out = new Map<number, string>();
  const count: Record<string, number> = {};
  tags.forEach((t, i) => {
    if (!t) out.set(i, 'it has no valid data-layout tag');
    else if (!opts.photo && t === 'photo-led') out.set(i, 'photo-led is only for a person\'s own photo and there is none');
    else if (!opts.photo && /data-image-slot/i.test(opts.blocks?.[i] ?? '')) out.set(i, 'it draws an empty picture frame (an image slot) and there is no photo to put in it');
    else if (i > 0 && tags[i - 1] === t) out.set(i, `it repeats the layout "${t}" of the slide before it`);
    else if ((count[t] ?? 0) >= 2) out.set(i, `the layout "${t}" is already used twice in this carousel`);
    if (t) count[t] = (count[t] ?? 0) + 1;
  });
  return out;
}
/** The layouts slide i may take: not its neighbours' and not one that is already used twice elsewhere. */
export const layoutChoices = (tags: (string | null)[], i: number, photo = false): string[] => LAYOUTS.filter((l) => (photo || l !== 'photo-led') && l !== tags[i - 1] && l !== tags[i + 1] && tags.filter((t, k) => k !== i && t === l).length < 2);

// ----- the pictures sent as inspiration -----
const gridOf = (layers: { kind: string; x: number; y: number; width: number; height: number }[]): number[] => {
  const cells = new Array(20).fill(0);
  for (const l of layers) {
    if (l.kind !== 'text') continue;
    for (let gy = 0; gy < 5; gy++)
      for (let gx = 0; gx < 4; gx++) {
        const ox = Math.max(0, Math.min(l.x + l.width, ((gx + 1) * 1080) / 4) - Math.max(l.x, (gx * 1080) / 4));
        const oy = Math.max(0, Math.min(l.y + l.height, ((gy + 1) * 1350) / 5) - Math.max(l.y, (gy * 1350) / 5));
        cells[gy * 4 + gx] = Math.min(1, cells[gy * 4 + gx] + (ox * oy) / ((1080 / 4) * (1350 / 5)));
      }
  }
  return cells;
};
/** Up to `max` reference pictures with the most different compositions (text placement), as plain jpeg bytes. `images`: data URLs by the slide name the read used. */
export function pickInspiration(pack: StylePack, images: Record<string, string>, max = 3): { name: string; mime: 'image/jpeg'; base64: string }[] {
  const all = Object.values(pack.variants ?? {}).flat().filter((v) => v && images[v.fromFile]).map((v) => ({ file: v.fromFile, g: gridOf(v.layers) }));
  const dist = (a: number[], b: number[]) => a.reduce((t, x, k) => t + Math.abs(x - b[k]), 0);
  const chosen: typeof all = [];
  while (all.length && chosen.length < max) {
    const best = chosen.length ? all.map((c, k) => ({ k, d: Math.min(...chosen.map((x) => dist(x.g, c.g))) })).sort((p, q) => q.d - p.d)[0].k : 0;
    chosen.push(all.splice(best, 1)[0]);
  }
  return chosen.map((c, k) => ({ name: `ref${k + 1}.jpg`, mime: 'image/jpeg' as const, base64: images[c.file].replace(/^data:[^,]*,/, '') }));
}
/** The pictures for this look: only for the pack that is the active reference (pixels live in memory only, never in a pack). */
export function inspirationImages(look: Look): { mime: 'image/jpeg'; base64: string }[] {
  const act = activeReference();
  if (!look.pack || !act?.pack || act.pack.name !== look.pack.name || !act.report?.images) return [];
  return pickInspiration(act.pack, act.report.images).map(({ mime, base64 }) => ({ mime, base64 }));
}

function lookText(look: Look): string {
  if (look.pack) {
    const p = look.pack;
    const brief = p.brief ?? styleBriefOf(p);
    return [
      `Look: INHERIT the style of the reference "${p.name}" (its colours, fonts, mood, background treatment, header and footer chrome, accent-word rule), but do NOT copy its layouts. Use its colours ONLY as these names (fill="$accent", stroke="$text", never hex): ${JSON.stringify(p.palette)}. Fonts: headline "${p.fonts.headline}", body "${p.fonts.body}".`,
      `Style brief: ${brief}`,
      'Any reference pictures given with this request are INSPIRATION for look and feel ONLY. Do NOT reuse their layouts or graphic devices.',
    ].join('\n');
  }
  return `Look: ${look.brief?.trim() ? `in the person's words: "${look.brief.trim().slice(0, 300)}"` : 'a clean, confident look that suits the text and tone'}. Choose ONE palette and ONE pair of fonts for the whole deck and name the colours on every <svg> as data-palette='{"bg":"#...","text":"#...","accent":"#...","accent2":"#...","surface":"#...","muted":"#..."}' (the same on every slide). Use colours ONLY as those names (fill="$accent", stroke="$text"), never hex.`;
}

function designRules(look: Look, _handle: string, n: number): string {
  return [
    '',
    '=== PART 2: design every slide ===',
    `After the JSON object, on new lines, write ONE <svg> for each of the ${n} slides, in order. No code fence, no explanation. Each is 4:5: viewBox="0 0 1080 1350", with data-slide="<number from 1>", data-type="<that slide's type>" and data-layout="<its layout tag>". Keep each under 3500 characters.`,
    lookText(look),
    `Fonts: only these bundled ones: ${FONT_NAMES.join(', ')}.`,
    `Layout: tag every slide with ONE layout from this menu: ${LAYOUTS.filter((l) => look.hasPhoto || l !== 'photo-led').join(', ')}. Pick it from THAT slide's content: 3 steps -> stepper; one number -> big-stat or segment-bar; a list of benefits -> checklist; two things set against each other -> comparison; a quote -> quote; the final call to action -> cta-button; ${look.hasPhoto ? "a photo hint -> photo-led; " : ''}a bold claim or hook -> statement or split-text; a value on a scale -> slider. No two consecutive slides share a layout, and no layout is used more than twice in the carousel. Never copy a graphic device from the reference pictures unless this slide's content calls for it.`,
    "Graphics: use a graphic device (a stepper, a bar, a slider, a button, an icon) ONLY if the slide's own text calls for it. Plain type is a valid slide (statement, quote, split-text). Draw devices as plain shapes and paths, each group a <g id=\"short-name\">. A checklist slide has ONE body text slot PER ITEM, each in its own row (data-role=\"body\", rows top to bottom, up to 5; the code puts item 1 in the first, item 2 in the second...; an unused row is hidden), never one slot holding all items. Allowed elements only: svg, g, path, circle, ellipse, rect, line, polyline, polygon, defs, linearGradient, radialGradient, stop, clipPath, mask, pattern, text, tspan. No images, scripts or links. The first element is the full-size background <rect>. Same palette, fonts, background treatment, chrome and margins on every slide.",
    `Text: real <text> elements, never outlines. Each slot has data-role (kicker, tag, title, body, caption or number), data-min-size (32 or more) and data-max-lines, and holds THAT slide's own words from the JSON (${ROLE_RULE}). Use only words that are in the slide's JSON: no new words, facts or numbers. NEVER write placeholder or label text such as "Source: the pitch text"; if a field has no content, leave that slot out. One <text> per slot; the code refits the words into it. Give each slot a character budget by its size: about (slot width / (size x 0.55)) characters per line times data-max-lines; keep the words inside it, never under 32 px, and keep 48 px margins on every side.`,
    'Stat slides: the biggest figure is the hero: draw it as a HUGE number (data-role="number"). The label is short (at most about 5 words, at most 48 px) and sits under the number with clear space, never over the bar or any other graphic.',
    'Chrome: do NOT draw the handle, the slide counter or the swipe cue: the engine draws them at fixed places on every slide (the handle top left at y 92, the counter bottom left and the swipe cue bottom right at y 1292). Keep your content between y 140 and y 1210.',
    'Stepper: when a slide is a stepper, the story JSON has a "steps" list (2 to 5 short texts) and the ENGINE draws the nodes and one label per node. Do NOT draw any steps, nodes, connectors, labels or body text for it: draw only the title (and kicker), and leave the area from y 430 to y 1130 empty.',
    'Hierarchy: on cover, statement, big-stat and cta-button slides the HEADLINE is the hero: 110 to 150 px type on the 1080 px wide canvas, set so the headline block takes at least a third of the slide height (wrap it onto several lines). Never a small headline floating in empty space. Supporting text is much smaller than the headline, so the order of reading is obvious.',
    'Fill the canvas: spread the content over the full 1350 px height (for example the headline high and the supporting line low, or the headline in the middle with the support at the foot), so no single block of empty space is bigger than about a quarter of the slide. Decoration must carry meaning: no circles, lines, bars or boxes that mean nothing; a shape is allowed only if it is the slide\'s own device (a stepper, a bar for a figure, a button, a check) or part of the reference style\'s background treatment or chrome.',
    'No repeated text: no text appears twice on a slide, and a caption or body line never restates the title in other words. If a field would only repeat the title, leave that slot out. Visual weight: a plain-type layout (statement, quote, split-text) needs at least 1 meaningful element from the style (a rule, a glow, a grid, a mark); every other layout needs at least 3 visual elements beyond its text, each of which means something (a large numeral, a stepper, a bar, an icon with a backing shape). A stat slide with a real "value" draws it as a HUGE number (data-role="number", at least 200 px) with its label and note around it.',
    'Composition variety: at most 2 slides may use the plain "big headline + small caption" composition. The others must differ in structure: a left-aligned versus a centred versus a bottom-anchored headline; scale contrast (a light lead-in line over one heavy line); a big number; a diagram; a list; a stepper. The layout tag must describe the REAL composition you drew.',
    'Graphics the content calls for: when a slide is about steps, draw the stepper; when it is about something that slides, locks or moves along a path, draw a slider or track with a handle (slide-and-bite = a slider/track); when it states a share or amount of something (an ask like $500,000 for 5%), draw the segment bar for that share. Do NOT fall back to plain text for these; draw the device small enough that the text still dominates.',
    'Accent and sizes: the engine colours each slide\'s "accent" phrase (from the story JSON) in the accent colour, so draw every headline as ONE plain <text> in the text colour, with no accent <tspan>. Headline sizes: the cover, statement, cta-button and split-text headlines are 110 to 150 px; every other headline is at least 72 px. Body text is 40 to 52 px; checklist rows are 44 px or more. Fill the space: no block of empty space bigger than about a quarter of the slide.',
    'Closing slide: a question or a direct prompt to the reader (for example "Would you wear it?", "Back it today."), never a repeat of an earlier benefit or headline.',
    'Contrast: any text, and accent-coloured labels such as "The story" or "The ask" in particular, must have at least 4.5:1 contrast against the ACTUAL background around it (the glow and gradient make the middle of the slide lighter or redder than the corners). Where the background is dark or dark red, set labels in white or a light tint of the accent, never in the dark accent colour itself.',
    look.hasPhoto
      ? 'Photos: when a slide has a "photo_hint", put the person\'s photo in an image slot, never as abstract shapes: <rect data-image-slot="background|inset|half-bleed|strip|cutout" data-mask="rect|rounded|circle|arch|blob" data-fit="cover" data-scrim="0.4" data-scrim-from="bottom" x=".." y=".." width=".." height=".."/>. NEVER an <image>. At most 2 per slide; keep text clear of it or on its scrim.'
      : 'Photos: the person has NO photo. Do not draw any image slot, picture frame, placeholder box or corner marks for a picture, and do not use the photo-led layout. Slides are type and meaningful graphics only.',
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
  const plain = PLAIN.has(layoutOf(block) ?? '');
  if (visualElements(block) < (plain ? 1 : 3)) out.push(plain ? 'the design has no decoration from the style at all: add at least one (a rule, a glow, a grid or a mark).' : 'the design has too little to look at: it needs at least 3 visual elements beyond its text (a large numeral, a pattern or shape cluster, a framed quote, an icon with a backing shape, a divider). A lone icon or line on empty space is not enough.');
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

/** Layouts whose headline is the hero of the slide. */
const HERO_LAYOUTS = new Set<string>(['statement', 'cta-button', 'split-text']);
/** The size range of a slide's main headline: 110 to 150 px on a cover and on the hero layouts (statement, cta-button, split-text), at least 72 px on every other slide. */
export const titleFloor = (slide: Record<string, unknown>, layout: string | null): { min: number; max: number } => (String(slide.type) === 'stat' ? { min: 40, max: 48 } : String(slide.type) === 'cover' || (!!layout && HERO_LAYOUTS.has(layout)) ? { min: 110, max: 150 } : { min: 72, max: 150 });

/**
 * Reading order of text boxes: top to bottom, and boxes whose tops are within 30 px of each other count as ONE row (left to right). The layouts, the build and the filler all sort with this
 * one comparator, so a cell's number and its label (side by side with other cells, a few px apart) are never swapped when a fit step nudges a box by a few px.
 */
export const readingOrder = (a: { x: number; y: number }, b: { x: number; y: number }): number => (Math.abs(a.y - b.y) < 30 ? a.x - b.x || a.y - b.y : a.y - b.y);

/** Fills the slide's own words into a design the way the renderer does (a checklist's item k goes in row k). Null for a one-row checklist, which the renderer grows itself. */
function fillerFor(pack: StylePack, key: keyof StylePack['designs'], slide: Record<string, unknown>, handle: string): ((ls: RLayer[]) => Layer[]) | null {
  const layers = pack.designs[key] ?? [];
  const texts: Partial<Record<string, string>> = { ...(textsOf(slide as never, handle) as Record<string, string>) };
  const rowsMode = (key === 'list' || (Array.isArray(slide.steps) && slide.steps.length >= 2)) && !!texts.body;
  const rows = rowsMode ? layers.filter((l) => l.kind === 'text' && l.name === 'body').sort(readingOrder) : [];
  if (rowsMode && rows.length < 2) return null;
  const items = (texts.body ?? '').split('\n').filter(Boolean);
  const rowName = new Map<string, string>();
  rows.forEach((l, k) => {
    const nm = k === 0 ? 'body' : 'body' + (k + 1);
    rowName.set(l.id, nm);
    texts[nm] = k === rows.length - 1 ? items.slice(k).join('\n') : (items[k] ?? '');
  });
  return (ls) => fillRecreate({ layers: ls.map((l) => (rowName.has(l.id) ? ({ ...l, name: rowName.get(l.id)! } as RLayer) : l)), palette: pack.palette, canvas: pack.canvas, notes: [] }, texts).layers;
}

const SIDE = 48;
const BOTTOM_LIMIT = 1350 - SIDE;
/**
 * The fit check and the type scale, in four steps. 1) Floors: the main headline is raised to 110 px (cover, statement, cta-button, split-text; at most 150) or 72 px (other
 * slides), body text to 40 px and checklist rows to 44 px, and those are their smallest sizes. 2) A slot whose words do not fit at its floor is widened to the margins, then made
 * taller (more lines) without running into the text under it. 3) Only if it still overflows, its smallest size comes down (never under 32 px). 4) What still does not fit is a
 * problem (the slide is asked for again once).
 */
export function fitSlots(pack: StylePack, key: keyof StylePack['designs'], slide: Record<string, unknown>, handle: string, layout: string | null = null): { pack: StylePack; problems: string[]; shrunk: string[]; notes: string[] } {
  const layers = pack.designs[key];
  const fill = layers ? fillerFor(pack, key, slide, handle) : null;
  if (!layers || !fill) return { pack, problems: [], shrunk: [], notes: [] };
  const notes: string[] = [];
  const shrunk: string[] = [];
  let cur: RLayer[] = layers;
  const patch = (ids: Set<string>, f: (l: RLayer) => RLayer) => (cur = cur.map((l) => (l.kind === 'text' && ids.has(l.id) ? f(l) : l)));
  const misfits = () => fill(cur).filter((l) => l.kind === 'text' && l.visible !== false && l.text && !layoutText(l).fits);
  // 1) floors
  const tf = titleFloor(slide, layout);
  const floorOf = (l: RLayer): { min: number; max?: number } | null => (l.kind !== 'text' ? null : l.name === 'title' ? (tf.min === 110 ? tf : { min: tf.min, max: Math.max(tf.min, Math.min(tf.max, l.style.size)) }) : l.name === 'body' ? { min: key === 'list' || (Array.isArray(slide.steps) && slide.steps.length >= 2) ? 44 : 40 } : null);
  let raised = 0;
  cur = cur.map((l) => {
    const f = floorOf(l);
    if (!f || l.kind !== 'text') return l;
    const size = Math.min(f.max ?? 600, Math.max(f.min, l.style.size));
    if (size === l.style.size && l.slot?.minSize === f.min && (!f.max || l.slot?.maxSize === f.max)) return l;
    raised += size !== l.style.size ? 1 : 0;
    return { ...l, style: { ...l.style, size }, slot: { ...l.slot, minSize: f.min, ...(f.max ? { maxSize: f.max } : {}) }, autoFit: { minSize: Math.min(f.min, size) } } as RLayer;
  });
  if (raised) notes.push(raised + ' text slot' + (raised === 1 ? '' : 's') + ' raised to the type-scale floor (headline ' + tf.min + ' px' + (key === 'list' ? ', checklist rows 44 px' : ', body 40 px') + ').');
  const stepsMode = Array.isArray(slide.steps) && slide.steps.length >= 2;
  if (stepsMode)
    cur = cur.map((l) => (l.kind === 'text' && l.name === 'body' ? ({ ...l, width: 1080 - SIDE - l.x, height: Math.max(l.height, Math.ceil(l.style.size * l.style.lineHeight * 2) + 4) } as RLayer) : l));
  // Hero headlines use the full content width (margin to margin), balanced, at most 3 lines: the size comes down toward 72 px only to get to 3 lines.
  if (tf.min === 110) {
    cur = cur.map((l) => (l.kind === 'text' && l.name === 'title' ? ({ ...l, x: SIDE, width: 1080 - 2 * SIDE } as RLayer) : l));
    for (const f of fill(cur)) {
      if (f.kind !== 'text' || f.name !== 'title' || !f.text) continue;
      let size = f.style.size;
      const lines = (n: number) => layoutText({ ...f, autoFit: undefined, height: 3000, style: { ...f.style, size: n } } as TextLayer).lines.length;
      while (size > 72 && lines(size) > 3) size -= 6;
      if (size !== f.style.size) {
        patch(new Set([f.id]), (l) => ({ ...l, style: { ...(l as TextLayer).style, size }, slot: { ...l.slot, minSize: Math.min(110, size) }, autoFit: { minSize: Math.min(110, size) } }) as RLayer);
        notes.push('the headline was set at ' + size + ' px to fit 3 lines across the full width.');
      }
    }
  }
  // 2) widen, then make taller (more lines)
  const first = misfits();
  if (first.length) {
    const ids = new Set(first.map((l) => l.id));
    const reflowed = new Set<string>();
    for (let pass = 0; pass < 6 && ids.size; pass++) {
      for (const id of [...ids]) {
        const l = cur.find((x) => x.id === id);
        if (!l || l.kind !== 'text') continue;
        const centred = (l as TextLayer).style.align === 'center' || (l as TextLayer).style.align === 'right';
        const nx = centred ? SIDE : Math.max(SIDE, l.x);
        const nw = centred ? 1080 - 2 * SIDE : 1080 - SIDE - nx;
        if (Math.abs(nw - l.width) > 1 || Math.abs(nx - l.x) > 1) patch(new Set([id]), (x) => ({ ...x, x: nx, width: nw }) as RLayer);
        else {
          const below = cur.filter((t) => t.kind === 'text' && t.id !== id && t.y > l.y + 10 && t.x < l.x + l.width && t.x + t.width > l.x).map((t) => t.y - 6);
          const room = Math.min(BOTTOM_LIMIT, ...below) - l.y;
          if (room <= l.height + 1) {
            ids.delete(id);
            continue;
          }
          patch(new Set([id]), (x) => ({ ...x, height: room }));
        }
        reflowed.add(id);
      }
      const still = new Set(misfits().map((l) => l.id));
      for (const id of [...ids]) if (!still.has(id)) ids.delete(id);
    }
    if (reflowed.size) notes.push(reflowed.size + ' text slot' + (reflowed.size === 1 ? ' was' : 's were') + ' widened or made taller before any size was reduced.');
  }
  // 3) only now may the size come down (never under 32 px)
  const left1 = misfits();
  if (left1.length)
    patch(new Set(left1.map((l) => l.id)), (l) => {
      if (l.kind !== 'text' || ((l.slot?.minSize ?? 32) <= 32 && (l.autoFit?.minSize ?? 32) <= 32)) return l;
      shrunk.push(String(l.name));
      return { ...l, slot: { ...l.slot, minSize: 32 }, autoFit: { minSize: 32 } } as RLayer;
    });
  // The stepper's labels share one size: the smallest any single label needed (a label that cannot fit at 44 px on 2 lines is the only reason it goes lower).
  if (stepsMode) {
    const rowIds = new Set(cur.filter((l) => l.kind === 'text' && l.name === 'body').map((l) => l.id));
    const sizes = fill(cur).filter((l) => rowIds.has(l.id) && l.kind === 'text' && l.visible !== false && l.text).map((l) => layoutText(l as TextLayer).size);
    const common = sizes.length ? Math.min(...sizes) : 0;
    if (common && new Set(sizes).size > 1) {
      patch(rowIds, (l) => ({ ...l, style: { ...(l as TextLayer).style, size: common }, slot: { ...l.slot, minSize: Math.min(l.slot?.minSize ?? common, common), maxSize: common }, autoFit: { minSize: Math.min((l as TextLayer).autoFit?.minSize ?? common, common) } }) as RLayer);
      notes.push('the stepper labels share one size (' + common + ' px, the smallest any label needed).');
    }
  }
  // 4) what is left
  const problems = misfits().map((l) => {
    const b = layoutText(l as never);
    return 'the ' + String((l as { name?: string }).name) + ' text "' + String((l as { text: string }).text).slice(0, 28) + '" does not fit its box even at ' + b.size + ' px (' + (b.why === 'word-too-wide' ? 'one word is wider than the box' : 'it is too tall for the box') + '): make that slot wider or taller, inside the 48 px margins.';
  });
  if (shrunk.length) notes.push(shrunk.length + ' text slot' + (shrunk.length === 1 ? '' : 's') + ' shrunk (down to 32 px) because the words truly overflow their box.');
  const next = cur === layers ? pack : { ...pack, designs: { ...pack.designs, [key]: cur }, slotMeta: { ...pack.slotMeta, [key]: slotMetaOf(cur) }, notes: [...pack.notes, ...notes.map((n) => key + ': ' + n)] };
  return { pack: next, problems, shrunk, notes };
}

/**
 * Vertical balance: the content (text as laid out, plus the slide's own graphics; not the background, the big glow, or the header and footer chrome) sits between the header
 * (y 140) and the footer (y 1210). If the empty space above or below it is more than 25% of the slide in one block, the whole content block moves so the empty space is split
 * top and bottom. Everything moves together, so nothing starts to overlap, and the chrome stays where it is. Skipped for a design with picture slots or with transformed groups.
 */
export function balanceVertical(pack: StylePack, key: keyof StylePack['designs'], slide: Record<string, unknown>, handle: string, layout: string | null = null): StylePack {
  const layers = pack.designs[key];
  const svg = pack.svgs?.[key];
  const fill = layers && svg ? fillerFor(pack, key, slide, handle) : null;
  if (!layers || !svg || !fill || pack.imageSlots?.[key]?.length) return pack;
  const TOP = 140;
  const BOT = 1210;
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const all = Array.from(root.querySelectorAll('*'));
  const transformed = (el: Element) => {
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) if ((p.getAttribute('transform') ?? '').trim()) return true;
    return false;
  };
  // A tall, thin side-bar next to the headline carries no meaning on a hero layout: it is dropped, so it cannot hold the content block open (and shows no empty strip).
  const dropped = new Set<string>();
  if (layout && HERO_LAYOUTS.has(layout))
    for (const l of layers) {
      if (l.kind === 'text' || Math.min(l.width, l.height) > 10 || l.height < 150 || l.height < l.width * 8 || l.y + l.height <= TOP || l.y >= BOT) continue;
      const el = l.src !== undefined ? all[l.src] : undefined;
      if (el && !transformed(el)) {
        el.parentNode?.removeChild(el);
        dropped.add(l.id);
      }
    }
  const live = layers.filter((l) => !dropped.has(l.id));
  const byId = new Map(fill(live).map((l) => [l.id, l]));
  const content: { l: RLayer; y0: number; y1: number }[] = [];
  for (const l of live) {
    const f = byId.get(l.id);
    if (!f || f.visible === false || l.id === 'bg' || l.name === 'background' || (l.kind !== 'text' && l.width * l.height > 0.35 * pack.canvas.w * pack.canvas.h)) continue;
    let y0 = l.y;
    let y1 = l.y + l.height;
    if (l.kind === 'text') {
      if (!(f as TextLayer).text) continue;
      y1 = f.y + Math.min(f.height, layoutText(f as TextLayer).height);
      y0 = f.y;
    }
    if (y1 <= TOP || y0 >= BOT) continue;
    content.push({ l, y0, y1 });
  }
  const top = content.length ? Math.min(...content.map((c) => c.y0)) : TOP;
  const bottom = content.length ? Math.max(...content.map((c) => c.y1)) : BOT;
  const freeTop = top - TOP;
  const freeBottom = BOT - bottom;
  let dy = content.length && Math.max(freeTop, freeBottom) > 0.25 * pack.canvas.h ? Math.round((freeBottom - freeTop) / 2) : 0;
  if (Math.abs(dy) < 12) dy = 0;
  const moved = new Set<string>();
  if (dy) {
    for (const c of content) {
      if (c.l.kind === 'text') {
        moved.add(c.l.id);
        continue;
      }
      const el = c.l.src !== undefined ? all[c.l.src] : undefined;
      if (!el || transformed(el)) {
        dy = 0;
        moved.clear();
        break;
      }
      el.setAttribute('transform', ('translate(0 ' + dy + ') ' + (el.getAttribute('transform') ?? '')).trim());
      moved.add(c.l.id);
    }
  }
  if (!dy && !dropped.size) return pack;
  const shifted = live.map((l) => (moved.has(l.id) ? ({ ...l, y: l.y + dy } as RLayer) : l));
  const notes = [...pack.notes];
  if (dropped.size) notes.push(key + ': ' + dropped.size + ' thin decorative side-bar' + (dropped.size === 1 ? '' : 's') + ' dropped (it carried no meaning).');
  if (dy) notes.push(key + ': the content was moved ' + Math.abs(dy) + ' px ' + (dy > 0 ? 'down' : 'up') + ' to split the empty space (' + Math.round(freeTop) + ' px above, ' + Math.round(freeBottom) + ' px below).');
  return { ...pack, designs: { ...pack.designs, [key]: shifted }, svgs: { ...pack.svgs, [key]: new XMLSerializer().serializeToString(root) }, slotMeta: { ...pack.slotMeta, [key]: slotMetaOf(shifted) }, notes };
}

/**
 * Moves the layers `ids` down by `dy` px: their boxes, and (for drawn shapes) their elements in the drawing. Null when it cannot be done safely (picture slots, or a shape
 * inside a transformed group).
 */
function shiftIds(pack: StylePack, key: keyof StylePack['designs'], ids: Set<string>, dy: number): StylePack | null {
  const layers = pack.designs[key];
  const svg = pack.svgs?.[key];
  if (!layers || !svg || pack.imageSlots?.[key]?.length) return null;
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const all = Array.from(root.querySelectorAll('*'));
  for (const l of layers) {
    if (!ids.has(l.id) || l.kind === 'text') continue;
    const el = l.src !== undefined ? all[l.src] : undefined;
    if (!el) return null;
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) if ((p.getAttribute('transform') ?? '').trim()) return null;
    el.setAttribute('transform', ('translate(0 ' + dy + ') ' + (el.getAttribute('transform') ?? '')).trim());
  }
  const shifted = layers.map((l) => (ids.has(l.id) ? ({ ...l, y: l.y + dy } as RLayer) : l));
  return { ...pack, designs: { ...pack.designs, [key]: shifted }, svgs: { ...pack.svgs, [key]: new XMLSerializer().serializeToString(root) }, slotMeta: { ...pack.slotMeta, [key]: slotMetaOf(shifted) } };
}

/**
 * The collision pass, the last step after the fit, the floors and the balance. Every text (as laid out) is checked against the other text and against the slide's shapes
 * (a button, a bar, a track, a card). Text that sits inside a card or button is by design; a partial overlap is a collision. Resolved in this order: (a) the lower of the two
 * and everything below it move down by the overlap + 24 px, when there is room above the footer; (b) otherwise the text above is shrunk toward its floor by giving it only the
 * room it has; (c) otherwise the collision is reported in \`problems\` (the slide is asked for again). Nothing is left overlapping without being reported.
 */
export function resolveCollisions(pack: StylePack, key: keyof StylePack['designs'], slide: Record<string, unknown>, handle: string, layout: string | null = null): { pack: StylePack; problems: string[]; notes: string[] } {
  const TOP = 140;
  const BOT = 1210;
  const notes: string[] = [];
  const problems: string[] = [];
  const skip = new Set<string>();
  const shrunkIds = new Set<string>();
  let cur = pack;
  const floorOf = (l: RLayer): number => (l.name === 'title' ? titleFloor(slide, layout).min : l.name === 'body' ? 40 : 32);
  for (let pass = 0; pass < 12; pass++) {
    const layers = cur.designs[key];
    const fill = layers ? fillerFor(cur, key, slide, handle) : null;
    if (!layers || !fill) break;
    const filled = new Map(fill(layers).map((l) => [l.id, l]));
    type Box = { l: RLayer; text: boolean; x0: number; y0: number; x1: number; y1: number };
    const boxes: Box[] = [];
    for (const l of layers) {
      const f = filled.get(l.id);
      if (!f || f.visible === false || l.id === 'bg' || l.name === 'background' || (l.kind !== 'text' && l.width * l.height > 0.35 * cur.canvas.w * cur.canvas.h)) continue;
      if (l.kind === 'text') {
        const t = f as TextLayer;
        if (!t.text) continue;
        const b = layoutText(t);
        if (!b.lines.length) continue;
        boxes.push({ l, text: true, x0: t.x + Math.min(...b.lines.map((x) => x.x)), x1: t.x + Math.max(...b.lines.map((x) => x.x + x.width)), y0: t.y + b.lines[0].y, y1: t.y + b.lines[b.lines.length - 1].y + b.lineStep });
      } else {
        if (l.y + l.height <= TOP || l.y >= BOT) continue;
        boxes.push({ l, text: false, x0: l.x, x1: l.x + l.width, y0: l.y, y1: l.y + l.height });
      }
    }
    let hit: { a: Box; b: Box } | null = null;
    outer: for (let i = 0; i < boxes.length; i++) {
      for (let j = 0; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a.text || i === j || (b.text && j < i) || skip.has(a.l.id + '|' + b.l.id)) continue;
        const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (w <= 4 || h <= 4) continue;
        // text inside a card or a button (most of it lies within the shape) is by design
        if (!b.text && w * h >= 0.8 * (a.x1 - a.x0) * (a.y1 - a.y0)) continue;
        hit = { a, b };
        break outer;
      }
    }
    if (!hit) break;
    const pair = [String(hit.a.l.name), String(hit.b.l.name)];
    if (pair.includes('tag') && pair.includes('number')) {
      problems.push('the tag and the number overlap: put them in separate places (they are never moved over each other).');
      skip.add(hit.a.l.id + '|' + hit.b.l.id);
      continue;
    }
    const upper = hit.a.y0 <= hit.b.y0 ? hit.a : hit.b;
    const lower = upper === hit.a ? hit.b : hit.a;
    const name = (x: Box) => String(x.l.name ?? x.l.id);
    const label = (x: Box) => (x.text ? 'the ' + name(x) + ' text' : 'the ' + name(x));
    // (a) move the lower one and everything below it down
    const dy = Math.ceil(upper.y1 - lower.y0 + 24);
    const below = boxes.filter((x) => x.y0 >= lower.y0 - 1);
    if (dy > 0 && Math.max(...below.map((x) => x.y1)) + dy <= BOT) {
      const moved = shiftIds(cur, key, new Set(below.map((x) => x.l.id)), dy);
      if (moved) {
        cur = moved;
        notes.push('The ' + name(lower) + ' and what is below it moved down ' + dy + ' px because ' + label(upper) + ' grew into it.');
        continue;
      }
    }
    // (b) the text above gets only the room it has, so it shrinks toward its floor
    if (upper.text && lower.y0 > upper.y0 && !shrunkIds.has(upper.l.id)) {
      const t = filled.get(upper.l.id) as TextLayer;
      const room = lower.y0 - 8 - t.y;
      const floor = floorOf(upper.l);
      if (room >= Math.ceil(floor * t.style.lineHeight)) {
        shrunkIds.add(upper.l.id);
        cur = { ...cur, designs: { ...cur.designs, [key]: layers.map((x) => (x.id === upper.l.id ? ({ ...x, height: room } as RLayer) : x)) } };
        cur = { ...cur, slotMeta: { ...cur.slotMeta, [key]: slotMetaOf(cur.designs[key]!) } };
        notes.push(label(upper).replace(/^t/, 'T') + ' was shrunk toward its floor to clear the ' + name(lower) + '.');
        continue;
      }
    }
    // (c) report it
    problems.push('the ' + (upper.text ? name(upper) + ' text' : name(upper)) + ' and ' + label(lower) + ' overlap and could not be moved apart or shrunk: leave more room between them.');
    skip.add(hit.a.l.id + '|' + hit.b.l.id);
  }
  const out = notes.length ? { ...cur, notes: [...cur.notes, ...notes.map((n) => key + ': ' + n)] } : cur;
  return { pack: out, problems, notes };
}

/**
 * The last guards on a finished design, measured on the slide as it will be drawn: it must show at least 3 words, no text may measure under the 32 px limit (the check used to
 * read the design size, so 30 px text passed), and no card or box may be empty (a flat solid shape of some size with no text and nothing else inside it).
 */
export function finalGuards(pack: StylePack, key: keyof StylePack['designs'], slide: Record<string, unknown>, handle: string): string[] {
  const layers = pack.designs[key];
  const fill = layers ? fillerFor(pack, key, slide, handle) : null;
  if (!layers || !fill) return [];
  const filled = fill(layers);
  const byId = new Map(filled.map((l) => [l.id, l]));
  const texts = filled.filter((l): l is TextLayer => l.kind === 'text' && l.visible !== false && !!(l as TextLayer).text?.trim());
  const out: string[] = [];
  const words = texts.reduce((a, l) => a + l.text.trim().split(/\s+/).length, 0);
  if (words < 3) out.push('the slide shows only ' + words + ' word' + (words === 1 ? '' : 's') + ': it needs at least 3 words of its own text, so draw the text slots its words need.');
  for (const t of texts) {
    const size = layoutText(t).size;
    if (size < 32) out.push('the ' + String((t as { name?: string }).name) + ' text measures ' + Math.round(size * 10) / 10 + ' px, under the 32 px limit.');
  }
  const canvasA = pack.canvas.w * pack.canvas.h;
  for (const l of layers) {
    if (l.kind !== 'shape' || l.id === 'bg' || l.name === 'background' || String(l.name).startsWith('photo-slot') || byId.get(l.id)?.visible === false) continue;
    const a = l.width * l.height;
    const f = (l as { fill?: unknown }).fill;
    if (a < 30000 || a > 0.35 * canvasA || typeof f !== 'string' || (/^rgba/i.test(f) && Number(/,\s*([\d.]+)\)$/.exec(f)?.[1] ?? 1) < 0.9)) continue;
    const hasText = texts.some((t) => {
      const cx = t.x + t.width / 2;
      const cy = t.y + Math.min(t.height, layoutText(t).height) / 2;
      return cx >= l.x && cx <= l.x + l.width && cy >= l.y && cy <= l.y + l.height;
    });
    const hasOther = layers.some((o) => o.id !== l.id && o.kind !== 'text' && o.width * o.height < a && o.x >= l.x - 4 && o.y >= l.y - 4 && o.x + o.width <= l.x + l.width + 4 && o.y + o.height <= l.y + l.height + 4);
    if (!hasText && !hasOther) out.push('there is an empty box (the ' + String(l.name ?? 'shape') + ', ' + Math.round(l.width) + ' x ' + Math.round(l.height) + ' px) with no text in it: put text in it or leave it out.');
  }
  return out;
}

export interface Repeat {
  role: string;
  phrase: string;
  /** 1-based number of the slide where the phrase appears first. */
  other: number;
}
/**
 * The duplicate-text check across the deck: any phrase of 3 or more words that shows on two slides, or twice on one slide. The first place keeps it; a later one is an offender.
 * A later title or number cannot be left out, so it is only reported in `notes`; a later body, caption, kicker or tag is an offender whose slide is asked for again (leave that slot out).
 */
export function repeatedText(slides: Record<string, unknown>[], handle: string): { offenders: Map<number, Repeat[]>; notes: string[] } {
  const seen = new Map<string, { slide: number; role: string; field: number }>();
  const offenders = new Map<number, Repeat[]>();
  const notes: string[] = [];
  const done = new Set<string>();
  slides.forEach((slide, i) => {
    const hasItems = Array.isArray(slide.items) && slide.items.length > 0;
    let field = 0;
    for (const [role, text] of Object.entries(textsOf(slide as never, handle))) {
      if (!text || typeof text !== 'string' || role === 'accent' || role === 'accents' || role === 'accentStyle' || (role === 'caption' && hasItems)) continue;
      field++;
      const w = tokens(text);
      for (let k = 0; k + 3 <= w.length; k++) {
        const gram = w.slice(k, k + 3).join(' ');
        const at = seen.get(gram);
        if (!at) {
          seen.set(gram, { slide: i, role, field });
          continue;
        }
        const once = i + ':' + role;
        if (done.has(once)) continue;
        done.add(once);
        const r: Repeat = { role, phrase: gram, other: at.slide + 1 };
        if (role === 'title' || role === 'number') notes.push('Slide ' + (i + 1) + ': its ' + role + ' repeats "' + gram + '" from slide ' + r.other + ' (the wording is the story\'s).');
        else offenders.set(i, [...(offenders.get(i) ?? []), r]);
      }
    }
  });
  return { offenders, notes };
}

/**
 * The stepper building block: the engine draws it, the model only supplies the step texts (2 to 5). One node and one label (a body text row) per step, on a vertical line, at
 * even spacing. States: done = filled with a tick, current = ringed with a dot, upcoming = hollow. It is scaled to the free vertical space between `bounds.top` and `bounds.bottom`
 * (nodes up to about 2.2 times the base size, labels 44 to 64 px) and centred in it. Colours are palette names.
 */
export function stepperSvg(steps: string[], current = 1, bounds: { top: number; bottom: number } = { top: 430, bottom: 1130 }): string {
  const n = Math.min(5, steps.length);
  const H = Math.max(300, bounds.bottom - bounds.top);
  const pitch = Math.min(300, Math.floor(H / n));
  const k = Math.max(1, Math.min(2.2, pitch / 120));
  const r = Math.min(Math.round(28 * k), Math.floor((pitch - 36) / 2) - 3); // at least 36 px between two nodes, ring included, so the connector between them always has room
  const size = Math.max(44, Math.min(64, Math.round(pitch / 2.6)));
  const x = 48 + r + 6;
  const lx = x + r + 36;
  const start = bounds.top + (H - pitch * n) / 2;
  const cy = (j: number) => Math.round(start + j * pitch + pitch / 2);
  const sw = (v: number) => Math.round(v * k);
  const parts: string[] = ['<g id="stepper">'];
  // the connector is drawn only BETWEEN the nodes: from the bottom edge of one (its ring included) to the top edge of the next, 6 px apart from each, never through a node and never
  // above the first or below the last. The edge of a node is its radius plus half its stroke (the ringed current node is the widest).
  const edge = (j: number) => r + (j + 1 === current ? sw(6) : j + 1 < current ? 0 : sw(4)) / 2;
  for (let j = 0; j + 1 < n; j++) {
    const y1 = Math.ceil(cy(j) + edge(j) + 6), y2 = Math.floor(cy(j + 1) - edge(j + 1) - 6);
    if (y2 > y1) parts.push('<line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2 + '" stroke="$muted" stroke-width="' + sw(4) + '"/>');
  }
  steps.slice(0, n).forEach((text, j) => {
    const y = cy(j);
    const state = j + 1 < current ? 'done' : j + 1 === current ? 'current' : 'upcoming';
    if (state === 'done') parts.push('<g id="step-node-done"><circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="$accent"/><path d="M ' + Math.round(x - 0.43 * r) + ' ' + y + ' L ' + Math.round(x - 0.1 * r) + ' ' + Math.round(y + 0.36 * r) + ' L ' + Math.round(x + 0.46 * r) + ' ' + Math.round(y - 0.32 * r) + '" fill="none" stroke="$bg" stroke-width="' + sw(5) + '"/></g>');
    else if (state === 'current') parts.push('<g id="step-node-current"><circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="$bg" stroke="$accent" stroke-width="' + sw(6) + '"/><circle cx="' + x + '" cy="' + y + '" r="' + Math.round(r * 0.36) + '" fill="$accent"/></g>');
    else parts.push('<g id="step-node-upcoming"><circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="none" stroke="$muted" stroke-width="' + sw(4) + '"/></g>');
    parts.push('<text data-role="body" data-min-size="44" data-max-lines="2" x="' + lx + '" y="' + Math.round(y + size * 0.33) + '" font-family="Instrument Sans" font-size="' + size + '" fill="$text">' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text>');
  });
  parts.push('</g>');
  return parts.join('');
}
/** The model's own stepper (nodes, tracks, step labels, body text) is removed. */
export function stripModelStepper(block: string): string {
  return block
    .replace(/<text\b[^>]*data-role\s*=\s*["'](?:body|caption)["'][^>]*>[\s\S]*?<\/text>/gi, '')
    .replace(/<g\b[^>]*id\s*=\s*["'][^"']*(?:step|track|timeline|node)[^"']*["'][^>]*>[\s\S]*?<\/g>/gi, '');
}
/** The model's stepper is replaced by the engine's, scaled to \`bounds\`. */
export function withEngineStepper(block: string, steps: string[], current = 1, bounds?: { top: number; bottom: number }): string {
  return stripModelStepper(block).replace(/<\/svg>\s*$/i, () => stepperSvg(steps, current, bounds) + '</svg>');
}
/** Where the title ends once it is fitted (the stepper is placed below it); null when there is no title. */
export function titleBottom(pack: StylePack, key: keyof StylePack['designs'], slide: Record<string, unknown>, handle: string, layout: string | null): number | null {
  const flat = { ...slide, steps: undefined };
  const fitted = fitSlots(pack, key, flat, handle, layout).pack;
  const layers = fitted.designs[key];
  if (!layers) return null;
  const texts = { ...textsOf(flat as never, handle), body: '' };
  const t = fillRecreate({ layers, palette: fitted.palette, canvas: fitted.canvas, notes: [] }, texts).layers.find((l) => l.kind === 'text' && l.name === 'title' && l.visible !== false && (l as TextLayer).text) as TextLayer | undefined;
  if (!t) return null;
  const b = layoutText(t);
  return t.y + (b.lines.length ? b.lines[b.lines.length - 1].y + b.lineStep : 0);
}

/** "@quick.flip" -> "Quick flip": the name shown in the profile header when the person gave only a handle. */
/** Title Case for a person's name: the first letter of every word (and of each part after a hyphen or apostrophe) is a capital; letters already capital stay ("McKenzie", "DJ"). */
export const titleCaseName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ').replace(/(^|[\s\-'’])(\p{Ll})/gu, (_m, pre: string, c: string) => pre + c.toUpperCase());
export const profileName = (handle: string) => {
  const t = (handle || '@yourname').replace(/^@/, '').replace(/[._-]+/g, ' ').trim() || 'your name';
  return titleCaseName(t);
};
/**
 * The chrome, drawn by the code at fixed places on every slide, never by the model (whatever it drew is stripped). Without a profile-header signature: the handle top left, the
 * counter bottom left, the swipe cue bottom right. With it: an avatar circle, the name, a verified tick and the handle at the top left, in place of the small handle. All text is
 * at least 32 px. (A photo of the person in the avatar is not wired yet: the avatar is a placeholder.)
 */
export function chromeItems(handle: string, i: number, n: number, palette: Record<string, string>, devices?: SignatureDevices | null): Recurring[] {
  const tok = (...names: string[]) => '$' + (names.find((k) => palette[k]) ?? 'text');
  const muted = tok('muted', 'text');
  const base = { size: 32, font: '', weight: 500, fill: muted };
  const out: Recurring[] = [];
  if (devices?.profileHeader) {
    const name = profileName(handle);
    const nameW = measureWidth(name, 'Instrument Sans', 600, 34);
    out.push({ ...base, shape: 'avatar', x: 82, y: 92, size: 34, fill: tok('surface', 'muted', 'text'), anchor: 'start', text: '' });
    out.push({ ...base, x: 136, y: 86, size: 34, weight: 600, fill: '$text', anchor: 'start', text: name });
    out.push({ ...base, shape: 'tick', x: Math.round(136 + nameW + 22), y: 74, size: 13, fill: '$accent', anchor: 'start', text: '' });
    out.push({ ...base, x: 136, y: 122, anchor: 'start', text: handle || '@yourname' });
  } else out.push({ ...base, x: 48, y: 92, anchor: 'start', text: handle || '@yourname' });
  out.push({ ...base, x: 48, y: 1292, anchor: 'start', text: (i + 1) + ' / ' + n });
  if (i < n - 1) out.push({ ...base, x: 1032, y: 1292, anchor: 'end', text: 'swipe →' });
  return out;
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
/** The recurring items as SVG (colour names still unresolved), added to the filled drawing. */
export function recurringMarkup(rec: Recurring[] | undefined, pack: StylePack): string {
  return (rec ?? [])
    .map((r) => {
      const q = r.size;
      if (r.shape === 'avatar')
        return '<circle cx="' + r.x + '" cy="' + r.y + '" r="' + q + '" fill="' + r.fill + '"/><circle cx="' + r.x + '" cy="' + Math.round(r.y - q * 0.2) + '" r="' + Math.round(q * 0.28) + '" fill="$bg" fill-opacity="0.55"/><ellipse cx="' + r.x + '" cy="' + Math.round(r.y + q * 0.55) + '" rx="' + Math.round(q * 0.55) + '" ry="' + Math.round(q * 0.38) + '" fill="$bg" fill-opacity="0.55"/>';
      if (r.shape === 'tick')
        return '<circle cx="' + r.x + '" cy="' + r.y + '" r="' + q + '" fill="' + r.fill + '"/><path d="M ' + Math.round(r.x - q * 0.45) + ' ' + r.y + ' L ' + Math.round(r.x - q * 0.1) + ' ' + Math.round(r.y + q * 0.38) + ' L ' + Math.round(r.x + q * 0.48) + ' ' + Math.round(r.y - q * 0.34) + '" fill="none" stroke="#FFFFFF" stroke-width="' + Math.max(2, Math.round(q * 0.28)) + '" stroke-linecap="round" stroke-linejoin="round"/>';
      return '<text x="' + r.x + '" y="' + r.y + '" font-size="' + r.size + '" font-family="' + (r.font || pack.fonts.body) + '" font-weight="' + r.weight + '" fill="' + r.fill + '" text-anchor="' + r.anchor + '">' + esc(r.text) + '</text>';
    })
    .join('');
}
/** The recurring items as layers (for the editable form, and for the phone checks: they are measured like any other text). */
export function recurringLayers(rec: Recurring[] | undefined, pack: StylePack, id: string): Layer[] {
  const hex = (c: string) => (c.startsWith('$') ? pack.palette[c.slice(1)] ?? '#888888' : c);
  const out: Layer[] = [];
  (rec ?? []).forEach((r, k) => {
    const base = { rotation: 0, opacity: 1, role: 'decor' as const };
    const q = r.size;
    if (r.shape === 'avatar') {
      out.push({ ...base, kind: 'shape', id: id + '-avatar' + k, name: 'recurring-avatar', shape: 'ellipse', x: r.x - q, y: r.y - q, width: 2 * q, height: 2 * q, fill: hex(r.fill) } as unknown as Layer);
      out.push({ ...base, opacity: 0.55, kind: 'shape', id: id + '-avatar-head' + k, name: 'recurring-avatar', shape: 'ellipse', x: r.x - q * 0.28, y: r.y - q * 0.2 - q * 0.28, width: q * 0.56, height: q * 0.56, fill: hex('$bg') } as unknown as Layer);
      out.push({ ...base, opacity: 0.55, kind: 'shape', id: id + '-avatar-body' + k, name: 'recurring-avatar', shape: 'ellipse', x: r.x - q * 0.55, y: r.y + q * 0.55 - q * 0.38, width: q * 1.1, height: q * 0.76, fill: hex('$bg') } as unknown as Layer);
      return;
    }
    if (r.shape === 'tick') {
      out.push({ ...base, kind: 'shape', id: id + '-tick' + k, name: 'recurring-tick', shape: 'ellipse', x: r.x - q, y: r.y - q, width: 2 * q, height: 2 * q, fill: hex(r.fill) } as unknown as Layer);
      const w = q * 0.96;
      const h = q * 0.75;
      out.push({ ...base, kind: 'path', id: id + '-tick-mark' + k, name: 'recurring-tick', x: r.x - q * 0.45, y: r.y - q * 0.38, width: w, height: h, d: 'M ' + (q * 0.02).toFixed(1) + ' ' + (q * 0.38).toFixed(1) + ' L ' + (q * 0.35).toFixed(1) + ' ' + (q * 0.76).toFixed(1) + ' L ' + (q * 0.93).toFixed(1) + ' ' + (q * 0.04).toFixed(1), stroke: { color: '#FFFFFF', width: Math.max(2, Math.round(q * 0.28)), cap: 'round', join: 'round' } } as unknown as Layer);
      return;
    }
    const font = ((FONT_NAMES as string[]).includes(r.font) ? r.font : pack.fonts.body) as FontFamily;
    const ws = FONT_WEIGHTS[font];
    const weight = ws.reduce((b, w) => (Math.abs(w - r.weight) < Math.abs(b - r.weight) ? w : b), ws[0]);
    const width = Math.ceil(r.text.length * r.size * 0.62) + 8;
    const x = r.anchor === 'middle' ? r.x - width / 2 : r.anchor === 'end' ? r.x - width : r.x;
    out.push({ kind: 'text', id: id + '-recurring' + k, name: 'recurring', role: 'content', x, y: r.y - r.size * 0.82, width, height: Math.ceil(r.size * 1.3), rotation: 0, opacity: 1, text: r.text, style: { font, weight, size: r.size, color: hex(r.fill), align: r.anchor === 'middle' ? 'center' : r.anchor === 'end' ? 'right' : 'left', valign: 'top', lineHeight: 1.15 } } as unknown as Layer);
  });
  return out;
}
async function checkOne(i: number, script: CarouselScript, block: string | undefined, look: Look, deckPalette: Record<string, string> | null): Promise<Checked> {
  const slide = script.slides[i] as unknown as Record<string, unknown>;
  if (!block) return { pack: null, problems: ['no design was given for this slide.'] };
  const key = designKey(String(slide.type));
  const forced = look.pack?.palette ?? deckPalette ?? undefined;
  const split = splitRecurring(block);
  const steps = Array.isArray(slide.steps) ? (slide.steps as unknown[]).filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, 5) : [];
  const engineStepper = layoutOf(block) === 'stepper' && steps.length >= 2;
  const current = typeof slide.current === 'number' ? Math.max(1, Math.min(steps.length, Math.round(slide.current))) : 1;
  let bounds: { top: number; bottom: number } | undefined;
  if (engineStepper) {
    const bare = stripModelStepper(split.block);
    const r0 = await parsePack(setType(forced ? bare.replace(PALETTE_RE, '') : bare, key), 'Slide ' + (i + 1), forced);
    const tb = r0.ok ? titleBottom({ ...r0.pack, ...(forced ? { palette: forced } : {}) }, key, slide, script.brand.handle, 'stepper') : null;
    const bottom = 1170;
    bounds = { top: Math.min(bottom - 300, Math.max(430, (tb ?? 380) + 50)), bottom };
    split.block = withEngineStepper(split.block, steps, current, bounds);
  }
  const typed = setType(forced ? split.block.replace(PALETTE_RE, '') : split.block, key);
  const r = await parsePack(typed, `Slide ${i + 1}`, forced);
  const shown = engineStepper ? withEngineStepper(block, steps, current, bounds) : block;
  if (!r.ok) return { pack: null, problems: checkDesign(slide, script.brand.handle, script.slides.length, shown, null, r.reasons) };
  // The reference's signature devices (a marker accent, a profile header) travel with every designed slide of that deck.
  const refDevices = look.pack ? (look.pack.devices ?? signatureDevices(look.pack)) : null;
  const pack = { ...r.pack, ...(forced ? { palette: forced } : {}), ...(refDevices ? { devices: refDevices } : {}) };
  const chrome = chromeItems(script.brand.handle, i, script.slides.length, pack.palette, refDevices);
  const problems = checkDesign(slide, script.brand.handle, script.slides.length, shown, pack, r.problems.filter((p) => !/left out/.test(p)));
  if (problems.length) return { pack: null, problems, recurring: chrome };
  const fitted = fitSlots(clampSlots(pack, key), key, slide, script.brand.handle, layoutOf(block));
  if (fitted.problems.length) return { pack: null, problems: fitted.problems, recurring: chrome };
  const balanced = balanceVertical(fitted.pack, key, slide, script.brand.handle, layoutOf(block));
  const col = resolveCollisions(balanced, key, slide, script.brand.handle, layoutOf(block));
  if (col.problems.length) return { pack: null, problems: col.problems, recurring: chrome };
  const last = finalGuards(col.pack, key, slide, script.brand.handle);
  if (last.length) return { pack: null, problems: last, recurring: chrome };
  return { pack: col.pack, problems: [], recurring: chrome };
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
  const tokens = { input: 0, output: 0 };
  // At most 3 inspiration pictures, each re-encoded as a small JPEG (longest side 700 px, quality 0.7).
  const pics = await Promise.all(inspirationImages(look).slice(0, 3).map(async (p) => ({ ...p, base64: await compressJpeg(p.base64).catch(() => p.base64) })));
  let requestBytes: RequestBytes | undefined;
  const ask = async (prompt: string) => {
    onPhase(calls === 0 ? 'writing' : 'retrying');
    lastRequest = { images: pics.map((x) => ({ bytes: Math.floor((x.base64.length * 3) / 4), format: 'jpeg' as const })), prompt: prompt.length, body: JSON.stringify({ prompt, kind: 'draw', ...(pics.length ? { images: pics } : {}) }).length };
    requestBytes ??= lastRequest;
    const a = await p.write(prompt, signal, 'draw', pics.length ? pics : undefined);
    calls += 1;
    ms += a.ms;
    tokens.input += a.usage?.input ?? 0;
    tokens.output += a.usage?.output ?? 0;
    return a.text;
  };
  let text = await ask(first);
  let v = validateScriptText(jsonPart(text), req.format);
  const storyWhy: string[] = [];
  if (!v.script) {
    storyWhy.push(...v.errors.map((e) => e.message));
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
  // The variety rule, checked by the code: slides whose layout tag repeats, is over-used or is missing are asked for again together with the failed ones (one retry in all).
  const tags: (string | null)[] = script.slides.map((_, i) => layoutOf(svgs.get(i)));
  const photo = !!look.hasPhoto;
  const blocks: (string | undefined)[] = script.slides.map((_, i) => svgs.get(i));
  const off = layoutOffenders(tags, { photo, blocks });
  const rep = repeatedText(script.slides as unknown as Record<string, unknown>[], withHandle.brand.handle);
  const again = [...new Set([...bad, ...off.keys(), ...rep.offenders.keys()])].sort((a, b) => a - b);
  const retryWhy: string[] = [];
  if (again.length && calls === 1) {
    for (const i of again) {
      const why: string[] = [];
      if (!done.get(i)!.pack) why.push('a check failed: ' + (done.get(i)!.problems[0] ?? 'no design'));
      if (off.has(i)) why.push('layout: ' + off.get(i));
      for (const r of rep.offenders.get(i) ?? []) why.push('repeated text: its ' + r.role + ' repeats "' + r.phrase + '" from slide ' + r.other);
      retryWhy.push('Retry for slide ' + (i + 1) + ' (' + String(script.slides[i]?.type) + '): ' + why.join('; ') + '.');
    }
    const problems = Object.fromEntries(again.map((i) => [i, [...(done.get(i)!.pack ? [] : done.get(i)!.problems), ...(off.has(i) ? [`its layout must change: ${off.get(i)}. Use a different layout from: ${layoutChoices(tags, i, photo).join(', ')}.`] : []), ...(rep.offenders.get(i) ?? []).map((r) => `its ${r.role} text repeats "${r.phrase}" from slide ${r.other}: leave that text slot out of the design (the slide keeps its other words).`)]]));
    const retryText = await ask(buildSvgRetry(first, script, problems));
    const more = svgsOf(retryText);
    for (const i of again) {
      if (!more.has(i)) continue;
      const c = await checkOne(i, withHandle, more.get(i), look, palette ?? deckPaletteOf(more.values()));
      // A slide that was fine but only repeated a layout keeps its first design unless the new one is usable.
      if (c.pack || !done.get(i)!.pack) {
        done.set(i, c);
        if (c.pack) {
          tags[i] = layoutOf(more.get(i));
          blocks[i] = more.get(i);
        }
      }
    }
    bad = [...done].filter(([, c]) => !c.pack).map(([i]) => i);
  }
  // A second retry, only for the slides the layout rule still flags, asking again for just those slides.
  const off2 = calls === 2 ? layoutOffenders(tags, { photo, blocks }) : new Map<number, string>();
  if (off2.size) {
    for (const [i, why] of off2) retryWhy.push('Second retry for slide ' + (i + 1) + ' (' + String(script.slides[i]?.type) + '): layout: ' + why + '.');
    const problems2 = Object.fromEntries([...off2].map(([i, why]) => [i, ['its layout must change: ' + why + '. Use a different layout from: ' + layoutChoices(tags, i, photo).join(', ') + '.']]));
    const more2 = svgsOf(await ask(buildSvgRetry(first, script, problems2)));
    for (const i of off2.keys()) {
      if (!more2.has(i)) continue;
      const c = await checkOne(i, withHandle, more2.get(i), look, palette ?? deckPaletteOf(more2.values()));
      if (c.pack) {
        done.set(i, c);
        tags[i] = layoutOf(more2.get(i));
        blocks[i] = more2.get(i);
      }
    }
  }
  const designed: Designed = { slides: {}, fallbacks: {}, notes: [], calls, ms, layouts: Object.fromEntries(tags.map((t, i) => [String(i), t])), ...(tokens.input || tokens.output ? { tokens } : {}), ...(requestBytes ? { requestBytes } : {}) };
  designed.notes.unshift(...retryWhy);
  if (storyWhy.length) designed.notes.unshift('Retry for the story (the first answer could not be used as a script): ' + storyWhy.join(' | '));
  for (const [i, rs] of rep.offenders)
    for (const r of rs) {
      const roles = (Object.values(designed.slides[String(i)]?.pack.slotMeta ?? {})[0] ?? []).map((m) => m.role);
      if (roles.includes(r.role)) designed.notes.push('Slide ' + (i + 1) + ': its ' + r.role + ' text repeats "' + r.phrase + '" from slide ' + r.other + '.');
    }
  designed.notes.push(...rep.notes);
  const left = layoutOffenders(tags, { photo });
  if (left.size) designed.notes.push('Some slides still share a layout after one retry: ' + [...left].map(([i, why]) => 'slide ' + (i + 1) + ' (' + why + ')').join('; ') + '.');
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

/** Forgets what a design call remembered in memory (the last request size and the recoloured fallback packs). Used by Reset page and Start over. */
export function resetDesignedState() {
  lastRequest = null;
  fallbackCache.clear();
}
