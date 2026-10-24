// Plain-language validation. Every problem is a sentence a person can act on.
import { FONT_FAMILIES, type Layer, type Plan } from './types';

const MAX_LAYERS = 60;
const MIN_SIDE = 64;
const MAX_SIDE = 4096;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGBA = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;

export const isColor = (v: unknown): v is string => typeof v === 'string' && (HEX.test(v) || RGBA.test(v));
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const label = (l: { id?: unknown; name?: unknown }) => `Layer "${String(l.name ?? l.id)}"`;

function range(errors: string[], who: string, what: string, v: unknown, lo: number, hi: number, optional = false) {
  if (v === undefined && optional) return;
  if (!num(v)) errors.push(`${who}: ${what} must be a number.`);
  else if (v < lo || v > hi) errors.push(`${who}: ${what} must be between ${lo} and ${hi} (it is ${v}).`);
}

function validateLayer(l: Layer, errors: string[]) {
  const who = label(l);
  if (typeof l.id !== 'string' || l.id.trim() === '') errors.push('A layer has no id.');
  for (const k of ['x', 'y'] as const) if (!num(l[k])) errors.push(`${who}: ${k} must be a number.`);
  if (!num(l.width) || l.width <= 0) errors.push(`${who}: width must be more than 0.`);
  if (!num(l.height) || l.height <= 0) errors.push(`${who}: height must be more than 0.`);
  if (!num(l.rotation)) errors.push(`${who}: rotation must be a number of degrees.`);
  range(errors, who, 'opacity', l.opacity, 0, 1);
  if (l.mask) {
    if (!['rect', 'roundRect', 'ellipse'].includes(l.mask.shape)) errors.push(`${who}: mask shape must be rect, roundRect or ellipse.`);
    range(errors, who, 'mask radius', l.mask.radius, 0, 4096, true);
  }

  switch (l.kind) {
    case 'image':
      if (typeof l.src !== 'string' || l.src === '') errors.push(`${who}: an image layer needs a source.`);
      if (!['cover', 'contain'].includes(l.fit)) errors.push(`${who}: fit must be cover or contain.`);
      if (l.focal) {
        range(errors, who, 'focal x', l.focal.x, 0, 1);
        range(errors, who, 'focal y', l.focal.y, 0, 1);
      }
      if (l.filters) {
        range(errors, who, 'brightness', l.filters.brightness, -1, 1, true);
        range(errors, who, 'contrast', l.filters.contrast, -1, 1, true);
        range(errors, who, 'saturation', l.filters.saturation, -1, 1, true);
        range(errors, who, 'blur', l.filters.blur, 0, 40, true);
      }
      break;
    case 'text': {
      if (typeof l.text !== 'string' || l.text.trim() === '') errors.push(`${who}: the text is empty.`);
      const s = l.style;
      if (!s) {
        errors.push(`${who}: a text layer needs a style.`);
        break;
      }
      if (!(FONT_FAMILIES as readonly string[]).includes(s.font))
        errors.push(`${who}: the font "${s.font}" is not available. Use ${FONT_FAMILIES.join(' or ')}.`);
      range(errors, who, 'font weight', s.weight, 100, 900);
      range(errors, who, 'font size', s.size, 6, 600);
      if (!isColor(s.color)) errors.push(`${who}: the text colour "${String(s.color)}" is not a colour.`);
      if (!['left', 'center', 'right'].includes(s.align)) errors.push(`${who}: align must be left, center or right.`);
      if (s.valign !== undefined && !['top', 'middle', 'bottom'].includes(s.valign)) errors.push(`${who}: valign must be top, middle or bottom.`);
      range(errors, who, 'line height', s.lineHeight, 0.8, 2.5);
      if (s.stroke) {
        if (!isColor(s.stroke.color)) errors.push(`${who}: the outline colour is not a colour.`);
        range(errors, who, 'outline width', s.stroke.width, 0, 60);
      }
      if (s.shadow) {
        if (!isColor(s.shadow.color)) errors.push(`${who}: the shadow colour is not a colour.`);
        range(errors, who, 'shadow blur', s.shadow.blur, 0, 100);
      }
      if (l.autoFit) {
        range(errors, who, 'minimum font size', l.autoFit.minSize, 6, 600);
        if (num(l.autoFit.minSize) && num(s.size) && l.autoFit.minSize > s.size)
          errors.push(`${who}: the minimum size (${l.autoFit.minSize}) is bigger than the size (${s.size}).`);
      }
      if (l.highlight) {
        const h = l.highlight;
        if (!Array.isArray(h.words) || h.words.length === 0) errors.push(`${who}: highlight needs at least one word.`);
        else {
          const present = new Set(l.text.toLowerCase().replace(/[^\p{L}\p{N}'\s-]/gu, ' ').split(/\s+/));
          for (const w of h.words) if (!present.has(w.toLowerCase())) errors.push(`${who}: the highlighted word "${w}" is not in the text.`);
        }
        if (!isColor(h.color)) errors.push(`${who}: the highlight colour is not a colour.`);
        if (h.textColor !== undefined && !isColor(h.textColor)) errors.push(`${who}: the highlight text colour is not a colour.`);
        range(errors, who, 'highlight padding', h.paddingX, 0, 100);
        range(errors, who, 'highlight padding', h.paddingY, 0, 100);
        range(errors, who, 'highlight corner radius', h.radius, 0, 100);
      }
      break;
    }
    case 'shape':
      if (!['rect', 'ellipse'].includes(l.shape)) errors.push(`${who}: shape must be rect or ellipse.`);
      if (!isColor(l.fill)) errors.push(`${who}: the fill colour "${String(l.fill)}" is not a colour.`);
      if (l.stroke) {
        if (!isColor(l.stroke.color)) errors.push(`${who}: the outline colour is not a colour.`);
        range(errors, who, 'outline width', l.stroke.width, 0, 100);
      }
      range(errors, who, 'corner radius', l.radius, 0, 4096, true);
      break;
    default:
      errors.push(`${who}: "${String((l as { kind?: unknown }).kind)}" is not a layer type. Use image, text or shape.`);
  }
  if ('filters' in l && l.kind !== 'image' && (l as { filters?: unknown }).filters)
    errors.push(`${who}: filters only work on image layers.`);
}

/** Returns a list of plain-language problems. Empty means the plan is valid. */
export function validatePlan(plan: unknown): string[] {
  const errors: string[] = [];
  const p = plan as Partial<Plan> | null;
  if (!p || typeof p !== 'object') return ['The plan is missing.'];
  if (p.schema !== 1) errors.push('This plan is not in a format we know (schema 1).');
  if (!Number.isInteger(p.revision) || (p.revision as number) < 1) errors.push('The revision must be a whole number, 1 or more.');
  const c = p.canvas;
  if (!c) errors.push('The plan has no canvas size.');
  else {
    for (const k of ['width', 'height'] as const) {
      const v = c[k];
      if (!Number.isInteger(v) || v < MIN_SIDE || v > MAX_SIDE) errors.push(`Canvas ${k} must be a whole number from ${MIN_SIDE} to ${MAX_SIDE} (it is ${String(v)}).`);
    }
    if (!isColor(c.background)) errors.push(`The background "${String(c.background)}" is not a colour.`);
  }
  if (!Array.isArray(p.layers)) {
    errors.push('The plan has no list of layers.');
    return errors;
  }
  if (p.layers.length > MAX_LAYERS) errors.push(`A plan can have at most ${MAX_LAYERS} layers (it has ${p.layers.length}).`);
  const seen = new Set<string>();
  for (const l of p.layers) {
    if (seen.has(l.id)) errors.push(`Two layers share the id "${l.id}". Ids must be unique.`);
    seen.add(l.id);
    validateLayer(l, errors);
  }
  return errors;
}
