// Round G part E: a brand (1 to 3 colours) applied to a style's palettes. Pure code: no UI, no storage, no model call.
// `applyBrand(pack, brand)` takes the style's pack (presetPackFor) and returns the pack with the brand's colours in it, the list of changes the guard made (plain words, with the contrast
// ratio that forced each) and, for each ground of the style's rhythm, which rule of the brand filled it. With no brand the pack is returned as it is (the same object).
//
// Reused from the existing colour code (not rewritten): `fixGround` (designLibrary.ts) makes every neutral ground readable (ink 4.5:1 on every colour of the ground, a muted ink and a card that read),
// `readableInk` / `quietOn` / `lightenForText` / `accentRolesOf` / `toHsl` / `fromHsl` (layouts/cuts.ts) choose inks and say how an accent reads as text on a ground (lightened on a dark one, else a bar
// of the accent colour with the ink on it: the "marker bar" the layouts already draw on the same layout). New here: the brand rules 1 to 7 below.
import { contrast } from './layouts/draw';
import { accentRolesOf, fromHsl, quietOn, readableInk, toHsl } from './layouts/cuts';
import { fixGround, readableGradient } from './designLibrary';
import type { PackGround, StylePack } from '../reference/pack';

export interface Brand {
  /** 1 to 3 colours as #RRGGBB (or #RGB): the first is the main colour, the second the secondary, the third the tertiary. */
  colours: string[];
  name?: string;
}
export interface BrandChange {
  kind: 'ignored' | 'close' | 'ink' | 'accent-text' | 'secondary' | 'gradient' | 'derived';
  /** The sentence for the person. */
  text: string;
  from?: string;
  to?: string;
  /** The contrast ratio that forced the change. */
  ratio?: number;
}
export interface BrandGround {
  /** Position in the style's rhythm (-1 = the closing ground). */
  slot: number;
  /** The style's own ground colour. */
  was: string;
  kind: 'light' | 'dark' | 'accent';
  /** Which rule of the brand filled it (plain words). */
  rule: string;
  bg: string;
}
export interface BrandResult { pack: StylePack; changes: BrandChange[]; grounds: BrandGround[] }

const HEX = /^#[0-9a-f]{6}$/i;
const norm = (c: string): string | null => {
  const t = String(c).trim();
  if (/^#[0-9a-f]{3}$/i.test(t)) return ('#' + [...t.slice(1)].map((x) => x + x).join('')).toUpperCase();
  return HEX.test(t) ? t.toUpperCase() : null;
};
const mix = (a: string, b: string, t: number): string => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [pa, pb] = [p(a), p(b)];
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
};
const r1 = (n: number) => (Math.round(n * 10) / 10).toString();
const ratio = (a: string, b: string) => r1(contrast(a, b));
const isDark = (c: string) => contrast('#FFFFFF', c) > contrast('#000000', c);

/**
 * Two brand colours too close to tell apart: they read under 1.25:1 against each other, or under 1.6:1 with hues within 25 degrees (two blues). A colour and white or black are never "close" by the
 * hue rule (an achromatic colour has no hue), so neon green with white stays a pair.
 */
export function tooClose(a: string, b: string): boolean {
  const c = contrast(a, b);
  if (c < 1.25) return true;
  const [h1, s1] = toHsl(a);
  const [h2, s2] = toHsl(b);
  if (s1 < 0.12 || s2 < 0.12) return false;
  const hd = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
  return c < 1.6 && hd < 25;
}

/**
 * Round G2: how visible an accent drawn as a SHAPE (a highlight bar, a pill, a card edge) has to be against its ground: 3.6:1 (the luminance contrast ratio of the accent colour against the ground colour).
 * It is the weakest accent the 15 built-in styles ship (object-neon: #45C9A0 on the lightest stop of its dark gradient, 3.67:1; the next are 4.81 and 4.97), rounded down. A brand is never less visible than
 * what we ship. Pale yellow on an off-white ground reads 1.1:1 and does not pass.
 */
export const ACCENT_FLOOR = 3.6;
/**
 * Round G3: brightness is not the only way a shape shows. A pale yellow bar on an off-white page is as bright as the page (1.2:1) and still reads as a clear yellow highlighter, because its COLOUR differs.
 * The colour difference is the distance in OKLab (the perceptual colour space of Ottosson, 2020: L, a, b; simple, one formula, equal steps look about equal). 0.12 is the floor. It is set from the
 * calibration cases, not from the built-ins (the weakest built-in, object-neon at 0.32, would reject the pale yellow, 0.142, which must show): every shape that has to show is at 0.142 or more
 * (pale yellow on off-white 0.142, neon on off-white 0.292, orange on navy 0.578) and every one that must not is at 0.105 or less (navy on near-black 0.105, near-black on near-black 0.023,
 * an accent a few percent from its ground 0.027), so 0.12 sits between them (0.022 above the weakest pass, 0.015 below the strongest fail).
 */
export const ACCENT_FLOOR_DE = 0.12;
const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const oklab = (hex: string): [number, number, number] => {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const sv = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * sv, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * sv, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * sv];
};
/** The colour difference of two #RRGGBB colours: the Euclidean distance in OKLab. */
export const colourDifference = (a: string, b: string): number => {
  const x = oklab(a), y = oklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
/** A shape in `accent` shows on `ground` when it reaches the floor on brightness (luminance contrast) OR on colour difference. */
export const accentVisible = (accent: string, ground: string): boolean => contrast(accent, ground) >= ACCENT_FLOOR || colourDifference(accent, ground) >= ACCENT_FLOOR_DE;
/** The most a brand colour's lightness may move (HSL, 0 to 1) to reach the floor and still read as the brand: a quarter of the scale. */
export const MAX_ACCENT_STEP = 0.25;
/** A dark primary is the dark ground itself when off-white text on it reaches this contrast. */
export const DARK_PRIMARY_INK = 7;

type Kind = 'light' | 'dark' | 'accent';
type PickHow = 'primary' | 'secondary' | 'step' | 'ink';
interface Pick { accent: string; how: PickHow; /** What the main colour reads against that ground. */ was: number; bg: string }
/** What a ground of a style is: a lively mid-tone (saturated, not near white or black) is an accent ground, else light or dark by its luminance. */
function kindOf(bg: string): Kind {
  const [, s, l] = toHsl(bg);
  if (s >= 0.45 && l > 0.15 && l < 0.85) return 'accent';
  return isDark(bg) ? 'dark' : 'light';
}

export function applyBrand(pack: StylePack, brand?: Brand | null): BrandResult {
  if (!brand || !brand.colours?.length) return { pack, changes: [], grounds: [] };
  const changes: BrandChange[] = [];
  const given = brand.colours.slice(0, 3).map(norm);
  if (!given[0]) return { pack, changes: [{ kind: 'ignored', text: `"${brand.colours[0]}" is not a colour (use a hex colour such as #39FF14), so the style keeps its own colours.` }], grounds: [] };
  const P = given[0]!;
  let S = given[1] ?? null;
  const T = given[2] ?? null;
  brand.colours.slice(1, 3).forEach((c, i) => { if (!given[i + 1]) changes.push({ kind: 'ignored', text: `"${c}" is not a colour, so it was left out.` }); });
  // rule 5: two colours too close to tell apart: the second is treated as missing
  if (S && tooClose(P, S)) {
    changes.push({ kind: 'close', from: S, ratio: contrast(P, S), text: `These two colours are very close (${ratio(P, S)}:1), so we used the first, ${P}, as your main colour.` });
    S = null;
  }
  // rule 1: the secondary, when missing, is a lighter or darker step of the main colour
  const derivedS = (() => { const [h, s, l] = toHsl(P); return fromHsl(h, s, Math.max(0.04, Math.min(0.96, l + (isDark(P) ? 0.22 : -0.22)))); })();
  const second = S ?? derivedS;
  if (!S) changes.push({ kind: 'derived', to: derivedS, text: `We made a second colour from your main one (${derivedS}) for cards and extra highlights.` });

  // rule 2: the neutral grounds and their inks come from the neutrals, tinted a few percent toward the main colour
  const LIGHT = mix('#FFFFFF', P, 0.05);
  const INK_ON_LIGHT = mix('#141414', P, 0.05);
  const INK_ON_DARK = mix('#F4F4F4', P, 0.05);
  // Round G2: a primary dark enough for off-white text to reach 7:1 IS the dark ground (navy makes the dark slides navy); a lighter primary keeps the near-black tinted toward it
  const darkIsP = contrast(INK_ON_DARK, P) >= DARK_PRIMARY_INK;
  const DARK = darkIsP ? P : mix('#0C0C0D', P, 0.07);
  // Round G2: the accent of a ground (what a highlight bar, a pill or a marker is drawn in) is the first of: the main colour, the second colour (when the brand has one), a step of the main colour's lightness
  // (at most MAX_ACCENT_STEP, same hue) and the ground's own ink, that reaches ACCENT_FLOOR against the ground
  const picks = new Map<string, Pick>();
  const pickAccent = (bg: string, ink: string): Pick => {
    const was = contrast(P, bg);
    if (accentVisible(P, bg)) return { accent: P, how: 'primary', was, bg };
    if (S && accentVisible(S, bg)) return { accent: S, how: 'secondary', was, bg };
    const [h, sat, l0] = toHsl(P);
    for (let k = 1; k <= Math.round(MAX_ACCENT_STEP * 100); k++) {
      const c = fromHsl(h, sat, Math.max(0, Math.min(1, l0 + (isDark(bg) ? 1 : -1) * 0.01 * k)));
      if (accentVisible(c, bg)) return { accent: c, how: 'step', was, bg };
    }
    return { accent: ink, how: 'ink', was, bg };
  };
  const markerAvailable = !pack.look?.deco?.penCircle;
  const shifts = new Map<string, { col: string; to: string; from: number }>();
  const neutral = (kind: 'light' | 'dark', gradient?: PackGround['gradient']): PackGround => {
    const bg = kind === 'light' ? LIGHT : DARK;
    const text = kind === 'light' ? INK_ON_LIGHT : INK_ON_DARK;
    const surface = kind === 'dark' && darkIsP ? mix(bg, text, 0.1) : mix(bg, second, kind === 'light' ? 0.12 : 0.14);
    const pk = pickAccent(bg, text);
    picks.set(kind, pk);
    const g: PackGround = { bg, text, muted: quietOn(text, [bg, surface], mix(text, bg, 0.4), 4.5), accent: pk.accent, surface, onAccent: readableInk(pk.accent, [bg, text, '#FFFFFF', '#000000']), ...(kind === 'dark' && darkIsP ? { keepBg: true } : {}) };
    // a style without the marker bar (the pen-circle style circles the word and sets it in the accent) cannot fall back to a bar: its accent is shifted, same hue, until it reads 4.5:1 on the ground and the card
    if (!markerAvailable && Math.min(contrast(pk.accent, bg), contrast(pk.accent, surface)) < 4.5) {
      const shifted = readableGradient([pk.accent], [bg, surface], 4.5)[0];
      shifts.set(kind, { col: pk.accent, to: shifted, from: Math.min(contrast(pk.accent, bg), contrast(pk.accent, surface)) });
      g.accent = shifted;
      g.onAccent = readableInk(shifted, [bg, text, '#FFFFFF', '#000000']);
    }
    const fixed = fixGround(g, []);
    if (!gradient) return fixed;
    // a gradient ground keeps its angle and its stops' places; the colours are the neutral ground moving toward the main colour
    const n = gradient.stops.length;
    return { ...fixed, bg, gradient: { angle: gradient.angle, stops: gradient.stops.map((s, k) => ({ at: s.at, color: darkIsP && kind === 'dark' ? mix(bg, '#FFFFFF', 0.03 + 0.08 * (n > 1 ? k / (n - 1) : 0)) : mix(bg, P, 0.06 + 0.16 * (n > 1 ? k / (n - 1) : 0)) })) } };
  };
  // rule 3: an accent ground is the main colour itself (a second accent ground, the secondary), with the ink that reads on it
  const accentGround = (bg: string): { g: PackGround; note: BrandChange | null } => {
    const text = readableInk(bg, [mix('#111111', bg, 0.05), mix('#F4F4F4', bg, 0.05)]);
    const c = contrast(text, bg);
    // keepBg: the ground IS the brand colour; the ground fix must not move it toward a 6:1 ink (the ink reaches 4.5:1 or is the better of black and white)
    const pk = pickAccent(bg, text);
    picks.set('accent:' + bg, pk);
    const g: PackGround = { bg, text, muted: quietOn(text, [bg], mix(text, bg, 0.35), 4.5), accent: pk.accent, surface: mix(bg, text, 0.12), onAccent: readableInk(pk.accent, [bg, text, '#FFFFFF', '#000000']), keepBg: true };
    return { g, note: c < 4.5 ? { kind: 'ink', ratio: c, to: text, text: `Text on ${bg} is the best we can do, ${text} (${r1(c)}:1), which is under 4.5:1.` } : null };
  };

  const look = pack.look ?? {};
  const slots: { slot: number; g: PackGround }[] = [...(look.rhythm ?? []).map((g, i) => ({ slot: i, g })), ...(look.closing ? [{ slot: -1, g: look.closing }] : [])];
  if (!slots.length) slots.push({ slot: 0, g: { bg: pack.palette.bg, text: pack.palette.text, muted: pack.palette.muted ?? pack.palette.text, accent: pack.palette.accent, surface: pack.palette.surface ?? pack.palette.bg, onAccent: pack.palette.onAccent } });
  const accentOrder: string[] = [];
  for (const { g } of slots) if (kindOf(g.bg) === 'accent' && !accentOrder.includes(g.bg.toUpperCase())) accentOrder.push(g.bg.toUpperCase());
  const grounds: BrandGround[] = [];
  const made = new Map<string, PackGround>();
  const noted = new Set<string>();
  const out = slots.map(({ slot, g }) => {
    const kind = kindOf(g.bg);
    const key = kind + ':' + g.bg.toUpperCase() + (g.gradient ? 'g' : '');
    let ng = made.get(key);
    let rule = '';
    if (kind === 'accent') {
      const which = accentOrder.indexOf(g.bg.toUpperCase());
      const bg = which === 0 ? P : second;
      if (!ng) {
        const r = accentGround(bg);
        ng = r.g;
        if (r.note && !noted.has(r.note.text)) { noted.add(r.note.text); changes.push(r.note); }
      }
      rule = which === 0 ? 'rule 3: your main colour is the ground; the ink is black or white by contrast; the accent is chosen by the visibility rule (the second colour, a step of the main one, or the ink)' : 'rule 3: a second accent ground is your second colour; the ink is black or white by contrast; the accent is chosen by the visibility rule';
    } else {
      ng ??= neutral(kind, g.gradient);
      rule = `rule 2${kind === 'dark' && darkIsP ? ' (dark main colour)' : ''}: ${kind === 'light' ? 'an off-white tinted toward your main colour' : darkIsP ? 'your main colour itself (it is dark enough for light text to reach 7:1)' : 'a near-black tinted toward your main colour'}; ink and muted ink from the neutrals; the accent is chosen for that ground by the visibility rule${g.gradient ? (kind === 'dark' && darkIsP ? '; the gradient is a gentle lift of that ground' : '; the gradient runs from that ground toward your main colour') : ''}`;
    }
    made.set(key, ng);
    grounds.push({ slot, was: g.bg, kind, rule, bg: ng.bg });
    return { slot, g: ng, kind };
  });

  if (darkIsP && out.some((o) => o.kind === 'dark')) changes.push({ kind: 'derived', to: P, text: `Your ${P} is dark enough to be the background of your dark slides (light text on it reads ${ratio(INK_ON_DARK, P)}:1), so it is.` });
  // rule 4: what your main colour does as text on each neutral ground (the layouts already do this on the same layout; here it is said in words)
  for (const kind of ['light', 'dark'] as const) {
    const ng = out.find((o) => o.kind === kind)?.g;
    if (!ng) continue;
    const r = contrast(P, ng.bg);
    const pk = picks.get(kind);
    if (pk && pk.how !== 'primary') continue; // the visibility messages below say what the highlight uses instead
    const sh = shifts.get(kind);
    if (sh) {
      changes.push({ kind: 'accent-text', from: sh.col, to: sh.to, ratio: sh.from, text: `Your ${sh.col === P ? 'main colour ' : 'colour '}${sh.col} reads ${r1(sh.from)}:1 on your ${kind} slides and this style has no highlight bar, so words set in it are shown ${kind === 'dark' ? 'lighter' : 'darker'} (${sh.to}, ${ratio(sh.to, ng.bg)}:1), the same hue.` });
      continue;
    }
    if (r >= 4.5) continue;
    const roles = accentRolesOf(P, ng.bg, ng.text, [ng.surface]);
    if (roles.accentText !== ng.text && roles.accentText.toUpperCase() !== P) {
      changes.push({ kind: 'accent-text', from: P, to: roles.accentText, ratio: r, text: `Your main colour ${P} reads ${r1(r)}:1 on your ${kind} slides, so words set in it are shown a little ${kind === 'dark' ? 'lighter' : 'darker'} (${roles.accentText}, ${ratio(roles.accentText, ng.bg)}:1), the same hue.` });
    } else {
      const ink = readableInk(P, [ng.bg, ng.text, '#FFFFFF', '#000000']);
      changes.push({ kind: 'accent-text', from: P, ratio: r, text: `Your main colour ${P} reads ${r1(r)}:1 on your ${kind} slides, so highlighted words sit on a bar of it with ${isDark(ink) ? 'black' : 'white'} text (${ratio(ink, P)}:1).` });
    }
  }
  // Round G2: where the main colour cannot be seen as a highlight (under the floor), say what the highlight uses instead: one line per reason, not one per slide
  {
    const groups = new Map<string, { how: PickHow; accent: string; names: string[]; bg: string; was: number }>();
    for (const [key, pk] of picks) {
      if (pk.how === 'primary') continue;
      if (pk.how === 'ink' && key.startsWith('accent:')) continue; // the ink on its own colour is what an accent ground always did
      const name = key.startsWith('accent:') ? (pk.bg === P ? `the slides with your ${P} background` : `the slides with your second colour as the background`) : `your ${key} slides`;
      const gk = pk.how + pk.accent;
      const gr = groups.get(gk) ?? { how: pk.how, accent: pk.accent, names: [], bg: pk.bg, was: pk.was };
      gr.names.push(name);
      groups.set(gk, gr);
    }
    for (const gr of groups.values()) {
      const where = gr.names.join(' and ');
      const bad = `only ${r1(gr.was)}:1 brighter than the ground and ${colourDifference(P, gr.bg).toFixed(2)} different in colour`;
      const onAccentGround = gr.names.every((n) => n.startsWith('the slides '));
      if (gr.how === 'secondary') changes.push({ kind: 'secondary', from: P, to: gr.accent, ratio: gr.was, text: onAccentGround ? `On ${where}, your ${P} cannot be the highlight, so highlights use your ${gr.accent} (${ratio(gr.accent, gr.bg)}:1).` : `Your ${P} does not show on ${where} (${bad}), so highlights use your ${gr.accent} there (${ratio(gr.accent, gr.bg)}:1).` });
      else if (gr.how === 'step') changes.push({ kind: 'accent-text', from: P, to: gr.accent, ratio: gr.was, text: `Your ${P} does not show on ${where} (${bad}), so highlights use ${isDark(gr.bg) ? 'a lighter' : 'a darker'} step of it there (${gr.accent}, ${ratio(gr.accent, gr.bg)}:1), the same hue.` });
      else changes.push({ kind: 'accent-text', from: P, ratio: gr.was, text: `Your ${P} does not show on ${where} (${bad}), and no step of it does, so highlights there are drawn in your text colour.` });
    }
  }
  // the secondary as text on the main colour (a second colour that cannot be read on it is not used for text there)
  if (S) {
    const acc = out.find((o) => o.kind === 'accent')?.g;
    if (acc && contrast(S, P) < 3) {
      changes.push({ kind: 'secondary', from: S, to: acc.text, ratio: contrast(S, P), text: `Your second colour ${S} reads ${ratio(S, P)}:1 on your main colour ${P}, so text on slides with that background is ${isDark(acc.text) ? 'black' : 'white'} (${ratio(acc.text, P)}:1) and ${S} is kept for cards.` });
    }
  }

  // the device roles of the three styles that had hard-coded colours (Round G part B)
  const roles = look.roles ? { ...look.roles } : undefined;
  if (roles) {
    const neutralBgs = out.filter((o) => o.kind !== 'accent').map((o) => o.g.bg);
    if (roles.glow) roles.glow = P;
    if (roles.page) roles.page = LIGHT;
    if (roles.gradient) {
      const base = T ? [P, mix(P, second, 0.5), second, T] : [P, mix(P, second, 0.5), second];
      // the ground, the card and the caption panel (the ground moved a fifth toward the ink) of every neutral ground
      const grds = (out.filter((o) => o.kind !== 'accent').length ? out.filter((o) => o.kind !== 'accent') : out).flatMap((o) => [o.g.bg, o.g.surface, mix(o.g.bg, o.g.text, 0.2)]);
      void neutralBgs;
      const stops = readableGradient(base, grds, 4.5);
      const moved = stops.map((c, k) => ({ from: base[k], to: c })).filter((m) => m.from !== m.to);
      if (moved.length) {
        const worst = Math.min(...moved.map((m) => Math.min(...grds.map((g) => contrast(m.from, g)))));
        changes.push({ kind: 'gradient', ratio: worst, from: moved.map((m) => m.from).join(', '), to: moved.map((m) => m.to).join(', '), text: `The headline gradient (${moved.map((m) => m.from).join(', ')}) reads as little as ${r1(worst)}:1 on your background, so its colours are shown as ${moved.map((m) => m.to).join(', ')}, the same hues.` });
      }
      roles.gradient = stops;
    }
  }

  const first = out[0].g;
  const rhythm = out.filter((o) => o.slot >= 0).map((o) => o.g);
  const closing = out.find((o) => o.slot === -1)?.g;
  const next: StylePack = {
    ...pack,
    palette: { ...pack.palette, bg: first.bg, text: first.text, accent: first.accent, muted: first.muted, surface: first.surface, onAccent: first.onAccent ?? pack.palette.onAccent },
    look: { ...look, ...(look.rhythm ? { rhythm } : {}), ...(closing ? { closing } : {}), ...(roles ? { roles } : {}), ...(look.gradient ? { gradient: first.gradient ?? undefined } : {}) },
  };
  return { pack: next, changes, grounds };
}
