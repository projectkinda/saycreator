// Plan, patch and result types. The plan JSON is the single source of truth; see IMAGE_CONTRACT.md.

export const FONT_FAMILIES = ['Schibsted Grotesk', 'Instrument Sans'] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

export interface ImageFilters {
  /** -1 to 1 */
  brightness?: number;
  /** -1 to 1 */
  contrast?: number;
  /** -1 to 1 */
  saturation?: number;
  /** 0 to 40 (px of blur at final size) */
  blur?: number;
}

/** The shape a layer is cut to. pill, arch, diamond, flower, blob and starburst fill the layer's box. */
export const MASK_SHAPES = ['rect', 'roundRect', 'ellipse', 'pill', 'arch', 'diamond', 'flower', 'blob', 'starburst'] as const;
export interface Mask {
  shape: (typeof MASK_SHAPES)[number];
  /** roundRect only, px */
  radius?: number;
}

/**
 * What is done to a photo, in order. All of it happens at the layer's own pixel size, so a treatment never changes the box.
 * Colours are hex or rgba. Amounts are 0 to 1 unless said.
 */
export type Treatment =
  | { op: 'grayscale'; amount?: number }
  /** Dark tones become `dark`, light tones `light`, in between a blend. */
  | { op: 'duotone'; dark: string; light: string; amount?: number }
  /** A dot screen: `cell` px between dots, `angle` in degrees. Ink is `dark` on `light`. */
  | { op: 'halftone'; cell: number; angle?: number; dark: string; light: string; contrast?: number }
  | { op: 'grain'; amount: number; size?: number; seed?: number }
  /** brightness and contrast from -1 to 1 */
  | { op: 'levels'; brightness?: number; contrast?: number; saturation?: number }
  | { op: 'blur'; radius: number }
  /** Smear along a direction. length in px, angle in degrees (0 = left to right). */
  | { op: 'motionBlur'; length: number; angle: number }
  | { op: 'tint'; color: string; amount: number }
  | { op: 'vignette'; amount: number }
  /** A gradient from an edge towards the middle. `start` (0 to 1) is how far in it is already clear. */
  | { op: 'fade'; from: 'bottom' | 'top' | 'left' | 'right'; color: string; amount: number; start?: number }
  /** One flat colour over the whole photo. */
  | { op: 'wash'; color: string; amount: number };

/** What a transparent object picture gets: a contact or drop shadow, a floor reflection, a glow. */
export interface ObjectFx {
  shadow?: 'contact' | 'drop';
  /** Strength of the floor reflection, 0 to 1. */
  reflection?: number;
  glow?: { color: string; blur: number; amount: number };
}

/** A straight-edged gradient. angle is CSS-style: 0 = towards the top, 90 = towards the right, 180 = towards the bottom. */
export interface LinearGradient {
  type: 'linear';
  angle: number;
  /** 2 to 6 stops, `at` from 0 to 1, in order. */
  stops: { at: number; color: string }[];
}
export type Fill = string | LinearGradient;

/**
 * What a layer is for, so the carousel checker knows what may overlap.
 * decor: backgrounds, markers, dividers, big shapes. May sit under anything and bleed off the edge.
 * content: text, icons, arrows, dots. Must not overlap other content, and must keep clear of the edges.
 * container: a card, badge or sticker that content may sit fully inside.
 */
export type Role = 'decor' | 'content' | 'container';

export interface LayerBase {
  id: string;
  name?: string;
  role?: Role;
  /** Box, top-left origin, px at final canvas size. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, about the box centre. */
  rotation: number;
  /** 0 to 1 */
  opacity: number;
  visible?: boolean;
  mask?: Mask;
}

export interface ImageLayer extends LayerBase {
  kind: 'image';
  /** URL the browser can load (same origin, blob: or data:). */
  src: string;
  fit: 'cover' | 'contain';
  /** Where `cover` keeps the crop centred, 0 to 1 on each axis. Default 0.5, 0.5. */
  focal?: { x: number; y: number };
  filters?: ImageFilters;
  /** Photo treatments, in order (grayscale, duotone, halftone, grain, blur...). */
  treatments?: Treatment[];
  /** A transparent object picture (a PNG cut-out): scaled to fit, with a shadow, reflection or glow. Needs fit "contain". */
  object?: ObjectFx;
  /** A soft shadow under the picture. */
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
  /** A synthetic stand-in, not the person's own picture (a test object, a placeholder). The checker and the Results screen say so. */
  synthetic?: boolean;
}

export interface TextStyle {
  font: FontFamily;
  weight: number;
  /** Requested size in px. With autoFit this is the largest size to try. */
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
  /** Where the text block sits inside its box. Default top. */
  valign?: 'top' | 'middle' | 'bottom';
  /** Multiplier of size, for example 1.1 */
  lineHeight: number;
  stroke?: { color: string; width: number };
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
}

export interface Highlight {
  /** Words (case-insensitive, punctuation ignored) that get a background. */
  words: string[];
  color: string;
  /** Text colour on the highlight. Defaults to the text colour. */
  textColor?: string;
  paddingX: number;
  paddingY: number;
  radius: number;
  /** Make the box about one line tall (never less than the letters), so boxes on tightly spaced lines do not cover the lines next to them. */
  hugLine?: boolean;
  /** Mark whole lines (counted from 0) whatever the words are. `words` may then be empty. */
  lines?: number[];
  /** Mark only the first time each word appears, so "the small thing ... the big thing" marks one "thing". */
  onlyFirst?: boolean;
}

export interface TextLayer extends LayerBase {
  kind: 'text';
  text: string;
  style: TextStyle;
  /** Shrink the text to fit the box, but never below minSize. */
  autoFit?: { minSize: number };
  highlight?: Highlight;
}

export interface ShapeLayer extends LayerBase {
  kind: 'shape';
  shape: 'rect' | 'ellipse';
  fill: Fill;
  stroke?: { color: string; width: number };
  /** rect corners, px */
  radius?: number;
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
}

/** A soft, blurred colour field: big colour blobs over a base colour, with grain. A background for the glass look. */
export interface FieldLayer extends LayerBase {
  kind: 'field';
  base: string;
  /** Blob centres and radii are fractions of the box: x and y from 0 to 1, r is a fraction of the width. */
  blobs: { x: number; y: number; r: number; color: string; alpha?: number }[];
  /** Blur in px at final size. */
  blur: number;
  /** 0 to 1 */
  grain: number;
  seed: number;
}

/**
 * A glass card: what is drawn behind it, blurred, with a translucent fill, a soft border and rounded corners.
 * It blurs the layers before it in the list, so it must come after them. Rotation must be 0.
 */
export interface GlassLayer extends LayerBase {
  kind: 'glass';
  /** Translucent fill, for example rgba(255,255,255,0.18). */
  fill: string;
  /** Blur of what is behind, px. */
  blur: number;
  radius: number;
  border?: { color: string; width: number };
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
}

/**
 * A drawn path (arrows, icons, strokes, quote marks). `d` is SVG path data in pixels inside the layer's own box:
 * (0,0) is the box's top-left corner and nothing is scaled. Use absolute commands M L C Q H V Z.
 */
export interface PathLayer extends LayerBase {
  kind: 'path';
  d: string;
  fill?: string;
  stroke?: { color: string; width: number; cap?: 'round' | 'butt'; join?: 'round' | 'miter' };
}

/**
 * An element from the asset library (an icon, an emoji-style object, a doodle, tape, a blob...), placed in the layer's box.
 * `element` is the library id, for example "lucide:arrow-right" or "code:squiggle:2". The element is fitted inside the box
 * (never stretched). Colours: `tint` makes it a flat one-colour shape; `colors` swaps specific source colours.
 */
export interface ElementLayer extends LayerBase {
  kind: 'element';
  element: string;
  /** Replace every colour of the element with this one. */
  tint?: string;
  /** Swap specific source colours (keys are the element's own colours or colour tokens) for new ones. */
  colors?: Record<string, string>;
  flipX?: boolean;
  /** A solid outline around the whole shape, like a die-cut sticker. */
  sticker?: { color: string; width: number };
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
}

export type Layer = ImageLayer | TextLayer | ShapeLayer | PathLayer | ElementLayer | FieldLayer | GlassLayer;

export interface Canvas {
  width: number;
  height: number;
  background: string;
}

export interface Plan {
  schema: 1;
  /** Starts at 1. Goes up by one for every applied patch, undo and redo included. */
  revision: number;
  canvas: Canvas;
  /** Back to front. */
  layers: Layer[];
  /** What the slide is about, for checking that pictures fit it. Optional; old plans do not have it. */
  meta?: {
    elementTags?: string[];
    /** Areas a layout wants kept free of pictures: the line where a slide splits in two, and the arrow button on it. */
    keepClear?: { name: 'split' | 'arrow'; x: number; y: number; width: number; height: number }[];
    /** The photo slots of a slide: whether each has a picture, and what the ideal picture is. */
    photoSlots?: { id: string; filled: boolean; photo?: string; hint?: string; synthetic?: boolean }[];
  };
}

export type Op =
  | { op: 'add'; layer: Layer; index?: number }
  | { op: 'set'; id: string; path: string; value: unknown }
  | { op: 'remove'; id: string }
  | { op: 'move'; id: string; toIndex: number };

export interface Patch {
  /** The plan revision this patch was written against. */
  baseRevision: number;
  /** Short words for the history list, for example "Bigger title". */
  label: string;
  ops: Op[];
}

export type PatchResult =
  | { ok: true; plan: Plan; inverse: Patch }
  | { ok: false; reasons: string[] };

export interface HistoryEntry {
  label: string;
  /** Revision the plan had after this entry was applied or undone. */
  revision: number;
}

export interface RenderWarning {
  layerId: string;
  code: 'text-overflow' | 'image-failed' | 'font-missing' | 'element-missing';
  message: string;
}

export interface RenderReport {
  ok: boolean;
  warnings: RenderWarning[];
  /** Lint results, filled in by the thumbnail checker. */
  lint?: LintResult[];
}

// ---- Thumbnails (Step 2) ----

export interface BrandInput {
  primary: string;
  text: string;
  background: string;
  highlight: string;
  headlineFont: FontFamily;
  bodyFont: FontFamily;
  handle?: string;
  logoUrl?: string;
}

export type ThumbnailLayout = 'plate' | 'outline' | 'panel';
export type ThumbnailAspect = '16:9' | '9:16';

export interface ThumbnailRequest {
  /** A plain image for now. Later this will be a frame mined from the video. */
  source: { url: string; width: number; height: number };
  /** Up to about 4 words. Longer titles are drawn, and fail the checks. */
  title: string;
  aspect: ThumbnailAspect;
  /** Default: all three. */
  layouts?: ThumbnailLayout[];
  brand: BrandInput;
}

export interface ThumbnailOption {
  id: string;
  layout: ThumbnailLayout;
  plan: Plan;
  /** Ids the checker looks for. */
  titleLayerId: string;
  photoLayerId: string;
  /** Plain notes about choices made (for example where the crop was centred). */
  notes: string[];
}

export type LintId = 'words' | 'readable' | 'contrast' | 'overlay' | 'margins' | 'resolution' | 'crop' | 'brightness' | 'sharpness' | 'subject' | 'focal' | 'overlap';

export interface LintResult {
  id: LintId;
  label: string;
  pass: boolean;
  /** One plain sentence: what was found, and what is needed if it failed. */
  reason: string;
  measured?: number;
  limit?: number;
}
