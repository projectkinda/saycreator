// Layout library types. A layout is code: the model only picks an id (and gives text), the engine draws it from the style tokens.
import type { FontFamily } from '../../image-engine/types';

export type LayoutId =
  | 'statement' | 'lead-statement' | 'big-question' | 'split-text' | 'big-stat' | 'stat-bar' | 'stepper' | 'step-numeral'
  | 'checklist' | 'numbered-list' | 'comparison' | 'quote' | 'feature-slider' | 'cta-button' | 'card-grid' | 'photo-led'
  | 'listicle-numeral' | 'stat-grid' | 'timeline' | 'spotlight';

export type ContentShape =
  | 'claim' | 'hook' | 'story' | 'question' | 'explainer' | 'number' | 'metric' | 'process' | 'step' | 'benefits' | 'list' | 'ranking'
  | 'contrast' | 'quote' | 'feature' | 'ask' | 'categories' | 'photo' | 'history' | 'product';

/** The Cut: the one dominant edge of a slide (families after sausi-7/carousels: edge-h, edge-v, angle, curve). */
export type Cut = 'plain' | 'edge-h' | 'edge-v' | 'angle' | 'curve';
export type PlaneTone = 'accent' | 'surface' | 'ink';

/** Everything a layout may use to look like the reference. Nothing is hard-coded in a layout. */
/** A linear gradient ground: CSS-style angle (180 = top to bottom) and colour stops (at 0..1). */
export interface Gradient {
  angle: number;
  stops: { at: number; color: string }[];
}
/** One ground of a palette rhythm: the ground colour with its ink, muted ink, accent and card colour (and a gradient over it). Every pair is meant to read at 4.5:1. */
export interface Ground {
  bg: string;
  text: string;
  muted: string;
  accent: string;
  surface: string;
  onAccent?: string;
  /** Drawn over the ground colour (bg is then the stop that reads worst, so the contrast holds on every stop). */
  gradient?: Gradient;
}
/** A preset's layout flavour (data, from its style.json "library.flavour"): what its cover is, which layouts it likes or avoids, which variant of a layout it takes first. */
export interface Flavour {
  cover?: LayoutId;
  coverVariant?: 0 | 1;
  prefer?: LayoutId[];
  avoid?: LayoutId[];
  variants?: Partial<Record<LayoutId, 0 | 1>>;
}
export interface LayoutStyle {
  palette: { bg: string; text: string; muted: string; accent: string; surface: string; onAccent?: string };
  fonts: { headline: FontFamily; body: FontFamily };
  /** Palette rhythm: 2 or 3 grounds, slide i takes ground i mod n (the palette above is the first). */
  rhythm?: Ground[];
  /** The closing slide's own ground (a preset's byType.closing). With it the closing slide is that ground, not an inverted one. */
  closing?: Ground;
  /** Layout flavour (see Flavour). */
  flavour?: Flavour;
  /** Case of the headlines only (not handles, counters or body). */
  caseStyle?: 'none' | 'upper' | 'lower';
  /** Words that keep their written case under the case transform (brands): the style's own list; the built-in brands and the carousel's handle words are added by the builder. */
  caseExceptions?: string[];
  /** The weight of heavy (headline) text and of body text; the nearest bundled weight is used. Default: 800 and 500. */
  weights?: { headline: number; body: number };
  background: 'flat' | 'glow' | 'grid' | 'gradient';
  /** Used when background is 'gradient'. */
  gradient?: Gradient;
  /** `planes`: the style uses colour blocks (planes). Without it cuts default to plain. */
  devices: { marker: boolean; profileHeader: boolean; underline: boolean; planes?: boolean };
  accentStyle: 'text' | 'marker';
  /** How loud the planes are (the Shapes toggle): subtle = a surface-toned, thinner plane; bold = an accent plane, thicker. */
  planeStrength?: 'subtle' | 'bold';
  /** The generic devices this style turns on (see reference/deco.ts). */
  deco?: import('../../reference/deco').Deco;
}

export type Fields = Record<string, string | string[]>;

export interface FieldSpec {
  name: string;
  required: boolean;
  /** Character budget (per item for a list). */
  max: number;
  /** Most words allowed (a label). */
  maxWords?: number;
  /** A list field: how many items. */
  list?: { min: number; max: number };
  /** A numeric field, 0 to 100. */
  percent?: boolean;
  note?: string;
}

/** A text slot the layout planned (geometry is the layout's own measurement; the engine's fit still checks it). */
export interface Slot {
  role: 'kicker' | 'tag' | 'title' | 'body' | 'caption' | 'number';
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  weight: number;
  font: FontFamily;
  fill: string;
  align: 'left' | 'center';
  lines: number;
  min: number;
  lh: number;
  valign?: 'top' | 'middle';
  /** Drawn after part(): it sits on the plane (the engine gives it the plane's colours). */
  plane?: boolean;
}

/** What the engine tells a layout about the slide it draws on: the free field, the cut and the options. */
export interface Cx {
  cut: Cut;
  /** The free region (content box) the layout composes in. */
  field: { x0: number; w: number; y0: number; y1: number };
  density: 'normal' | 'statement';
  weight: 'equal' | 'unequal';
  /** Where part B (the plane part) starts, when the slide splits into a field part and a plane part. */
  partTop?: number;
  /** Do not split: everything sits on the field. */
  noPart?: boolean;
  /** Use this type scale (the second pass of a split slide uses the first pass's). */
  k?: number;
}

export interface Plan {
  type: 'cover' | 'stat' | 'step' | 'content' | 'checklist' | 'quote' | 'closing';
  /** Which layout name the engine's type scale uses (hero layouts get the 110 to 150 px headline). */
  fitAs: string;
  slots: Slot[];
  /** Static drawing (shapes) as SVG markup with palette tokens. */
  shapes: string;
  /** Static drawing of part B (on the plane). */
  planeShapes: string;
  /** The height of part A and part B, when the layout calls part(). */
  parts?: { hA: number; hB: number };
  stepperPlane?: boolean;
  /** The type scale the layout was planned at. */
  k?: number;
  stepper?: { steps: string[]; current: number; bounds: { top: number; bottom: number } };
  /** Slide words by field for textsOf (the engine's own mapping of words to slots). */
  slide: Record<string, unknown>;
  noBalance?: boolean;
  photo?: { x: number; y: number; w: number; h: number };
  /** Height the content needs (for sizing the plane). */
  span: number;
  /** A giant numeral drawn this many px further left (it bleeds off the left edge); the checks still see it inside the margin. */
  bleedLeft?: number;
  /** The width of the bleeding glyph, to check that at least ~85% of it stays visible. */
  glyphW?: number;
}

export interface LayoutDef {
  id: LayoutId;
  label: string;
  shapes: ContentShape[];
  fields: FieldSpec[];
  variants: [string, string];
  /** The cuts this layout supports (plain always). */
  cuts?: Cut[];
  samples: { normal: Fields; long: Fields; short: Fields };
  plan(f: Fields, variant: 0 | 1, st: LayoutStyle, cx: Cx): Plan;
}
