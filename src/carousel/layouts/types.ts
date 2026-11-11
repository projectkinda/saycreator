// Layout library types. A layout is code: the model only picks an id (and gives text), the engine draws it from the style tokens.
import type { FontFamily } from '../../image-engine/types';

export type LayoutId =
  | 'statement' | 'lead-statement' | 'big-question' | 'split-text' | 'big-stat' | 'stat-bar' | 'stepper' | 'step-numeral'
  | 'checklist' | 'numbered-list' | 'comparison' | 'quote' | 'feature-slider' | 'cta-button' | 'card-grid' | 'photo-led'
  | 'listicle-numeral' | 'stat-grid' | 'timeline' | 'spotlight'
  | 'prose' | 'statement-stacked' | 'statement-card' | 'statement-pill' | 'statement-question' | 'contact-closing' | 'cta-pair' | 'numbered-stagger' | 'bullet-list' | 'pill-stagger' | 'headline-card'
  | 'cover-centred' | 'cover-index' | 'cover-block' | 'cover-sticker' | 'cover-word' | 'cover-ruled'
  | 'photo-full-caption' | 'split-half' | 'title-over-photo' | 'twin-photos' | 'photo-grid' | 'phone-frame'
  | 'headline-body-image' | 'image-row' | 'thumb-rows' | 'cover-art' | 'photo-cover' | 'portrait-closing' | 'art-side-text' | 'do-dont';

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
  /** The layout slide 1 takes when its headline is a question (a preset that has a question form, like statement-question). */
  coverQuestion?: LayoutId;
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
  /** The layout the closing slide takes in a preset (library.byType.closing): the layout, its variant, and the layouts a closing avoids. */
  closingLayout?: { layout: LayoutId; variant?: 0 | 1; avoid?: LayoutId[] };
  /** The covers the preset allows (3 or more) and avoids (library.byType.cover). */
  coverLayouts?: { layouts: LayoutId[]; avoid?: LayoutId[]; signature?: LayoutId };
  /** The website the person has set in their profile / brand settings: the footer shows it, and shows no website line when there is none. */
  site?: string;
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
  /** The preset's corner radius (px): pictures take it, kept between 12 and 48. */
  radius?: number;
  /** The generic devices this style turns on (see reference/deco.ts). */
  deco?: import('../../reference/deco').Deco;
}

export type Fields = Record<string, string | string[]>;

/** A picture the layout draws in a slot (a data: URL the person supplied), cropped to the slot (cover fit) with rounded corners or a circle. */
export interface PlanImage {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rx: number;
  circle?: boolean;
  /** Drawn above the plane shapes and cards (a portrait on a band); otherwise right after the ground, so badges and shapes of the layout sit over it. */
  front?: boolean;
}
export interface FieldSpec {
  name: string;
  /** The field holds a picture (a data: URL), not text: it is left out of every text budget and word list, and the writer never fills it. */
  image?: boolean;
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
  valign?: 'top' | 'middle' | 'bottom';
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
  /** title-over-photo: how strong the scrim behind the text is (0 gradient .. 3 solid panel); the draw step raises it until every word reads at 4.5:1 on the real picture. */
  scrim?: number;
}

export interface Plan {
  /** The pictures of this slide (an optional image field): drawn behind the text, at their slots. */
  images?: PlanImage[];
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

/** The orientation of a picture or of a slot. */
export type Orientation = 'portrait' | 'landscape' | 'square';
/** One picture slot of a layout in one variant: which field holds it, its shape (width / height) and which orientations fit it. */
export interface ImageSlotDef {
  field: string;
  aspect: number;
  /** The orientation the slot is made for (a portrait photo fits a tall slot best). */
  orientation: Orientation;
  /** The orientations of a picture that crop well in it. */
  accepts: Orientation[];
}
export interface LayoutDef {
  id: LayoutId;
  label: string;
  shapes: ContentShape[];
  fields: FieldSpec[];
  variants: [string, string];
  /** The cuts this layout supports (plain always). */
  cuts?: Cut[];
  /** Layouts with picture slots: the slots of each variant (field, aspect, orientations), in the order pictures are given to them. */
  imageSlots?: (variant: 0 | 1) => ImageSlotDef[];
  /** The fewest pictures the layout needs to draw its picture form; with fewer, the slide uses the layout's text-only form. */
  minImages?: number;
  samples: { normal: Fields; long: Fields; short: Fields };
  plan(f: Fields, variant: 0 | 1, st: LayoutStyle, cx: Cx): Plan;
}
