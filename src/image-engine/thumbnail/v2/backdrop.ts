// What sits behind a cutout in a thumbnail, and the "More looks" variants. The subject stays; the background is a blurred copy of the original photo, another
// photo, a colour, a gradient, a pattern from the existing textures, or a colour block the subject overlaps. Colours may be palette names ("$accent"), so a look
// follows the style's palette, and so a saved look holds no picture. No model anywhere here.
import type { Treatment } from '../../types';

export const BACKDROP_KINDS = ['blur', 'photo', 'colour', 'gradient', 'pattern', 'block'] as const;
export type BackdropKind = (typeof BACKDROP_KINDS)[number];
export const PATTERNS = ['halftone', 'dots', 'stripes', 'grain'] as const;
export type PatternKind = (typeof PATTERNS)[number];
export const TITLE_PLACES = ['left', 'right', 'top', 'bottom', 'centre'] as const;
export type TitlePlace = (typeof TITLE_PLACES)[number];

/** The treatments the photo and blurred backgrounds take (the existing photo treatments). */
export interface BackdropTreat {
  blur?: boolean;
  darken?: boolean;
  duotone?: boolean;
  vignette?: boolean;
  grain?: boolean;
}
export interface Backdrop {
  kind: BackdropKind;
  /** For "photo": where the cover-fit is centred (the person drags it). */
  focal?: { x: number; y: number };
  /** A colour, hex or a palette name like "$accent". For colour, block, pattern (the ground). */
  colour?: string;
  /** Gradient: the second colour, and the angle (0 is towards the top, 90 towards the right, 180 towards the bottom). */
  to?: string;
  angle?: number;
  pattern?: PatternKind;
  /** The ink of a pattern. */
  ink?: string;
  treat?: BackdropTreat;
  /** Tint the subject's edge and its glow toward the background. */
  match?: boolean;
}

export function treatmentsOf(t: BackdropTreat | undefined, base: Treatment[] = []): Treatment[] {
  const out: Treatment[] = [...base];
  if (t?.blur) out.push({ op: 'blur', radius: 16 });
  if (t?.duotone) out.push({ op: 'duotone', dark: '$bg', light: '$accent', amount: 0.9 });
  if (t?.darken) out.push({ op: 'wash', color: '#000000', amount: 0.45 });
  if (t?.vignette) out.push({ op: 'vignette', amount: 0.55 });
  if (t?.grain) out.push({ op: 'grain', amount: 0.25 });
  return out;
}

export interface VariantLook {
  fx?: 'none' | 'contact' | 'drop' | 'glow';
  outline?: boolean;
  textBehind?: boolean;
}
export interface VariantSpec {
  id: string;
  backdrop: Backdrop;
  look: VariantLook;
  palette?: string;
  titlePlace: TitlePlace;
  layout: 'object-title' | 'cutout-outline-glow' | 'cutout-over-text' | 'cutout-on-block';
}

/** The cutout treatments a variant can have, each a clear change of look. */
const TREATMENTS: { name: string; look: VariantLook }[] = [
  { name: 'outline', look: { outline: true, fx: 'contact' } },
  { name: 'glow', look: { fx: 'glow' } },
  { name: 'shadow', look: { fx: 'drop' } },
  { name: 'text behind', look: { textBehind: true, fx: 'contact' } },
  { name: 'outline and glow', look: { outline: true, fx: 'glow' } },
];
interface Cand {
  back: Backdrop;
  backName: string;
  treat: (typeof TREATMENTS)[number];
  palette?: string;
  place: TitlePlace;
}

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds `count` looks by combining background, cutout treatment, palette and title place, picked so no two look alike: two looks share at most two of those four,
 * and no background kind or treatment is used more than a third of the time (rounded up). Pure and repeatable for a seed.
 */
export function makeVariants(o: { palettes: string[]; hasBackPhoto: boolean; count?: number; seed?: number }): VariantSpec[] {
  const count = o.count ?? 12;
  const R = rng(o.seed ?? 7);
  const backs: { name: string; back: Backdrop }[] = [
    { name: 'blur', back: { kind: 'blur', treat: { blur: true, darken: true } } },
    { name: 'blur', back: { kind: 'blur', treat: { blur: true, duotone: true } } },
    ...(o.hasBackPhoto ? [{ name: 'photo', back: { kind: 'photo' as const, treat: { darken: true, vignette: true } } }, { name: 'photo', back: { kind: 'photo' as const, treat: { duotone: true, grain: true } } }] : []),
    { name: 'colour', back: { kind: 'colour', colour: '$accent' } },
    { name: 'colour', back: { kind: 'colour', colour: '$surface' } },
    { name: 'gradient', back: { kind: 'gradient', colour: '$bg', to: '$accent', angle: 160 } },
    { name: 'gradient', back: { kind: 'gradient', colour: '$accent', to: '$marker', angle: 45 } },
    { name: 'pattern', back: { kind: 'pattern', pattern: 'halftone', colour: '$bg', ink: '$accent' } },
    { name: 'pattern', back: { kind: 'pattern', pattern: 'dots', colour: '$surface', ink: '$text' } },
    { name: 'pattern', back: { kind: 'pattern', pattern: 'stripes', colour: '$bg', ink: '$marker' } },
    { name: 'pattern', back: { kind: 'pattern', pattern: 'grain', colour: '$accent', ink: '$text' } },
    { name: 'block', back: { kind: 'block', colour: '$accent' } },
    { name: 'block', back: { kind: 'block', colour: '$marker' } },
  ];
  const palettes = o.palettes.length ? o.palettes : [undefined as unknown as string];
  const pool: Cand[] = [];
  for (const b of backs) for (const t of TREATMENTS) for (const p of palettes) for (const place of TITLE_PLACES) pool.push({ back: b.back, backName: b.name, treat: t, palette: p, place });
  // A repeatable shuffle.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const cap = Math.ceil(count / 3);
  const picked: Cand[] = [];
  const used = (f: (c: Cand) => string, v: string) => picked.filter((c) => f(c) === v).length;
  const shared = (a: Cand, b: Cand) => [a.backName === b.backName && JSON.stringify(a.back) === JSON.stringify(b.back), a.treat.name === b.treat.name, a.palette === b.palette, a.place === b.place].filter(Boolean).length;
  for (const maxShared of [1, 2, 3]) {
    for (const c of pool) {
      if (picked.length >= count) break;
      if (picked.includes(c)) continue;
      if (used((x) => x.backName, c.backName) >= cap + (maxShared - 1)) continue;
      if (used((x) => x.treat.name, c.treat.name) >= cap + (maxShared - 1)) continue;
      if (picked.some((p) => shared(p, c) > maxShared)) continue;
      picked.push(c);
    }
  }
  const layouts: VariantSpec['layout'][] = ['cutout-outline-glow', 'cutout-over-text', 'cutout-on-block', 'object-title'];
  return picked.map((c, i) => ({ id: `variant-${i + 1}`, backdrop: c.back, look: c.treat.look, palette: c.palette, titlePlace: c.place, layout: layouts[i % layouts.length] }));
}
