// Style from references: the shapes passed between the measuring code, the reader (a model with vision) and the screen.
import type { SlideType } from '../image-engine/styles/format';

export interface Px {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** A box as shares of the frame (0 to 1). */
export type Frac = Rect;

export type Target = 'carousel' | 'thumbnail' | 'both';
export const TARGET_LABEL: Record<Target, string> = { carousel: 'Carousels', thumbnail: 'Thumbnails', both: 'Both' };

/** What the style takes from one reference. */
export type LearnFrom = 'everything' | 'colours-type' | 'layout' | 'photo';
export const LEARN_LABEL: Record<LearnFrom, string> = { everything: 'Everything', 'colours-type': 'Colours and type only', layout: 'Layout only', photo: 'Photo treatment only' };
/** The parts of a style spec each choice may change. Anything not listed stays as it is in the base style. */
export const LEARN_SECTIONS: Record<LearnFrom, string[]> = {
  everything: ['palettes', 'rhythm', 'byType', 'fonts', 'type', 'caseStyle', 'headlineLineHeight', 'bodyLineHeight', 'shape', 'spacing', 'chrome', 'layouts', 'free', 'photo', 'elements', 'marks', 'thumbnail', 'description'],
  'colours-type': ['palettes', 'rhythm', 'byType', 'fonts', 'type', 'caseStyle', 'headlineLineHeight', 'bodyLineHeight', 'shape'],
  layout: ['spacing', 'chrome', 'layouts', 'free', 'elements', 'marks', 'thumbnail'],
  photo: ['photo', 'thumbnail'],
};

/** One picture the style learns from: a whole image, or one cell of a grid, or a rectangle the person drew. */
export interface ReferenceItem {
  /** Stable id inside one session, for example "img2" or "img2#4". */
  id: string;
  /** The file's name, for the person. */
  name: string;
  /** A downscaled JPEG of just this piece, as a data URL (never stored). */
  dataUrl: string;
  width: number;
  height: number;
  learn: LearnFrom;
  /** Which image it came from, and where in it (for a cell). */
  source: { image: string; cell?: number; rect?: Rect };
}

export interface MeasuredColour {
  hex: string;
  /** Share of the picture (0 to 1). */
  share: number;
}
export interface Measured {
  size: { width: number; height: number };
  palette: MeasuredColour[];
  background: string;
  /** The colour that reads best against the background, or null when no colour does. */
  textColour: string | null;
  /** Contrast of each other palette colour against the background. */
  contrast: { hex: string; ratio: number }[];
  /** Space between the content and each edge, as shares of the frame. Null for a picture that fills the frame. */
  margins: { left: number; top: number; right: number; bottom: number } | null;
  /** The tallest line of text, as a share of the frame's height. */
  titleHeight: number | null;
  /** How wide that line is, as a share of the frame's width. */
  titleWidth: number | null;
  /** Where the title block is, as shares of the frame. */
  title: Frac | null;
  titlePlacement: string | null;
  textZones: Frac[];
  textBlocks: number;
  /** Share of the frame that is flat colour. */
  emptySpace: number;
  photo: {
    present: boolean;
    /** Share of the frame that is photo-like. */
    share: number;
    blackAndWhite: boolean;
    highContrast: boolean;
    blurred: boolean;
    halftone: boolean;
    duotone: boolean;
    meanSaturation: number;
    /** Spread of brightness, 0 to 1. */
    brightnessSpread: number;
    /** Where the most detail and colour is (a guess, not a face finder), as shares. */
    detailCentre: { x: number; y: number } | null;
  };
}

export interface MissingTool {
  tool: string;
  why: string;
  /** Names of the references that need it. */
  images?: string[];
}

export interface Judgement {
  /** The reader's own score of how close the replica is, 0 to 100. */
  score: number;
  matched: string[];
  approximated: string[];
  missing: string[];
}

export interface ReadResult {
  /** The sections of the style the reader chose to change, in the style.json vocabulary. */
  style: Record<string, unknown>;
  seenSlideTypes: SlideType[];
  /** The reference files (ref1.jpg...) that clearly show a photo, a person, a device or an object. */
  photoImages: string[];
  missingTools: MissingTool[];
  notes: string;
}
