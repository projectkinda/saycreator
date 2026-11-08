// Designed mode, library route (the default): the model only CHOOSES - for each slide a layout id, the text of that layout's fields, up to 3 accent phrases and optional
// suggestions (variant, density, cut, invert). It never draws and never outputs SVG. The code does the rest: validates every slide against its layout's budgets, rotates the
// variants and the cuts over the deck, draws each slide with the layout library (src/carousel/layouts) and, for a slide that cannot be made, retries once (one extra call for
// the failing slides only) and then falls back to a plain version of the SAME layout. The old standard template look is never the fallback.
// The old route (the model draws SVG) is still in designed.ts, behind the flag `legacySvgRoute()` (off by default).
import type { CarouselScript } from '../image-engine/carousel/types';
import type { Layer } from '../image-engine/types';
import { signatureDevices, styleBriefOf, type PackGround, type StyleOverrides, type StylePack } from '../reference/pack';
import { FONT_NAMES, type RLayer } from '../reference/recreate';
import type { Designed, DesignedSlide, Look } from './designed';
import { LAYOUT_IDS, buildSlide, cutsOf, layoutDef, rotateCuts, rotateVariants, validateSlideContent, type Built, type Cut, type Fields, type LayoutId, type LayoutStyle } from './layouts';
import { coloursFor, fromHsl, inkOn, lightenForText, quietOn, readableInk, toHsl } from './layouts/cuts';
import { contrast } from './layouts/draw';
import { withoutSwitches } from '../reference/deco';
import { cleanPaste, validateScriptText, SLIDE_RANGE } from './script';
import { WriterError, type GenerateResult, type WriteProvider } from './writer';
import type { WriteRequest } from './writerPrompt';
import { IMAGE_LAYOUT_IDS, hasEnoughPictures, imageSlotsOf, imagesNeeded, isImageKey, picOrientation } from './layouts/images';
import { placeImages } from './imagePlace';
import { flavourPass, type FlavourKept, type FlavourSwap } from './flavour';
import { picturePass, type PictureSwap } from './picturePass';
import { TONES } from './writerPrompt';

/** The old route, where the model draws every slide as SVG, stays available behind this flag (off by default): localStorage "creator.legacySvgRoute" = "1" or VITE_LEGACY_SVG_ROUTE=1. */
export const legacySvgRoute = (): boolean => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('creator.legacySvgRoute') === '1') return true;
  } catch {
    /* no storage */
  }
  return (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_LEGACY_SVG_ROUTE === '1';
};

/** The template route (a preset's own templates fill the slides, no library) stays available behind this flag (off by default): localStorage "creator.templateRoute" = "1" or VITE_TEMPLATE_ROUTE=1. */
export const templateRoute = (): boolean => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('creator.templateRoute') === '1') return true;
  } catch {
    /* no storage */
  }
  return (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_TEMPLATE_ROUTE === '1';
};

// ----- the reference style -> LayoutStyle tokens -----
const HEX = /^#[0-9a-f]{6}$/i;
const mixHex = (a: string, b: string, t: number): string => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = p(a);
  const [br, bg, bb] = p(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return ('#' + c(ar, br) + c(ag, bg) + c(ab, bb)).toUpperCase();
};
/** The bundled font nearest to a name: the name itself when it is bundled, else a bundled family that shares a word, else the default. */
export const nearestFont = (name: string | undefined, fallback: LayoutStyle['fonts']['headline']): LayoutStyle['fonts']['headline'] => {
  const names = FONT_NAMES as string[];
  if (name && names.includes(name)) return name as LayoutStyle['fonts']['headline'];
  const words = (name ?? '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
  const hit = names.find((n) => words.some((w) => n.toLowerCase().includes(w)));
  return (hit ?? fallback) as LayoutStyle['fonts']['headline'];
};
/** A plane device: a filled block (not the page) that touches a canvas edge and takes at least 14% of the slide, on at least 40% of the read slides. */
const hasPlane = (ls: RLayer[], W: number, H: number, bg: string): boolean =>
  ls.some((l) => {
    if (l.kind !== 'shape' || l.id === 'bg' || l.name === 'background') return false;
    const fill = (l as { fill?: unknown }).fill;
    if (typeof fill !== 'string' || fill.toUpperCase() === bg) return false;
    const a = l.width * l.height;
    const touches = l.x <= 2 || l.y <= 2 || l.x + l.width >= W - 2 || l.y + l.height >= H - 2;
    return touches && a >= 0.14 * W * H && a < 0.9 * W * H;
  });
export interface DeviceReport {
  slides: number;
  /** How many slides must show a device for it to count (40%, at least 1). */
  need: number;
  /** On how many slides each device was seen. */
  seen: { marker: number; underline: number; planes: number; profileHeader: number };
  /** What was decided from that. */
  decided: { marker: boolean; underline: boolean; planes: boolean; profileHeader: boolean };
  perSlide: { file: string; /** The reader answered the yes/no checks for this slide (else the drawn geometry decided). */ answered: boolean; marker: boolean; underline: boolean; planes: boolean; profileHeader: boolean }[];
}
/** Per-slide device counts (marker, underline, planes, profile header), so a borderline case (3 of 10 slides, say) can be seen. The 40% rule decides. */
export function deviceReport(pack: StylePack): DeviceReport {
  const reads = Object.values(pack.variants ?? {}).flatMap((arr) => (arr ?? []).map((v) => v));
  const W = pack.canvas?.w ?? 1080;
  const H = pack.canvas?.h ?? 1350;
  const bg = (pack.palette.bg ?? '').toUpperCase();
  const perSlide = reads.map((v) => {
    const one = signatureDevices({ ...pack, variants: { cover: [v] } } as StylePack);
    return { file: v.fromFile, answered: !!v.devices, marker: one.counts.marker > 0, underline: one.counts.underline > 0, profileHeader: one.counts.profileHeader > 0, planes: v.devices?.planes ?? hasPlane(v.layers as RLayer[], W, H, bg) };
  });
  const n = perSlide.length;
  const need = Math.max(1, Math.ceil(0.4 * n));
  const seen = { marker: perSlide.filter((s) => s.marker).length, underline: perSlide.filter((s) => s.underline).length, planes: perSlide.filter((s) => s.planes).length, profileHeader: perSlide.filter((s) => s.profileHeader).length };
  return { slides: n, need, seen, decided: { marker: n > 0 && seen.marker >= need, underline: n > 0 && seen.underline >= need, planes: n > 0 && seen.planes >= need, profileHeader: n > 0 && seen.profileHeader >= need }, perSlide };
}
export function detectPlanes(pack: StylePack): boolean {
  const reads = Object.values(pack.variants ?? {}).flat().map((v) => v!.layers as RLayer[]);
  const slides = reads.length ? reads : (Object.keys(pack.designs) as (keyof StylePack['designs'])[]).map((k) => (pack.designs[k] ?? []) as RLayer[]);
  if (!slides.length) return false;
  const W = pack.canvas?.w ?? 1080;
  const H = pack.canvas?.h ?? 1350;
  const bg = (pack.palette.bg ?? '').toUpperCase();
  const has = slides.filter((ls) =>
    ls.some((l) => {
      if (l.kind !== 'shape' || l.id === 'bg' || l.name === 'background') return false;
      const fill = (l as { fill?: unknown }).fill;
      if (typeof fill !== 'string' || fill.toUpperCase() === bg) return false;
      const a = l.width * l.height;
      const touches = l.x <= 2 || l.y <= 2 || l.x + l.width >= W - 2 || l.y + l.height >= H - 2;
      return touches && a >= 0.14 * W * H && a < 0.9 * W * H;
    }),
  ).length;
  return has >= Math.max(1, Math.ceil(0.4 * slides.length));
}
export const DEFAULT_STYLE: LayoutStyle = { palette: { bg: '#FFFFFF', text: '#111111', muted: '#5C5C5C', accent: '#2F5BEA', surface: '#F1F1F1' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, background: 'flat', devices: { marker: false, profileHeader: false, underline: false, planes: false }, accentStyle: 'text' };
/** The person's changes laid over what was detected: each toggle wins over the reader. Shapes: off = no planes, subtle = thin surface-toned planes, bold = accent planes. */
export function applyOverrides(style: LayoutStyle, ov?: StyleOverrides | null): { style: LayoutStyle; notes: string[] } {
  if (!ov) return { style, notes: [] };
  const notes: string[] = [];
  const devices = { ...style.devices };
  let accentStyle = style.accentStyle;
  let planeStrength = style.planeStrength;
  if (ov.marker !== undefined) {
    devices.marker = ov.marker;
    accentStyle = ov.marker ? 'marker' : 'text';
    notes.push('Override: highlight marker ' + (ov.marker ? 'on' : 'off') + '.');
  }
  if (ov.underline !== undefined) {
    devices.underline = ov.underline;
    notes.push('Override: underline ' + (ov.underline ? 'on' : 'off') + '.');
  }
  if (ov.profileHeader !== undefined) {
    devices.profileHeader = ov.profileHeader;
    notes.push('Override: profile header ' + (ov.profileHeader ? 'on' : 'off') + '.');
  }
  if (ov.shapes) {
    devices.planes = ov.shapes !== 'off';
    planeStrength = ov.shapes === 'off' ? undefined : ov.shapes;
    notes.push('Override: shapes ' + ov.shapes + '.');
  }
  if (ov.deco) {
    const off = Object.entries(ov.deco).filter(([, v]) => v === false).map(([k]) => k);
    if (off.length) notes.push('Override: ' + off.join(', ') + ' off.');
  }
  const deco = withoutSwitches(style.deco, ov.deco);
  return { style: { ...style, ...(deco ? { deco } : {}), devices, accentStyle, ...(planeStrength ? { planeStrength } : { planeStrength: undefined }) }, notes };
}
/** Maps a reference style (the pack the whole-slide read made, with its style brief and signature devices) to the tokens the layouts use. */
const HEX6 = /^#[0-9a-f]{6}$/i;
/** One ground of a rhythm made readable: the ink with the best contrast over every colour of the ground (gradient stops included), a muted ink and a card colour that clear 4.5:1 too. */
export function fixGround(g: PackGround, notes: string[]): NonNullable<LayoutStyle['rhythm']>[number] {
  const hx = (v: string | undefined, fb: string) => (v && HEX6.test(v) ? v.toUpperCase() : fb);
  const stops = g.gradient?.stops.map((s) => ({ at: s.at, color: hx(s.color, hx(g.bg, '#FFFFFF')) }));
  const all = stops ? stops.map((s) => s.color) : [hx(g.bg, '#FFFFFF')];
  const minOn = (c: string, on: string[]) => Math.min(...on.map((s) => contrast(c, s)));
  // the ground colour is the stop that reads worst against the ink, so every check against bg holds on the whole gradient
  const text0 = hx(g.text, '#111111');
  const bg = all.reduce((w, s) => (contrast(text0, s) < contrast(text0, w) ? s : w), all[0]);
  let text = text0;
  if (minOn(text0, all) < 4.5) {
    text = [text0, '#FFFFFF', '#000000'].reduce((b, c) => (minOn(c, all) > minOn(b, all) ? c : b));
    notes.push(`Ground ${bg}: the ink ${text0} reads ${minOn(text0, all).toFixed(1)}:1, so ${text} (${minOn(text, all).toFixed(1)}:1) is used.`);
  }
  // A ground whose ink reads under 6:1 (a mid-tone red with black ink: 4.6:1) is moved along its lightness, hue and saturation kept, until the ink reads at 6:1, so text on it is
  // comfortable and not borderline. Gradient grounds keep their stops (they are checked on every stop instead).
  let bgFinal = bg;
  if (!stops && contrast(text, bg) < 6) {
    const inkDark = contrast(text, '#FFFFFF') > contrast(text, '#000000');
    const [h, s, l0] = toHsl(bg);
    for (let k = 1; k <= 24; k++) {
      const c = fromHsl(h, s, l0 + (inkDark ? 1 : -1) * 0.01 * k);
      if (contrast(text, c) >= 6) {
        notes.push(`Ground ${bg}: the ink ${text} read ${contrast(text, bg).toFixed(1)}:1 on it, so the ground is ${c} (same hue, ${contrast(text, c).toFixed(1)}:1).`);
        bgFinal = c;
        break;
      }
    }
  }
  const allFinal = stops ? all : [bgFinal];
  const bgOrig = bg;
  void bgOrig;
  const accent = hx(g.accent, text);
  const surface0 = hx(g.surface, mixHex(bgFinal, text, 0.08));
  // a card colour the ink cannot be read on (a dark card on a lime ground) is replaced by a card close to the ground
  const cardBad = allFinal.some((st) => contrast(surface0, st) < 1.4) || contrast(text, surface0) < 4.5;
  // a card (and a bar track) must be told apart from the ground (at least 1.4:1) and keep the ink readable on it
  const cards = [0.1, 0.14, 0.2, 0.28, 0.36, 0.46, 0.58].flatMap((k) => [mixHex(bgFinal, '#FFFFFF', k), mixHex(bgFinal, '#000000', k), mixHex(bgFinal, text, k)]).filter((c) => allFinal.every((st) => contrast(c, st) >= 1.4) && contrast(text, c) >= 4.5);
  const surface = cardBad ? cards[0] ?? bgFinal : surface0;
  if (cardBad) notes.push(`Ground ${bgFinal}: the card colour ${surface0} is too close to the ground or unreadable under the ink, so cards use ${surface}.`);
  const mutedMin = Math.max(4.5, Math.min(6, Math.min(...allFinal.map((s) => contrast(text, s))) * 0.7));
  const muted = quietOn(text, [...allFinal, surface], hx(g.muted, mixHex(text, bgFinal, 0.4)), mutedMin);
  const onAccent = readableInk(accent, [hx(g.onAccent, text), text, bgFinal, '#FFFFFF', '#000000']);
  void inkOn;
  return { bg: bgFinal, text, muted, accent, surface, onAccent, ...(stops ? { gradient: { angle: g.gradient!.angle, stops } } : {}) };
}
export function styleFromPack(pack: StylePack | null | undefined): { style: LayoutStyle; notes: string[] } {
  if (!pack) return { style: DEFAULT_STYLE, notes: ['No reference style: a neutral light style is used.'] };
  const notes: string[] = [];
  const pal = pack.palette;
  const hex = (v: string | undefined, fb: string) => (v && HEX.test(v) ? v.toUpperCase() : fb);
  const bg = hex(pal.bg, '#FFFFFF');
  const text = hex(pal.text, '#111111');
  const accent = hex(pal.accent, text);
  const quiet = mixHex(text, bg, 0.4);
  const muted = quietOn(text, bg, hex(pal.muted ?? pal.accent2, quiet), 4.5);
  const surface0 = hex(pal.surface, mixHex(bg, text, 0.08));
  // a surface the read gave as the same colour as the ground would make every card and bar invisible: it is made a little darker (or lighter)
  const surface = contrast(surface0, bg) < 1.04 ? mixHex(bg, text, 0.06) : surface0;
  if (surface !== surface0) notes.push(`The surface colour ${surface0} is the same as the ground ${bg}: cards use ${surface} instead.`);
  const svgs = Object.values(pack.svgs ?? {}).join('\n') + Object.values(pack.variants ?? {}).flat().map((v) => v!.svg).join('\n');
  const first = Object.values(pack.svgs ?? {})[0] ?? '';
  const background: LayoutStyle['background'] = /<radialGradient/i.test(svgs) ? 'glow' : /<pattern/i.test(svgs) || (first.match(/<line/gi) ?? []).length >= 8 ? 'grid' : 'flat';
  const d = pack.devices ?? signatureDevices(pack);
  const planes = detectPlanes(pack);
  const headline = nearestFont(pack.fonts?.headline, 'Schibsted Grotesk');
  const body = nearestFont(pack.fonts?.body, 'Instrument Sans');
  if (headline !== pack.fonts?.headline || body !== pack.fonts?.body) notes.push(`Fonts mapped to the nearest bundled ones: headline ${headline}, body ${body}.`);
  const dr = deviceReport(pack);
  if (dr.slides) notes.push(`Devices seen (need ${dr.need} of ${dr.slides} slides): marker ${dr.seen.marker}, underline ${dr.seen.underline}, planes ${dr.seen.planes}, profile header ${dr.seen.profileHeader}.`);
  notes.push(`Style tokens: background ${background}; marker ${d.marker}, profile header ${d.profileHeader}, underline ${d.underline}, planes ${planes}; accent ${d.marker ? 'marker' : 'text'}.`);
  // the lightened accent of the deck: it reads on the ground and on the card / tint colour, so every slide uses the same one
  const lk = lightenForText(accent, [bg, surface].reduce((w, s) => (contrast(accent, s) < contrast(accent, w) ? s : w), bg));
  if (lk.changed) notes.push(`Accent text: ${accent} is ${contrast(accent, bg).toFixed(1)}:1 on ${bg} (under 4.5:1 for large text), so accent text uses ${lk.color} (${contrast(lk.color, bg).toFixed(1)}:1, same hue). The brand accent ${accent} is unchanged.`);
  const base: LayoutStyle = { palette: { bg, text, muted, accent, surface }, fonts: { headline, body }, background, devices: { marker: d.marker, profileHeader: d.profileHeader, underline: d.underline, planes }, accentStyle: d.marker ? 'marker' : 'text' };
  // A preset's look (palette rhythm, case, weights, gradient) rides on the pack: every ground is made readable here, never by shrinking text.
  if (pack.look) {
    const L = pack.look;
    const grounds = (L.rhythm ?? []).map((g) => fixGround(g, notes));
    if (grounds.length) {
      base.palette = { bg: grounds[0].bg, text: grounds[0].text, muted: grounds[0].muted, accent: grounds[0].accent, surface: grounds[0].surface, onAccent: grounds[0].onAccent };
      if (grounds.length >= 2) base.rhythm = grounds;
      else if (L.closing) base.rhythm = undefined;
      if (grounds[0].gradient) {
        base.background = 'gradient';
        base.gradient = grounds[0].gradient;
      }
    }
    if (L.closing) base.closing = fixGround(L.closing, notes);
    if (L.flavour) base.flavour = L.flavour as LayoutStyle['flavour'];
    if (L.closingLayout) base.closingLayout = L.closingLayout as LayoutStyle['closingLayout'];
    if (L.deco) base.deco = L.deco;
    if (typeof L.radius === 'number') base.radius = L.radius;
    if (L.caseStyle && L.caseStyle !== 'none') base.caseStyle = L.caseStyle;
    if (L.caseExceptions?.length) base.caseExceptions = L.caseExceptions;
    if (L.weights) base.weights = { headline: L.weights.headline, body: L.weights.body };
    notes.push(`Preset look: ${grounds.length} ground${grounds.length === 1 ? '' : 's'} in the rhythm, case ${L.caseStyle ?? 'none'}, weights ${L.weights ? L.weights.headline + '/' + L.weights.body : 'default'}${grounds.some((g) => g.gradient) ? ', gradient ground' : ''}.`);
  }
  const ov = applyOverrides(base, pack.overrides);
  notes.push(...ov.notes);
  return { style: ov.style, notes };
}

// ----- what the model is told -----
const GOOD_FOR: Record<LayoutId, string> = {
  statement: 'a bold claim or the cover hook: one huge headline, optional kicker and caption',
  'lead-statement': 'a story beat: a short lead-in line over a heavy headline',
  'big-question': 'a hook or turn as a question, set huge with a drawn question mark',
  'split-text': 'a headline with a short explaining paragraph',
  'big-stat': 'one hero number with a short label (at most 5 words)',
  'stat-bar': 'a share or amount as a number plus a bar (for example $500,000 for 5%)',
  stepper: '2 to 5 ordered steps',
  'step-numeral': 'ONE step shown with a giant numeral',
  checklist: '3 to 5 benefits or to-dos with check icons',
  'numbered-list': '3 to 5 ordered or ranked items',
  comparison: 'two things set against each other (before/after, myth/fact)',
  quote: 'a quote with its attribution',
  'feature-slider': 'one feature that slides, toggles or locks',
  'cta-button': 'the closing call to action with a button',
  'card-grid': '3 to 4 short categories or benefits as cards',
  'photo-led': "a headline with the person's own photo (only when a photo exists)",
  'listicle-numeral': 'one numbered list entry with a huge numeral',
  'stat-grid': '3 to 4 small figures, the first as the hero',
  timeline: '3 to 5 events in order, the last one highlighted',
  spotlight: 'a product or subject with exactly 3 numbered callouts',
  prose: 'LONGER TEXT: 1 to 3 paragraphs (up to 300 characters each), optional heading, a bold pull line or 2 to 4 bullets; the only layout that takes whole paragraphs',
  'statement-stacked': 'a hook of 2 to 4 words set huge, one word per line, with a short caption',
  'statement-card': 'one bold claim on a rounded card, with an optional kicker and caption',
  'statement-pill': 'a hook with a short call-out set in a pill under it (the caption is required)',
  'statement-question': 'one question or thought set under a thin rule, quieter than big-question',
  'contact-closing': 'the closing slide with contact details (2 to 4 lines: handle, site, phone, email), an optional button and brand name',
  'cta-pair': 'a closing with TWO actions: a filled button and an outlined button, each with a line',
  'numbered-stagger': '2 or 3 numbered points, each a sentence, the numerals in one column',
  'bullet-list': '3 to 5 short bold lines with bullets (what is in it, what you get)',
  'pill-stagger': '3 to 5 short options or ways, each in its own pill, with a headline',
  'headline-card': 'a headline over one key paragraph set on a card, with an optional subline, paragraph and closing line',
  'headline-body-image': 'a headline and 1 to 2 lines of text with a picture the person supplied (the picture field is never written by you)',
  'image-row': 'a headline, a row of 1 to 3 supplied pictures and a paragraph under them',
  'thumb-rows': '3 or 4 short rows, each with a small supplied picture',
  'cover-art': 'a hook with one big supplied picture (round or wide)',
  'photo-cover': 'a hook, an intro line and one wide supplied photo',
  'portrait-closing': 'a closing with a supplied portrait of a person: a band title, a heading, paragraphs and a link',
  'art-side-text': 'a heading and a short paragraph beside a supplied picture, with a hand-drawn arrow',
  'do-dont': 'a numbered do and do-not pair: what is wrong and what is right (text on each side; a supplied picture for each side is optional)',
};
const FIELD_NOTE: Record<string, string> = {
  bar: 'percent filled, a whole number 0-100',
  position: 'handle position, a whole number 0-100',
  current: 'which step is active, 1-based',
  step: 'the step number 1-9',
  numeral: 'a whole number',
  numbers: 'parallel to "labels"',
  labels: 'parallel to the other list',
  cardTitles: 'parallel to "cardLines"',
  cardLines: 'parallel to "cardTitles"',
  events: 'parallel to "labels"',
  label: 'finishes the number: number + label read as ONE phrase, e.g. "30%" + "off for early backers"',
  paragraph: 'ONE idea, at most 14 words, no second sentence',
  callouts: 'exactly 3',
};
/** The writer's picture rules: metadata only (id, orientation, shape, pixel size), never pixels. */
export function imageRules(images: { id: string; width: number; height: number }[]): string[] {
  const ratio = (p: { width: number; height: number }) => (p.width >= p.height ? `${(p.width / p.height).toFixed(2)}:1` : `1:${(p.height / p.width).toFixed(2)}`);
  const list = images.map((p, i) => `image ${i + 1}: ${picOrientation(p)}, ${ratio(p)}, ${p.width}x${p.height} px`);
  const nl = (IMAGE_LAYOUT_IDS as readonly string[]).filter((id) => hasEnoughPictures(id, images));
  return [
    `- Pictures available (metadata only, you never see them and never write a picture field): ${list.join('; ')}.`,
    '- Pictures were supplied: USE THEM. Choose a picture layout for at least one slide for every group of pictures that fits one (a single picture can head a text slide or the cover, two can be a comparison, three or more can be a row or thumbnails); a deck that ignores the pictures is wrong. The code places them.',
    '- Choose a layout with picture slots ONLY if there are enough pictures for its slots (the menu lists the slots and how many pictures each needs); every picture is used at most once in the deck, so the slots of all your picture layouts together must not exceed the pictures available. Prefer a layout whose slot orientation matches the pictures (landscape slots for landscape pictures, tall slots for portrait pictures). The code places the pictures.',
    nl.includes('do-dont') ? '- Two-sided content (a do and do-not pair, before and after, myth and fact): use "do-dont" when two pictures are available; with fewer pictures use "comparison".' : '- Two-sided content (a do and do-not pair, before and after, myth and fact): use "comparison" (not enough pictures for "do-dont").',
  ];
}
/** How a picture layout's slots read to the writer: how many pictures, which orientation. */
const slotsNote = (id: LayoutId): string => {
  const s = imageSlotsOf(id, 0);
  if (!s.length) return '';
  const o = [...new Set(s.flatMap((q) => q.accepts))];
  return ` Slots: ${s.length} ${s.length === 1 ? 'picture' : 'pictures'} (${s[0].orientation}${o.length > 1 ? '; fits ' + o.join(' or ') : ''}); needs at least ${imagesNeeded(id)}.`;
};
const fieldLine = (id: LayoutId): string => {
  const def = layoutDef(id)!;
  const parts = def.fields.map((f) => f.image ? `${f.name}? (a picture the person supplied: never write it, leave it out)` : `${f.name}${f.required ? '' : '?'} (${f.list ? `list of ${f.list.min === f.list.max ? f.list.min : f.list.min + '-' + f.list.max}, each ≤${f.max} chars` : `≤${f.max} chars`}${f.maxWords ? `, ≤${f.maxWords} words` : ''}${FIELD_NOTE[f.name] ? '; ' + FIELD_NOTE[f.name] : ''})`);
  return `- ${id}: ${GOOD_FOR[id]}. Fields: ${parts.join(', ')}.${slotsNote(id)}`;
};
/** What KIND of content a layout suits, in plain words (for the preset's shape line in the writer prompt). */
const KIND: Partial<Record<LayoutId, string>> = {
  'card-grid': 'card lists', 'stat-grid': 'sets of figures', comparison: 'comparisons', spotlight: 'three callouts', checklist: 'short lists', stepper: 'step sequences', 'numbered-list': 'ranked lists', timeline: 'timelines',
  statement: 'big statements', 'lead-statement': 'big statements', 'big-question': 'big questions', 'big-stat': 'one big figure', 'stat-bar': 'a share with a bar', quote: 'quotes', 'split-text': 'a headline with one idea', 'feature-slider': 'one feature',
  'step-numeral': 'numbered steps', 'listicle-numeral': 'numbered entries', 'cta-button': 'a closing call to action',
  'headline-body-image': 'a text with a picture', 'image-row': 'a text with pictures', 'thumb-rows': 'short lists with pictures', 'cover-art': 'big statements with a picture', 'photo-cover': 'big statements with a picture', 'portrait-closing': 'a closing with a person', 'art-side-text': 'a text with a picture', 'do-dont': 'do and do-not pairs',
  prose: 'short paragraphs of text', 'statement-stacked': 'big statements', 'statement-card': 'big statements', 'statement-pill': 'big statements', 'statement-question': 'big questions', 'contact-closing': 'a closing with contact details', 'cta-pair': 'a closing call to action', 'numbered-stagger': 'numbered points', 'bullet-list': 'short lists', 'pill-stagger': 'short lists', 'headline-card': 'a key paragraph',
};
/** The preset's shape line: the kinds of content its preferred layouts suit, the layouts, and the honesty rule. Short on purpose (about 60 tokens). */
export function flavourLine(fl: NonNullable<LayoutStyle['flavour']>): string {
  const kinds = [...new Set((fl.prefer ?? []).map((l) => KIND[l]).filter(Boolean))].slice(0, 4);
  return `- This look suits ${kinds.join(', ') || 'any content'} (layouts: ${(fl.prefer ?? []).join(', ') || 'any'}${fl.avoid?.length ? '; avoid unless needed: ' + fl.avoid.join(', ') : ''}). Use these forms where the topic honestly allows; never invent content to fit.`;
}
export const DENSE_LAYOUTS = ['statement', 'big-question', 'cta-button', 'statement-card', 'statement-stacked', 'statement-question'];

/** When to use each of the layouts a preset can like (the pack layouts): said in the menu so the writer picks them on purpose, not by a hidden swap rule. */
const WHEN: Partial<Record<LayoutId, string>> = {
  'pill-stagger': 'a short list of 3 to 5 options, tags or places (each at most 36 characters)',
  'statement-question': 'a slide that asks the reader ONE question or poses one thought',
  'contact-closing': 'ONLY when the text gives contact details (handle, site, phone, email): never invent them',
  'cta-pair': 'a closing with TWO real actions (a main one and a second one)',
  'numbered-stagger': '2 or 3 numbered points, each ONE short sentence (under about 60 characters)',
  'headline-card': 'one key paragraph under a headline',
  'statement-card': 'one bold claim that should sit on a card',
  'statement-pill': 'a hook with a short call-out (at most 40 characters) set in a pill',
  'statement-stacked': 'a hook of 2 to 4 words, one word per line',
  'bullet-list': 'a short list of 3 to 4 lines (at most 46 characters each)',
  prose: 'a slide that has to explain something in whole sentences',
};
/** "This style likes: ..." with when to use each pack layout the preset prefers (the layouts it has no hidden swap for are left to the general rules). */
export function flavourLikesLine(fl: NonNullable<LayoutStyle['flavour']>): string {
  const likes = (fl.prefer ?? []).filter((l) => WHEN[l as LayoutId]);
  if (!likes.length) return '';
  return `- This style likes: ${likes.map((l) => `"${l}" (${WHEN[l as LayoutId]})`).join('; ')}. Choose them on purpose where the slide's content fits; a layout that does not fit the content is worse than a plain one.`;
}
/** The preset's own cover form (flavour.cover): the writer is told to write slide 1 for it, and which headline length it needs. */
export function flavourCoverLine(fl: NonNullable<LayoutStyle['flavour']>): string {
  const cover = fl.cover as LayoutId | undefined;
  const parts: string[] = [];
  if (cover && cover !== 'statement') {
    const need: Partial<Record<LayoutId, string>> = {
      'statement-stacked': 'a headline of 2 to 4 words (one per line) and an optional short caption',
      'statement-pill': 'a short headline and a SHORT call-out of at most 40 characters for the pill (required)',
      'statement-card': 'a bold headline of at most about 60 characters, with an optional kicker and caption',
      'statement-question': 'one question as the headline',
    };
    parts.push(`this style's cover (slide 1) is "${cover}": write slide 1 as "${cover}" with ${need[cover] ?? 'a short headline'}; do not use plain "statement" for the cover`);
  }
  if (fl.coverQuestion) parts.push(`when the hook is a QUESTION (it ends with "?"), slide 1 is "${fl.coverQuestion}"`);
  return parts.length ? `- Cover: ${parts.join('; ')}.` : '';
}

export function buildLibraryPrompt(req: WriteRequest, look: Look, style: LayoutStyle, brief: string, n: number): string {
  const tone = TONES.find((t) => t.id === req.tone)!;
  // photo-led needs a photo; a layout with picture slots needs enough pictures that fit its slots (the metadata list below); without a list, any photo will do
  const ids = LAYOUT_IDS.filter((id) => (id === 'photo-led' ? !!look.hasPhoto : (IMAGE_LAYOUT_IDS as readonly string[]).includes(id) ? (look.images ? hasEnoughPictures(id, look.images) : !!look.hasPhoto) : true));
  const example = { title: 'Short name of this carousel', note: 'optional, only if the text is thin', slides: [{ layout: 'statement', variant: 1, fields: { kicker: 'Small line', headline: 'The big promise in a few words', caption: 'One line that makes people swipe.' }, accents: ['big promise'], density: 'normal', cut: 'edge-h' }, { layout: 'checklist', fields: { title: 'Before you start', items: ['Short item', 'Short item', 'Short item'] }, accents: [] }] };
  return [
    '[carousel:library]',
    `Turn the text between the markers into a ${n}-slide carousel. You only CHOOSE and WRITE: for every slide pick ONE layout id from the menu and write the text of its fields. You never draw: no SVG, no HTML, no coordinates, no colours. The code draws every slide from your choice.`,
    '',
    '<text>',
    req.text.trim(),
    '</text>',
    '',
    'Reply with ONE JSON object and nothing else (no code fence, no explanation). Format:',
    JSON.stringify(example, null, 2),
    '',
    'Layouts (id: what it is good for. Fields: name, a trailing ? means optional, with its length limit; a list field is a JSON list of strings). Respect every limit; text over a limit is refused:',
    ...ids.map(fieldLine),
    '',
    'Rules:',
    `- Write ${n} slides. Slide 1 is a strong hook (statement, statement-stacked, statement-card, statement-pill, statement-question, big-question or lead-statement; at most 8 words). In between choose the layout that suits THAT slide's content.`,
    '- The closing (last slide) depends on the TEXT, not on habit: "cta-button" ONLY when the text contains a real next action for the reader (book, buy, sign up, download, reply, follow, try, join); "cta-pair" when the text gives TWO different actions; "contact-closing" ONLY when the text itself contains contact details such as a handle, site, phone or email (never invent any); otherwise close on a closing statement ("statement" or "statement-card", a short closing line, NO button).',
    '- A button label is an ACTION PHRASE: verb first, 2 to 4 words, at most 20 characters, no question mark, comma or full stop ("Book a call", "Get the checklist", "Join the list"). Never a question, a slogan or a topic ("Which fits you?", "Sleep well"). If there is no real action in the text, there is no button: use a closing statement instead.',
    '- Prose: "prose" is the ONLY layout that takes whole paragraphs (up to 300 characters each, at most 3 paragraphs, about 450 characters in all). Use it for a slide that needs explaining in sentences; its heading is optional and, when present, reads on its own as a full title. Every other layout stays short: never put a paragraph into a statement, list or card layout.',
    ...(look.images?.length ? imageRules(look.images) : []),
    '- Forms: "statement-stacked" is 2 to 4 words (one per line); "statement-pill" needs a short caption (at most 40 characters) that is set in a pill; "statement-question" is one question or thought; "numbered-stagger" is 2 or 3 sentences; "bullet-list" and "pill-stagger" are short lines (at most 46 and 36 characters); "headline-card" has ONE key paragraph (the card) under a headline; "cta-pair" has two buttons with a short line each.',
    '- Variety: no two consecutive slides use the same layout, and no layout is used more than twice. Use "stepper" for 2 to 5 ordered steps, "stat-bar" or "big-stat" for a figure, "checklist" for benefits, "comparison" for two things set against each other, "quote" only for words that are in the text.',
    '- Stats: the "label" of big-stat and stat-bar is the continuation of the number, so "number label" reads as one phrase: "30%" + "off for early backers" (never a label that starts a new sentence, such as "Early backers save" under a 30%). split-text: the paragraph is ONE idea in at most 14 words.',
    '- Facts: use only facts, claims and numbers that are in the text. Never invent statistics, names, quotes, dates or results. If a slide would want a figure the text does not give, use a layout without one. A big-stat or stat-bar number must be a real figure from the text.',
    `- "accents": up to 3 phrases (1 to 3 words each) copied EXACTLY from the slide's headline, question or quote text, the words that carry the meaning (never filler such as the, a, and, of, to). The code sets them in the accent colour or on a marker bar.`,
    '- "density": "statement" is optional and ONLY for a statement, big-question or cta-button whose headline is 4 words or fewer: the code then drops the secondary copy and sets the headline huge. Otherwise leave it out.',
    style.devices.planes ? '- "cut": optional suggestion, one of plain, edge-h, angle, curve (a colour plane the slide is cut by). "invert": optional suggestion (true swaps field and plane colours). The code may override both to keep the deck varied.' : '- This style is flat (no colour planes): "cut" and "invert" are not needed.',
    '- "variant" is optional (1 or 2) and only a suggestion: the code alternates variants.',
    style.flavour && (style.flavour.prefer?.length || style.flavour.avoid?.length) ? flavourLine(style.flavour) : '',
    style.flavour ? flavourLikesLine(style.flavour) : '',
    style.flavour ? flavourCoverLine(style.flavour) : '',
    look.pack?.look ? '- Every title and headline stands alone as a complete phrase: write "How to pack it", not a fragment like "To pack it".' : '',
    `- Tone: ${tone.label} (${tone.how}). Plain, specific language. No hashtags, no emoji, no links.`,
    `- The look the code will draw (for the feel of the copy only): ${brief.slice(0, 500)}`,
    `- If the text is too thin for ${n} different slides, write fewer (at least ${SLIDE_RANGE.carousel[0]}) and add a top-level "note" saying so. Never pad. Add a short top-level "title" (at most 6 words).`,
  ].join('\n');
}

// ----- reading the answer -----
export interface SlideSpec {
  layout: string;
  variant?: 0 | 1;
  fields: Fields;
  accents: string[];
  density?: 'statement';
  cut?: Cut;
  invert?: boolean;
  /** What the person chose for this slide in the layout picker: the deck rotation and the style toggles keep it. */
  pin?: { variant?: 0 | 1; cut?: Cut; invert?: false | 'full' | 'tint' };
}
export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export function toSpec(raw: unknown): SlideSpec | null {
  if (!isObj(raw)) return null;
  const fields: Fields = {};
  // the writer never fills a picture field: whatever it sends there is dropped
  if (isObj(raw.fields)) for (const [k, v] of Object.entries(raw.fields).filter(([key]) => !isImageKey(key))) fields[k] = Array.isArray(v) ? v.map((x) => String(x)) : typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  const cuts: Cut[] = ['plain', 'edge-h', 'edge-v', 'angle', 'curve'];
  return {
    layout: String(raw.layout ?? '').trim().toLowerCase(),
    ...(raw.variant === 1 || raw.variant === 2 ? { variant: (raw.variant - 1) as 0 | 1 } : {}),
    fields,
    accents: (Array.isArray(raw.accents) ? raw.accents : typeof raw.accents === 'string' && raw.accents ? [raw.accents] : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 3),
    ...(raw.density === 'statement' ? { density: 'statement' as const } : {}),
    ...(typeof raw.cut === 'string' && (cuts as string[]).includes(raw.cut) ? { cut: raw.cut as Cut } : {}),
    ...(raw.invert === true ? { invert: true } : {}),
  };
}
export function parseLibraryAnswer(text: string): { title: string; note: string | null; slides: SlideSpec[]; errors: string[] } {
  const errors: string[] = [];
  let j: unknown;
  try {
    j = JSON.parse(cleanPaste(text));
  } catch (e) {
    return { title: '', note: null, slides: [], errors: ['The answer is not valid JSON: ' + (e as Error).message.slice(0, 120)] };
  }
  if (!isObj(j) || !Array.isArray(j.slides)) return { title: '', note: null, slides: [], errors: ['The answer has no "slides" list.'] };
  const slides = j.slides.map(toSpec);
  slides.forEach((s, i) => !s && errors.push(`Slide ${i + 1} is not an object like {"layout": "...", "fields": {...}}.`));
  const [lo, hi] = SLIDE_RANGE.carousel;
  if (j.slides.length < lo || j.slides.length > hi) errors.push(`A carousel needs ${lo} to ${hi} slides (this answer has ${j.slides.length}).`);
  return { title: typeof j.title === 'string' ? j.title.trim() : '', note: typeof j.note === 'string' && j.note.trim() ? j.note.trim() : null, slides: slides.filter((s): s is SlideSpec => !!s), errors };
}

// ----- checking and repairing one slide -----
export const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const clip = (s: string, max: number): string => {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, '');
};
/** The optional one-line texts a layout may take: the code trims these a little when they are over their limit (a required headline or title goes to the retry instead). */
const OPTIONAL_TEXT = new Set(['kicker', 'caption', 'source', 'note', 'line', 'sub']);
const DANGLING = /\s+(?:and|of|the|with)$/i;
/**
 * A deterministic fix for an optional text that is over its limit by 20% or less: cut at the last word boundary that fits, drop a dangling "and", "of", "the" or "with", and keep
 * the result only when at least 60% of the text survives. Otherwise the text is left as it is (the retry call asks for a new one). Returns the trimmed text or null.
 */
export function trimAtWord(text: string, max: number): string | null {
  const t = text.trim();
  if (t.length <= max || t.length > max * 1.2) return null;
  let cut = t.slice(0, max + 1);
  const sp = cut.lastIndexOf(' ');
  if (sp <= 0) return null;
  cut = (cut.length > max && t[max] !== ' ' ? cut.slice(0, sp) : cut.slice(0, max)).trim();
  for (;;) {
    const before = cut;
    cut = cut.replace(/[\s,;:\u2013\u2014-]+$/u, '').replace(DANGLING, '').trim();
    if (cut === before) break;
  }
  return cut && cut.length <= max && cut.length >= 0.6 * t.length ? cut : null;
}
export interface Trim {
  slide: number;
  field: string;
  from: string;
  to: string;
  max: number;
}
/** Applies trimAtWord to the optional text fields of every slide (before the slides are checked). */
export function trimOptionalFields(specs: SlideSpec[]): { specs: SlideSpec[]; trims: Trim[] } {
  const trims: Trim[] = [];
  const out = specs.map((sp, i) => {
    const def = layoutDef(sp.layout);
    if (!def) return sp;
    let fields = sp.fields;
    for (const fs0 of def.fields) {
      const v = sp.fields[fs0.name];
      if (fs0.required || fs0.list || fs0.percent || !OPTIONAL_TEXT.has(fs0.name) || typeof v !== 'string') continue;
      const t = trimAtWord(v, fs0.max);
      if (t !== null) {
        trims.push({ slide: i + 1, field: fs0.name, from: v, to: t, max: fs0.max });
        fields = { ...fields, [fs0.name]: t };
      }
    }
    return fields === sp.fields ? sp : { ...sp, fields };
  });
  return { specs: out, trims };
}
const wordsOf = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
/** True when a line repeats the headline: at least 60% of the words of the shorter text are in the other (case and punctuation ignored). */
export function repeatsHeadline(line: string, headline: string): boolean {
  const a = wordsOf(line), b = wordsOf(headline);
  if (a.length < 2 || b.length < 2) return a.length > 0 && a.join(' ') === b.join(' ');
  const [short, long] = a.length <= b.length ? [a, new Set(b)] : [b, new Set(a)];
  return short.filter((w) => long.has(w)).length / short.length >= 0.6;
}
const HEAD_FIELDS = ['headline', 'title', 'question', 'heading'];
const LINE_FIELDS = ['caption', 'sub', 'subline', 'line', 'subtitle', 'kicker'];
/**
 * A pill, caption or sub that only says the headline again is taken out (a trim, never a failure): the optional line goes; a statement-pill (whose caption is required) becomes a plain
 * statement without it. Returns the new specs and a log of what was done.
 */
export function dropRepeats(specs: SlideSpec[]): { specs: SlideSpec[]; trims: Trim[] } {
  const trims: Trim[] = [];
  const out = specs.map((sp, i) => {
    const hk = HEAD_FIELDS.find((k) => typeof sp.fields[k] === 'string' && (sp.fields[k] as string).trim());
    if (!hk) return sp;
    const head = String(sp.fields[hk]);
    let fields = sp.fields;
    let layout = sp.layout;
    for (const k of LINE_FIELDS) {
      const v = fields[k];
      if (typeof v !== 'string' || !v.trim() || !repeatsHeadline(v, head)) continue;
      trims.push({ slide: i + 1, field: k, from: v, to: '(removed: it repeats the headline)', max: 0 });
      fields = Object.fromEntries(Object.entries(fields).filter(([n]) => n !== k)) as Fields;
      // the pill goes with its caption: a plain statement, or a statement card when a neighbour is already a plain statement (no two in a row)
      if (layout === 'statement-pill' && k === 'caption') layout = specs[i - 1]?.layout === 'statement' || specs[i + 1]?.layout === 'statement' ? 'statement-card' : 'statement';
    }
    return fields === sp.fields ? sp : { ...sp, layout, fields };
  });
  return { specs: out, trims };
}
/** The slide's fields as the layout takes them (with its accent phrases). */
export const fieldsOf = (s: SlideSpec): Fields => ({ ...s.fields, ...(s.accents.length ? { accent: s.accents } : {}) });
/** Verbs a button label may start with: a button says what happens when it is pressed. */
export const ACTION_VERBS = new Set([
  'book', 'get', 'join', 'sign', 'start', 'try', 'download', 'click', 'read', 'save', 'share', 'follow', 'subscribe', 'buy', 'order', 'reserve', 'grab', 'claim', 'watch', 'learn', 'see', 'visit', 'contact', 'call', 'email', 'message', 'reply', 'comment',
  'send', 'apply', 'register', 'shop', 'explore', 'discover', 'build', 'create', 'make', 'use', 'take', 'schedule', 'request', 'back', 'pledge', 'support', 'donate', 'listen', 'tell', 'ask', 'dm', 'find', 'check', 'view', 'open', 'unlock', 'access',
  'pick', 'choose', 'test', 'print', 'copy', 'bookmark', 'tag', 'tap', 'stream', 'play', 'rsvp', 'enroll', 'upgrade', 'preorder', 'add', 'redeem', 'complete', 'answer', 'vote', 'write', 'publish', 'post', 'submit', 'talk', 'meet', 'connect', 'invite',
  'give', 'enter', 'win', 'plan', 'compare', 'calculate', 'browse', 'install', 'launch', 'upload', 'review', 'rate', 'sample', 'taste', 'swap', 'trade', 'hire', 'work', 'ship', 'fix', 'audit', 'steal', 'borrow', 'remix', 'customize', 'customise',
]);
/**
 * Why a button label is not a button: it must be an ACTION PHRASE, verb first, 2 to 4 words ("Book a call", "Get the checklist"), at most 20 characters, with no question mark, comma or
 * full stop. Returns the reason, or null when the label is fine.
 */
export function buttonProblem(label: string): string | null {
  const t = label.trim();
  if (!t) return 'the button text is empty';
  const words = t.split(/\s+/);
  if (/[?!.,;:]/.test(t)) return `"${t}" has punctuation: a button label is a short action phrase (like "Book a call")`;
  if (words.length < 2 || words.length > 4) return `"${t}" is ${words.length} word${words.length === 1 ? '' : 's'}: a button label is 2 to 4 words (like "Get the checklist")`;
  if (t.length > 20) return `"${t}" is ${t.length} characters: a button label is at most 20`;
  if (!ACTION_VERBS.has(words[0].toLowerCase())) return `"${t}" does not start with an action verb: a button label is verb first (like "Join the list")`;
  return null;
}
/** The button fields of a closing layout (cta-button, cta-pair, contact-closing). */
const BUTTON_FIELDS = ['button', 'button1', 'button2'];
export const buttonProblems = (s: SlideSpec): string[] =>
  BUTTON_FIELDS.flatMap((k) => (typeof s.fields[k] === 'string' && (s.fields[k] as string).trim() ? [buttonProblem(s.fields[k] as string)].filter((x): x is string => !!x).map((m) => `${k}: ${m}`) : []));

/** Problems that need the model (or a repair): unknown layout, photo without a photo, fields over budget or missing, a button that is not an action phrase. */
export function slideProblems(s: SlideSpec, look: Look): string[] {
  const id = s.layout;
  if (!layoutDef(id)) return [`"${s.layout}" is not a layout (use one of: ${LAYOUT_IDS.join(', ')}).`];
  if (id === 'photo-led' && !look.hasPhoto) return ['photo-led is only for the person\'s own photo and there is none: choose another layout.'];
  return [...validateSlideContent(id, fieldsOf(s)).errors, ...buttonProblems(s)];
}
/**
 * A closing whose button is still not an action phrase (the retry did not fix it) loses the button instead of failing: it becomes a closing statement card with the same words and no
 * button (the headline, and the line under it as the caption). A contact closing only loses its button text. Returns the new specs and a log of what was done.
 */
export function dropBadButtons(specs: SlideSpec[]): { specs: SlideSpec[]; trims: Trim[] } {
  const trims: Trim[] = [];
  const out = specs.map((s, i) => {
    if (!buttonProblems(s).length) return s;
    const labels = BUTTON_FIELDS.map((k) => String(s.fields[k] ?? '')).filter(Boolean).join(' / ');
    trims.push({ slide: i + 1, field: 'button', from: labels, to: s.layout === 'contact-closing' ? '(no button)' : '(closing statement, no button)', max: 20 });
    if (s.layout === 'contact-closing') return { ...s, fields: Object.fromEntries(Object.entries(s.fields).filter(([k]) => k !== 'button')) as Fields };
    const f = s.fields;
    const cap = [f.sub, f.line1, f.line].find((x) => typeof x === 'string' && x.trim()) as string | undefined;
    return { layout: 'statement-card', fields: { headline: String(f.headline ?? '').trim(), ...(cap ? { caption: cap.trim().slice(0, 60) } : {}) } as Fields, accents: s.accents };
  });
  return { specs: out, trims };
}
/** Trims every field to its budget; null when a required list cannot reach its minimum. */
export function repairFields(id: string, f: Fields): Fields | null {
  const def = layoutDef(id);
  if (!def) return null;
  const texts = Object.values(f).flatMap((v) => (Array.isArray(v) ? v : [v])).map((x) => String(x).trim()).filter(Boolean);
  const out: Fields = {};
  for (const spec of def.fields) {
    const v = f[spec.name];
    if (spec.image) {
      if (typeof v === 'string' && v.trim()) out[spec.name] = v;
      continue;
    }
    if (spec.list) {
      const list = (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(/\n|;/) : []).map((x) => String(x).trim()).filter(Boolean).slice(0, spec.list.max).map((x) => clip(x, spec.max));
      if (list.length < spec.list.min) return spec.required ? null : out;
      out[spec.name] = list;
      continue;
    }
    let s = (typeof v === 'string' ? v : Array.isArray(v) ? v.join(' ') : '').trim();
    if (spec.percent) s = String(Math.min(100, Number(s.match(/\d+/)?.[0] ?? '')) || '');
    if (spec.name === 'step') s = /^[1-9]$/.test(s) ? s : '1';
    if (spec.maxWords) s = s.split(/\s+/).slice(0, spec.maxWords).join(' ');
    s = clip(s, spec.max);
    if (!s && spec.required) s = clip(texts.find((t) => !Object.values(out).flat().includes(t)) ?? '', spec.max);
    if (spec.percent && !s && spec.required) s = '50';
    if (s) out[spec.name] = s;
  }
  return validateSlideContent(id, out).ok ? out : null;
}
/** The script slide (the app's own slide types) that stands for a library slide: for the editor, exports and the report. The slide is DRAWN from the library, not from this. */
export function scriptSlideOf(layout: string, f: Fields): Record<string, unknown> {
  const s = (k: string) => (typeof f[k] === 'string' ? (f[k] as string) : '');
  const a = (k: string) => (Array.isArray(f[k]) ? (f[k] as string[]) : []);
  const tags = { element_tags: ['idea', 'message'] };
  const pair = (x: string[], y: string[]) => x.map((t, i) => (y[i] ? `${t}: ${y[i]}` : t));
  switch (layout) {
    case 'statement': return { type: 'cover', headline: s('headline'), ...(s('kicker') ? { kicker: s('kicker') } : {}), ...(s('caption') ? { sub: s('caption') } : {}), ...tags };
    case 'lead-statement': return { type: 'cover', kicker: s('lead'), headline: s('headline'), ...tags };
    case 'big-question': return { type: 'cover', headline: s('question'), ...(s('line') ? { sub: s('line') } : {}), ...tags };
    case 'photo-led': return { type: 'cover', headline: s('headline'), ...(s('kicker') ? { kicker: s('kicker') } : {}), ...tags };
    case 'split-text': return { type: 'content', headline: s('headline'), body: s('paragraph'), ...tags };
    case 'feature-slider': return { type: 'content', headline: s('title'), body: s('body'), ...tags };
    case 'stepper': return { type: 'content', headline: s('title'), body: a('steps').join('. '), steps: a('steps'), ...tags };
    case 'step-numeral': return { type: 'step', number: Number(s('step')) || 1, headline: s('title'), body: s('body'), ...tags };
    case 'listicle-numeral': return { type: 'step', number: Number(s('numeral')) || 1, headline: s('title'), body: s('body') || s('title'), ...tags };
    case 'big-stat': return { type: 'stat', value: s('number'), label: s('label'), ...(s('source') ? { note: s('source') } : {}), ...tags };
    case 'stat-bar': return { type: 'stat', value: s('number'), label: s('label'), ...(s('note') ? { note: s('note') } : {}), ...tags };
    case 'checklist': case 'numbered-list': return { type: 'checklist', headline: s('title'), items: a('items'), ...tags };
    case 'comparison': return { type: 'beforeafter', beforeLabel: s('leftLabel'), before: s('leftText'), afterLabel: s('rightLabel'), after: s('rightText'), ...tags };
    case 'quote': return { type: 'quote', quote: s('quote'), by: s('author'), ...tags };
    case 'cta-button': return { type: 'closing', headline: s('headline'), cta: s('button'), ...tags };
    case 'card-grid': return { type: 'checklist', headline: s('title') || 'In short', items: pair(a('cardTitles'), a('cardLines')).slice(0, 6), ...tags };
    case 'stat-grid': return { type: 'checklist', headline: s('title') || 'In numbers', items: pair(a('numbers'), a('labels')).slice(0, 6), ...tags };
    case 'timeline': return { type: 'checklist', headline: s('title'), items: pair(a('labels'), a('events')).slice(0, 6), ...tags };
    case 'spotlight': return { type: 'checklist', headline: s('subject'), items: a('callouts'), ...tags };
    case 'headline-body-image': return { type: 'content', headline: s('headline'), body: s('body'), ...tags };
    case 'image-row': return { type: 'content', headline: s('headline'), body: [s('subline'), s('paragraph')].filter(Boolean).join(' '), ...tags };
    case 'thumb-rows': return { type: 'checklist', headline: s('title') || 'In short', items: a('items'), ...tags };
    case 'cover-art': return { type: 'cover', headline: s('headline'), ...(s('subtitle') ? { sub: s('subtitle') } : {}), ...tags };
    case 'photo-cover': return { type: 'cover', headline: s('headline'), sub: s('intro'), ...tags };
    case 'portrait-closing': return { type: 'closing', headline: s('headline'), cta: s('url') || 'Get in touch', ...tags };
    case 'art-side-text': return { type: 'content', headline: s('heading'), body: s('paragraph'), ...tags };
    case 'do-dont': return { type: 'beforeafter', beforeLabel: 'Do not', before: s('wrong'), afterLabel: 'Do', after: s('right'), ...tags };
    case 'prose': return { type: 'content', headline: s('heading') || s('p1').split(/\s+/).slice(0, 6).join(' '), body: [s('p1'), s('p2'), s('p3'), s('pull'), ...a('bullets')].filter(Boolean).join(' '), ...tags };
    case 'statement-stacked': case 'statement-card': case 'statement-pill': return { type: 'cover', headline: s('headline'), ...(s('kicker') ? { kicker: s('kicker') } : {}), ...(s('caption') ? { sub: s('caption') } : {}), ...tags };
    case 'statement-question': return { type: 'cover', headline: s('question'), ...(s('line') ? { sub: s('line') } : {}), ...tags };
    case 'contact-closing': return { type: 'closing', headline: s('headline'), cta: s('button') || a('contacts')[0] || 'Get in touch', ...tags };
    case 'cta-pair': return { type: 'closing', headline: s('headline'), cta: s('button1'), ...tags };
    case 'numbered-stagger': case 'bullet-list': return { type: 'checklist', headline: s('title'), items: a('items'), ...tags };
    case 'pill-stagger': return { type: 'checklist', headline: s('headline'), items: a('items'), ...tags };
    case 'headline-card': return { type: 'content', headline: s('headline'), body: [s('card'), s('paragraph'), s('closing')].filter(Boolean).join(' '), ...tags };
    default: return { type: 'content', headline: s('headline') || s('title') || 'Slide', body: Object.values(f).flat().join('. ').slice(0, 250) || 'Slide', ...tags };
  }
}

// ----- the report -----
export interface LibraryReport {
  route: 'library';
  provider: string;
  tokenNote: string;
  calls: number;
  tokens: { input: number; output: number } | null;
  seconds: number;
  layouts: string[];
  variants: number[];
  cuts: string[];
  inverts: string[];
  densities: string[];
  /** What the model suggested (cut, invert, density) next to what the code used. */
  suggested: { cut: (string | null)[]; invert: boolean[]; density: (string | null)[] };
  retries: { slide: number; reasons: string[] }[];
  fallbacks: { slide: number; layout: string; level: string; reason: string }[];
  /** Cuts or densities the code dropped without a model call (the cut did not fit the content, the headline was too long for statement density). */
  codeAdjustments: string[];
  style: LayoutStyle;
  styleNotes: string[];
  /** The final slides (layout, fields, accents, suggestions): the deck can be drawn again from this with no model call (the style toggles do). */
  plan?: { title: string; specs: SlideSpec[] };
  /** How many times the deck was drawn again from the plan. */
  redraws?: number;
  /** Optional texts the code trimmed at a word boundary instead of asking the writer again. */
  trims?: { slide: number; field: string; from: string; to: string; max: number }[];
  /** The preset flavour pass: layouts moved to a preferred one (slide, from, to, why) and the slides that stayed with the reason. Presets only. */
  flavour?: { swaps: FlavourSwap[]; kept: FlavourKept[] };
  /** Slides changed to a picture layout because pictures were left unused (slide, from, to, why). */
  pictureSwaps?: PictureSwap[];
  /** What the deck was drawn from: a built-in preset's name, or 'reference' (the active reference style). The style toggles redraw it only for the same source. */
  source?: string;
  /** The palette-rhythm ground of each slide (an index into the style's rhythm, -1 = the closing ground, null = no rhythm). */
  grounds?: (number | null)[];
}

// ----- the deck -----
export const stubPack = (style: LayoutStyle, name: string): StylePack => {
  const c = coloursFor({ ...style.palette, onAccent: style.palette.onAccent ?? style.palette.bg }, {});
  return { name, palette: { bg: style.palette.bg, text: style.palette.text, accent: style.palette.accent, muted: style.palette.muted, surface: style.palette.surface, onAccent: c.F.onAccent }, fonts: { ...style.fonts }, motifs: [], designs: {}, canvas: { w: 1080, h: 1350 }, notes: ['Drawn by the layout library: no pack designs.'] };
};

export interface Drawn {
  built: Built | null;
  cut: Cut;
  invert: boolean;
  density: 'normal' | 'statement';
  adjustments: string[];
  problems: string[];
}
/** Draws one slide. A density or cut that does not fit is dropped by the code (no model call); only a plain failure is a problem. */
/**
 * After a deck is drawn: a run of 3 or more plain slides is broken by giving a slide in it (the middle one first) another cut its layout carries. A layout that cannot carry any
 * plane (the numeral layouts) stays plain, so the slides beside it have to take the plane. `redraw(i, cut)` draws slide i with that cut; `pinned(i)` slides are never changed.
 */
export async function breakPlainRuns(drawn: (Drawn | undefined)[], layoutOf: (i: number) => string, pinned: (i: number) => boolean, redraw: (i: number, cut: Cut) => Promise<Drawn>): Promise<void> {
  const isPlain = (i: number) => !!drawn[i]?.built && drawn[i]!.cut === 'plain';
  for (let guard = 0; guard < drawn.length; guard++) {
    let a = -1, b = -1;
    for (let i = 0; i < drawn.length && a < 0; i++) {
      if (!isPlain(i)) continue;
      let j = i;
      while (j + 1 < drawn.length && isPlain(j + 1)) j++;
      if (j - i >= 2) [a, b] = [i, j];
      i = j;
    }
    if (a < 0) return;
    const mid = (a + b) / 2;
    const order = Array.from({ length: b - a + 1 }, (_, k) => a + k).sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid));
    let fixed = false;
    for (const i of order) {
      if (pinned(i)) continue;
      for (const c of cutsOf(layoutOf(i))) {
        if (c === 'plain' || c === 'edge-v' || drawn[i - 1]?.cut === c || drawn[i + 1]?.cut === c) continue;
        const alt = await redraw(i, c);
        if (alt.built && alt.cut !== 'plain') {
          alt.adjustments = [...alt.adjustments, `slide ${i + 1}: the cut "${c}" was used so the deck does not have three plain slides in a row.`];
          drawn[i] = alt;
          fixed = true;
          break;
        }
      }
      if (fixed) break;
    }
    // Second try: the only cut that works for a slide of the run is the one a neighbour has. The neighbour then takes another cut (never plain, never edge-v, never the same as its own neighbours).
    if (!fixed) {
      outer: for (const i of order) {
        if (pinned(i)) continue;
        for (const c of cutsOf(layoutOf(i))) {
          if (c === 'plain' || c === 'edge-v') continue;
          const k = drawn[i - 1]?.cut === c ? i - 1 : drawn[i + 1]?.cut === c ? i + 1 : -1;
          if (k < 0 || pinned(k)) continue;
          const alt = await redraw(i, c);
          if (!alt.built || alt.cut === 'plain') continue;
          const far = k < i ? k - 1 : k + 1;
          for (const c2 of cutsOf(layoutOf(k))) {
            if (c2 === 'plain' || c2 === 'edge-v' || c2 === c || drawn[far]?.cut === c2) continue;
            const alt2 = await redraw(k, c2);
            if (alt2.built && alt2.cut !== 'plain') {
              alt.adjustments = [...alt.adjustments, `slide ${i + 1}: the cut "${c}" was used so the deck does not have three plain slides in a row.`];
              alt2.adjustments = [...alt2.adjustments, `slide ${k + 1}: the cut "${c2}" was used so that slide ${i + 1} could take "${c}".`];
              drawn[i] = alt;
              drawn[k] = alt2;
              fixed = true;
              break outer;
            }
          }
        }
      }
    }
    if (!fixed) return;
  }
}
export async function drawOne(spec: SlideSpec, variant: 0 | 1, style: LayoutStyle, o: { handle: string; index: number; total: number; cut: Cut; invert: false | 'full' | 'tint'; density: 'normal' | 'statement'; ground?: number }): Promise<Drawn> {
  const f = fieldsOf(spec);
  const adjustments: string[] = [];
  const headline = typeof f.headline === 'string' ? f.headline : typeof f.question === 'string' ? f.question : '';
  let density = o.density;
  if (density === 'statement' && (!DENSE_LAYOUTS.includes(spec.layout) || words(headline) > 4)) {
    adjustments.push(`slide ${o.index + 1}: statement density dropped (${DENSE_LAYOUTS.includes(spec.layout) ? 'the headline is longer than 4 words' : 'not for ' + spec.layout}).`);
    density = 'normal';
  }
  const tries: { cut: Cut; invert: false | 'full' | 'tint'; density: 'normal' | 'statement' }[] = [{ cut: o.cut, invert: o.invert, density }];
  if (density === 'statement') tries.push({ cut: o.cut, invert: o.invert, density: 'normal' });
  if (o.cut !== 'plain') tries.push({ cut: 'plain', invert: o.invert, density: 'normal' });
  if (o.invert) tries.push({ cut: 'plain', invert: false, density: 'normal' });
  let last: Built | null = null;
  for (const [k, t] of tries.entries()) {
    const b = await buildSlide(spec.layout, variant, f, style, { handle: o.handle, index: o.index, total: o.total, cut: cutsOf(spec.layout).includes(t.cut) ? t.cut : 'plain', invert: t.invert, density: t.density, ...(o.ground !== undefined ? { ground: o.ground } : {}) });
    last = b;
    if (b.ok) {
      if (k > 0) adjustments.push(`slide ${o.index + 1}: drawn with ${t.cut}${t.invert ? ' + invert' : ''}${t.density === 'statement' ? ' + statement density' : ''} instead of ${o.cut}${o.invert ? ' + invert' : ''}${density === 'statement' ? ' + statement density' : ''} (that did not fit: ${tries[k - 1] && last ? 'content too big for it' : ''}).`);
      if (b.cut !== t.cut) adjustments.push(`slide ${o.index + 1}: the ${t.cut} plane would hold no content for ${spec.layout}, so it is drawn with no plane.`);
      return { built: b, cut: b.cut, invert: !!t.invert, density: t.density, adjustments, problems: [] };
    }
  }
  return { built: null, cut: 'plain', invert: false, density: 'normal', adjustments, problems: (last?.errors ?? ['it could not be drawn']).slice(0, 4) };
}

function buildRetry(first: string, specs: SlideSpec[], why: Map<number, string[]>): string {
  return [
    first,
    '',
    'The slides so far (JSON):',
    JSON.stringify(specs),
    '',
    'These slides cannot be used, for these reasons:',
    ...[...why].flatMap(([i, ps]) => ps.slice(0, 5).map((p) => `- slide ${i + 1}: ${p}`)),
    '',
    `Reply with ONLY a JSON object {"slides": {${[...why.keys()].map((i) => `"${i + 1}": {...}`).join(', ')}}} holding the corrected slide for slide number ${[...why.keys()].map((i) => i + 1).join(', ')} (same shape as before: layout, fields, accents, ...). No other slides, no code fence, no explanation. Keep each text within its limit.`,
  ].join('\n');
}

export async function designLibraryDeck(req: WriteRequest, look: Look, handle: string, p: WriteProvider, signal: AbortSignal, onPhase: (ph: 'writing' | 'retrying') => void = () => undefined): Promise<GenerateResult & { designed: Designed }> {
  const t0 = performance.now();
  const { style, notes: styleNotes } = styleFromPack(look.pack);
  const brief = look.pack ? look.pack.brief ?? styleBriefOf(look.pack) : look.brief?.trim() || 'a clean, confident look';
  const [lo, hi] = SLIDE_RANGE[req.format];
  const n = Math.min(hi, Math.max(lo, req.slides));
  const first = buildLibraryPrompt(req, look, style, brief, n);
  let calls = 0;
  let ms = 0;
  const tokens = { input: 0, output: 0 };
  const ask = async (prompt: string) => {
    onPhase(calls === 0 ? 'writing' : 'retrying');
    const a = await p.write(prompt, signal, 'write');
    calls += 1;
    ms += a.ms;
    tokens.input += a.usage?.input ?? 0;
    tokens.output += a.usage?.output ?? 0;
    return a.text;
  };
  let text = await ask(first);
  let parsed = parseLibraryAnswer(text);
  if (parsed.errors.length || parsed.slides.length < lo) {
    text = await ask([first, '', 'Your previous answer was:', text.slice(0, 6000), '', 'It cannot be used, for these reasons:', ...parsed.errors.map((e) => '- ' + e), '', 'Reply again with the corrected JSON object only.'].join('\n'));
    parsed = parseLibraryAnswer(text);
  }
  if (parsed.errors.length || parsed.slides.length < lo) throw new WriterError('invalid', 'The writer answered twice, but neither answer could be used as a slide list.', parsed.errors.map((message) => ({ severity: 'error' as const, path: '', message })));
  let specs = parsed.slides.slice(0, hi);
  // optional one-line texts a little over their limit are trimmed by the code (no retry call for a kicker one character long)
  const tr = trimOptionalFields(specs);
  specs = tr.specs;
  // a pill, caption or sub that repeats the headline is taken out (a trim)
  const rp = dropRepeats(specs);
  specs = rp.specs;
  tr.trims.push(...rp.trims);
  const suggested = { cut: specs.map((s) => s.cut ?? null), invert: specs.map((s) => !!s.invert), density: specs.map((s) => s.density ?? null) };
  // A preset's flavour: layouts it avoids move to ones it prefers where the slide's text fits (deterministic, no model call; references have no flavour).
  const fp = look.pack?.look?.flavour ? flavourPass(specs, style, look, look.pack.name.replace(/ pack$/, '')) : null;
  if (fp) specs = fp.specs;
  // pictures the writer left unused get a slide (a deterministic swap to a picture layout of the slide's own meaning, no text lost)
  let pictureSwaps: PictureSwap[] = [];
  if (look.images?.length) {
    const pp = picturePass(specs, look);
    specs = pp.specs;
    pictureSwaps = pp.swaps;
  }

  /** The deck's rotation: variants and cuts over the whole deck. A layout the rotation would change (repeated or over-used) is a problem for the retry. */
  const rotate = () => {
    const ids = specs.map((s) => s.layout as LayoutId);
    const rv = rotateVariants(ids.map((layout) => ({ layout: layoutDef(layout) ? layout : ('statement' as LayoutId) })), { photo: !!look.hasPhoto, flavour: style.flavour });
    const count: Record<string, number> = {};
    const variants = specs.map((s, i) => {
      const same = rv[i].layout === s.layout;
      const c = count[s.layout] ?? 0;
      count[s.layout] = c + 1;
      return same ? rv[i].variant : ((c % 2) as 0 | 1);
    });
    specs.forEach((s, i) => { if (s.pin?.variant !== undefined) variants[i] = s.pin.variant; }); // a variant the preset (closing) or the person pinned
    const repeats = new Map<number, string>();
    rv.forEach((r, i) => layoutDef(specs[i].layout) && r.layout !== specs[i].layout && repeats.set(i, r.note || `the layout "${specs[i].layout}" repeats or is over-used`));
    const rc = rotateCuts(ids.map((layout) => ({ layout: layoutDef(layout) ? layout : ('statement' as LayoutId) })), style, { suggest: specs.map((s) => ({ cut: s.cut })) });
    return { variants, repeats, cuts: rc };
  };
  const drawAll = async (only?: Set<number>, prev?: Map<number, Drawn>) => {
    const rot = rotate();
    // the project's pictures go into the picture slots by code (best fit, each at most once); a layout that cannot get enough keeps its text-only form
    if (look.images?.length) specs = placeImages(specs, rot.variants, look.images);
    const out = new Map<number, Drawn>(prev ?? []);
    for (let i = 0; i < specs.length; i++) {
      if (only && !only.has(i)) continue;
      const pr = slideProblems(specs[i], look);
      if (pr.length) {
        out.set(i, { built: null, cut: 'plain', invert: false, density: 'normal', adjustments: [], problems: pr });
        continue;
      }
      const d = await drawOne(specs[i], rot.variants[i], style, { handle, index: i, total: specs.length, cut: rot.cuts[i].cut, invert: rot.cuts[i].invert, density: specs[i].density ?? 'normal', ground: rot.cuts[i].ground });
      if (rot.repeats.has(i)) d.problems = [...d.problems, 'layout: ' + rot.repeats.get(i)!];
      out.set(i, d);
    }
    const arr: (Drawn | undefined)[] = specs.map((_, i) => out.get(i));
    if (style.devices.planes) await breakPlainRuns(arr, (i) => specs[i].layout, () => false, (i, cut) => drawOne(specs[i], rot.variants[i], style, { handle, index: i, total: specs.length, cut, invert: rot.cuts[i].invert, density: specs[i].density ?? 'normal', ground: rot.cuts[i].ground }));
    arr.forEach((d, i) => d && out.set(i, d));
    return { out, rot };
  };
  let { out: drawn, rot } = await drawAll();
  const failing = () => new Map<number, string[]>([...drawn].filter(([, d]) => d.problems.length || !d.built).map(([i, d]) => [i, d.problems.length ? d.problems : ['it could not be drawn']]));
  const retries: LibraryReport['retries'] = [];
  const bad = failing();
  // The repeats only matter when they are the sole problem of a slide that otherwise drew: the retry asks for another layout.
  if (bad.size && calls < 3) {
    for (const [i, why] of bad) retries.push({ slide: i + 1, reasons: why });
    const answer = await ask(buildRetry(first, specs, bad));
    let fix: unknown;
    try {
      fix = JSON.parse(cleanPaste(answer));
    } catch {
      fix = null;
    }
    const slidesObj = isObj(fix) ? fix.slides : null;
    const changed = new Set<number>();
    for (const i of bad.keys()) {
      const raw = Array.isArray(slidesObj) ? slidesObj[i] : isObj(slidesObj) ? slidesObj[String(i + 1)] : null;
      const sp = toSpec(raw);
      if (sp) {
        specs = specs.map((s, k) => (k === i ? { ...sp, cut: sp.cut ?? s.cut } : s));
        changed.add(i);
      }
    }
    // the layouts changed, so the rotation changes: redraw the whole deck (no model call)
    ({ out: drawn, rot } = await drawAll());
  }
  // A closing whose button is still not an action phrase after the retry: the button goes (the closing becomes a statement card with no button): a trim, never a failure.
  {
    const db = dropBadButtons(specs);
    if (db.trims.length) {
      specs = db.specs;
      tr.trims.push(...db.trims);
      ({ out: drawn, rot } = await drawAll());
    }
  }
  // Slides still failing: a plain version of the SAME layout (fields trimmed to their budgets), never the old template look.
  const fallbacks: LibraryReport['fallbacks'] = [];
  const adjustments: string[] = [];
  for (const [i, why] of failing()) {
    const sp = specs[i];
    const reason = why.join(' | ').slice(0, 300);
    let done: Drawn | null = null;
    let level = 'plain version of the same layout';
    const fixed = layoutDef(sp.layout) && !(sp.layout === 'photo-led' && !look.hasPhoto) ? repairFields(sp.layout, fieldsOf(sp)) : null;
    if (fixed) for (const v of [rot.variants[i], (1 - rot.variants[i]) as 0 | 1]) {
      const d = await drawOne({ ...sp, fields: Object.fromEntries(Object.entries(fixed).filter(([k]) => k !== 'accent')) as Fields, density: undefined }, v, style, { handle, index: i, total: specs.length, cut: 'plain', invert: false, density: 'normal' });
      if (d.built) { done = d; break; }
    }
    if (!done) {
      // the fields cannot be repaired for that layout: the plain statement layout with the text that is there
      level = 'plain statement layout (the fields could not be repaired for the chosen layout)';
      const text0 = Object.values(sp.fields).flat().map((x) => String(x).trim()).filter(Boolean)[0] ?? 'Slide ' + (i + 1);
      done = await drawOne({ layout: 'statement', fields: { headline: clip(text0, 60) }, accents: [] }, 0, style, { handle, index: i, total: specs.length, cut: 'plain', invert: false, density: 'normal' });
      specs = specs.map((s, k) => (k === i ? { layout: 'statement', fields: { headline: clip(text0, 60) }, accents: [] } : s));
    } else specs = specs.map((s, k) => (k === i ? { ...s, fields: fixed!, density: undefined } : s));
    fallbacks.push({ slide: i + 1, layout: specs[i].layout, level, reason });
    if (done) drawn.set(i, done);
  }
  for (const d of drawn.values()) adjustments.push(...d.adjustments);
  // the script (the app's own slide types) the editor, the exports and the report use; the slides are drawn from the library
  const raw = { title: parsed.title || 'Carousel', brand: { handle }, slides: specs.map((s) => scriptSlideOf(s.layout, s.fields)) };
  let v = validateScriptText(JSON.stringify(raw), req.format);
  if (!v.script) {
    raw.slides = raw.slides.map((s, i) => (v.errors.some((e) => e.path.startsWith(`slides[${i}]`)) ? { type: 'content', headline: clip(String(s.headline ?? s.quote ?? 'Slide ' + (i + 1)), 90), body: clip(JSON.stringify(specs[i].fields), 250), element_tags: ['idea', 'message'] } : s));
    v = validateScriptText(JSON.stringify(raw), req.format);
  }
  if (!v.script) throw new WriterError('invalid', 'The slides could not be turned into a script.', v.errors);
  const script: CarouselScript = { ...v.script, brand: { ...v.script.brand, handle: handle.trim() || v.script.brand.handle } };
  const designed: Designed = { slides: {}, fallbacks: {}, notes: [], calls, ms, layouts: {}, ...(tokens.input || tokens.output ? { tokens } : {}) };
  specs.forEach((s, i) => {
    const d = drawn.get(i);
    if (!d?.built) return;
    const ds: DesignedSlide = { pack: stubPack(style, 'library'), built: { svg: d.built.svg, layers: d.built.layers as Layer[], bg: d.built.fieldBg ?? style.palette.bg, ...(d.built.devices ? { devices: d.built.devices } : {}), ...(d.built.images ? { images: d.built.images } : {}) } };
    designed.slides[String(i)] = ds;
    designed.layouts![String(i)] = s.layout;
  });
  const seconds = Math.round((performance.now() - t0) / 100) / 10;
  const report: LibraryReport = {
    route: 'library',
    provider: p.id,
    tokenNote: p.id === 'dev-cli' ? 'Provider is dev-cli (the Claude Code command line): these token numbers include its own overhead (system prompt, tools, cache reads), so they are inflated. Use the api provider (a key set on the server) for real numbers.' : 'Real usage reported by the API provider.',
    calls,
    tokens: tokens.input || tokens.output ? tokens : null,
    seconds,
    layouts: specs.map((s) => s.layout),
    variants: rot.variants.map((x) => x + 1),
    cuts: specs.map((_, i) => drawn.get(i)?.cut ?? 'plain'),
    inverts: specs.map((_, i) => (drawn.get(i)?.invert ? (rot.cuts[i]?.invert ?? 'full') : 'none') as string),
    densities: specs.map((_, i) => drawn.get(i)?.density ?? 'normal'),
    suggested,
    retries,
    fallbacks,
    codeAdjustments: adjustments,
    style,
    styleNotes,
    plan: { title: parsed.title || 'Carousel', specs },
    grounds: rot.cuts.map((c) => c.ground ?? null),
    ...(fp ? { flavour: { swaps: fp.swaps, kept: fp.kept } } : {}),
    ...(pictureSwaps.length ? { pictureSwaps } : {}),
    ...(tr.trims.length ? { trims: tr.trims } : {}),
  };
  designed.library = report;
  report.codeAdjustments.unshift(...tr.trims.map((t) => t.to.startsWith('(removed') ? `slide ${t.slide}: ${t.field} "${t.from}" repeats the headline, so the code left it out.` : t.field === 'button' ? `slide ${t.slide}: the button "${t.from}" is not an action phrase (verb first, 2 to 4 words), so the code left it out: ${t.to}.` : `slide ${t.slide}: ${t.field} "${t.from}" is ${t.from.length} characters, over its limit of ${t.max}: trimmed to "${t.to}" at a word boundary by the code (no retry call).`));
  designed.notes.push(...pictureSwaps.map((w) => `Pictures: slide ${w.slide} ${w.from} -> ${w.to} (${w.why})`));
  if (fp) designed.notes.push(...fp.swaps.map((w) => `Flavour: slide ${w.slide} ${w.from} -> ${w.to} (${w.why})${w.droppedOptional.length ? '; leaves out ' + w.droppedOptional.map((t) => '"' + t.slice(0, 24) + '"').join(', ') : ''}.`));
  designed.notes.push(...retries.map((r) => `Retry for slide ${r.slide}: ${r.reasons.join('; ')}`), ...fallbacks.map((f) => `Slide ${f.slide} fell back to a ${f.level}: ${f.reason}`), ...adjustments);
  return { script, style: null, note: parsed.note, attempts: calls > 1 ? 2 : 1, ms, warnings: v.warnings, provider: p.id, designed };
}

/** One slide in a plain version of its own layout (fields trimmed to their budgets), else the plain statement layout. Used when the deck is drawn again. */
async function plainSameLayout(sp: SlideSpec, v: 0 | 1, style: LayoutStyle, o: { handle: string; index: number; total: number }, hasPhoto: boolean): Promise<{ d: Drawn; spec: SlideSpec }> {
  const fixed = layoutDef(sp.layout) && !(sp.layout === 'photo-led' && !hasPhoto) ? repairFields(sp.layout, fieldsOf(sp)) : null;
  if (fixed)
    for (const vv of [v, (1 - v) as 0 | 1]) {
      const spec = { ...sp, fields: Object.fromEntries(Object.entries(fixed).filter(([k]) => k !== 'accent')) as Fields, density: undefined };
      const d = await drawOne(spec, vv, style, { ...o, cut: 'plain', invert: false, density: 'normal' });
      if (d.built) return { d, spec };
    }
  const text0 = Object.values(sp.fields).flat().map((x) => String(x).trim()).filter(Boolean)[0] ?? 'Slide ' + (o.index + 1);
  const spec: SlideSpec = { layout: 'statement', fields: { headline: clip(text0, 60) }, accents: [] };
  return { d: await drawOne(spec, 0, style, { ...o, cut: 'plain', invert: false, density: 'normal' }), spec };
}

/**
 * Draws the deck again from its stored plan with the style as it is NOW (the person's overrides applied): no model call. The variants and the cuts are rotated again, because
 * the style decides whether planes are used.
 */
export async function redrawLibraryDeck(lib: LibraryReport, look: Look, handle: string): Promise<{ slides: Record<string, DesignedSlide>; layouts: Record<string, string>; library: LibraryReport }> {
  if (!lib.plan) throw new Error('This deck has no stored plan to draw again.');
  const { style, notes: styleNotes } = styleFromPack(look.pack);
  let specs = lib.plan.specs;
  const ids = specs.map((s) => (layoutDef(s.layout) ? (s.layout as LayoutId) : ('statement' as LayoutId)));
  const rv = rotateVariants(ids.map((layout) => ({ layout })), { photo: !!look.hasPhoto, flavour: style.flavour });
  const count: Record<string, number> = {};
  const variants = specs.map((s, i) => {
    const same = rv[i].layout === s.layout;
    const c = count[s.layout] ?? 0;
    count[s.layout] = c + 1;
    return same ? rv[i].variant : ((c % 2) as 0 | 1);
  });
  const rc = rotateCuts(ids.map((layout) => ({ layout })), style, { suggest: specs.map((s) => ({ cut: s.cut })) });
  // a slide the person set in the layout picker keeps its variant, cut and invert
  specs.forEach((s, i) => {
    if (s.pin?.variant !== undefined) variants[i] = s.pin.variant;
    if (s.pin?.cut !== undefined) rc[i] = { ...rc[i], cut: s.pin.cut };
    if (s.pin && 'invert' in s.pin) rc[i] = { ...rc[i], invert: s.pin.invert ?? false };
  });
  const slides: Record<string, DesignedSlide> = {};
  const layouts: Record<string, string> = {};
  const drawn: Drawn[] = [];
  const adjustments: string[] = [];
  for (let i = 0; i < specs.length; i++) {
    const o = { handle, index: i, total: specs.length };
    let d = slideProblems(specs[i], look).length ? null : await drawOne(specs[i], variants[i], style, { ...o, cut: rc[i].cut, invert: rc[i].invert, density: specs[i].density ?? 'normal', ground: rc[i].ground });
    if (!d?.built) {
      const f = await plainSameLayout(specs[i], variants[i], style, o, !!look.hasPhoto);
      d = f.d;
      specs = specs.map((s, k) => (k === i ? f.spec : s));
      adjustments.push(`slide ${i + 1}: drawn plain (same layout) after the style changed.`);
    }
    drawn.push(d);
  }
  if (style.devices.planes) await breakPlainRuns(drawn, (i) => specs[i].layout, (i) => specs[i].pin?.cut !== undefined, (i, cut) => drawOne(specs[i], variants[i], style, { handle, index: i, total: specs.length, cut, invert: rc[i].invert, density: specs[i].density ?? 'normal', ground: rc[i].ground }));
  drawn.forEach((d, i) => {
    adjustments.push(...d.adjustments);
    if (d.built) {
      slides[String(i)] = { pack: stubPack(style, 'library'), built: { svg: d.built.svg, layers: d.built.layers as Layer[], bg: d.built.fieldBg ?? style.palette.bg, ...(d.built.devices ? { devices: d.built.devices } : {}), ...(d.built.images ? { images: d.built.images } : {}) } };
      layouts[String(i)] = specs[i].layout;
    }
  });
  const library: LibraryReport = {
    ...lib,
    layouts: specs.map((s) => s.layout),
    variants: variants.map((x) => x + 1),
    cuts: drawn.map((d) => d.cut),
    inverts: drawn.map((d, i) => (d.invert ? (rc[i].invert || 'full') : 'none') as string),
    densities: drawn.map((d) => d.density),
    codeAdjustments: adjustments,
    style,
    styleNotes,
    plan: { ...lib.plan, specs },
    redraws: (lib.redraws ?? 0) + 1,
    grounds: rc.map((c) => c.ground ?? null),
  };
  return { slides, layouts, library };
}
