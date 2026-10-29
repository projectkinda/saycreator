// The "thumbnail" block of a style file (style.json): how that style looks as a thumbnail. Types only; the validator is in
// styles/format.ts with the rest of the style rules. Nothing here is drawn from a reference thumbnail: no folder of reference
// thumbnails exists yet, so each block is derived from the style's own carousel reading.
import type { Treatment } from '../../types';

/** The arrangements a thumbnail can have. A style lists the ones it suits, best first. */
export const THUMB_LAYOUTS = ['face-left-title-right', 'title-over-photo', 'split-colour', 'object-title', 'number-badge', 'before-after', 'cutout-outline-glow', 'cutout-over-text', 'cutout-on-block', 'described'] as const;
/** The three ready combinations for a cutout: offered with any style when the person has added an object. */
export const CUTOUT_COMBOS = ['cutout-outline-glow', 'cutout-over-text', 'cutout-on-block'] as const;
export type ThumbLayoutId = (typeof THUMB_LAYOUTS)[number];

export const THUMB_LAYOUT_LABEL: Record<ThumbLayoutId, string> = {
  described: 'Your described layout',
  'face-left-title-right': 'Subject on one side, title on the other',
  'title-over-photo': 'Big title over the photo',
  'split-colour': 'Photo and colour block',
  'object-title': 'Object and title',
  'number-badge': 'Number badge',
  'before-after': 'Before and after',
  'cutout-outline-glow': 'Subject with outline and glow',
  'cutout-over-text': 'Subject over big text',
  'cutout-on-block': 'Subject on a colour block',
};

/** How the title is set. plain: letters on a darkened photo. outline: a thick outline round the letters. marker: the emphasis word on a coloured box. plate: the whole title on a solid plate. */
export const TITLE_LOOKS = ['plain', 'outline', 'marker', 'plate'] as const;
export type TitleLook = (typeof TITLE_LOOKS)[number];

/** How a style dresses a cutout when the person has not chosen: a background recipe (colours as palette names, never a picture), cutout treatment, palette and title place. Saved looks live here. */
export interface CutoutDefaults {
  backdrop?: import('./backdrop').Backdrop;
  look?: import('./backdrop').VariantLook;
  palette?: string;
  titlePlace?: import('./backdrop').TitlePlace;
}

export interface ThumbSpec {
  /** Optional: the cutout look this style uses by default. */
  cutout?: CutoutDefaults;
  /** The palette the thumbnail uses (a name in the style's "palettes"). */
  palette: string;
  title: {
    look: TitleLook;
    /** Palette role of the letters. */
    colour: string;
    /** Palette role of the plate (look "plate") or of the outline (look "outline"). */
    ground?: string;
    /** Bundled weight of the headline font. Default: the style's own. */
    weight?: number;
    /** upper (default) or sentence. */
    case?: 'upper' | 'sentence';
  };
  /** The photo's treatment: an inline list (colours may be "$accent"). Left out: the photo is not treated. */
  treatment?: Treatment[];
  /** The layouts this style suits, best first. At least 3. */
  layouts: ThumbLayoutId[];
  /** Palette role of the colour block, the number badge and the chips. Default accent. */
  block?: string;
  /** Colour under words on a photo (a hex colour or "$role"). Default black. */
  scrim?: string;
  /** Set the colour block and the chips as glass cards (they blur what is behind them). Needs photo.glass or uses a default. */
  glass?: boolean;
  /** Place the style's own elements (stickers, arrows) around the title, off the subject. Needs "elements". */
  elements?: boolean;
  /** Use the style's soft colour field (photo.field) behind a colour block. */
  field?: boolean;
}
