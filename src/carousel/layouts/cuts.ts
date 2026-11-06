// The Cut: one dominant edge per slide, drawn as a colour plane that may bleed off the canvas. Re-implemented geometry after the four layout families of
// sausi-7/carousels (MIT) - edge-h (plane along the bottom), edge-v (full-height side plane), angle (raked top edge), curve (dome). Static drawing only.
// Adapted from sausi-7/carousels, MIT: the family split and the idea that type keys off the plane edge; the maths below is our own, in px on a 1080 x 1350 slide.
import { contrast } from './draw';
import type { Cut, Cx, PlaneTone } from './types';

const W = 1080;
const H = 1350;
export const CUT_RATIO: Record<Cut, number> = { plain: 0, 'edge-h': 0.28, 'edge-v': 0.3, angle: 0.28, curve: 0.26 };
/** How far the plane's top edge is below its highest point at the left margin (the rake of an angle, the depth of the dome's shoulder). */
export const RAKE: Record<Cut, number> = { plain: 0, 'edge-h': 0, 'edge-v': 0, angle: 144, curve: 176 };

export interface Geometry {
  cut: Cut;
  /** The free field the layout composes in (a layout with a plane part overrides y1). */
  field: Cx['field'];
  /** SVG of the plane (palette tokens "$plane", stroke "$planeInk" when it needs a drawn edge); empty for plain. */
  plane: (stroke: boolean) => string;
  /** Does a point lie on the plane? */
  on: (x: number, y: number) => boolean;
  /** Where the plane starts at its highest point (y), or the side plane's left edge (x). */
  edge: number;
  /** Bottom of the free field the checks should use for the balance rule. */
  fieldBottom: number;
}

/** The plane and the free field for a cut. `ratio` is how much of the slide the plane takes; `Tover` fixes the plane's top (its highest point) instead. */
export function geometry(cut: Cut, ratio = CUT_RATIO[cut], Tover?: number): Geometry {
  const base = { x0: 48, w: 978, y0: 190, y1: 1190 };
  const stroke = (on: boolean) => (on ? ' stroke="$planeInk" stroke-width="5"' : '');
  if (cut === 'plain') return { cut, field: base, plane: () => '', on: () => false, edge: H, fieldBottom: 1210 };
  if (cut === 'edge-v') {
    const s = Math.round(W * ratio);
    const x = W - s;
    return {
      cut, field: { x0: 48, w: x - 40 - 48, y0: 190, y1: 1190 },
      plane: (st) => `<rect x="${x}" y="-60" width="${s + 60}" height="${H + 120}" fill="$plane"${stroke(st)}/>`,
      on: (px) => px >= x, edge: x, fieldBottom: 1210,
    };
  }
  const T = Tover ?? H - Math.round(H * ratio);
  const bottom = T - 44;
  const field = { x0: 48, w: 978, y0: 190, y1: bottom };
  if (cut === 'edge-h')
    return { cut, field, plane: (st) => `<rect x="-60" y="${T}" width="${W + 120}" height="${H - T + 460}" fill="$plane"${stroke(st)}/>`, on: (_x, y) => y >= T, edge: T, fieldBottom: bottom };
  if (cut === 'angle') {
    const drop = 150;
    return {
      cut, field: { ...field, y1: bottom - 8 },
      plane: (st) => `<path d="M -60 ${T + drop} L ${W + 60} ${T} L ${W + 60} ${H + 460} L -60 ${H + 460} Z" fill="$plane"${stroke(st)}/>`,
      on: (x, y) => y >= T + (drop * (W - x)) / W, edge: T, fieldBottom: bottom - 8,
    };
  }
  // curve: a dome (a wide ellipse whose crown is at T)
  const ry = 760;
  return {
    cut, field,
    plane: (st) => `<ellipse cx="${W / 2}" cy="${T + ry}" rx="${W * 0.72}" ry="${ry}" fill="$plane"${stroke(st)}/>`,
    on: (x, y) => ((x - W / 2) / (W * 0.72)) ** 2 + ((y - (T + ry)) / ry) ** 2 <= 1,
    edge: T, fieldBottom: bottom,
  };
}

// ----- colour: the roles on a surface, the plane, the invert -----
// ----- accent as text: lightened (same hue) when it is under 4.5:1 on a dark surface
export const toHsl = (hex: string): [number, number, number] => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
};
export const fromHsl = (h: number, s: number, l: number): string => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
};
export const hueOf = (hex: string): number => toHsl(hex)[0];
/** On a dark surface, an accent under `min` as large text is lightened (hue and saturation kept) in 1% steps until it reaches `min`. Unchanged on a light surface or when it already reads. */
export function lightenForText(accent: string, surface: string, min = 4.5): { color: string; changed: boolean } {
  if (contrast(accent, surface) >= min) return { color: accent, changed: false };
  if (contrast('#FFFFFF', surface) <= contrast('#000000', surface)) return { color: accent, changed: false };
  const [h, s, l0] = toHsl(accent);
  for (let l = l0 + 0.01; l <= 0.97; l += 0.01) {
    const c = fromHsl(h, s, l);
    if (contrast(c, surface) >= min) return { color: c, changed: true };
  }
  return { color: accent, changed: false };
}
/** The accent as text on a surface: itself when it reads at 4.5:1, a lightened copy on a dark surface, else itself at 3:1, else the text colour. */
export function accentTextOf(accent: string, surface: string, text: string, refs: string[] = []): { accentText: string; accentInk?: string } {
  if (contrast(accent, surface) >= 4.5) return { accentText: accent };
  // A deck has ONE lightened accent: on a dark surface it is lightened until it reads on the hardest dark ground of the deck (`refs`: the ground, the card/tint colour), so the
  // same accent is not pure red on one slide and coral on the next (Shapes off / subtle / bold, tinted slides).
  const isDark = (s: string) => contrast('#FFFFFF', s) > contrast('#000000', s);
  const worst = isDark(surface) ? [surface, ...refs.filter(isDark)].reduce((w, s) => (contrast(accent, s) < contrast(accent, w) ? s : w), surface) : surface;
  const lk = lightenForText(accent, worst);
  if (lk.changed) return { accentText: lk.color, accentInk: lk.color };
  // under 4.5:1 the accent is not used as text: the text colour is (the engine then sets accent phrases on a marker bar)
  return { accentText: text };
}

export interface Roles {
  bg: string;
  text: string;
  muted: string;
  accent: string;
  surface: string;
  onAccent: string;
  /** The accent as text on this surface (the accent when it reads at 3:1, else the text colour). */
  accentText: string;
  /** Set only when the accent had to be lightened to read as text on this surface: that lighter colour (same hue). The accent itself is unchanged. */
  accentInk?: string;
}
type Pal = Record<string, string>;
const mix = (a: string, b: string, t: number): string => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = p(a);
  const [br, bg, bb] = p(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return ('#' + c(ar, br) + c(ag, bg) + c(ab, bb)).toUpperCase();
};
/** The better of the inks on a surface. */
export const inkOn = (surface: string, inks: string[]): string => inks.reduce((b, c) => (contrast(c, surface) > contrast(b, surface) ? c : b), inks[0]);
/** A quiet ink that still clears `min` on every surface (blends from the quiet colour toward full ink). */
export const quietOn = (ink: string, surfaceOrSurfaces: string | string[], quiet: string, min = 3.2): string => {
  const surfaces = Array.isArray(surfaceOrSurfaces) ? surfaceOrSurfaces : [surfaceOrSurfaces];
  const ok = (c: string) => surfaces.every((s) => contrast(c, s) >= min);
  if (ok(quiet)) return quiet;
  for (const t of [0.75, 0.55, 0.35, 0.15, 0]) {
    const c = mix(ink, quiet, t);
    if (ok(c)) return c;
  }
  return ink;
};
/** The better of the inks on a surface that reaches `min` contrast; when none of them does, pure white or black (whichever reads better). */
export const readableInk = (surface: string, inks: string[], min = 4.5): string => {
  const best = inkOn(surface, inks);
  return contrast(best, surface) >= min ? best : inkOn(surface, [...inks, '#FFFFFF', '#000000']);
};
/**
 * Every role re-derived for a surface colour, so text, muted, accent and surface keep their contrast on it. The text colour is the one with the higher contrast and reaches
 * 4.5:1 (on #CC0000 that is white, not the near-black that only reaches 3.4:1). The accent is the other ink only when it also reaches 4.5:1, else it is the text colour
 * (the engine then sets accent phrases on a marker bar).
 */
export function rolesFor(surface: string, base: Pal): Roles {
  const text = readableInk(surface, [base.text, base.bg, base.onAccent]);
  const other = [base.text, base.bg].find((c) => c !== text);
  const accent = other && contrast(other, surface) >= 4.5 ? other : text;
  const card = mix(surface, text, 0.08);
  return { bg: surface, text, muted: quietOn(text, [surface, card], mix(text, surface, 0.35), 4.5), accent, surface: card, onAccent: readableInk(accent, [text, surface, base.bg, base.text]), ...accentTextOf(accent, surface, text) };
}

export interface Colours {
  /** Roles on the field and on the plane. */
  F: Roles;
  P: Roles;
  /** The plane drawn needs an edge line (its colour is too close to the field). */
  edge: boolean;
  inverted: boolean;
}
/**
 * The colours of a slide. The plane takes `tone` (accent, surface or the ink colour) and has its own roles (text, muted, accent, surface re-derived for it, so part B on the
 * plane keeps its contrast). `invert: 'full'` swaps field and plane colours; `invert: 'tint'` only moves the field to the surface colour (for flat styles with no planes).
 */
export function coloursFor(base: Pal, opts: { tone?: PlaneTone; invert?: false | 'full' | 'tint'; /** The deck uses tinted slides (the card colour as a ground). A palette rhythm does not: then the card colour does not decide how light the accent text must be. Default true. */ tints?: boolean }): Colours {
  const tone = opts.tone ?? 'accent';
  const plane0 = tone === 'ink' ? base.text : tone === 'surface' ? base.surface : base.accent;
  const baseRoles: Roles = { bg: base.bg, text: base.text, muted: base.muted, accent: base.accent, surface: base.surface, onAccent: base.onAccent, ...accentTextOf(base.accent, base.bg, base.text, opts.tints === false ? [] : [base.surface]) };
  let F = baseRoles;
  let planeFill = plane0;
  let inverted = false;
  if (opts.invert === 'full') {
    inverted = true;
    F = rolesFor(plane0, base);
    planeFill = base.bg;
  } else if (opts.invert === 'tint' && base.surface !== base.bg) {
    inverted = true;
    F = { ...baseRoles, bg: base.surface, surface: base.bg, muted: quietOn(base.text, [base.surface, base.bg], base.muted, 4.5), ...accentTextOf(base.accent, base.surface, base.text, [base.bg]) };
  }
  const P = opts.invert === 'full' ? baseRoles : rolesFor(planeFill, base);
  return { F, P: { ...P, bg: planeFill, ...accentTextOf(P.accent, planeFill, P.text) }, edge: contrast(planeFill, F.bg) < 1.5, inverted };
}
