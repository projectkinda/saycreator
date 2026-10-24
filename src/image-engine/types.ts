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

export interface Mask {
  shape: 'rect' | 'roundRect' | 'ellipse';
  /** roundRect only, px */
  radius?: number;
}

export interface LayerBase {
  id: string;
  name?: string;
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
  fill: string;
  stroke?: { color: string; width: number };
  /** rect corners, px */
  radius?: number;
}

export type Layer = ImageLayer | TextLayer | ShapeLayer;

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
  code: 'text-overflow' | 'image-failed' | 'font-missing';
  message: string;
}

export interface RenderReport {
  ok: boolean;
  warnings: RenderWarning[];
  /** Lint results arrive with the thumbnail checker in Step 2. */
  lint?: unknown[];
}
