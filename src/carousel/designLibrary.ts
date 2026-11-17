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
import { sourceBrands } from './layouts/build';
import { isCoverLayout } from './layouts/coverIds';
import { resolveDecoRoles, withoutSwitches } from '../reference/deco';
import { along, faithfulChecks } from '../reference/faithfulChecks';
import { cleanPaste, validateScriptText, SLIDE_RANGE } from './script';
import { WriterError, type GenerateResult, type WriteProvider } from './writer';
import type { WriteRequest } from './writerPrompt';
import { layoutOptionsFor } from './layoutMap';
import { IMAGE_LAYOUT_IDS, hasEnoughPictures, imageSlotsOf, imagesNeeded, isImageKey, picOrientation, pictureLayoutCap } from './layouts/images';
import { pictureUseOf, pinnedPicture, placeImages, usedIds } from './imagePlace';
import { coverKeyOf, styleIdOf, flavourPass, type FlavourKept, type FlavourSwap } from './flavour';
import { settleScrim } from './scrim';
import { measurePhotoContrast, repairSideLabel, type PhotoContrastRole } from './photoContrast';
import { namePass } from './pictureNames';
import { heroPass, picturePass, screenshotPass, separatePictureRuns, type PictureSwap } from './picturePass';
import { isTallShot, shapePass, tallShotTooSmall, type ShapeRow } from './photoShape';
import { rescuePass, type RescueRow } from './pictureRescue';
import { isPhotoOnly } from './layouts/photoOnly';
import { addPhotoSlides, SLIDES_MAX, type PhotoSlideAdded } from './photoSlides';
import type { Picked } from './layouts';
import { TONES } from './writerPrompt';
import { emojiPlaces, emojisOf } from './sourceCheck';
import { inSource, isFunctionWord, labelFromSource, labelIsSourcePhrase, sourceAction } from './closingAction';

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
/**
 * The card colour for a tinted ground, hue-preserving. First the preset's own tinted card colour when the ink reads on it (4.5:1) and it can be seen against every colour of the ground
 * (1.04:1); otherwise the ground's own hue and saturation with the lightness moved 10, 8 or 6% toward the ink, the first step at which the ink reads at 7:1. null when neither exists.
 */
const HSL_TINT = (c: string) => { const [, s, l] = toHsl(c); return s >= 0.12 && l > 0.06 && l < 0.985; };
export function tintedCard(grounds: string[], bg: string, ink: string, own: string, ownTinted: boolean): string | null {
  const seen = (c: string) => grounds.every((g) => contrast(c, g) >= 1.04);
  if (ownTinted && contrast(ink, own) >= 4.5 && seen(own)) return own;
  const [h, s, l] = toHsl(bg);
  const inkDark = contrast(ink, '#FFFFFF') > contrast(ink, '#000000');
  for (const step of [0.1, 0.08, 0.06]) {
    const c = fromHsl(h, s, Math.max(0, Math.min(1, l + (inkDark ? -step : step))));
    if (contrast(ink, c) >= 7 && seen(c)) return c;
  }
  return null;
}
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
  if (!stops && !g.keepBg && contrast(text, bg) < 6) {
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
  // A tinted ground (or a tinted card colour) never gets a neutral grey card: the card keeps the ground's own hue and saturation and only its lightness moves a step toward the ink
  // (6 to 10%), with the ink reading at 7:1 on it; a card that is too close to the ground to tell apart that way is drawn with a hairline (Draw.rect) instead of a darker colour.
  const tinted = (c: string) => { const [, s, l] = toHsl(c); return s >= 0.12 && l > 0.06 && l < 0.985; };
  const hueCard = tinted(bgFinal) || tinted(surface0) ? tintedCard(allFinal, bgFinal, text, surface0, tinted(surface0)) : null;
  // only where the old fallback would have been a neutral grey (a coloured fallback, like the olive card on a lime ground, was never the problem and stays)
  // A lively light ground (yellow, lime, orange) never gets a card made by darkening it: that is a muddy olive or brown. Its card is the ground lightened toward white (a clean pale card, the hairline
  // outline tells it from the ground), the ground's own colour hue kept.
  const [gh, gs, gl] = toHsl(bgFinal);
  const lively = !stops && gs >= 0.35 && gl >= 0.5;
  const lightCard = lively ? [0.1, 0.14, 0.2, 0.28, 0.36, 0.46, 0.58].map((k) => mixHex(bgFinal, '#FFFFFF', k)).find((c) => contrast(text, c) >= 4.5 && allFinal.every((st) => contrast(c, st) >= 1.4)) ?? mixHex(bgFinal, '#FFFFFF', 0.58) : null;
  void gh;
  const oldFallback = lightCard ?? cards[0] ?? bgFinal;
  const surface = cardBad ? (hueCard && toHsl(oldFallback)[1] < 0.2 ? hueCard : oldFallback) : surface0;
  if (cardBad) notes.push(`Ground ${bgFinal}: the card colour ${surface0} is too close to the ground or unreadable under the ink, so cards use ${surface}${hueCard ? ' (the ground\'s own hue' + (allFinal.some((st) => contrast(surface, st) < 1.4) ? ', with a hairline outline' : '') + ')' : ''}.`);
  const mutedMin = Math.max(4.5, Math.min(6, Math.min(...allFinal.map((s) => contrast(text, s))) * 0.7));
  const muted = quietOn(text, [...allFinal, surface], hx(g.muted, mixHex(text, bgFinal, 0.4)), mutedMin);
  const onAccent = readableInk(accent, [hx(g.onAccent, text), text, bgFinal, '#FFFFFF', '#000000']);
  void inkOn;
  return { bg: bgFinal, text, muted, accent, surface, onAccent, ...(g.accent2 && HEX6.test(g.accent2) ? { accent2: g.accent2.toUpperCase() } : {}), ...(g.accent3 && HEX6.test(g.accent3) ? { accent3: g.accent3.toUpperCase() } : {}), ...(stops ? { gradient: { angle: g.gradient!.angle, stops } } : {}) };
}
/**
 * Round G: the style with every ground's ink made readable on its own ground (text 4.5:1 by the better of the ink, white and black, the muted ink and the ink on the accent re-derived),
 * the ground and the accent unchanged. Used by the repair stage for a contrast failure, so the layout stays. null when nothing would change.
 */
export function readableStyle(style: LayoutStyle, grounds: string[] = []): LayoutStyle | null {
  const fix = <G extends { bg: string; text: string; muted: string; accent: string; surface: string; onAccent?: string }>(g: G): G => {
    const text = contrast(g.text, g.bg) >= 4.5 ? g.text : readableInk(g.bg, [g.text, '#FFFFFF', '#000000']);
    if (text === g.text) return g;
    return { ...g, text, muted: quietOn(text, [g.bg, g.surface], mixHex(text, g.bg, 0.4), 4.5), onAccent: readableInk(g.accent, [g.onAccent ?? text, text, g.bg, '#FFFFFF', '#000000']) };
  };
  const palette = fix(style.palette);
  const rhythm = style.rhythm?.map(fix);
  const closing = style.closing ? fix(style.closing) : undefined;
  // a gradient headline: every stop is moved (same hue and saturation, 1% steps, away from the ground's lightness) until it reads 4.5:1 on the ground of the slide
  let deco = style.deco;
  const stops = style.deco?.gradientText;
  if (grounds.length && stops && stops.length >= 2) {
    const moved = readableGradient(stops, grounds, 4.5);
    if (moved.some((c, k) => c !== stops[k])) deco = { ...style.deco!, gradientText: moved };
  }
  const changed = palette !== style.palette || (rhythm ?? []).some((g, k) => g !== style.rhythm![k]) || (closing !== undefined && closing !== style.closing) || deco !== style.deco;
  return changed ? { ...style, palette, ...(rhythm ? { rhythm } : {}), ...(closing ? { closing } : {}), ...(deco ? { deco } : {}) } : null;
}
/**
 * Gradient stops moved (same hue and saturation, 1% steps away from the ground's lightness) until every stop AND every colour between two stops reads `min`:1 on every ground; a gradient between two
 * stops that each read can dip a little under in the middle, so the whole gradient is lifted until its worst point reads.
 */
export function readableGradient(stops: string[], grounds: string[], min = 4.5): string[] {
  const worst = (st: string[]) => Math.min(...along(st).flatMap((c) => grounds.map((g) => contrast(c, g))));
  if (!grounds.length || worst(stops) >= min) return stops;
  const hard = grounds.reduce((w, g) => (Math.max(contrast('#FFFFFF', g), contrast('#000000', g)) < Math.max(contrast('#FFFFFF', w), contrast('#000000', w)) ? g : w), grounds[0]);
  const up = contrast('#FFFFFF', hard) > contrast('#000000', hard);
  const hsl = stops.map(toHsl);
  for (let k = 0; k <= 97; k++) {
    const moved = stops.map((c, i) => {
      if (grounds.every((g) => contrast(c, g) >= min) && k === 0) return c;
      const [h, s, l0] = hsl[i];
      for (let j = Math.max(1, k); j <= 97; j++) {
        const n = fromHsl(h, s, Math.max(0, Math.min(1, l0 + (up ? 1 : -1) * 0.01 * j)));
        if (grounds.every((g) => contrast(n, g) >= min)) return n;
      }
      return up ? '#FFFFFF' : '#000000';
    });
    if (worst(moved) >= min) return moved;
  }
  return stops.map(() => (up ? '#FFFFFF' : '#000000'));
}
/** The flat colours a slide's title sits on: the slide's ground and the flat shapes (a caption panel, a card) under the middle of the title. */
export function groundsUnderTitle(layers: Layer[] | undefined, bg: string): string[] {
  const out = new Set<string>([bg.toUpperCase()]);
  const t = (layers ?? []).find((l) => l.kind === 'text' && (l as { name?: string }).name === 'title');
  if (t) {
    const cx = t.x + t.width / 2, cy = t.y + Math.min(t.height, 120) / 2;
    for (const l of layers!) {
      const fill = (l as { fill?: unknown }).fill;
      if (l.kind === 'shape' && typeof fill === 'string' && /^#[0-9a-f]{6}$/i.test(fill) && l.visible !== false && cx >= l.x && cx <= l.x + l.width && cy >= l.y && cy <= l.y + l.height && l.width * l.height < 1080 * 1350 * 0.98) out.add(fill.toUpperCase());
    }
  }
  return [...out];
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
  const surface = contrast(surface0, bg) < 1.04 ? (HSL_TINT(bg) ? tintedCard([bg], bg, text, surface0, false) : null) ?? mixHex(bg, text, 0.06) : surface0;
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
      base.palette = { bg: grounds[0].bg, text: grounds[0].text, muted: grounds[0].muted, accent: grounds[0].accent, surface: grounds[0].surface, onAccent: grounds[0].onAccent, ...(grounds[0].accent2 ? { accent2: grounds[0].accent2 } : {}), ...(grounds[0].accent3 ? { accent3: grounds[0].accent3 } : {}) };
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
    if (L.coverLayouts) base.coverLayouts = L.coverLayouts as LayoutStyle['coverLayouts'];
    if (L.deco) base.deco = resolveDecoRoles(L.deco, L.roles);
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
  'photo-full-caption': 'a big picture (65% of the slide) with a short headline and one line in a caption panel (1 picture of any shape)',
  'split-half': 'a headline and a short paragraph beside a picture that fills exactly half (1 picture: portrait or tall, left or right; other shapes, top or bottom)',
  'title-over-photo': 'a cover or a big claim set on a picture with a scrim (1 picture of any shape)',
  'twin-photos': 'two pictures with a short caption each, only when the text has the captions (2 pictures)',
  'photo-grid': 'a headline over a grid of 3 or 4 pictures',
  'phone-frame': 'a tall or portrait picture (a screenshot) in a phone outline with a headline and a line beside it (1 tall or portrait picture)',
  'cover-centred': 'a cover (the code chooses it, never you)', 'cover-index': 'a cover (the code chooses it, never you)', 'cover-block': 'a cover (the code chooses it, never you)', 'cover-sticker': 'a cover (the code chooses it, never you)', 'cover-word': 'a cover (the code chooses it, never you)', 'cover-ruled': 'a cover (the code chooses it, never you)',
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
  'list-under-band': 'a title and 2 to 5 short items under a supplied picture band (not offered to the writer: the picker and the picture pass use it)',
  'list-beside-picture': 'a title and 2 to 5 short items beside a supplied tall picture (not offered to the writer: the picker and the picture pass use it)',
  'cover-art': 'a hook with one big supplied picture (round or wide)',
  'photo-cover': 'a hook, an intro line and one wide supplied photo',
  'portrait-closing': 'a closing with a supplied portrait of a person: a band title, a heading, paragraphs and a link',
  'art-side-text': 'a heading and a short paragraph beside a supplied picture, with a hand-drawn arrow',
  'do-dont': 'a numbered do and do-not pair: what is wrong and what is right (text on each side; a supplied picture for each side is optional)',
  // Round R: picture-only slides the code adds (never offered to the writer)
  'photo-full': 'one photo, no text (added by the code)',
  'photo-pair': 'two photos, no text (added by the code)',
  'photo-quad': 'three or four photos, no text (added by the code)',
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
  author: 'only when the text names who said it (a person or a source); otherwise leave the field out. Never write a label such as "The text"',
  callouts: 'exactly 3',
};
/** Layouts only the code uses (the picture pass and the picker): the writer's menu and notes never list them, so the writer prompt is unchanged. */
export const WRITER_HIDDEN: readonly string[] = ['list-under-band', 'list-beside-picture'];
/** The six picture layouts of Round 9, as the writer is told about them (count and shape only). */
const NEW_PICTURE_NOTES: [string, string][] = [
  ['photo-full-caption', '1 picture of any shape, 65% of the slide with a caption panel'],
  ['split-half', '1 picture: a portrait or tall one fills a left or right half, any other a top or bottom half'],
  ['title-over-photo', '1 picture of any shape, the headline set on it'],
  ['twin-photos', '2 pictures, short captions only when the text has them'],
  ['photo-grid', '3 or 4 pictures under a headline'],
  ['phone-frame', '1 tall or portrait screenshot in a phone outline'],
];
/** The writer's picture rules: metadata only (id, orientation, shape, pixel size), never pixels. */
export function imageRules(images: { id: string; width: number; height: number; content?: 'screenshot' | 'photo'; label?: string }[], slides = 7): string[] {
  const ratio = (p: { width: number; height: number }) => (p.width >= p.height ? `${(p.width / p.height).toFixed(2)}:1` : `1:${(p.height / p.width).toFixed(2)}`);
  const list = images.map((p, i) => `image ${i + 1}: ${picOrientation(p)}, ${ratio(p)}, ${p.width}x${p.height} px${p.content === 'screenshot' ? ', SCREENSHOT' : ''}${p.label?.trim() ? `, named "${p.label.trim().replace(/"/g, "'").slice(0, 40)}"` : ''}`);
  const nl = (IMAGE_LAYOUT_IDS as readonly string[]).filter((id) => hasEnoughPictures(id, images));
  return [
    `- Pictures available (metadata only, you never see them and never write a picture field): ${list.join('; ')}.`,
    ...(images.some((p) => p.content === 'screenshot') ? ['- A picture marked SCREENSHOT never goes under text: never "title-over-photo", and it is never the cover of the deck. Use it in "phone-frame" (a tall one), "split-half", "photo-full-caption", "twin-photos", "photo-grid" or beside the text of a card.'] : []),
    `- PICTURE SLIDES: use at least ${Math.max(1, Math.min(images.length, Math.floor(slides / 2)))} picture slide${Math.max(1, Math.min(images.length, Math.floor(slides / 2))) === 1 ? '' : 's'} (the smaller of the number of pictures and half the slides), a DIFFERENT picture layout each time, never the same one on two slides in a row. Match the picture's shape: a portrait or tall picture (a phone screenshot) takes a split layout ("headline-body-image", "photo-cover", "art-side-text" or "cover-art" set it beside the text); a landscape or wide picture takes a full-width layout ("photo-cover", "headline-body-image" or the wide "cover-art"); a square picture takes "cover-art" (a circle) or a card layout. If there are no more pictures than slides, use every picture exactly once.`,
    `- Picture layouts for these pictures (the code places them; you see only counts and shapes): ${NEW_PICTURE_NOTES.filter(([id]) => nl.includes(id)).map(([id, note]) => `"${id}" (${note})`).join('; ')}. Use them where they suit the slide, a different one each time.`,
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

/**
 * Round M part 3: ask the writer to keep EVERY sentence of the person's text (the writer used to drop whole sentences to fit a fixed slide count, and nothing told the person).
 * Round O: it is the person's switch ("Keep every sentence of my text", on by default, WriteRequest.keepEverySentence). On: the picked count N is the target and the deck may grow to N + 2
 * (never past the app's 10) only so no sentence is lost. Off: exactly N slides; whole sentences from the middle may be left out, never the opening hook or the closing line.
 */
export const KEEP_EVERY_SENTENCE = true;
/** Round N: the photo shape rule (photoShape.ts) is on. A switch the before/after comparison turns off; the app never does. */
export const photoShapeRule = { on: true };
/** Round O: the final placement measures each slide as drawn and moves a tall screenshot drawn under 22% of the width (on; the before/after comparison turns it off, the app never does). */
export const placementCheck = { on: true };
/** Round Q: the rescue pass for unused pictures (pictureRescue.ts) is on. A switch the before/after comparison turns off; the app never does. */
export const pictureRescueRule = { on: true };
/** Round R: photo slides for the photos still unused when the writer made fewer slides than were asked for (photoSlides.ts). A switch the before/after comparison turns off; the app never does. */
export const photoSlidesRule = { on: true };
/** Round O: with "Keep every sentence" on, at most this many slides more than the person picked (never past the app's maximum). */
export const KEEP_EVERY_SENTENCE_EXTRA = 2;
/** The most slides the writer may write for a request of `n` slides. */
export const mostSlidesFor = (n: number, keep: boolean, max: number = SLIDE_RANGE.carousel[1]): number => (keep ? Math.max(n, Math.min(n + KEEP_EVERY_SENTENCE_EXTRA, SLIDE_RANGE.carousel[1], max)) : n);
export function buildLibraryPrompt(req: WriteRequest, look: Look, style: LayoutStyle, brief: string, n: number, handle?: string): string {
  const carousel = req.format === 'carousel';
  const keep = KEEP_EVERY_SENTENCE && carousel && req.keepEverySentence !== false;
  const exact = carousel && req.keepEverySentence === false;
  // (Round Q: never past the chosen platform's limit)
  const most = mostSlidesFor(n, keep, req.slidesMax);
  const tone = TONES.find((t) => t.id === req.tone)!;
  // photo-led needs a photo; a layout with picture slots needs enough pictures that fit its slots (the metadata list below); without a list, any photo will do
  const ids = LAYOUT_IDS.filter((id) => !isCoverLayout(id)).filter((id) => !WRITER_HIDDEN.includes(id)).filter((id) => (id === 'photo-led' ? !!look.hasPhoto : (IMAGE_LAYOUT_IDS as readonly string[]).includes(id) ? (look.images ? hasEnoughPictures(id, look.images) : !!look.hasPhoto) : true));
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
    `- Write ${exact ? `exactly ${n}` : n} slides${keep && most > n ? `; when the person's text needs more room to keep every sentence, use up to ${most} slides (never more than ${most})` : ''}. Slide 1 is a strong hook (statement, statement-stacked, statement-card, statement-pill, statement-question, big-question or lead-statement; at most 8 words). In between choose the layout that suits THAT slide's content.`,
    '- The closing (last slide) depends on the TEXT, not on habit. If the text contains a real next action for the reader (book, buy, sign up, download, visit, reply, join): "cta-button" with that action; "cta-pair" when it gives TWO different actions; "contact-closing" when the text itself contains contact details such as a handle, site, phone or email (never invent any).',
    '- A real action also includes: comment (a quoted or capitalised keyword too), DM or message me, reply, send me, link in bio or below, subscribe, follow, save, share, click, tap, try it. The button label uses the action\'s own words from the text ("Comment brain", "DM me GUIDE", "Download the guide"), at most 24 characters. The line under the closing headline ("sub") may only use words that are in the text; when it would need other words, leave the sub line out. Never invent an offer, link, number or promise.',
    // Round R: an emoji is the person's words; a button label only uses the person's words, and a text that asks for nothing gets no button (no generic "Follow for more")
    "- Keep every emoji of the text where it stands (right after the same words): an emoji is part of the person's words.",
    `- If the text has NO real action, the closing has NO button: use "statement" or "statement-card" with a real takeaway sentence from the text as its headline, never "Thanks for reading" or other filler. Never invent a call to action ("Follow for more", "Save this for later", "Send this to a friend" ...), a link, "link in bio", website, email, offer, number${isSetHandle(handle) ? '' : ' or handle'}.`,
    '- Every button label is an ACTION PHRASE made ONLY of words from the text: verb first, 2 to 4 words, at most 20 characters, no question mark, comma or full stop ("Book a call", "Get the checklist", "Join the list"). Never a question, a slogan or a topic ("Which fits you?", "Sleep well").',
    '- Prose: "prose" is the ONLY layout that takes whole paragraphs. Aim for 35 to 50 words in all (the heading and the pull line included); use up to 70 only when the source text truly needs it. 70 is a hard limit (the handle and the page number are not counted; 300 characters per paragraph at most), and the code cuts anything past it. Prefer ONE short paragraph plus a bold one-line takeaway (the "pull" field) to three paragraphs. Use prose for a slide that needs explaining in sentences; its heading is optional and, when present, reads on its own as a full title. Every other layout stays short: never put a paragraph into a statement, list or card layout.',
    '- Long passages: if the text for ONE slide would run past 70 words, split it across two slides, a prose slide and then a statement, bullet-list or numbered-list slide for the rest, instead of cramming it into one. ' + (keep ? `You may add a slide for it, up to ${most} slides in all; never cut a sentence to save a slide.` : exact ? `The number of slides is exactly ${n}: when every slide is needed, tighten the prose to 70 words or fewer, or leave out a whole sentence from the middle of the text (see "Exactly ${n} slides").` : 'The number of slides is fixed (see above): split only when another slide of your plan can be spared for it (a slide that would only repeat or pad); when every slide is needed, tighten the prose to 70 words or fewer instead.'),
    ...(look.images?.length ? imageRules(look.images, n) : []),
    ...(look.images?.some((p) => p.label?.trim()) ? ['- If a picture has a name, put it on the slide whose words it matches best: give that slide "picture": the number of that picture (for example "picture": 2). Use each named picture at most once. A picture without a name is placed by shape as before (leave "picture" out). Never add words to a slide because of a picture name.'] : []),
    '- Forms: "statement-stacked" is 2 to 4 words (one per line); "statement-pill" needs a short caption (at most 40 characters) that is set in a pill; "statement-question" is one question or thought; "numbered-stagger" is 2 or 3 sentences; "bullet-list" and "pill-stagger" are short lines (at most 46 and 36 characters); "headline-card" has ONE key paragraph (the card) under a headline; "cta-pair" has two buttons with a short line each.',
    '- Use "step-numeral" only when at least two slides in the deck are steps of one sequence (step 1, step 2 ...); with a single step, use "split-text" or "statement" instead.',
    '- Variety: no two consecutive slides use the same layout, and no layout is used more than twice. Use "stepper" for 2 to 5 ordered steps, "stat-bar" or "big-stat" for a figure, "checklist" for benefits, "comparison" for two things set against each other, "quote" only for words that are in the text.',
    '- Stats: the "label" of big-stat and stat-bar is the continuation of the number, so "number label" reads as one phrase: "30%" + "off for early backers" (never a label that starts a new sentence, such as "Early backers save" under a 30%). split-text: the paragraph is ONE idea in at most 14 words.',
    '- A kicker is only allowed if that exact phrase is in the person\'s text; otherwise omit it. Headlines must be words from the person\'s text in their order; you may drop words but not add or reorder them.',
    keep ? '- Keep every sentence: EVERY sentence of the person\'s text must appear on a slide. Never drop a sentence. You may shorten a sentence only by dropping whole trailing clauses (the words after a comma, "and", "but" or "which" at its end), never its opening words (the hook). A sentence too long for one layout goes on a prose slide, or on a slide of its own, not out of the deck.' : '',
    exact ? `- Exactly ${n} slides: the person asked for exactly ${n} slides, never more. When the text does not fit, leave out whole sentences from the MIDDLE of the text (the ones the point needs least); never leave out the opening hook (the first sentence) or the closing line (the last sentence), and never cut words inside a sentence you keep to make room.` : '',
    '- Wording: the person\'s own sentences are the copy. A sentence that already fits its layout is used word for word (same words, same order); shorten only what is over a limit, by cutting words, never by rewording; never add a word, claim or example that is not in the text.',
    '- Facts: use only facts, claims and numbers that are in the text. Never invent statistics, names, quotes, dates or results. If a slide would want a figure the text does not give, use a layout without one. A big-stat or stat-bar number must be a real figure from the text.',
    `- "accents": up to 3 phrases copied EXACTLY from the slide's HEADLINE (its headline, title, question or quote text) and from nothing else: never from the kicker, a caption, a sub line, the body or a list item. They are the words that carry the meaning (never filler such as the, a, and, of, to). Highlight 1 or 2 words, the ones that carry the point (never more than half of the headline). The code sets them in the accent colour or on a marker bar.`,
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
  /** A slide of the person's own script whose text is longer than the layout can show: its words are kept exactly as written and the code never trims them (it is drawn with the style's template until the text is shortened). */
  keepAsWritten?: boolean;
  /** What the person chose for this slide in the layout picker: the deck rotation and the style toggles keep it. */
  pin?: { variant?: 0 | 1; cut?: Cut; invert?: false | 'full' | 'tint'; /** The picture picker: "none", or the id of the picture the person chose (their choice is never moved or removed). */ picture?: string; /** The slide as the deck's own placement made it, kept while a picture is pinned so "Auto" can bring it back. */ auto?: { layout: string; fields: Fields; accents: string[] }; /** Round N: the person chose this slide's layout in the Layout tab: no automatic rule moves it. */ layout?: true };
  /** A text slide the code turned into a picture layout because a picture was left unused: the pictures the writer's own picture layouts need are placed first. */
  pictureUpgrade?: boolean;
  /** Round 18: the writer's suggestion for a NAMED picture (its number, 1-based). The code keeps it only when the layout rules allow it. */
  hint?: number;
  /** Round 18: the id of the NAMED picture the code put on this slide by its name; the placement leaves the slide alone (the person's own pick is `pin.picture`, which wins). */
  named?: string;
  /** Round N: the id of the photo the shape rule kept on this slide when it moved the slide to a layout that shows the photo larger; the placement leaves it there. */
  shaped?: string;
  /** Round O: the final placement drew a tall screenshot under 22% of the width on this slide: the slide takes no tall screenshot (other pictures still may go here). */
  refuseTall?: true;
  /** Round R: a picture-only slide the code added for photos no slide used (photoSlides.ts): no text field. */
  photoSlide?: true;
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
    ...(Number.isInteger(Number(raw.picture)) && Number(raw.picture) >= 1 && Number(raw.picture) <= 12 && raw.picture !== null && raw.picture !== '' ? { hint: Number(raw.picture) } : {}),
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
/**
 * Round M: a line repeats the headline only when it ADDS nothing: at least 80% of its meaning words (small words like "they", "have", "a" left out, plurals and -ing / -ed folded) are already
 * in the headline. The old rule (60% of the shorter one's words, small words counted) took out real sentences: "They have a time problem." under "Most creators don't have a design problem."
 * shares only "have a ... problem", and "Back it today, early backers save" under "Back it today" adds "early backers save". A line that adds a word of its own stays.
 */
const REPEAT_STOP = new Set(['a', 'an', 'the', 'it', 'its', "it's", 'is', 'are', 'was', 'be', 'to', 'of', 'and', 'or', 'but', 'for', 'in', 'on', 'at', 'this', 'that', 'these', 'those', 'they', 'them', 'their', 'you', 'your', "you're", 'we', 'our', 'i', 'my', 'me', 'he', 'she', 'have', 'has', 'had', 'do', 'does', "don't", "doesn't", 'not', 'no', 'so', 'with', 'as', 'by', 'from', 'just', 'will', 'can', 'all', 'more', 'than', 'there', 'here', 'what', 'who', 'how']);
const stemWord = (w: string): string => (w.length > 5 && w.endsWith('ing') ? w.slice(0, -3) : w.length > 4 && w.endsWith('ed') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
export function repeatsHeadline(line: string, headline: string): boolean {
  const a = wordsOf(line), b = wordsOf(headline);
  if (!a.length) return false;
  if (a.join(' ') === b.join(' ')) return true;
  const mean = (ws: string[]) => ws.filter((w) => !REPEAT_STOP.has(w)).map(stemWord);
  const la = mean(a), hb = new Set(mean(b));
  if (!la.length) return a.every((w) => b.includes(w));
  return la.filter((w) => hb.has(w)).length / la.length >= 0.8;
}
const HEAD_FIELDS = ['headline', 'title', 'question', 'heading'];
const LINE_FIELDS = ['caption', 'sub', 'subline', 'line', 'subtitle', 'kicker'];
/**
 * A pill, caption or sub that only says the headline again is taken out (a trim, never a failure): the optional line goes; a statement-pill (whose caption is required) becomes a plain
 * statement without it. Returns the new specs and a log of what was done.
 */
/** A prose slide holds at most this many words of slide text in all (heading, paragraphs, bullets and pull line; not the handle or the page number): the app's phone check holds a prose slide to 70 (every other content slide to 50). */
export const PROSE_WORDS = 70;
const wordsIn = (t: unknown) => String(t ?? '').split(/\s+/).filter(Boolean).length;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
/** Sentences of a paragraph, each kept with its end mark. */
const sentencesOf = (t: string) => t.match(/[^.!?]+[.!?]*\s*/g)?.map((x) => x.trim()).filter(Boolean) ?? [t];
/**
 * A prose slide over PROSE_WORDS words is trimmed by the code (a trim, never a retry): bullets go from the end, then the third and the second paragraph lose their last sentences (or go),
 * then the first loses its last sentences; the heading and the pull line stay. A single sentence still too long is cut at a word and closed with a full stop.
 */
export function trimProse(specs: SlideSpec[]): { specs: SlideSpec[]; trims: Trim[] } {
  const trims: Trim[] = [];
  const out = specs.map((s, i) => {
    if (s.layout !== 'prose') return s;
    const f: Record<string, unknown> = { ...s.fields };
    const total = () => wordsIn(f.heading) + wordsIn(f.p1) + wordsIn(f.p2) + wordsIn(f.p3) + wordsIn(f.pull) + (Array.isArray(f.bullets) ? (f.bullets as string[]).reduce((n, b) => n + wordsIn(b), 0) : 0);
    const before = total();
    if (before <= PROSE_WORDS) return s;
    const shorten = (k: 'p3' | 'p2' | 'p1') => {
      const t = String(f[k] ?? '').trim();
      if (!t) return false;
      const ss = sentencesOf(t);
      if (ss.length > 1) { f[k] = ss.slice(0, -1).join(' '); return true; }
      if (k !== 'p1') { delete f[k]; return true; }
      const w = t.split(/\s+/);
      if (w.length <= 6) return false;
      f[k] = w.slice(0, Math.max(6, w.length - Math.max(1, total() - PROSE_WORDS))).join(' ').replace(/[,;:\s]+$/, '') + '.';
      return true;
    };
    for (let guard = 0; guard < 40 && total() > PROSE_WORDS; guard++) {
      if (Array.isArray(f.bullets) && (f.bullets as string[]).length) { const b = (f.bullets as string[]).slice(0, -1); if (b.length >= 2) f.bullets = b; else delete f.bullets; continue; }
      if (shorten('p3') || shorten('p2') || shorten('p1')) continue;
      break;
    }
    trims.push({ slide: i + 1, field: 'prose words', from: String(before), to: String(total()), max: PROSE_WORDS });
    return { ...s, fields: f as Fields };
  });
  return { specs: out, trims };
}
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
// ----- the closing call to action -----
/** The three generic closing calls to action, for a text with no real action of its own. Not subject to the 4 word / 20 character limit of other labels ("Send this to a friend" is 5 words). */
export const GENERIC_CTAS = ['Save this for later', 'Follow for more', 'Send this to a friend'] as const;
export type CtaKind = 'save' | 'follow' | 'friend';
export const GENERIC_CTA_OF: Record<CtaKind, (typeof GENERIC_CTAS)[number]> = { save: 'Save this for later', follow: 'Follow for more', friend: 'Send this to a friend' };
/** What the button check needs to know: the profile handle (when one is set) and the person's text (links, handles and numbers in a label must come from it). */
export interface CtaCtx { handle?: string; text?: string }
/** A handle that is really set (the default placeholder is not). */
export const isSetHandle = (h?: string): boolean => !!h && /^@[\w.]{2,30}$/.test(h.trim()) && h.trim().toLowerCase() !== '@yourname';
/** The generic labels allowed for this profile: the three, and "Follow @handle" when the handle is set. */
export const genericLabels = (handle?: string): string[] => [...GENERIC_CTAS, ...(isSetHandle(handle) ? [`Follow ${handle!.trim()}`] : [])];
export const isGenericCta = (label: string, handle?: string): boolean => genericLabels(handle).some((g) => g.toLowerCase() === label.trim().toLowerCase());
/** Whether the text holds a real next action for the reader (book, buy, sign up, download, visit, reply, join ...) or contact details (a link, an email, a phone number, a handle). */
export function textHasAction(text: string): boolean {
  const t = text;
  if (/[\w.+-]+@[\w-]+\.[\w.]{2,}/.test(t)) return true; // an email
  if (/(?:\+?\d[\d\s().-]{7,}\d)/.test(t) && /(?:\+\d|\(\d{2,4}\)|\d{3}[\s.-]\d{3,4}[\s.-]\d{3,4})/.test(t)) return true; // a phone number
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|io|co|net|org|app|me|ai|dev|xyz)\b/i.test(t)) return true; // a link or a site
  if (/(?:^|\s)@[\w.]{2,}/.test(t)) return true; // a handle
  if (/\b(?:sign ?up|subscribe|download|register|pre-?order|rsvp|link in bio|dm me|message me|email me|call me|text me)\b/i.test(t)) return true;
  if (/\b(?:book|reserve|schedule) (?:a|an|your|the|now|today|me|us|it)\b/i.test(t)) return true;
  if (/\b(?:buy|order|get|grab|claim|try|join|visit|shop|back|pledge|donate|follow|reply|comment)\b[^.!?\n]{0,40}\b(?:now|today|here|below|free|link|waitlist|newsletter|checklist|course|store|offer|list|us|me)\b/i.test(t)) return true;
  // an action the person asks for in words: comment (a quoted or capitalised keyword too), DM me, reply, send me, link in bio, sign up, subscribe, save, share, download, book a call, join, click, tap, try it ...
  if (sourceAction(t)) return true;
  return false;
}
/** Which generic label fits the content: how-to, list, tips or steps save; relatable or funny posts are sent to a friend; opinion, story, critique and insight follow. */
export function genericKindOf(text: string): CtaKind {
  if (/\b(?:how to|tips?|ways to|checklist|step by step|steps to|(?:three|four|five|six|seven|\d+) steps|here is how|here's how|cheat ?sheet)\b/i.test(text)) return 'save';
  if (/\b(?:we'?ve all|everyone has|relatable|ever (?:feel|notice)|funny|lol|that moment when|every monday)\b/i.test(text)) return 'friend';
  return 'follow';
}
const CLOSING_FILLER = /^(?:thanks?(?: you)?(?: for (?:reading|watching|stopping by))?|thank you|the end|that'?s all|see you|bye)\W*$/i;
/**
 * Round R: the closing rule for a text with NO real action: the last slide has no button (a plain statement or a statement card with a real takeaway sentence from the text). A button there is a
 * miss, and so is filler as a headline. A text with a real action (or contact details) is not checked here. Returns the reasons (empty when fine).
 */
export function closingProblems(s: SlideSpec, text: string, _handle?: string): string[] {
  if (textHasAction(text)) return [];
  const out: string[] = [];
  const labels = BUTTON_FIELDS.map((k) => String(s.fields[k] ?? '').trim()).filter(Boolean);
  if (labels.length) out.push(`closing: the text asks the reader for no action, so the closing has no button (it is "${labels.join('" / "')}"): use a statement or a statement card with a takeaway sentence from the text`);
  if (CLOSING_FILLER.test(String(s.fields.headline ?? '').trim())) out.push('closing: the headline must be a real takeaway sentence from the text, not "Thanks for reading"');
  return out;
}
const closingWords = (t: string) => t.toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) ?? [];
/** Round R: a button label made of the person's own words: every word is in the text (small function words allowed) and at least one is not a function word. */
export const labelOwnWords = (label: string, text: string): boolean => labelFromSource(label, text) && closingWords(label).some((w) => !isFunctionWord(w));
/**
 * Round R: an emoji of the person's text that the writer left out is put back on the slide that has the words it followed ("Punit Chawla 😂"), right after them, when the field still fits its
 * budget. Pure code: no word changes; an emoji that finds no place stays out and the sentences notice lists it (sourceCheck.emojis).
 */
export function restoreEmojis(specs: SlideSpec[], text: string): { specs: SlideSpec[]; trims: Trim[] } {
  const trims: Trim[] = [];
  let out = specs;
  const fieldTexts = () => out.flatMap((s) => Object.entries(s.fields).filter(([k]) => !/^image\d?$/.test(k)).flatMap(([, v]) => (Array.isArray(v) ? v : [v])).map(String));
  const shown = fieldTexts().flatMap(emojisOf);
  for (const e of emojiPlaces(text)) {
    const k0 = shown.indexOf(e.emoji);
    if (k0 >= 0) { shown.splice(k0, 1); continue; }
    const words = e.after.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    // the field whose text holds those words in order: the emoji goes right after the last of them
    const pat = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^\\p{L}\\p{N}]+') + '(?![\\p{L}\\p{N}])', 'iu');
    let done = false;
    out = out.map((s, i) => {
      if (done) return s;
      for (const [key, v] of Object.entries(s.fields)) {
        if (typeof v !== 'string' || /^image\d?$/.test(key)) continue;
        const m = pat.exec(v);
        if (!m) continue;
        const at = m.index + m[0].length;
        const next = v.slice(0, at) + ' ' + e.emoji + v.slice(at);
        const fields = { ...s.fields, [key]: next } as Fields;
        if (layoutDef(s.layout) && !validateSlideContent(s.layout, fields).ok) continue;
        done = true;
        trims.push({ slide: i + 1, field: 'emoji', from: e.emoji, to: next, max: 0 });
        return { ...s, fields };
      }
      return s;
    });
  }
  return { specs: out, trims };
}
/**
 * Round R: the code's check after the writer: a button label may only use words from the person's text, and a text that asks for no action has no button at all. A slide whose button breaks
 * this loses it: a contact closing keeps its contacts; a cta-button or cta-pair becomes its no-button sibling, a statement card (the headline, the line under it as the caption), else a
 * statement, else the prose layout, whichever keeps EVERY word of the slide (a label that is not the person's is not their word). No model call; each change is logged.
 */
export function dropInventedButtons(specs: SlideSpec[], text: string): { specs: SlideSpec[]; trims: Trim[] } {
  const action = textHasAction(text);
  const trims: Trim[] = [];
  const out = specs.map((s, i) => {
    const keys = BUTTON_FIELDS.filter((k) => typeof s.fields[k] === 'string' && (s.fields[k] as string).trim());
    const bad = keys.filter((k) => !action || !labelOwnWords(String(s.fields[k]), text));
    if (!bad.length) return s;
    const labels = bad.map((k) => String(s.fields[k]).trim()).join(' / ');
    const why = action ? 'the label uses words that are not in the text' : 'the text asks for no action';
    // the text asks for an action: a closing button takes that action's own words instead (the settled closing of the source)
    const act = action && s.layout === 'cta-button' ? sourceAction(text) : null;
    if (act && labelOwnWords(act.label, text)) {
      trims.push({ slide: i + 1, field: 'closing cta', from: labels, to: act.label, max: 0 });
      return { ...s, fields: { ...s.fields, button: act.label } as Fields };
    }
    if (s.layout === 'contact-closing') {
      trims.push({ slide: i + 1, field: 'invented button', from: labels, to: `${why}; the contacts stay`, max: 0 });
      return { ...s, fields: Object.fromEntries(Object.entries(s.fields).filter(([k]) => !bad.includes(k))) as Fields };
    }
    // a line under the headline the writer made up (its words are not in the text) is not carried over: the sub-line rule of the closing
    const LINES = ['sub', 'line', 'line1', 'line2', 'caption'];
    const made = LINES.filter((k) => typeof s.fields[k] === 'string' && (s.fields[k] as string).trim() && !inSource(s.fields[k] as string, text));
    for (const k of made) trims.push({ slide: i + 1, field: 'closing sub line', from: String(s.fields[k]), to: '(not in the text)', max: 0 });
    const kept = Object.fromEntries(Object.entries(s.fields).filter(([k]) => !BUTTON_FIELDS.includes(k) && k !== 'link' && !made.includes(k))) as Fields;
    const head = String(kept.headline ?? '').trim();
    const cap = LINES.map((k) => String(kept[k] ?? '').trim()).filter(Boolean).join(' ');
    const tries: [string, Fields | null][] = [
      ['statement-card', head ? ({ headline: head, ...(cap ? { caption: cap } : {}) } as Fields) : null],
      ['statement', head ? ({ headline: head, ...(cap ? { caption: cap } : {}) } as Fields) : null],
      ['prose', proseFieldsOf(kept)],
    ];
    for (const [layout, fields] of tries) {
      if (!fields || !validateSlideContent(layout, fields).ok || !keepsAllWords(kept, fields)) continue;
      trims.push({ slide: i + 1, field: 'invented button', from: labels, to: `${why}; the closing is "${layout}" with every other word`, max: 0 });
      return { layout, fields, accents: s.accents } as SlideSpec;
    }
    return s;
  });
  return { specs: out, trims };
}
/** The closing fields that carry a line under the headline. */
const SUB_FIELDS: Record<string, string[]> = { 'cta-button': ['sub'], 'contact-closing': ['line'], 'cta-pair': ['line1', 'line2'] };
/**
 * The closing, settled against the SOURCE text (after the writer, the retry and the generic rule):
 *  - a text that asks for a real action ("Comment "brain""): a cta-button whose label is not that action, or is only a generic label, takes the label built from the action's own words; a label that is
 *    already a real action from the text is kept as it is;
 *  - a line under the headline (sub line) may only use words that are in the text (small function words allowed), otherwise it is dropped: an offer, link, number or promise is never invented.
 */
export function settleClosing(specs: SlideSpec[], text: string): { specs: SlideSpec[]; trims: Trim[] } {
  const i = specs.length - 1;
  if (i < 1) return { specs, trims: [] };
  let s = specs[i];
  const trims: Trim[] = [];
  const act = sourceAction(text);
  if (act && s.layout === 'cta-button') {
    const label = String(s.fields.button ?? '').trim();
    const real = !!label && !isGenericCta(label, undefined) && (labelIsSourcePhrase(label, text) || (!buttonProblem(label, { text }) && labelFromSource(label, text)));
    if (!real) {
      s = { ...s, fields: { ...s.fields, button: act.label } as Fields };
      trims.push({ slide: i + 1, field: 'closing cta', from: label, to: act.label, max: 0 });
    }
  }
  for (const k of SUB_FIELDS[s.layout] ?? []) {
    let v = s.fields[k];
    // the rest of a sentence the button took ("Comment slides" + "and I'll send you the link."): the leading "and" goes and the next letter is capital. Nothing else changes.
    if (typeof v === 'string' && /^and\s+\S/i.test(v.trim())) {
      const rest = v.trim().replace(/^and\s+/i, '');
      const fixed = rest.charAt(0).toUpperCase() + rest.slice(1);
      s = { ...s, fields: { ...s.fields, [k]: fixed } as Fields };
      trims.push({ slide: i + 1, field: 'closing sub line start', from: v, to: fixed, max: 0 });
      v = fixed;
    }
    if (typeof v !== 'string' || !v.trim() || inSource(v, text)) continue;
    s = { ...s, fields: Object.fromEntries(Object.entries(s.fields).filter(([n]) => n !== k)) as Fields };
    trims.push({ slide: i + 1, field: 'closing sub line', from: v, to: '(not in the text)', max: 0 });
  }
  return trims.length ? { specs: specs.map((x, k) => (k === i ? s : x)), trims } : { specs, trims };
}
/**
 * "step-numeral" is for two or more steps of one sequence. A deck with exactly ONE step-numeral slide has no sequence: that slide becomes "split-text" with the same words (the step's title as the
 * headline, its body as the paragraph; the step number is a counter, not a word). It stays as it is when the words would not fit split-text.
 */
export function swapLoneStep(specs: SlideSpec[]): { specs: SlideSpec[]; trims: Trim[] } {
  const at = specs.flatMap((s, i) => (s.layout === 'step-numeral' ? [i] : []));
  if (at.length !== 1) return { specs, trims: [] };
  const i = at[0];
  const s = specs[i];
  const title = String(s.fields.title ?? '').trim();
  const body = String(s.fields.body ?? '').trim();
  if (!title) return { specs, trims: [] };
  const fields = { headline: title, ...(body ? { paragraph: body } : {}) } as Fields;
  if (validateSlideContent('split-text', { ...fields, ...(s.accents.length ? { accent: s.accents } : {}) }).errors.length) return { specs, trims: [] };
  const next: SlideSpec = { ...s, layout: 'split-text', fields };
  return { specs: specs.map((x, k) => (k === i ? next : x)), trims: [{ slide: i + 1, field: 'step swap', from: 'step-numeral', to: 'split-text', max: 0 }] };
}
const HIGHLIGHT_HEAD = ['headline', 'title', 'question', 'quote', 'heading', 'lead', 'statement'];
/**
 * A highlight carries the point, so it is short: at most 2 words (3 when the headline has 8 or more words), and never more than half of the headline's words. A longer one the writer gave keeps
 * its LAST words ("keeps things running" in "Your brain keeps things running" becomes "things running"). Only for a written deck: a highlight the person typed is never changed.
 */
/** An accent is a phrase of the slide's HEADLINE (headline, title, question, quote, heading, lead or statement). One that is not inside it is dropped: the second value says which, for the report. */
export function dropForeignAccents(specs: SlideSpec[]): { specs: SlideSpec[]; notes: string[] } {
  const norm = (t: string) => ' ' + t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
  const notes: string[] = [];
  const out = specs.map((sp, i) => {
    if (!sp.accents.length) return sp;
    const heads = HIGHLIGHT_HEAD.map((k) => sp.fields[k]).filter((v): v is string => typeof v === 'string' && !!v.trim()).map(norm);
    // Round B: a phrase the writer gave with a leading article ("the hoodie" for the headline "Flip your hoodie") is the phrase without it, as the library has always set accents; it is not dropped
    const inHead = (p: string) => heads.some((h) => h.includes(norm(p)));
    const keep = sp.accents.flatMap((a) => {
      if (inHead(a)) return [a];
      const bare = a.trim().replace(/^(the|a|an)\s+/i, '');
      if (bare !== a.trim() && bare && inHead(bare)) {
        notes.push(`slide ${i + 1}: accent "${a}" is "${bare}" (a leading article is left out)`);
        return [bare];
      }
      notes.push(`slide ${i + 1}: accent "${a}" is not in the headline, not drawn`);
      return [];
    });
    return keep.length === sp.accents.length && keep.every((k, n) => k === sp.accents[n]) ? sp : { ...sp, accents: keep };
  });
  return { specs: out, notes };
}
const ACCENT_STOP = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'as', 'is', 'are', 'was', 'be', 'it', 'its', "it's", 'that', 'this', 'these', 'those', 'i', 'you', 'we', 'they', 'he', 'she', 'me', 'my', 'your', 'our', 'not', 'so', 'if', 'then', 'than', "here's", "there's", "that's", "what's", "let's", "i'll", "i'm", "i've", "i'd", "you'll", "you're", "you've", "we'll", "we're", "they're", "don't", "doesn't", "can't", "won't", "isn't", 'here', 'there']);
const stopKey = (w: string) => w.toLowerCase().replace(/[\u2019`]/g, "'").replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');
/**
 * An accent that is a lone stop-word or contraction ("Here's", "the", "I'll") highlights nothing: it is replaced by the last one or two non-stop words of the slide's headline, as the span of the
 * headline from the first of them to the last ("Here's how it works" -> "how it works"; the usual clamp then applies). A headline with no such words loses the accent. Never a word the headline does not have.
 * The second value says what changed, for the report (codeAdjustments).
 */
export function fixStopAccents(specs: SlideSpec[]): { specs: SlideSpec[]; notes: string[] } {
  const notes: string[] = [];
  const out = specs.map((sp, i) => {
    if (!sp.accents.length) return sp;
    const hk = HIGHLIGHT_HEAD.find((k) => typeof sp.fields[k] === 'string' && String(sp.fields[k]).trim());
    const head = hk ? String(sp.fields[hk]).trim() : '';
    let changed = false;
    const next: string[] = [];
    for (const a of sp.accents) {
      const ws = a.trim().split(/\s+/).filter(Boolean);
      if (ws.length !== 1 || !ACCENT_STOP.has(stopKey(ws[0]))) { next.push(a); continue; }
      const hw = head.split(/\s+/).filter(Boolean);
      const idx = hw.map((w, k) => (ACCENT_STOP.has(stopKey(w)) || !stopKey(w) ? -1 : k)).filter((k) => k >= 0);
      changed = true;
      if (!idx.length) { notes.push(`slide ${i + 1}: accent "${a}" is a stop-word and the headline has no other word, so it is not drawn`); continue; }
      const span = hw.slice(idx[Math.max(0, idx.length - 2)], idx[idx.length - 1] + 1).join(' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      notes.push(`slide ${i + 1}: accent "${a}" is a stop-word, so the accent is "${span}" (the last words of the headline)`);
      next.push(span);
    }
    return changed ? { ...sp, accents: [...new Set(next)] } : sp;
  });
  return { specs: out, notes };
}
export function clampAccents(specs: SlideSpec[]): { specs: SlideSpec[]; trims: Trim[] } {
  const trims: Trim[] = [];
  const out = specs.map((s, i) => {
    if (!s.accents.length) return s;
    const hk = HIGHLIGHT_HEAD.find((k) => typeof s.fields[k] === 'string' && String(s.fields[k]).trim());
    const n = hk ? wordsIn(s.fields[hk]) : 0;
    const max = n ? Math.max(1, Math.min(n >= 8 ? 3 : 2, Math.floor(n / 2))) : 2;
    const next = s.accents.map((a) => {
      const w = a.trim().split(/\s+/);
      return w.length > max ? w.slice(-max).join(' ') : a;
    });
    if (next.every((a, k) => a === s.accents[k])) return s;
    trims.push({ slide: i + 1, field: 'highlight', from: s.accents.join(' | '), to: next.join(' | '), max });
    return { ...s, accents: next };
  });
  return { specs: out, trims };
}
const TOPIC_LINE_FIELDS = ['subtitle', 'subline', 'caption', 'sub'];
/**
 * Nothing is drawn that nobody wrote. For a written deck: (1) a quote's attribution only stays when its words are in the person's text (a person or a source the text names); an invented one ("The text",
 * "An editor") goes, and the quote is drawn with no attribution and no rule; (2) a line under a headline (sub line, caption) that only repeats the topic (a short phrase made of the words of the deck's
 * title) is not a sentence of the text and goes. The closing's own lines are settled by settleClosing.
 */
export function dropInvented(specs: SlideSpec[], text: string, title: string): { specs: SlideSpec[]; trims: Trim[] } {
  const trims: Trim[] = [];
  const titleWords = new Set(wordsOf(title));
  const out = specs.map((sp, i) => {
    let fields = sp.fields;
    const author = typeof fields.author === 'string' ? fields.author.trim() : '';
    if (sp.layout === 'quote' && author && !inSource(author, text)) {
      fields = Object.fromEntries(Object.entries(fields).filter(([k]) => k !== 'author')) as Fields;
      trims.push({ slide: i + 1, field: 'attribution', from: author, to: '(removed)', max: 0 });
    }
    if (i < specs.length - 1) {
      for (const k of TOPIC_LINE_FIELDS) {
        const v = fields[k];
        if (typeof v !== 'string' || !v.trim()) continue;
        const ws = wordsOf(v);
        const content = ws.filter((w) => !isFunctionWord(w));
        if (ws.length <= 4 && content.length > 0 && content.every((w) => titleWords.has(w)) && !repeatsHeadline(v, String(fields.headline ?? fields.title ?? ''))) {
          fields = Object.fromEntries(Object.entries(fields).filter(([n]) => n !== k)) as Fields;
          trims.push({ slide: i + 1, field: 'topic line', from: v, to: '(removed)', max: 0 });
        }
      }
    }
    return fields === sp.fields ? sp : { ...sp, fields };
  });
  return { specs: out, trims };
}
/** One line of the report for a trim the code made. */
export function trimNote(t: Trim): string {
  if (t.field === 'attribution') return `slide ${t.slide}: the quote's attribution "${t.from}" is not in your text, so the code left it out (nothing is drawn that nobody wrote).`;
  if (t.field === 'topic line') return `slide ${t.slide}: the line "${t.from}" only repeats the topic and is not a sentence of your text, so the code left it out.`;
  if (t.field === 'highlight') return `slide ${t.slide}: the highlight "${t.from}" was longer than ${t.max} word${t.max === 1 ? '' : 's'}, so the code kept the last words: "${t.to}".`;
  if (t.field === 'step swap') return `slide ${t.slide}: only one slide in the deck is a step, so the code drew it as split-text with the same words (step-numeral is for two or more steps of one sequence).`;
  if (t.field === 'closing cta') return t.from ? `slide ${t.slide}: the closing button "${t.from}" was not the call to action the text asks for, so the code used "${t.to}".` : `slide ${t.slide}: the closing had no call to action, so the code made it "${t.to}".`;
  if (t.field === 'emoji') return `slide ${t.slide}: the writer left out the ${t.from} of your text, so the code put it back after the same words: "${t.to}".`;
  if (t.field === 'invented button') return `slide ${t.slide}: the button "${t.from}" is not your words (${t.to.split(';')[0]}), so the code left it out:${t.to.split(';').slice(1).join(';')}.`;
  if (t.field === 'closing sub line') return `slide ${t.slide}: the line under the closing headline, "${t.from}", uses words that are not in the text, so the code left it out (an offer or promise is never invented).`;
  if (t.to.startsWith('(removed')) return `slide ${t.slide}: ${t.field} "${t.from}" repeats the headline, so the code left it out.`;
  if (t.field === 'button') return `slide ${t.slide}: the button "${t.from}" is not an action phrase (verb first, 2 to 4 words), so the code left it out: ${t.to}.`;
  return `slide ${t.slide}: ${t.field} "${t.from}" is ${t.from.length} characters, over its limit of ${t.max}: trimmed to "${t.to}" at a word boundary by the code (no retry call).`;
}
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
export function buttonProblem(label: string, ctx?: CtaCtx): string | null {
  const t = label.trim();
  if (!t) return 'the button text is empty';
  // the three generic closing calls to action (a closing with no real action in the text), and "Follow @handle" with the handle that is set: always fine
  if (GENERIC_CTAS.some((g) => g.toLowerCase() === t.toLowerCase())) return null;
  if (ctx ? isSetHandle(ctx.handle) && t.toLowerCase() === `follow ${ctx.handle!.trim()}`.toLowerCase() : /^follow @[\w.]{2,30}$/i.test(t)) return null;
  // the action the text itself asks for ("Comment brain", "Download the guide"), built from its own words, is always a fine label
  if (ctx?.text !== undefined && sourceAction(ctx.text)?.label.toLowerCase() === t.toLowerCase()) return null;
  // a link, a handle, a "link in bio", an offer or a number in a label must come from the text (checked when the text is known)
  if (ctx?.text !== undefined) {
    const src = ctx.text.toLowerCase();
    const bits = t.toLowerCase().match(/https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(?:com|io|co|net|org|app|me|ai|dev|xyz)\b\S*|@[\w.]+|link in bio|\d[\d,.%]*/g) ?? [];
    const invented = bits.filter((b) => !src.includes(b.replace(/[.,]+$/, '')));
    if (invented.length) return `"${t}" contains "${invented[0]}", which is not in the text: never invent a link, handle, website, email, offer or number`;
  }
  const words = t.split(/\s+/);
  if (/[?!.,;:]/.test(t)) return `"${t}" has punctuation: a button label is a short action phrase (like "Book a call")`;
  if (words.length < 2 || words.length > 4) return `"${t}" is ${words.length} word${words.length === 1 ? '' : 's'}: a button label is 2 to 4 words (like "Get the checklist")`;
  if (t.length > 20) return `"${t}" is ${t.length} characters: a button label is at most 20`;
  if (!ACTION_VERBS.has(words[0].toLowerCase())) return `"${t}" does not start with an action verb: a button label is verb first (like "Join the list")`;
  return null;
}
/** The button fields of a closing layout (cta-button, cta-pair, contact-closing). */
const BUTTON_FIELDS = ['button', 'button1', 'button2'];
export const buttonProblems = (s: SlideSpec, ctx?: CtaCtx): string[] =>
  BUTTON_FIELDS.flatMap((k) => (typeof s.fields[k] === 'string' && (s.fields[k] as string).trim() ? [buttonProblem(s.fields[k] as string, ctx)].filter((x): x is string => !!x).map((m) => `${k}: ${m}`) : []));

/** Problems that need the model (or a repair): unknown layout, photo without a photo, fields over budget or missing, a button that is not an action phrase. */
export function slideProblems(s: SlideSpec, look: Look, ctx?: CtaCtx): string[] {
  const id = s.layout;
  if (!layoutDef(id)) return [`"${s.layout}" is not a layout (use one of: ${LAYOUT_IDS.join(', ')}).`];
  if (id === 'photo-led' && !look.hasPhoto) return ['photo-led is only for the person\'s own photo and there is none: choose another layout.'];
  if (id === 'photo-led' && look.images?.length && look.images.every((p) => p.content === 'screenshot')) return ['photo-led is for the person\'s own photo and every picture is a screenshot (a screenshot never goes under text): choose another layout.'];
  return [...validateSlideContent(id, fieldsOf(s)).errors, ...buttonProblems(s, ctx)];
}
/**
 * A closing whose button is still not an action phrase (the retry did not fix it) loses the button instead of failing: it becomes a closing statement card with the same words and no
 * button (the headline, and the line under it as the caption). A contact closing only loses its button text. Returns the new specs and a log of what was done.
 */
export function dropBadButtons(specs: SlideSpec[], ctx?: CtaCtx): { specs: SlideSpec[]; trims: Trim[] } {
  const trims: Trim[] = [];
  const out = specs.map((s, i) => {
    if (!buttonProblems(s, ctx).length) return s;
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
/** Round M: the words of a slide's text fields (the picture fields left out), lower case, with repeats. */
const fieldWords = (f: Fields): string[] => Object.entries(f).filter(([k]) => !/^image\d*$/.test(k)).flatMap(([, v]) => (Array.isArray(v) ? v : [v])).flatMap((x) => String(x).toLowerCase().replace(/[’']/g, "'").match(/[\p{L}\p{N}']+/gu) ?? []);
/** Round M: true when every word of `before` (as often as it is there) is also in `after`: a change of fields that loses no word. */
export function keepsAllWords(before: Fields, after: Fields): boolean {
  const have = new Map<string, number>();
  for (const w of fieldWords(after)) have.set(w, (have.get(w) ?? 0) + 1);
  for (const w of fieldWords(before)) {
    const n = have.get(w) ?? 0;
    if (n <= 0) return false;
    have.set(w, n - 1);
  }
  return true;
}
/**
 * Round M: every word of a slide as the prose layout's fields: the first text as the heading when it is short (60 characters) and there is more, then the rest in the paragraphs (300, 300, 260
 * characters), split at sentence ends and, for a sentence longer than a paragraph, between words. No word is cut or left out; null when the text is longer than the three paragraphs hold.
 */
export function proseFieldsOf(f: Fields): Fields | null {
  const texts = Object.entries(f).filter(([k]) => !/^image\d*$/.test(k)).flatMap(([, v]) => (Array.isArray(v) ? v : [v])).map((x) => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!texts.length) return null;
  const heading = texts.length > 1 && texts[0].length <= 60 ? texts[0] : '';
  const rest = heading ? texts.slice(1) : texts;
  const pieces = rest.flatMap((t) => t.split(/(?<=[.!?])\s+/)).flatMap((sentence) => {
    if (sentence.length <= 260) return [sentence];
    const out: string[] = [];
    let cur = '';
    for (const w of sentence.split(' ')) { if (cur && (cur + ' ' + w).length > 260) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }
    if (cur) out.push(cur);
    return out;
  });
  const caps = [300, 300, 260];
  const paras: string[] = [''];
  for (const p of pieces) {
    const k = paras.length - 1;
    if (!paras[k]) paras[k] = p;
    else if ((paras[k] + ' ' + p).length <= caps[k]) paras[k] += ' ' + p;
    else { if (paras.length === 3) return null; paras.push(p); }
    if (paras[paras.length - 1].length > caps[paras.length - 1]) return null;
  }
  if (!paras[0]) return null;
  const out: Fields = { p1: paras[0] };
  if (heading) out.heading = heading;
  if (paras[1]) out.p2 = paras[1];
  if (paras[2]) out.p3 = paras[2];
  return validateSlideContent('prose', out).ok ? out : null;
}
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
    case 'thumb-rows': case 'list-under-band': case 'list-beside-picture': return { type: 'checklist', headline: s('title') || 'In short', items: a('items'), ...tags };
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
    // Round R: a photo slide has no words: a cover with no headline (the script check lets a photoOnly slide go without one)
    case 'photo-full': case 'photo-pair': case 'photo-quad': return { type: 'cover', headline: '', photoOnly: true, ...tags };
    default: return { type: 'content', headline: s('headline') || s('title') || 'Slide', body: Object.values(f).flat().join('. ').slice(0, 250) || 'Slide', ...tags };
  }
}

// ----- the report -----
export interface LibraryReport {
  route: 'library';
  /** Round O: the slides the person picked (the writer's target), and whether "Keep every sentence" was on for that call. Missing on a pasted script (no writer). */
  slidesRequested?: number;
  keepEverySentence?: boolean;
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
  /** A pasted script: which slides use a simple layout because their text is long ('simple'), and which keep their words with no library layout ('kept'). */
  ownMarks?: ('simple' | 'kept' | null)[];
  /** How many times the deck was drawn again from the plan. */
  redraws?: number;
  /** The closing as the writer gave it (layout, headline, button, sub line), before the code changed anything. */
  writerClosing?: { layout: string; headline?: string; button?: string; sub?: string };
  /** Optional texts the code trimmed at a word boundary instead of asking the writer again. */
  trims?: { slide: number; field: string; from: string; to: string; max: number }[];
  /** The preset flavour pass: layouts moved to a preferred one (slide, from, to, why) and the slides that stayed with the reason. Presets only. */
  flavour?: { swaps: FlavourSwap[]; kept: FlavourKept[] };
  /** Slides changed to a picture layout because pictures were left unused (slide, from, to, why). */
  pictureSwaps?: PictureSwap[];
  /** Round N: every photo slide the shape rule looked at: the layout, the share of its slot the photo covers and the crop, before and after. */
  photoShape?: ShapeRow[];
  /** Round Q: every picture the passes left unused, and where the rescue pass put it (or why it stays unused). */
  pictureRescue?: RescueRow[];
  /** Round R: the photo slides the code added (the writer made `slidesBefore` slides): where each is, its layout and its pictures. */
  photoSlidesAdded?: { count: number; slidesBefore: number; slides: PhotoSlideAdded[] };
  /** Round S: the slides the person removed and moved in Edit slides (slideEdit.ts). A redraw keeps it; a new deck has none. */
  manualEdits?: import('./slideEdit').ManualEdits;
  /** Round T: the slides with text over a picture, measured as drawn (photoContrastOf); recomputed on every redraw. */
  photoContrast?: PhotoContrastSlide[];
  /** Round 15: slides that failed one of the phone checks when drawn and were drawn again by the code (never a model call): what failed, and what the slide is now. */
  /** Round 16: one row per writer call: what was sent and what it cost (null where the provider does not say). */
  writes?: { call: number; promptChars: number; promptBytes: number; requestBytes: number | null; numTurns: number | null; durationApiMs: number | null; effort: string | null; inputTokens: number | null; outputTokens: number | null; seconds: number }[];
  /** Round J: the colour repairs of the last redraw (a style switch, a colour change), the same rule as the new-deck repair stage. */
  redrawRepairs?: { slide: number; from: string; to: string; failed: string[]; result: 'repaired' | 'not repaired'; how?: 'colour' | 'layout' }[];
  repairs?: { slide: number; from: string; to: string; failed: string[]; result: 'repaired' | 'not repaired'; /** Round G: 'colour' = a contrast failure fixed by a colour on the same layout; 'layout' = another layout (size, edges, words, overlap). */ how?: 'colour' | 'layout' }[];
  /** The project's pictures and what became of them in the final deck (Round 13). */
  pictureUse?: { uploaded: number; used: number; unused: string[]; whyUnused: string };
  /** What the deck was drawn from: a built-in preset's name, or 'reference' (the active reference style). The style toggles redraw it only for the same source. */
  source?: string;
  /** The palette-rhythm ground of each slide (an index into the style's rhythm, -1 = the closing ground, null = no rhythm). */
  grounds?: (number | null)[];
  /** The version of the drawing code the stored slides were drawn with (DRAW_VERSION). A deck stored by older code is drawn again from its plan when it is opened. */
  drawVersion?: number;
}
/** Raise this whenever the drawing changes how a stored plan looks (pen ring, cards, buttons, stat margins...): decks stored with a lower number are redrawn on open. */
export const DRAW_VERSION = 2;

// ----- the deck -----
export const stubPack = (style: LayoutStyle, name: string): StylePack => {
  const c = coloursFor({ ...style.palette, onAccent: style.palette.onAccent ?? style.palette.bg }, {});
  return { name, palette: { bg: style.palette.bg, text: style.palette.text, accent: style.palette.accent, muted: style.palette.muted, surface: style.palette.surface, onAccent: c.F.onAccent }, fonts: { ...style.fonts }, motifs: [], designs: {}, canvas: { w: 1080, h: 1350 }, notes: ['Drawn by the layout library: no pack designs.'] };
};

/** A test seam: an extra check run on every drawn slide besides the phone checks (a deliberately failing one lets a spec drive the repair path). Null in the app. */
let slideCheckHook: ((layers: unknown[], spec: { layout: string; fields: Record<string, unknown> }) => string[]) | null = null;
export const setSlideCheckHook = (f: typeof slideCheckHook) => {
  slideCheckHook = f;
};
export interface Drawn {
  built: Built | null;
  cut: Cut;
  invert: boolean;
  density: 'normal' | 'statement';
  adjustments: string[];
  problems: string[];
  /** title-over-photo: the scrim level the drawing settled on (0 is the layout's own; 1..3 were raised so the headline reads), or 'caption' when no scrim read and the slide became a photo-full-caption. */
  scrim?: number | 'caption';
  /** Round T: draws the same slide again with the title-over-photo scrim starting at a higher level (set by drawOne; never stored). */
  redo?: (scrimFrom: number) => Promise<Drawn>;
}
/** Round T: one slide's text over its picture, measured on the slide as drawn (photoContrast.ts). */
export interface PhotoContrastSlide { slide: number; layout: string; pass: boolean; roles: PhotoContrastRole[]; ms: number }
/**
 * Round T: every drawn slide with text over a picture is measured (light text against the 90th percentile of the pixels behind it, dark text against the 10th; 3:1 from 48 px, else 4.5:1) and a slide
 * that does not read is repaired, stopping at the first step that passes; a slide that reads is left exactly as it is.
 *  - the headline or its line on title-over-photo (a gradient headline, which the layout's own scrim is not chosen for): the same slide drawn again with its scrim one level stronger, up to the solid
 *    panel (level 3); the layout, the words and the picture stay.
 *  - the side label (page chrome) over a photo: a plate behind the label only (at most 0.6 opacity), then the other ink of the slide's palette, then that ink on a plate (repairSideLabel).
 * A role that still does not read keeps the best result and stays failing in the report. The repairs run on every drawing (a new deck and every redraw), from the slide as drawn, so a style switch, a
 * colour change or a move draws and repairs the same way each time. A slide with no text over a picture is not drawn again and has no row. No model call.
 */
export async function settlePhotoContrast(drawn0: (Drawn | null | undefined)[], layouts: string[]): Promise<{ rows: PhotoContrastSlide[]; drawn: (Drawn | null | undefined)[]; notes: string[] }> {
  const rows: PhotoContrastSlide[] = [];
  const notes: string[] = [];
  const drawn = [...drawn0];
  const read = async (d: Drawn) => { try { return await measurePhotoContrast(d.built!); } catch { return null; } };
  const ratioOfRole = (x: { roles: PhotoContrastRole[] } | null, role: string) => x?.roles.find((r) => r.role === role)?.ratio ?? 0;
  const textFails = (x: { roles: PhotoContrastRole[] } | null) => !!x?.roles.some((r) => (r.role === 'title' || r.role === 'body') && !r.pass);
  for (let i = 0; i < drawn.length; i++) {
    let d = drawn[i];
    if (!d?.built?.images?.length) continue;
    let m = await read(d);
    if (!m?.roles.length) continue;
    let ms = m.ms;
    const repairs = new Map<string, string>();
    if (textFails(m) && d.redo && typeof d.scrim === 'number' && d.scrim < 3) {
      for (let lv = d.scrim + 1; lv <= 3; lv++) {
        const d2 = await d.redo(lv);
        if (!d2.built || typeof d2.scrim !== 'number') break;
        const m2 = await read(d2);
        if (!m2) break;
        ms += m2.ms;
        const done = !textFails(m2) || d2.scrim >= 3;
        if (!done) { lv = Math.max(lv, d2.scrim); continue; }
        // the strongest scrim and still no better: the slide stays as it was drawn
        if (textFails(m2) && ratioOfRole(m2, 'title') <= ratioOfRole(m, 'title')) break;
        const how = `the title-over-photo scrim raised from level ${d.scrim} to ${d2.scrim} of 3`;
        for (const r of m2.roles) if (r.role === 'title' || r.role === 'body') repairs.set(r.role, how);
        notes.push(`slide ${i + 1}: ${how}, so the headline reads on the picture (${ratioOfRole(m2, 'title')}:1).`);
        d = { ...d2, redo: d.redo };
        m = m2;
        break;
      }
    }
    const side = m.roles.find((r) => r.role === 'side-label');
    if (side && !side.pass) {
      const pal = d.built!.palette ?? {};
      const fix = await repairSideLabel(d.built!, [pal.text, pal.bg].filter(Boolean));
      if (fix && fix.ratio > side.ratio) {
        d = { ...d, built: { ...d.built!, svg: fix.svg } };
        const m3 = await read(d);
        if (m3) { ms += m3.ms; m = m3; }
        repairs.set('side-label', fix.repair);
        notes.push(`slide ${i + 1}: ${fix.repair}, so the side label reads on the picture (${fix.ratio}:1${fix.pass ? '' : ', still under 4.5:1'}).`);
      }
    }
    // the scrim drawOne itself raised (the Round N rule), when it raised one
    const own = typeof d.scrim === 'number' && d.scrim > 0 ? `the title-over-photo scrim was raised to level ${d.scrim} of 3` : undefined;
    drawn[i] = d;
    rows.push({
      slide: i + 1, layout: layouts[i] ?? '', pass: m.roles.every((r) => r.pass), ms,
      roles: m.roles.map((r) => { const how = repairs.get(r.role) ?? (r.role === 'title' || r.role === 'body' ? own : undefined); return how ? { ...r, repair: how } : r; }),
    });
  }
  return { rows, drawn, notes };
}
/** The rows of settlePhotoContrast alone (measured and repaired; the repaired drawings are not returned). */
export const photoContrastOf = async (drawn: (Drawn | null | undefined)[], layouts: string[]): Promise<PhotoContrastSlide[]> => (await settlePhotoContrast(drawn, layouts)).rows;
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
export async function drawOne(spec: SlideSpec, variant: 0 | 1, style: LayoutStyle, o: { handle: string; index: number; total: number; cut: Cut; invert: false | 'full' | 'tint'; density: 'normal' | 'statement'; ground?: number; /** Round T: the weakest title-over-photo scrim level to try. */ scrimFrom?: number }): Promise<Drawn> {
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
  let scrim: Drawn['scrim'];
  for (const [k, t] of tries.entries()) {
    const opts = { handle: o.handle, index: o.index, total: o.total, cut: cutsOf(spec.layout).includes(t.cut) ? t.cut : ('plain' as Cut), invert: t.invert, density: t.density, ...(o.ground !== undefined ? { ground: o.ground } : {}) };
    let b: Built;
    if (spec.layout === 'title-over-photo' && typeof f.image === 'string' && f.image) {
      // a headline on a picture: the scrim is the weakest one at which every word reads at 4.5:1 over 95% of the pixels behind it, measured on the real picture; if even the solid panel does not read, the slide is the full-photo caption layout
      const sc = await settleScrim((level) => buildSlide(spec.layout, variant, f, style, { ...opts, scrim: level }), o.scrimFrom ?? 0);
      if (sc.reads) {
        b = sc.built;
        scrim = sc.level;
        if (sc.level > 0) adjustments.push(`slide ${o.index + 1}: the scrim behind the headline was strengthened to level ${sc.level} of 3 so every word reads at 4.5:1 on the picture.`);
      } else {
        scrim = 'caption';
        b = await buildSlide('photo-full-caption', variant, { headline: f.headline, ...(f.line ? { line: f.line } : {}), image: f.image, ...(f.accent ? { accent: f.accent } : {}) } as Fields, style, opts);
        adjustments.push(`slide ${o.index + 1}: no scrim made the headline read on this picture, so it is drawn as a full photo with a caption panel.`);
      }
    } else b = await buildSlide(spec.layout, variant, f, style, opts);
    last = b;
    if (b.ok) {
      if (k > 0) adjustments.push(`slide ${o.index + 1}: drawn with ${t.cut}${t.invert ? ' + invert' : ''}${t.density === 'statement' ? ' + statement density' : ''} instead of ${o.cut}${o.invert ? ' + invert' : ''}${density === 'statement' ? ' + statement density' : ''} (that did not fit: ${tries[k - 1] && last ? 'content too big for it' : ''}).`);
      if (b.cut !== t.cut) adjustments.push(`slide ${o.index + 1}: the ${t.cut} plane would hold no content for ${spec.layout}, so it is drawn with no plane.`);
      return { built: b, cut: b.cut, invert: !!t.invert, density: t.density, adjustments, problems: [], ...(scrim !== undefined ? { scrim, redo: (scrimFrom: number) => drawOne(spec, variant, style, { ...o, scrimFrom }) } : {}) };
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

/** The person's own script, already turned into a plan by code (see libraryFromScript.ts): the deck is drawn from it with NO model call and none of the writer-only rules (generic closing, text trims). */
/** The deck's rotation: variants and cuts over the whole deck. A layout the rotation would change (repeated or over-used) is a problem for the retry. */
/**
 * The layout rotation of the TEXT slides (the variants, and the layouts that repeat or are over-used): Round R picture-only slides are left out of it, so adding a photo slide never changes the
 * variant of a text slide or makes one count as a repeat. A picture-only slide takes variant 1 (its only form).
 */
export function rotationOf(list: SlideSpec[], photo: boolean, flavour: LayoutStyle['flavour'], pictureCap = 2): { rv: Picked[]; variants: (0 | 1)[] } {
  const text = list.map((_, i) => i).filter((i) => !isPhotoOnly(list[i].layout));
  const rv0 = rotateVariants(text.map((i) => ({ layout: layoutDef(list[i].layout) ? (list[i].layout as LayoutId) : ('statement' as LayoutId) })), { photo, flavour, pictureCap });
  const rv: Picked[] = list.map((s) => ({ layout: s.layout as LayoutId, variant: 0, note: '' }));
  text.forEach((i, k) => (rv[i] = rv0[k]));
  const count: Record<string, number> = {};
  const variants = list.map((s, i) => {
    if (isPhotoOnly(s.layout)) return 0 as const;
    const same = rv[i].layout === s.layout;
    const c = count[s.layout] ?? 0;
    count[s.layout] = c + 1;
    return same ? rv[i].variant : ((c % 2) as 0 | 1);
  });
  return { rv, variants };
}
export function deckRotation(list: SlideSpec[], look: Look, style: LayoutStyle) {
  const ids = list.map((s) => s.layout as LayoutId);
  const { rv, variants } = rotationOf(list, !!look.hasPhoto, style.flavour, pictureLayoutCap(look.images));
  list.forEach((s, i) => { if (s.pin?.variant !== undefined) variants[i] = s.pin.variant; }); // a variant the preset (closing) or the person pinned
  const repeats = new Map<number, string>();
  rv.forEach((r, i) => layoutDef(list[i].layout) && r.layout !== list[i].layout && repeats.set(i, r.note || `the layout "${list[i].layout}" repeats or is over-used`));
  const rc = rotateCuts(ids.map((layout) => ({ layout: layoutDef(layout) ? layout : ('statement' as LayoutId) })), style, { suggest: list.map((s) => ({ cut: s.cut })) });
  return { variants, repeats, cuts: rc };
}
/**
 * Round N: the photo shape rule on a whole deck (photoShape.ts): the pictures are placed as the deck places them, each photo slide is measured as drawn, and a slide moves only to a layout that
 * shows its photo larger with every word kept. The slides that do not move are returned as they came (the placement puts their pictures in again). No model call.
 */
export async function applyPhotoShape(specs0: SlideSpec[], look: Look, style: LayoutStyle, handle: string, ctx?: CtaCtx): Promise<{ specs: SlideSpec[]; swaps: PictureSwap[]; rows: ShapeRow[] }> {
  if (!look.images?.length) return { specs: specs0, swaps: [], rows: [] };
  const placed = placeImages(specs0, deckRotation(specs0, look, style).variants, look.images);
  const sh = await shapePass(placed, look, async (sp, i, v, deck) => {
    if (slideProblems(sp, look, ctx).length) return null;
    const rc = deckRotation(deck, look, style).cuts[i];
    const d = await drawOne(sp, v, style, { handle, index: i, total: deck.length, cut: rc.cut, invert: rc.invert, density: sp.density ?? 'normal', ground: rc.ground });
    return d.built && !d.problems.length ? d.built.images ?? [] : null;
  }, (deck) => deckRotation(deck, look, style));
  return { specs: specs0.map((s, k) => (sh.moved.includes(k) ? sh.specs[k] : s)), swaps: sh.swaps, rows: sh.rows };
}
/**
 * Round Q: every picture still unused after the passes gets a second chance (pictureRescue.ts): measured on the slides as drawn, the empty picture slots first, then the slides whose words match
 * its name, then any slide whose words fit a picture layout. No model call, every word kept.
 */
export async function applyPictureRescue(specs0: SlideSpec[], look: Look, style: LayoutStyle, handle: string, ctx?: CtaCtx): Promise<{ specs: SlideSpec[]; swaps: PictureSwap[]; rows: RescueRow[] }> {
  if (!look.images?.length) return { specs: specs0, swaps: [], rows: [] };
  const placed = placeImages(specs0, deckRotation(specs0, look, style).variants, look.images);
  const rs = await rescuePass(placed, look, async (sp, i, v, deck) => {
    if (slideProblems(sp, look, ctx).length) return null;
    const rc = deckRotation(deck, look, style).cuts[i];
    const d = await drawOne(sp, v, style, { handle, index: i, total: deck.length, cut: rc.cut, invert: rc.invert, density: sp.density ?? 'normal', ground: rc.ground });
    return d.built && !d.problems.length ? d.built.images ?? [] : null;
  }, (deck) => deckRotation(deck, look, style));
  return { specs: specs0.map((s, k) => (rs.moved.includes(k) ? rs.specs[k] : s)), swaps: rs.swaps, rows: rs.rows };
}
export interface OwnScript { title: string; specs: SlideSpec[]; script: CarouselScript; /** Per slide: 'simple' = the simple (prose) layout because the text is long; 'kept' = no layout fits, the words are kept and the slide is drawn with the style's template. */ marks?: ('simple' | 'kept' | null)[] }
export async function designLibraryDeck(req: WriteRequest, look: Look, handle: string, p: WriteProvider, signal: AbortSignal, onPhase: (ph: 'writing' | 'retrying') => void = () => undefined, own?: OwnScript): Promise<GenerateResult & { designed: Designed }> {
  const t0 = performance.now();
  const { style: style0, notes: styleNotes } = styleFromPack(look.pack);
  const style1: LayoutStyle = look.site?.trim() ? { ...style0, site: look.site.trim() } : style0;
  // a lower-case style keeps the capitals of the brand names and acronyms the text writes (ChatGPT, Claude, AI, PDF)
  const style: LayoutStyle = !own && style1.caseStyle === 'lower' ? { ...style1, caseExceptions: [...new Set([...(style1.caseExceptions ?? []), ...sourceBrands(req.text)])] } : style1;
  const brief = look.pack ? look.pack.brief ?? styleBriefOf(look.pack) : look.brief?.trim() || 'a clean, confident look';
  const [lo, hi] = SLIDE_RANGE[req.format];
  const n = Math.min(hi, Math.max(lo, req.slides));
  const first = buildLibraryPrompt(req, look, style, brief, n, handle);
  let calls = 0;
  let ms = 0;
  const tokens = { input: 0, output: 0 };
  const writes: NonNullable<LibraryReport['writes']> = [];
  const ask = async (prompt: string) => {
    onPhase(calls === 0 ? 'writing' : 'retrying');
    const a = await p.write(prompt, signal, 'write');
    calls += 1;
    // the evidence for one call: the exact prompt the app sent (characters and bytes), the request body, the turns, the API time, the effort setting and the tokens
    writes.push({ call: calls, promptChars: prompt.length, promptBytes: new TextEncoder().encode(prompt).length, requestBytes: a.requestBytes ?? null, numTurns: a.meta?.numTurns ?? null, durationApiMs: a.meta?.durationApiMs ?? null, effort: a.meta?.effort ?? null, inputTokens: a.usage?.input ?? null, outputTokens: a.usage?.output ?? null, seconds: Math.round(a.ms / 100) / 10 });
    ms += a.ms;
    tokens.input += a.usage?.input ?? 0;
    tokens.output += a.usage?.output ?? 0;
    return a.text;
  };
  let text = own ? '' : await ask(first);
  let parsed = own ? { title: own.title, note: null as string | null, slides: own.specs, errors: [] as string[] } : parseLibraryAnswer(text);
  if (!own && (parsed.errors.length || parsed.slides.length < lo)) {
    text = await ask([first, '', 'Your previous answer was:', text.slice(0, 6000), '', 'It cannot be used, for these reasons:', ...parsed.errors.map((e) => '- ' + e), '', 'Reply again with the corrected JSON object only.'].join('\n'));
    parsed = parseLibraryAnswer(text);
  }
  if (!own && (parsed.errors.length || parsed.slides.length < lo)) throw new WriterError('invalid', 'The writer answered twice, but neither answer could be used as a slide list.', parsed.errors.map((message) => ({ severity: 'error' as const, path: '', message })));
  let specs = own ? parsed.slides : parsed.slides.slice(0, hi);
  const accentNotes: string[] = [];
  // the closing exactly as the writer gave it, before the code changed anything (the downloadable report shows it)
  const writerClosing = !own && specs.length ? { layout: specs[specs.length - 1].layout, headline: str(specs[specs.length - 1].fields.headline), button: str(specs[specs.length - 1].fields.button ?? specs[specs.length - 1].fields.caption), sub: str(specs[specs.length - 1].fields.sub ?? specs[specs.length - 1].fields.line) } : undefined;
  // optional one-line texts a little over their limit are trimmed by the code (no retry call for a kicker one character long)
  const tr = own ? { specs, trims: [] as ReturnType<typeof trimOptionalFields>['trims'] } : trimOptionalFields(specs);
  specs = tr.specs;
  // The person's own words are never trimmed by the code. For a written deck:
  if (!own) {
    // a pill, caption or sub that repeats the headline is taken out (a trim)
    const rp = dropRepeats(specs);
    specs = rp.specs;
    tr.trims.push(...rp.trims);
    // a prose slide over 55 words is cut down (the app's phone check fails a content slide at 50)
    const pw = trimProse(specs);
    specs = pw.specs;
    tr.trims.push(...pw.trims);
    // an accent is a word of the HEADLINE: one that is not in the slide's headline is not drawn (and the report says so)
    const fa = dropForeignAccents(specs);
    specs = fa.specs;
    accentNotes.push(...fa.notes);
    // an accent that is a lone stop-word or contraction ("Here's") moves to the last words of the headline
    const sa = fixStopAccents(specs);
    specs = sa.specs;
    accentNotes.push(...sa.notes);
    // a highlight is 1 or 2 words (3 on a long headline), never half the headline
    const ca = clampAccents(specs);
    specs = ca.specs;
    tr.trims.push(...ca.trims);
  }
  // nothing invented: an attribution the text does not name, a line that only repeats the topic
  if (!own) {
    const di = dropInvented(specs, req.text, parsed.title);
    specs = di.specs;
    tr.trims.push(...di.trims);
    // Round R: a button label only of the person's words; no button when the text asks for no action
    const db = dropInventedButtons(specs, req.text);
    specs = db.specs;
    tr.trims.push(...db.trims);
    // Round R: an emoji of the text the writer left out goes back after the same words (when the field has room); one that still is on no slide is listed by the sentences notice
    const re = restoreEmojis(specs, req.text);
    specs = re.specs;
    tr.trims.push(...re.trims);
  }
  // one step-numeral slide alone in a deck is not a sequence: it is drawn as split-text with the same words (for the person's own script too)
  {
    const ls = swapLoneStep(specs);
    specs = ls.specs;
    tr.trims.push(...ls.trims);
  }
  const suggested = { cut: specs.map((s) => s.cut ?? null), invert: specs.map((s) => !!s.invert), density: specs.map((s) => s.density ?? null) };
  // A preset's flavour: layouts it avoids move to ones it prefers where the slide's text fits (deterministic, no model call; references have no flavour).
  const fp = look.pack?.look?.flavour ? flavourPass(specs, style, look, look.pack.name.replace(/ pack$/, ''), coverKeyOf(parsed.title, specs, styleIdOf(look.pack))) : null;
  if (fp) specs = fp.specs;
  // pictures the writer left unused get a slide (a deterministic swap to a picture layout of the slide's own meaning, no text lost)
  let pictureSwaps: PictureSwap[] = [];
  if (look.images?.length) {
    // Round 18: a picture the person NAMED goes to the slide whose words match its name (the writer's suggestion first, where the rules allow it); no model call
    const np = namePass(specs, look);
    specs = np.specs;
    pictureSwaps = [...np.swaps];
    // a screenshot is never under text: the slides the writer put in such a layout move to one that shows it whole (same words)
    const ss = screenshotPass(specs, look);
    specs = ss.specs;
    pictureSwaps = [...pictureSwaps, ...ss.swaps];
    const pp = picturePass(specs, look);
    specs = pp.specs;
    pictureSwaps.push(...pp.swaps);
    // never the same picture layout twice in a row; and a hero: one picture over more than half of the slide
    const sr = separatePictureRuns(specs, look);
    specs = sr.specs;
    pictureSwaps.push(...sr.swaps);
    const hp = heroPass(specs, look);
    specs = hp.specs;
    pictureSwaps.push(...hp.swaps);
  }

  const rotate = (list: SlideSpec[] = specs) => deckRotation(list, look, style);
  const ctaCtx: CtaCtx = { handle, text: req.text };
  // The closing is never a reason for a second writer call: a closing that breaks the rule is settled by the code below (dropInventedButtons, settleClosing).
  const drawAll = async (only?: Set<number>, prev?: Map<number, Drawn>) => {
    const rot = rotate();
    // the project's pictures go into the picture slots by code (best fit, each at most once); a layout that cannot get enough keeps its text-only form
    if (look.images?.length) specs = placeImages(specs, rot.variants, look.images);
    const out = new Map<number, Drawn>(prev ?? []);
    const drawAt = async (i: number) => {
      const pr = slideProblems(specs[i], look, ctaCtx);
      if (pr.length) {
        out.set(i, { built: null, cut: 'plain', invert: false, density: 'normal', adjustments: [], problems: pr });
        return;
      }
      const d = await drawOne(specs[i], rot.variants[i], style, { handle, index: i, total: specs.length, cut: rot.cuts[i].cut, invert: rot.cuts[i].invert, density: specs[i].density ?? 'normal', ground: rot.cuts[i].ground });
      if (rot.repeats.has(i)) d.problems = [...d.problems, 'layout: ' + rot.repeats.get(i)!];
      out.set(i, d);
    };
    for (let i = 0; i < specs.length; i++) {
      if (only && !only.has(i)) continue;
      await drawAt(i);
    }
    // Round O: the final placement measures too. A slide the code placed a tall screenshot on that draws it under 22% of the slide's width refuses tall screenshots; the placement runs
    // again (the screenshot may go to a slide that shows it large enough, or stay unused) and the slides whose pictures changed are drawn again. The person's own picks are never touched.
    if (look.images?.length && placementCheck.on) {
      for (let round = 0; round < 3; round++) {
        const small = specs.map((_, i) => i).filter((i) => {
          if (pinnedPicture(specs[i]) || (only && !only.has(i))) return false;
          const imgs = out.get(i)?.built?.images;
          return usedIds(specs[i].fields).some((id) => { const p = look.images!.find((q) => q.id === id); return !!p && isTallShot(p) && tallShotTooSmall(imgs, id); });
        });
        if (!small.length) break;
        const before = specs.map((s) => usedIds(s.fields).join(','));
        specs = specs.map((s, k) => (small.includes(k) ? { ...s, refuseTall: true } : s));
        specs = placeImages(specs, rot.variants, look.images);
        for (let i = 0; i < specs.length; i++) if (usedIds(specs[i].fields).join(',') !== before[i] && (!only || only.has(i))) await drawAt(i);
      }
    }
    const arr: (Drawn | undefined)[] = specs.map((_, i) => out.get(i));
    if (style.devices.planes) await breakPlainRuns(arr, (i) => specs[i].layout, () => false, (i, cut) => drawOne(specs[i], rot.variants[i], style, { handle, index: i, total: specs.length, cut, invert: rot.cuts[i].invert, density: specs[i].density ?? 'normal', ground: rot.cuts[i].ground }));
    arr.forEach((d, i) => d && out.set(i, d));
    return { out, rot };
  };
  // Round N: a photo goes where it looks good: how much of its slot it fills and how much a crop cuts, measured on the slide as drawn (photoShape.ts), no model call
  let shapeRows: ShapeRow[] = [];
  if (look.images?.length && photoShapeRule.on) {
    const sh = await applyPhotoShape(specs, look, style, handle, ctaCtx);
    specs = sh.specs;
    pictureSwaps.push(...sh.swaps);
    shapeRows = sh.rows;
  }
  // Round Q: a picture still unused gets a second chance (pictureRescue.ts)
  let rescueRows: RescueRow[] = [];
  if (look.images?.length && pictureRescueRule.on) {
    const rs = await applyPictureRescue(specs, look, style, handle, ctaCtx);
    specs = rs.specs;
    pictureSwaps.push(...rs.swaps);
    rescueRows = rs.rows;
  }
  let { out: drawn, rot } = await drawAll();
  const failing = () => new Map<number, string[]>([...drawn].filter(([, d]) => d.problems.length || !d.built).map(([i, d]) => [i, d.problems.length ? d.problems : ['it could not be drawn']]));
  const retries: LibraryReport['retries'] = [];
  const bad = failing();
  // The repeats only matter when they are the sole problem of a slide that otherwise drew: the retry asks for another layout.
  if (bad.size && calls < 3 && !own) {
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
    // Round R: the retry's answer gets the button check too, before a preset's card closing could carry its label as a caption
    {
      const rb = dropInventedButtons(specs, req.text);
      specs = rb.specs;
      tr.trims.push(...rb.trims);
    }
    // a preset that closes on a card moves the new closing onto it again (the preset's flavour)
    if (style.closingLayout && look.pack?.look?.flavour) specs = flavourPass(specs, style, look, look.pack.name.replace(/ pack$/, ''), coverKeyOf(parsed.title, specs, styleIdOf(look.pack))).specs;
    // the layouts changed, so the rotation changes: redraw the whole deck (no model call)
    ({ out: drawn, rot } = await drawAll());
  }
  // Round R: the writer made fewer slides than the person asked for and photos are still unused after every placement pass: the code adds photo slides for them (no text on them), at most
  // the slides that were not made, never past the platform's cap or 10. After the retry, so the writer's slide numbers are the ones a retry speaks of. No model call.
  const slidesMade0 = specs.length;
  let photoSlidesAdded: PhotoSlideAdded[] = [];
  if (!own && look.images?.length && photoSlidesRule.on) {
    const cap = Math.min(n, req.slidesMax ?? hi, SLIDES_MAX, hi);
    if (cap > specs.length) {
      const ps = await addPhotoSlides(specs, look.images, cap - specs.length, style, async (sp, i, deck) => {
        const rc = deckRotation(deck, look, style).cuts[i];
        const d = await drawOne(sp, 0, style, { handle, index: i, total: deck.length, cut: rc.cut, invert: rc.invert, density: 'normal', ground: rc.ground });
        return d.built && !d.problems.length ? d.built.images ?? [] : null;
      });
      if (ps.added.length) {
        specs = ps.specs;
        photoSlidesAdded = ps.added;
        ({ out: drawn, rot } = await drawAll());
      }
    }
  }
  // A closing whose button is still not an action phrase after the retry: the button goes (the closing becomes a statement card with no button): a trim, never a failure.
  {
    const db = dropBadButtons(specs, ctaCtx);
    if (db.trims.length) {
      specs = db.specs;
      tr.trims.push(...db.trims);
      ({ out: drawn, rot } = await drawAll());
    }
  }
  // Round R: after the retry the same check: a button label only of the person's words, no button when the text asks for no action (never a generic "Follow for more")
  if (!own) {
    const ib = dropInventedButtons(specs, req.text);
    if (ib.trims.length) {
      specs = ib.specs;
      tr.trims.push(...ib.trims);
      ({ out: drawn, rot } = await drawAll());
    }
  }
  // The closing against the source text: the action the text asks for as the label, and a sub line only with words from the text.
  {
    const sc = settleClosing(specs, req.text);
    if (sc.trims.length) {
      specs = sc.specs;
      tr.trims.push(...sc.trims);
      ({ out: drawn, rot } = await drawAll());
    }
  }
  // Slides still failing: a plain version of the SAME layout (fields trimmed to their budgets), never the old template look.
  const fallbacks: LibraryReport['fallbacks'] = [];
  const adjustments: string[] = [...accentNotes];
  for (const [i, why] of failing()) {
    const sp = specs[i];
    const reason = why.join(' | ').slice(0, 300);
    if (own) {
      // the person's own words are never trimmed: the slide keeps its text and is drawn by the style's template (a warning on the slide says so)
      specs = specs.map((s, k) => (k === i ? { ...s, keepAsWritten: true } : s));
      fallbacks.push({ slide: i + 1, layout: sp.layout, level: 'kept as written (no library layout fits the text)', reason });
      continue;
    }
    let done: Drawn | null = null;
    let level = 'plain version of the same layout';
    // first: another layout that takes ALL of the slide's words and fits (no word is cut to make a drawing fit)
    if (!(sp.layout === 'photo-led' && !look.hasPhoto)) {
      for (const opt of layoutOptionsFor(sp, look)) {
        if (opt.current || opt.dropped.length || opt.droppedCore.length) continue;
        if (IMAGE_LAYOUT_IDS.includes(opt.layout as never) && !look.images?.length) continue;
        for (const v of [rot.variants[i], (1 - rot.variants[i]) as 0 | 1]) {
          const d = await drawOne({ ...sp, layout: opt.layout, fields: opt.fields, density: undefined }, v, style, { handle, index: i, total: specs.length, cut: 'plain', invert: false, density: 'normal' });
          if (d.built) { done = d; break; }
        }
        if (done) {
          level = `another layout that shows every word and fits ("${opt.layout}")`;
          specs = specs.map((s, k) => (k === i ? { ...s, layout: opt.layout, fields: opt.fields, density: undefined } : s));
          break;
        }
      }
    }
    // Round M: a repair is used only when it keeps EVERY word of the slide (repairFields drops a field the layout does not have, and clips to a field's length)
    const fixed0 = done ? null : layoutDef(sp.layout) && !(sp.layout === 'photo-led' && !look.hasPhoto) ? repairFields(sp.layout, fieldsOf(sp)) : null;
    const fixed = fixed0 && keepsAllWords(sp.fields, fixed0) ? fixed0 : null;
    if (fixed) for (const v of [rot.variants[i], (1 - rot.variants[i]) as 0 | 1]) {
      const d = await drawOne({ ...sp, fields: Object.fromEntries(Object.entries(fixed).filter(([k]) => k !== 'accent')) as Fields, density: undefined }, v, style, { handle, index: i, total: specs.length, cut: 'plain', invert: false, density: 'normal' });
      if (d.built) { done = d; break; }
    }
    // Round M: no repair keeps every word: the prose layout with EVERY word (a heading, then the rest in paragraphs, by sentence), before any fallback that would lose words
    if (!done) {
      const pf = proseFieldsOf(sp.fields);
      if (pf) for (const v of [0, 1] as const) {
        const d = await drawOne({ layout: 'prose', fields: pf, accents: sp.accents ?? [] }, v, style, { handle, index: i, total: specs.length, cut: 'plain', invert: false, density: 'normal' });
        if (d.built && keepsAllWords(sp.fields, pf)) {
          done = d;
          level = 'the prose layout with every word (the fields could not be repaired for the chosen layout without losing words)';
          specs = specs.map((s, k) => (k === i ? { layout: 'prose', fields: pf, accents: s.accents ?? [] } : s));
          break;
        }
      }
      if (done) { fallbacks.push({ slide: i + 1, layout: 'prose', level, reason }); drawn.set(i, done); continue; }
    }
    if (!done) {
      // the fields cannot be repaired for that layout and are too long for the prose layout: the plain statement layout with the text that is there (the words it loses are named in the level)
      const kept = Object.values(sp.fields).flat().map((x) => String(x).trim()).filter(Boolean)[0] ?? '';
      const lost = Object.entries(sp.fields).filter(([k]) => !/^image\d*$/.test(k)).flatMap(([, v]) => (Array.isArray(v) ? v : [v])).map((x) => String(x).trim()).filter((t) => t && t !== kept);
      level = 'plain statement layout (the fields could not be repaired for the chosen layout)' + (lost.length ? `; NOT on the slide: ${lost.map((t) => '"' + t + '"').join(', ')}` : '');
      const text0 = Object.values(sp.fields).flat().map((x) => String(x).trim()).filter(Boolean)[0] ?? 'Slide ' + (i + 1);
      done = await drawOne({ layout: 'statement', fields: { headline: clip(text0, 60) }, accents: [] }, 0, style, { handle, index: i, total: specs.length, cut: 'plain', invert: false, density: 'normal' });
      specs = specs.map((s, k) => (k === i ? { layout: 'statement', fields: { headline: clip(text0, 60) }, accents: [] } : s));
    } else if (fixed) specs = specs.map((s, k) => (k === i ? { ...s, fields: fixed, density: undefined } : s));
    fallbacks.push({ slide: i + 1, layout: specs[i].layout, level, reason });
    if (done) drawn.set(i, done);
  }
  // Round 15: the phone checks the person sees (size, edges, words, overlap, contrast) are run on every drawn slide. A slide that fails one is drawn again by the code in another layout that shows
  // every word (never a cut word, never a model call) and the change is logged as a repair; a slide no layout can repair stays as it is and is reported as "not repaired", never silently.
  const repairs: NonNullable<LibraryReport['repairs']> = [];
  const phoneFailures = (d: Drawn | undefined, sp: SlideSpec): string[] => {
    if (!d?.built) return [];
    const type = String(scriptSlideOf(sp.layout, sp.fields).type ?? 'content');
    return faithfulChecks(d.built.layers as never, { canvas: { w: 1080, h: 1350 }, bg: d.built.fieldBg ?? style.palette.bg, k: 1, slideType: type, prose: /data-layout="prose"/.test(d.built.svg), svg: d.built.svg, devices: d.built.devices }).filter((q) => !q.pass).map((q) => q.id + ': ' + q.reason).concat(slideCheckHook ? slideCheckHook(d.built.layers as unknown[], sp) : []);
  };
  if (!own) {
    const isContrast = (q: string) => q.startsWith('contrast:');
    for (let i = 0; i < specs.length; i++) {
      let failed = phoneFailures(drawn.get(i), specs[i]);
      if (!failed.length) continue;
      let sp = specs[i];
      // Round G: a failed contrast check is fixed by changing a COLOUR on the same layout (the ink that reads on the ground, the weak accent as a marker bar), never by moving the slide to another layout.
      // The layout is changed only for the other checks (size, edges, words, overlap).
      let styleUse = style;
      let how: 'colour' | 'layout' = 'layout';
      if (failed.some(isContrast)) {
        const fixedStyle = readableStyle(style, groundsUnderTitle(drawn.get(i)?.built?.layers as never, drawn.get(i)?.built?.fieldBg ?? style.palette.bg));
        if (fixedStyle) {
          const dc = await drawOne(sp, rot.variants[i], fixedStyle, { handle, index: i, total: specs.length, cut: 'plain', invert: false, density: 'normal' });
          if (dc.built && !dc.problems.length) {
            const after = phoneFailures(dc, sp);
            if (after.filter(isContrast).length < failed.filter(isContrast).length) {
              drawn.set(i, dc);
              styleUse = fixedStyle;
              how = 'colour';
              repairs.push({ slide: i + 1, from: sp.layout, to: sp.layout, failed: failed.filter(isContrast), result: after.some(isContrast) ? 'not repaired' : 'repaired', how: 'colour' });
              failed = after;
            }
          }
        }
        if (how !== 'colour') repairs.push({ slide: i + 1, from: sp.layout, to: sp.layout, failed: failed.filter(isContrast), result: 'not repaired', how: 'colour' });
        failed = failed.filter((q) => !isContrast(q));
      }
      if (!failed.length) continue;
      let fixed: { d: Drawn; spec: SlideSpec } | null = null;
      for (const opt of layoutOptionsFor(sp, look)) {
        if (opt.current || opt.dropped.length || opt.droppedCore.length) continue;
        if (IMAGE_LAYOUT_IDS.includes(opt.layout as never) && !look.images?.length) continue;
        for (const v of [rot.variants[i], (1 - rot.variants[i]) as 0 | 1]) {
          const spec2 = { ...sp, layout: opt.layout, fields: opt.fields, density: undefined } as SlideSpec;
          const d = await drawOne(spec2, v, styleUse, { handle, index: i, total: specs.length, cut: 'plain', invert: false, density: 'normal' });
          // the new layout has to pass every check but contrast (a colour failure is never a reason to choose a layout)
          if (d.built && !d.problems.length && !phoneFailures(d, spec2).filter((q) => !isContrast(q)).length) { fixed = { d, spec: spec2 }; break; }
        }
        if (fixed) break;
      }
      if (fixed) {
        specs = specs.map((x, k) => (k === i ? fixed!.spec : x));
        drawn.set(i, fixed.d);
        repairs.push({ slide: i + 1, from: sp.layout, to: fixed.spec.layout, failed, result: 'repaired', how: 'layout' });
      } else repairs.push({ slide: i + 1, from: sp.layout, to: sp.layout, failed, result: 'not repaired', how: 'layout' });
    }
  }
  for (const d of drawn.values()) adjustments.push(...d.adjustments);
  // the script (the app's own slide types) the editor, the exports and the report use; the slides are drawn from the library
  const raw = { title: parsed.title || 'Carousel', brand: { handle }, slides: specs.map((s) => scriptSlideOf(s.layout, s.fields)) };
  let v = validateScriptText(JSON.stringify(raw), req.format);
  if (!v.script) {
    raw.slides = raw.slides.map((s, i) => (v.errors.some((e) => e.path.startsWith(`slides[${i}]`)) ? { type: 'content', headline: clip(String(s.headline ?? s.quote ?? 'Slide ' + (i + 1)), 90), body: clip(JSON.stringify(specs[i].fields), 250), element_tags: ['idea', 'message'] } : s));
    v = validateScriptText(JSON.stringify(raw), req.format);
  }
  if (!v.script && !own) throw new WriterError('invalid', 'The slides could not be turned into a script.', v.errors);
  const script: CarouselScript = own ? { ...own.script, brand: { ...own.script.brand, handle: handle.trim() || own.script.brand.handle } } : { ...v.script!, brand: { ...v.script!.brand, handle: handle.trim() || v.script!.brand.handle } };
  const designed: Designed = { slides: {}, fallbacks: {}, notes: [], calls, ms, layouts: {}, ...(tokens.input || tokens.output ? { tokens } : {}), ...(writes.length ? { requestBytes: { images: [], prompt: writes[0].promptChars, body: writes[0].requestBytes ?? writes[0].promptBytes } } : {}) };
  // Round T: text over a picture is measured and, where it does not read, repaired (the repaired drawing is the one kept)
  const settled = await settlePhotoContrast(specs.map((_, i) => drawn.get(i)), specs.map((sp) => sp.layout));
  settled.drawn.forEach((d, i) => { if (d) drawn.set(i, d); });
  const photoContrast = settled.rows;
  adjustments.push(...settled.notes);
  specs.forEach((s, i) => {
    const d = drawn.get(i);
    if (!d?.built) return;
    const ds: DesignedSlide = { pack: stubPack(style, 'library'), built: { svg: d.built.svg, layers: d.built.layers as Layer[], bg: d.built.fieldBg ?? style.palette.bg, ...(d.built.devices ? { devices: d.built.devices } : {}), ...(d.built.images ? { images: d.built.images } : {}), ...(d.built.fills ? { fills: d.built.fills } : {}) } };
    designed.slides[String(i)] = ds;
    designed.layouts![String(i)] = s.layout;
  });
  const seconds = Math.round((performance.now() - t0) / 100) / 10;
  // the pictures of the project and what became of them in the FINAL deck
  const pictureUse: LibraryReport['pictureUse'] = look.images?.length ? pictureUseOf(specs, look.images) : undefined;
  const report: LibraryReport = {
    route: 'library',
    ...(own ? {} : { slidesRequested: n, keepEverySentence: req.keepEverySentence !== false }),
    ...(photoContrast.length ? { photoContrast } : {}),
    ...(photoSlidesAdded.length ? { photoSlidesAdded: { count: photoSlidesAdded.length, slidesBefore: slidesMade0, slides: photoSlidesAdded } } : {}),
    drawVersion: DRAW_VERSION,
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
    ...(shapeRows.length ? { photoShape: shapeRows } : {}),
    ...(rescueRows.length ? { pictureRescue: rescueRows } : {}),
    ...(repairs.length ? { repairs } : {}),
    ...(writes.length ? { writes } : {}),
    ...(pictureUse ? { pictureUse } : {}),
    ...(own?.marks?.some(Boolean) ? { ownMarks: own.marks } : {}),
    ...(tr.trims.length ? { trims: tr.trims } : {}),
    ...(writerClosing ? { writerClosing } : {}),
  };
  designed.library = report;
  report.codeAdjustments.unshift(...tr.trims.map(trimNote));
  designed.notes.push(...pictureSwaps.map((w) => `Pictures: slide ${w.slide} ${w.from} -> ${w.to} (${w.why})`));
  report.codeAdjustments.push(...repairs.map((r) => `slide ${r.slide}: ${r.from}${r.result === 'repaired' ? ' -> ' + r.to : ''} (${r.result}: ${r.failed.join('; ')})`));
  report.codeAdjustments.push(...pictureSwaps.filter((w) => w.why.startsWith('screenshot never') || w.why.startsWith('no picture left')).map((w) => `slide ${w.slide}: ${w.from} -> ${w.to} (${w.why})`));
  if (fp) designed.notes.push(...fp.swaps.map((w) => `Flavour: slide ${w.slide} ${w.from} -> ${w.to} (${w.why})${w.droppedOptional.length ? '; leaves out ' + w.droppedOptional.map((t) => '"' + t.slice(0, 24) + '"').join(', ') : ''}.`));
  designed.notes.push(...retries.map((r) => `Retry for slide ${r.slide}: ${r.reasons.join('; ')}`), ...fallbacks.map((f) => `Slide ${f.slide} fell back to a ${f.level}: ${f.reason}`), ...adjustments);
  return { script, style: null, note: parsed.note, attempts: calls > 1 ? 2 : 1, ms, warnings: v.warnings, provider: p.id, designed };
}

/** The report notes for a preset's flavour swaps (shared by a new deck and by a style switch). */
export const flavourNotes = (swaps: FlavourSwap[]): string[] => swaps.map((w) => `Flavour: slide ${w.slide} ${w.from} -> ${w.to} (${w.why})${w.droppedOptional.length ? '; leaves out ' + w.droppedOptional.map((t) => '"' + t.slice(0, 24) + '"').join(', ') : ''}.`);

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
  const { style: style0, notes: styleNotes } = styleFromPack(look.pack);
  // the website of the profile / brand settings (the one the deck was made with, when the caller gives none)
  const site = look.site?.trim() || (lib.style as { site?: string } | null)?.site?.trim();
  const style: LayoutStyle = site ? { ...style0, site } : style0;
  let specs = lib.plan.specs;
  const ids = specs.map((s) => (layoutDef(s.layout) ? (s.layout as LayoutId) : ('statement' as LayoutId)));
  // the picture-layout cap of the deck: from the project's pictures, or (a caller that gives none) from the photos the plan shows
  const planPhotos = [...new Set(specs.flatMap((s) => Object.values(s.fields).filter((v): v is string => typeof v === 'string' && v.startsWith('picture:') && v.includes('k=p')).map((v) => v.split('#')[0])))].map(() => ({ content: 'photo' }));
  const { variants } = rotationOf(specs, !!look.hasPhoto, style.flavour, pictureLayoutCap(look.images?.length ? look.images : planPhotos));
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
    if (specs[i].keepAsWritten && slideProblems(specs[i], look).length) {
      drawn.push({ built: null, cut: 'plain', invert: false, density: 'normal', adjustments: [], problems: slideProblems(specs[i], look) } as Drawn);
      continue;
    }
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
  // Round J: the redraw runs the phone check a new deck runs. A slide drawn from the stored plan can carry a layout, a ground or a tint the new style would not have picked itself (a card the previous
  // style chose, under this style's gradient headline); a contrast failure there is fixed the way the new-deck repair fixes it: by a COLOUR on the same layout (the ink that reads, the gradient
  // moved along its hue for the grounds under the title), never by another layout, a cut word or a model call. The layout, variant, cut, tint and ground of the slide stay.
  const redrawRepairs: NonNullable<LibraryReport['repairs']> = [];
  const contrastFails = (d: Drawn, sp: SlideSpec): string[] => (d.built ? faithfulChecks(d.built.layers as never, { canvas: { w: 1080, h: 1350 }, bg: d.built.fieldBg ?? style.palette.bg, k: 1, slideType: String(scriptSlideOf(sp.layout, sp.fields).type ?? 'content'), prose: /data-layout="prose"/.test(d.built.svg), svg: d.built.svg, devices: d.built.devices }).filter((q) => !q.pass && q.id === 'contrast').map((q) => q.id + ': ' + q.reason) : []);
  for (let i = 0; i < drawn.length; i++) {
    const d = drawn[i];
    if (!d?.built) continue;
    const failed = contrastFails(d, specs[i]);
    if (!failed.length) continue;
    const fixedStyle = readableStyle(style, groundsUnderTitle(d.built.layers as never, d.built.fieldBg ?? style.palette.bg));
    const dc = fixedStyle ? await drawOne(specs[i], variants[i], fixedStyle, { handle, index: i, total: specs.length, cut: d.cut, invert: rc[i].invert, density: specs[i].density ?? 'normal', ground: rc[i].ground }) : null;
    const after = dc?.built && !dc.problems.length && dc.cut === d.cut ? contrastFails(dc, specs[i]) : null;
    if (dc && after && after.length < failed.length) {
      drawn[i] = dc;
      redrawRepairs.push({ slide: i + 1, from: specs[i].layout, to: specs[i].layout, failed, result: after.length ? 'not repaired' : 'repaired', how: 'colour' });
    } else redrawRepairs.push({ slide: i + 1, from: specs[i].layout, to: specs[i].layout, failed, result: 'not repaired', how: 'colour' });
  }
  // Round T: text over a picture, measured and repaired the way a new deck is
  const settled = await settlePhotoContrast(drawn, specs.map((s) => s.layout));
  settled.drawn.forEach((d, i) => { if (d) drawn[i] = d; });
  adjustments.push(...settled.notes);
  for (const r of redrawRepairs) adjustments.push(`slide ${r.slide}: a colour changed so the words read at phone size, same layout (${r.result}: ${r.failed.join('; ')}).`);
  drawn.forEach((d, i) => {
    adjustments.push(...d.adjustments);
    if (d.built) {
      slides[String(i)] = { pack: stubPack(style, 'library'), built: { svg: d.built.svg, layers: d.built.layers as Layer[], bg: d.built.fieldBg ?? style.palette.bg, ...(d.built.devices ? { devices: d.built.devices } : {}), ...(d.built.images ? { images: d.built.images } : {}), ...(d.built.fills ? { fills: d.built.fills } : {}) } };
      layouts[String(i)] = specs[i].layout;
    }
  });
  const photoContrast = settled.rows;
  const library: LibraryReport = {
    ...lib,
    photoContrast: photoContrast.length ? photoContrast : undefined,
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
    redrawRepairs: redrawRepairs.length ? redrawRepairs : undefined,
    drawVersion: DRAW_VERSION,
    grounds: rc.map((c) => c.ground ?? null),
  };
  return { slides, layouts, library };
}
