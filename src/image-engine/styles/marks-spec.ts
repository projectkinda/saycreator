// Marks: badges, stamps and shapes (the first group) and textures and patterns (the second) that a style draws in code, with no pictures.
// This file holds only the shape of a mark and its checking, so the validator and the reader's vocabulary can use it without the drawing code.

export const SHAPE_MARKS = ['asterisk', 'sparkle', 'round-badge', 'starburst-badge', 'circular-text', 'stamp', 'ticket', 'label', 'outline-button', 'arrow', 'scribble-circle', 'ribbon', 'tape', 'two-tone-text'] as const;
export const TEXTURE_MARKS = ['dot-grid', 'halftone-field', 'stripes', 'grain', 'text-rows'] as const;
export const MARK_KINDS = [...SHAPE_MARKS, ...TEXTURE_MARKS] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

export const MARK_ZONES = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top', 'bottom', 'left', 'right', 'centre', 'full'] as const;
export type MarkZone = (typeof MARK_ZONES)[number];

export interface MarkSpec {
  kind: MarkKind;
  zone: MarkZone;
  /**
   * Shapes: the width of the mark in px (a circle's diameter). Dot grid and halftone: the distance between dots. Stripes: the distance between stripes.
   * Grain: the size of a speck. Text rows: the text size. Ribbon: the band's height. Two-tone text: the text size.
   */
  size: number;
  /** A palette colour name. */
  colour: string;
  /** A second palette colour name: text on a badge, the other tone of two-tone text, the ink of a ribbon. */
  colour2?: string;
  /** The words on a badge, stamp, ticket, label, button, ribbon, circular ring, or the repeated words of a text row. */
  text?: string;
  /** Two-tone text: the lines, alternately in colour and colour2. */
  lines?: string[];
  /** Degrees, -90 to 90. For stripes the angle of the stripes. */
  rotate?: number;
  /** Starburst and asterisk: how many points (4 to 24). */
  points?: number;
  /** 0.05 to 1. Textures default to a quiet 0.35. */
  opacity?: number;
  /** Let a shape run off the edge of the slide. */
  bleed?: boolean;
  /** Which of the style's two fonts the words use. Default headline. */
  font?: 'headline' | 'body';
  /** Only on these slide types (all if left out). */
  types?: string[];
}

export const MAX_MARKS = 8;
const NEEDS_TEXT: MarkKind[] = ['circular-text', 'stamp', 'ticket', 'label', 'outline-button', 'text-rows'];
export const TEXTURE_SET = new Set<string>(TEXTURE_MARKS);

/** Plain-language problems with a style's "marks" list. */
export function validateMarks(raw: unknown, roles: readonly string[], slideTypes: readonly string[], err: (m: string) => void): void {
  if (!Array.isArray(raw)) return err('"marks" must be a list.');
  if (raw.length > MAX_MARKS) err(`"marks" has ${raw.length} entries. At most ${MAX_MARKS} per style.`);
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  raw.forEach((m: unknown, i: number) => {
    const w = `marks[${i}]`;
    if (typeof m !== 'object' || m === null || Array.isArray(m)) return err(`${w} must be an object.`);
    const o = m as Record<string, unknown>;
    if (!(MARK_KINDS as readonly string[]).includes(o.kind as string)) return err(`${w}.kind is "${String(o.kind)}". Kinds: ${MARK_KINDS.join(', ')}.`);
    const kind = o.kind as MarkKind;
    if (!(MARK_ZONES as readonly string[]).includes(o.zone as string)) err(`${w}.zone is "${String(o.zone)}". Zones: ${MARK_ZONES.join(', ')}.`);
    const lo = TEXTURE_SET.has(kind) ? 6 : 40;
    const hi = kind === 'text-rows' || kind === 'two-tone-text' ? 400 : 1600;
    if (!num(o.size) || o.size < lo || o.size > hi) err(`${w}.size must be a number from ${lo} to ${hi}.`);
    if (typeof o.colour !== 'string' || !roles.includes(o.colour)) err(`${w}.colour must be a palette colour name (${roles.join(', ')}).`);
    if (o.colour2 !== undefined && (typeof o.colour2 !== 'string' || !roles.includes(o.colour2))) err(`${w}.colour2 must be a palette colour name.`);
    if (o.text !== undefined && (typeof o.text !== 'string' || o.text.length > 40)) err(`${w}.text must be words of at most 40 characters.`);
    if (NEEDS_TEXT.includes(kind) && (typeof o.text !== 'string' || o.text.trim() === '')) err(`${w} (${kind}) needs "text".`);
    if (kind === 'two-tone-text' && !(Array.isArray(o.lines) && o.lines.length >= 1 && o.lines.length <= 4 && o.lines.every((l) => typeof l === 'string' && l.trim() !== '' && l.length <= 24))) err(`${w} (two-tone-text) needs "lines": 1 to 4 short lines (24 characters each).`);
    if (o.rotate !== undefined && (!num(o.rotate) || o.rotate < -90 || o.rotate > 90)) err(`${w}.rotate must be -90 to 90 degrees.`);
    if (o.points !== undefined && (!num(o.points) || o.points < 4 || o.points > 24 || !Number.isInteger(o.points))) err(`${w}.points must be a whole number from 4 to 24.`);
    if (o.opacity !== undefined && (!num(o.opacity) || o.opacity < 0.05 || o.opacity > 1)) err(`${w}.opacity must be 0.05 to 1.`);
    if (o.bleed !== undefined && typeof o.bleed !== 'boolean') err(`${w}.bleed must be true or false.`);
    if (o.font !== undefined && o.font !== 'headline' && o.font !== 'body') err(`${w}.font must be "headline" or "body".`);
    if (o.types !== undefined && !(Array.isArray(o.types) && o.types.every((t) => slideTypes.includes(t as string)))) err(`${w}.types must be a list of slide types (${slideTypes.join(', ')}).`);
  });
}
