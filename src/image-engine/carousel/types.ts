// Carousel input (a script and a theme) and what the composer returns.
import type { Fill, FontFamily, Plan } from '../types';

export interface CarouselBrand {
  /** Shown on the last slide, for example "@maya.builds". */
  handle: string;
}

export type SlideScript =
  | { type: 'cover'; kicker?: string; headline: string; sub?: string; highlight?: string }
  | { type: 'content'; headline: string; body: string; highlight?: string }
  | { type: 'step'; number: number; headline: string; body: string; highlight?: string }
  | { type: 'stat'; kicker?: string; value: string; label: string; note?: string }
  | { type: 'checklist'; headline: string; items: string[]; highlight?: string }
  | { type: 'beforeafter'; beforeLabel: string; before: string; afterLabel: string; after: string }
  | { type: 'quote'; quote: string; by: string; highlight?: string }
  | { type: 'closing'; headline: string; cta: string; highlight?: string };

export interface CarouselScript {
  id: string;
  /** What the script is, for people. */
  title: string;
  /** Plain note on why this script is in the set (for example "deliberately awkward"). */
  note?: string;
  /** 4:5, 1080 x 1350. */
  aspect: '4:5';
  brand: CarouselBrand;
  /** Exactly 7. */
  slides: SlideScript[];
}

/** Colours for one kind of slide. Every colour a slide uses comes from here. */
export interface Palette {
  bg: Fill;
  text: string;
  muted: string;
  /** Used for numbers, icons, strokes and accent words. Also used as text, so it must reach 4.5:1 on bg. */
  accent: string;
  /** Text on top of an accent-coloured shape. */
  onAccent: string;
  /** The marker behind or under a highlighted word. */
  marker: string;
  /** Text on top of a marker. */
  onMarker: string;
  /** Cards and panels. */
  surface: string;
  onSurface: string;
  /** Dividers, outlines. */
  line: string;
}

export interface Theme {
  id: string;
  name: string;
  /** One line a person can read. */
  mood: string;
  /** Content slides. */
  base: Palette;
  /** Cover, stat, quote, closing, and the "after" half of a split. */
  hero: Palette;
  fonts: { headline: FontFamily; headlineWeight: number; body: FontFamily; bodyWeight: number; strong: number };
  /** Font sizes in px on the 1080 wide slide. */
  type: { cover: number; headline: number; body: number; small: number; stat: number; quote: number; label?: number };
  shape: {
    /** Card, sticker and button corner radius. */
    radius: number;
    /** Outline weight on cards and badges. 0 = none. */
    outline: number;
    /** Weight of drawn strokes: icons, arrows, dividers, underlines. */
    stroke: number;
    badge: 'circle' | 'rounded' | 'square';
    marker: 'box' | 'underline' | 'brush';
    sticker: 'pill' | 'tag' | 'burst';
    /** Offset of a hard shadow under cards and buttons. 0 = none. */
    hardShadow: number;
    /** Decorative background shapes. */
    decor: 'rings' | 'orbs' | 'blocks';
  };
  spacing: { margin: number; gap: number; section: number };
}

export interface ComposedSlide {
  id: string;
  type: SlideScript['type'];
  plan: Plan;
  /** Plain notes about choices made (for example "Headline was shrunk to 68 px to fit"). */
  notes: string[];
}

export const SLIDE = { width: 1080, height: 1350 } as const;
