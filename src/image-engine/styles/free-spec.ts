// The free layout: a slide described as free boxes (in percent of the canvas) instead of one of our stored layouts. It is made in code from the
// measurements of a reference (see reference/free.ts), labelled by one reader call, edited by the person, and saved in a template. It holds boxes,
// roles, alignment, treatments and graphics: never a picture. This file is only the shape and its checking.

export const FREE_ROLES = ['title', 'subtitle', 'body', 'label', 'number', 'button', 'decoration'] as const;
export type FreeRole = (typeof FREE_ROLES)[number];
export const FREE_TREATMENTS = ['outline', 'shadow', 'tilt', 'caps'] as const;
export type FreeTreatmentKind = (typeof FREE_TREATMENTS)[number];
export const FREE_SHAPES = ['rect', 'rounded', 'pill', 'circle', 'bar', 'ring'] as const;

export interface FreeBox {
  /** Percent of the canvas (0 to 100). */
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface FreeTreatment {
  kind: FreeTreatmentKind;
  colour?: string;
  /** Degrees, for tilt. */
  angle?: number;
  /** Off in the editor: kept so it can be switched on again. */
  off?: boolean;
}
export interface FreeSlot {
  id: string;
  role: FreeRole;
  box: FreeBox;
  align: 'left' | 'centre' | 'right';
  maxLines: number;
  anchor: 'top' | 'middle' | 'bottom';
  /** The type size to aim for on a 1350 px high slide; the text is fitted into the box and never goes under 32 px. */
  sizePx: number;
  colour?: string;
  weight?: number;
  treatments: FreeTreatment[];
}
export interface FreeShape {
  id: string;
  kind: (typeof FREE_SHAPES)[number];
  box: FreeBox;
  colour: string;
  angle?: number;
}
/** A graphic the toolbox draws as a mark (asterisk, sparkle, badge, arrow...): its kind comes from the reader's label. */
export interface FreeGraphic {
  id: string;
  kind: string;
  box: FreeBox;
  colour: string;
  angle?: number;
  text?: string;
}
export interface FreePhoto {
  id: string;
  box: FreeBox;
  shape: 'rect' | 'rounded' | 'circle' | 'full-bleed';
}
export interface FreeBackground {
  kind: 'flat' | 'gradient' | 'split' | 'photo';
  colours: string[];
  direction?: 'vertical' | 'horizontal';
  split?: number;
}
export interface FreeLayout {
  background: FreeBackground;
  photos: FreePhoto[];
  shapes: FreeShape[];
  graphics: FreeGraphic[];
  slots: FreeSlot[];
  /** What was detected in the reference and the drawing cannot do (said in the closeness panel). */
  missing?: string[];
}

export const MAX_SLOTS = 8;
export const MAX_SHAPES = 12;
export const MAX_GRAPHICS = 10;
export const MAX_PHOTOS = 3;

const HEX = /^#[0-9a-fA-F]{6}$/;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Plain-language problems with a style's "free" block. */
export function validateFree(raw: unknown, slideTypes: readonly string[], marksKinds: readonly string[], err: (m: string) => void): void {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return err('"free" must be an object with a free layout for each slide type.');
  for (const [type, f] of Object.entries(raw as Record<string, unknown>)) {
    const w = `free.${type}`;
    if (!slideTypes.includes(type)) {
      err(`${w}: "${type}" is not a slide type (${slideTypes.join(', ')}).`);
      continue;
    }
    if (typeof f !== 'object' || f === null) {
      err(`${w} must be an object.`);
      continue;
    }
    const o = f as Record<string, unknown>;
    const box = (b: unknown, where: string) => {
      const x = b as Record<string, unknown>;
      if (typeof b !== 'object' || b === null || !['x', 'y', 'w', 'h'].every((k) => num(x[k]))) return err(`${where}.box must have x, y, w and h (percent of the canvas).`);
      if ((x.w as number) < 1 || (x.h as number) < 1 || (x.x as number) < -5 || (x.y as number) < -5 || (x.x as number) + (x.w as number) > 105 || (x.y as number) + (x.h as number) > 105) err(`${where}.box is outside the canvas or too small.`);
    };
    const list = (k: string, max: number) => (Array.isArray(o[k]) ? (o[k] as unknown[]) : (err(`${w}.${k} must be a list.`), [])).slice(0, max + 50);
    if (typeof o.background !== 'object' || o.background === null) err(`${w}.background is missing.`);
    else {
      const b = o.background as Record<string, unknown>;
      if (!['flat', 'gradient', 'split', 'photo'].includes(b.kind as string)) err(`${w}.background.kind must be flat, gradient, split or photo.`);
      if (!Array.isArray(b.colours) || !b.colours.every((c) => typeof c === 'string' && HEX.test(c))) err(`${w}.background.colours must be hex colours.`);
    }
    list('photos', MAX_PHOTOS).forEach((p, i) => box((p as Record<string, unknown>)?.box, `${w}.photos[${i}]`));
    list('shapes', MAX_SHAPES).forEach((p, i) => {
      const s = p as Record<string, unknown>;
      box(s?.box, `${w}.shapes[${i}]`);
      if (!(FREE_SHAPES as readonly string[]).includes(s?.kind as string)) err(`${w}.shapes[${i}].kind must be one of ${FREE_SHAPES.join(', ')}.`);
      if (typeof s?.colour !== 'string' || !HEX.test(s.colour)) err(`${w}.shapes[${i}].colour must be a hex colour.`);
    });
    list('graphics', MAX_GRAPHICS).forEach((p, i) => {
      const s = p as Record<string, unknown>;
      box(s?.box, `${w}.graphics[${i}]`);
      if (!marksKinds.includes(s?.kind as string)) err(`${w}.graphics[${i}].kind "${String(s?.kind)}" is not a mark the toolbox draws (${marksKinds.join(', ')}).`);
      if (typeof s?.colour !== 'string' || !HEX.test(s.colour)) err(`${w}.graphics[${i}].colour must be a hex colour.`);
    });
    list('slots', MAX_SLOTS).forEach((p, i) => {
      const s = p as Record<string, unknown>;
      box(s?.box, `${w}.slots[${i}]`);
      if (!(FREE_ROLES as readonly string[]).includes(s?.role as string)) err(`${w}.slots[${i}].role must be one of ${FREE_ROLES.join(', ')}.`);
      if (!['left', 'centre', 'right'].includes(s?.align as string)) err(`${w}.slots[${i}].align must be left, centre or right.`);
      if (!['top', 'middle', 'bottom'].includes(s?.anchor as string)) err(`${w}.slots[${i}].anchor must be top, middle or bottom.`);
      if (!num(s?.sizePx) || (s.sizePx as number) < 32 || (s.sizePx as number) > 420) err(`${w}.slots[${i}].sizePx must be 32 to 420 (nothing under 32 px is readable on a phone).`);
      if (!num(s?.maxLines) || (s.maxLines as number) < 1 || (s.maxLines as number) > 12) err(`${w}.slots[${i}].maxLines must be 1 to 12.`);
      if (!Array.isArray(s?.treatments) || !(s.treatments as { kind?: string }[]).every((t) => (FREE_TREATMENTS as readonly string[]).includes(t?.kind as string))) err(`${w}.slots[${i}].treatments must be a list of ${FREE_TREATMENTS.join(', ')}.`);
    });
    if (list('slots', MAX_SLOTS).length > MAX_SLOTS) err(`${w} has more than ${MAX_SLOTS} text slots.`);
  }
}
