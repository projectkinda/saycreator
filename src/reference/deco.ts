// Generic design devices a preset can turn on (style.json "library.devices"). Each is drawn by the code from its own shapes (no copied art). A preset asks for the ones it wants;
// the style panel can switch each one off (and on again) without a model call. Nothing here is a picture: only parameters.
/** Where an art item may go: the edges, the corners (the item may bleed off the page), or a clear stretch low on the slide for a divider. Always only where no text is. */
export type ArtZone = 'top-edge' | 'bottom-edge' | 'corner-tl' | 'corner-tr' | 'corner-bl' | 'corner-br' | 'divider-low' | 'divider-high';
/** One vector art item of a preset's pack (src/image-engine/art), placed in a safe zone and recoloured to the preset's own palette. */
export interface ArtPlacement {
  /** "<pack>/<name>" as in src/image-engine/art/index.json, for example "style-4/frame-1". */
  item: string;
  zone: ArtZone;
  /** The width it is drawn at, px (default: its own width for an edge, 220 for a corner, 320 for a divider). */
  w?: number;
  /** Which slides: every one (default), the first, the last, or the ones in between. */
  on?: 'all' | 'first' | 'last' | 'inner';
  /** How far a corner item may bleed off the page (0..0.5 of its size; default 0). */
  bleed?: number;
}
export interface Deco {
  // chrome
  /** The profile header (avatar placeholder, name, handle). It is switched by the panel's own Profile header toggle. */
  profileHeader?: boolean;
  /** The page index ("01") at the top right instead of "1 / 6" at the bottom left. */
  pageIndex?: boolean;
  /** A vertical label (the handle) along the right edge. */
  sideLabel?: boolean;
  /** A brand footer row: handle / site / logo placeholder. */
  footerRow?: boolean;
  /** A three-part header row: handle / page / site. */
  headerRow?: boolean;
  /** A thin line across the top with a small arrow disc at its end. */
  arrowHeader?: boolean;
  /** The last slide gets a contact block: logo placeholder, site and socials as plain text. */
  contactClosing?: boolean;
  // shapes
  /** The call-to-action button is an outline, not a filled pill. */
  outlinedButton?: boolean;
  /** A row of scallops along the top edge, in the ink colour. */
  scallop?: boolean;
  /** Cards and pills get a solid offset shadow (px) with a thin outline. `shadow` is the colour role of the shadow. */
  hardShadow?: number;
  shadow?: 'accent' | 'text';
  /** A ground that is not the page colour is drawn as a rounded card inset on a page of this colour. */
  insetCard?: { page: string; margin: number; radius: number };
  /** A thin rule across the page; 'lower-two-thirds' also keeps the slide's content under it. */
  rule?: 'across' | 'lower-two-thirds';
  /** A soft radial glow in a corner. */
  glow?: { corner: 'tl' | 'tr' | 'bl' | 'br'; color: string };
  // accents
  /** The accent word is circled with a hand-drawn pen line (a third accent type next to the marker and the underline). */
  penCircle?: boolean;
  /** Accent runs are set in an italic serif inside the upright headline. */
  italicAccent?: boolean;
  /** The headline is filled with this colour gradient (left to right, top to bottom). */
  gradientText?: string[];
  // art
  /** Vector art from the preset's own pack (a list of placements), recoloured to the preset's palette; drawn only where no text is. Off unless a preset lists it. */
  art?: ArtPlacement[];
  // stickers
  /** Emoji stickers (a monochrome open-licence emoji font) in empty corners, never on text. */
  stickers?: boolean;
}

/** The devices the style panel can switch, in plain words. */
export const DECO_LABELS: Record<keyof Deco, string> = {
  profileHeader: 'Profile header',
  pageIndex: 'Page index at the top right',
  sideLabel: 'Vertical side label',
  footerRow: 'Brand footer row',
  headerRow: 'Three-part header row',
  arrowHeader: 'Arrow-line header',
  contactClosing: 'Contact block on the last slide',
  outlinedButton: 'Outlined button',
  scallop: 'Scalloped top edge',
  hardShadow: 'Offset shadow on cards and pills',
  shadow: 'Shadow colour',
  insetCard: 'Rounded colour card',
  rule: 'Thin rule across the page',
  glow: 'Corner glow',
  penCircle: 'Pen circle round the accent word',
  italicAccent: 'Italic accent words',
  gradientText: 'Gradient headline',
  stickers: 'Emoji stickers',
  art: 'Vector art from the style’s pack',
};
/** Keys that are switches (the rest only carry a value for a switch). */
export const DECO_SWITCHES = ['pageIndex', 'sideLabel', 'footerRow', 'headerRow', 'arrowHeader', 'contactClosing', 'outlinedButton', 'scallop', 'hardShadow', 'insetCard', 'rule', 'glow', 'penCircle', 'italicAccent', 'gradientText', 'stickers', 'art'] as const satisfies readonly (keyof Deco)[];
export type DecoSwitch = (typeof DECO_SWITCHES)[number];
/** The devices a deco asks for (those that are on). */
export const decoOn = (d: Deco | undefined): DecoSwitch[] => DECO_SWITCHES.filter((k) => !!d && d[k] !== undefined && d[k] !== false);
/** A deco with the given switches turned off (a switch set to false is removed). */
export function withoutSwitches(d: Deco | undefined, off: Partial<Record<DecoSwitch, boolean>> | undefined): Deco | undefined {
  if (!d || !off) return d;
  const out: Deco = { ...d };
  for (const k of DECO_SWITCHES) if (off[k] === false) delete out[k];
  if (off.hardShadow === false) delete out.shadow;
  return out;
}
