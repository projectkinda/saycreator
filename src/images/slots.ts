// Image slots: the places in a slide design where a picture goes. A slot has a kind, a box, a mask, a fit with a focal point and an optional scrim. In a pack's SVG a slot is
// written <rect data-image-slot="inset" data-mask="circle" data-fit="cover" x y width height/>; the stored pack keeps only a marker <g id="imgslot-N"/> and the slot data
// (never a picture). When a slide is drawn the marker is filled with the slide's picture (a clean placeholder when there is none).
import { contrastRgb, parseColor, type RGB } from '../image-engine/lint/color';
import { renderPhoto } from '../image-engine/draw/treat';
import type { Treatment } from '../image-engine/types';

export const SLOT_KINDS = ['background', 'inset', 'half-bleed', 'strip', 'cutout'] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];
export const MASKS = ['rect', 'rounded', 'circle', 'arch', 'blob'] as const;
export type SlotMask = (typeof MASKS)[number];
export const isKind = (v: unknown): v is SlotKind => SLOT_KINDS.includes(v as SlotKind);

export interface ImageSlot {
  id: string;
  kind: SlotKind;
  /** The box in px of the design's canvas. */
  x: number;
  y: number;
  w: number;
  h: number;
  mask: SlotMask;
  fit: 'cover' | 'contain';
  focal: { x: number; y: number };
  /** A darkening (or lightening) layer over the picture so text on it stays readable. */
  scrim?: { amount: number; from: 'top' | 'bottom' | 'all' };
  /** A strip holds 2 or 3 pictures side by side. */
  count?: number;
}

const num = (v: string | null, d: number) => (v !== null && Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);

/** Takes the image-slot elements out of a design's SVG text (leaving a marker where each was) and returns them as slot data. External pictures (<image>) are never kept. */
export function extractImageSlots(raw: string): { svg: string; slots: ImageSlot[] } {
  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length) return { svg: raw, slots: [] };
  const root = doc.documentElement;
  const vb = (root.getAttribute('viewBox') ?? '0 0 1080 1350').split(/\s+/).map(Number);
  const k = 1080 / (vb[2] || 1080);
  const slots: ImageSlot[] = [];
  for (const img of Array.from(root.getElementsByTagName('image'))) img.parentNode?.removeChild(img);
  for (const el of Array.from(root.querySelectorAll('[data-image-slot]'))) {
    const kind = el.getAttribute('data-image-slot');
    if (!isKind(kind) || slots.length >= 4) {
      el.parentNode?.removeChild(el);
      continue;
    }
    const full = kind === 'background';
    const x = num(el.getAttribute('x'), 0) * k;
    const y = num(el.getAttribute('y'), 0) * k;
    const w = num(el.getAttribute('width'), full ? vb[2] : 400) * k;
    const h = num(el.getAttribute('height'), full ? vb[3] : 400) * k;
    const mask = MASKS.includes(el.getAttribute('data-mask') as SlotMask) ? (el.getAttribute('data-mask') as SlotMask) : 'rect';
    const scrimAmt = num(el.getAttribute('data-scrim'), 0);
    const from = el.getAttribute('data-scrim-from');
    const id = `imgslot-${slots.length}`;
    slots.push({
      id,
      kind,
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h),
      mask,
      fit: el.getAttribute('data-fit') === 'contain' ? 'contain' : 'cover',
      focal: { x: Math.min(1, Math.max(0, num(el.getAttribute('data-focal-x'), 0.5))), y: Math.min(1, Math.max(0, num(el.getAttribute('data-focal-y'), 0.5))) },
      ...(scrimAmt > 0 ? { scrim: { amount: Math.min(0.9, scrimAmt), from: from === 'top' || from === 'all' ? from : 'bottom' } } : {}),
      ...(kind === 'strip' ? { count: Math.min(3, Math.max(2, Math.round(num(el.getAttribute('data-count'), 3)))) } : {}),
    });
    const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', id);
    el.parentNode?.replaceChild(g, el);
  }
  return { svg: new XMLSerializer().serializeToString(root), slots };
}

// ----- boxes and masks -----

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** The boxes a slot's pictures fill: one, or 2 to 3 side by side for a strip. */
export function slotCells(s: ImageSlot): Box[] {
  const n = s.kind === 'strip' ? (s.count ?? 3) : 1;
  const gap = 12;
  const w = (s.w - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: s.x + i * (w + gap), y: s.y, w, h: s.h }));
}
const f = (n: number) => Math.round(n * 10) / 10;
export function maskShape(m: SlotMask, b: Box): string {
  const { x, y, w, h } = b;
  switch (m) {
    case 'rounded':
      return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(Math.min(w, h) * 0.08)}"/>`;
    case 'circle':
      return `<ellipse cx="${f(x + w / 2)}" cy="${f(y + h / 2)}" rx="${f(w / 2)}" ry="${f(h / 2)}"/>`;
    case 'arch':
      return `<path d="M${f(x)} ${f(y + h)} L${f(x)} ${f(y + w / 2)} A${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(x + w)} ${f(y + w / 2)} L${f(x + w)} ${f(y + h)} Z"/>`;
    case 'blob':
      return `<path d="M${f(x + w * 0.5)} ${f(y)} C${f(x + w * 0.88)} ${f(y)} ${f(x + w)} ${f(y + h * 0.22)} ${f(x + w)} ${f(y + h * 0.5)} C${f(x + w)} ${f(y + h * 0.86)} ${f(x + w * 0.8)} ${f(y + h)} ${f(x + w * 0.5)} ${f(y + h)} C${f(x + w * 0.14)} ${f(y + h)} ${f(x)} ${f(y + h * 0.78)} ${f(x)} ${f(y + h * 0.5)} C${f(x)} ${f(y + h * 0.16)} ${f(x + w * 0.16)} ${f(y)} ${f(x + w * 0.5)} ${f(y)} Z"/>`;
    default:
      return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/>`;
  }
}

// ----- a baked picture: cropped to the slot's box with its treatments applied -----

export interface Baked {
  url: string;
  w: number;
  h: number;
  /** The mean colour of the darkest and the lightest quarter of the picture: what text may land on. */
  dark: RGB;
  light: RGB;
}

export const TREATMENT_IDS = [
  { id: 'duotone', label: 'Duotone (palette)' },
  { id: 'grain', label: 'Grain' },
  { id: 'blur', label: 'Blur' },
  { id: 'darken', label: 'Darken' },
  { id: 'lighten', label: 'Lighten' },
  { id: 'wash', label: 'Colour wash' },
  { id: 'vignette', label: 'Vignette' },
] as const;
export type TreatmentId = (typeof TREATMENT_IDS)[number]['id'];
/** The photo treatments the engine already has, tuned by the slide's palette so every picture in a carousel shares one look. */
export function treatmentList(ids: string[] | undefined, palette: Record<string, string>): Treatment[] {
  const accent = palette.accent ?? '#FF8A4C';
  const dark = palette.bg ?? '#101820';
  const out: Treatment[] = [];
  for (const id of ids ?? []) {
    if (id === 'duotone') out.push({ op: 'duotone', dark, light: accent });
    else if (id === 'grain') out.push({ op: 'grain', amount: 0.25, seed: 7 });
    else if (id === 'blur') out.push({ op: 'blur', radius: 6 });
    else if (id === 'darken') out.push({ op: 'levels', brightness: -0.25 });
    else if (id === 'lighten') out.push({ op: 'levels', brightness: 0.2 });
    else if (id === 'wash') out.push({ op: 'wash', color: accent, amount: 0.3 });
    else if (id === 'vignette') out.push({ op: 'vignette', amount: 0.5 });
  }
  return out;
}

export async function bakeImage(blob: Blob, box: { w: number; h: number }, o: { fit: 'cover' | 'contain'; focal: { x: number; y: number }; treatments: Treatment[]; maxSide?: number }): Promise<Baked> {
  const img = new Image();
  const u = URL.createObjectURL(blob);
  try {
    img.src = u;
    await img.decode();
    const k = Math.min(1, (o.maxSide ?? 1080) / Math.max(box.w, box.h));
    const w = Math.max(8, Math.round(box.w * k));
    const h = Math.max(8, Math.round(box.h * k));
    const c = renderPhoto(img, w, h, o.fit, o.focal, o.treatments);
    const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
    const px: { l: number; r: number; g: number; b: number }[] = [];
    for (let i = 0; i < d.length; i += 4 * 7) if (d[i + 3] > 128) px.push({ l: 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2], r: d[i], g: d[i + 1], b: d[i + 2] });
    px.sort((a, b) => a.l - b.l);
    const q = Math.max(1, Math.floor(px.length / 4));
    const mean = (a: typeof px): RGB => [Math.round(a.reduce((s, p) => s + p.r, 0) / (a.length || 1)), Math.round(a.reduce((s, p) => s + p.g, 0) / (a.length || 1)), Math.round(a.reduce((s, p) => s + p.b, 0) / (a.length || 1))];
    return { url: c.toDataURL(o.fit === 'contain' ? 'image/png' : 'image/jpeg', 0.86), w: c.width, h: c.height, dark: mean(px.slice(0, q)), light: mean(px.slice(-q)) };
  } finally {
    URL.revokeObjectURL(u);
  }
}

// ----- the contrast safety net -----

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t];
/**
 * The scrim a picture needs so the text over it keeps 4.5:1: the worst part of the picture under the text (its lightest quarter for light text, its darkest for dark text)
 * is darkened (or lightened) until the contrast holds. The slot's own scrim is the starting amount.
 */
export function scrimFor(textColours: string[], b: Baked, own?: ImageSlot['scrim']): { color: string; amount: number; from: 'top' | 'bottom' | 'all'; raised: boolean } | null {
  const text = textColours.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)).map((c) => parseColor(c).rgb);
  if (text.length === 0) return own ? { color: '#000000', amount: own.amount, from: own.from, raised: false } : null;
  const lightText = text.reduce((s, t) => s + (0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2]), 0) / text.length > 140;
  const worst = lightText ? b.light : b.dark;
  const veil: RGB = lightText ? [0, 0, 0] : [255, 255, 255];
  const need = (a: number) => text.every((t) => contrastRgb(t, mix(worst, veil, a) as RGB) >= 4.5);
  const start = own?.amount ?? 0;
  let a = start;
  while (a < 0.9 && !need(a)) a = Math.round((a + 0.05) * 100) / 100;
  if (a === 0) return null;
  return { color: lightText ? '#000000' : '#FFFFFF', amount: a, from: own?.from ?? 'all', raised: a > start };
}

// ----- filling a marker -----

/** The SVG that goes in a slot's marker: the picture(s) in the mask with the scrim, or nothing when it is empty. */
export function slotMarkup(slot: ImageSlot, fills: (Baked | null)[], o: { palette: Record<string, string>; scrim?: { color: string; amount: number; from: 'top' | 'bottom' | 'all' } | null }): string {
  const cells = slotCells(slot);
  let defs = '';
  let body = '';
  cells.forEach((c, i) => {
    const id = `${slot.id}-c${i}`;
    defs += `<clipPath id="clip-${id}">${maskShape(slot.mask, c)}</clipPath>`;
    const b = fills[i];
    if (b) {
      let veil = '';
      if (o.scrim) {
        const [y1, y2] = o.scrim.from === 'top' ? [1, 0] : [0, 1];
        defs += `<linearGradient id="scrim-${id}" x1="0" y1="${y1}" x2="0" y2="${y2}"><stop offset="0" stop-color="${o.scrim.color}" stop-opacity="${o.scrim.from === 'all' ? o.scrim.amount : 0}"/><stop offset="1" stop-color="${o.scrim.color}" stop-opacity="${o.scrim.amount}"/></linearGradient>`;
        veil = `<rect x="${f(c.x)}" y="${f(c.y)}" width="${f(c.w)}" height="${f(c.h)}" fill="url(#scrim-${id})"/>`;
      }
      body += `<g clip-path="url(#clip-${id})"><image href="${b.url}" x="${f(c.x)}" y="${f(c.y)}" width="${f(c.w)}" height="${f(c.h)}" preserveAspectRatio="none"/>${veil}</g>`;
    }
    // An empty slot draws nothing: no placeholder in the drawing or the export (the editor shows its own overlay).
  });
  return `<defs>${defs}</defs>${body}`;
}

/** Puts each markup inside its marker group of a drawn SVG. */
export function injectSlots(svg: string, markup: Record<string, string>): string {
  if (Object.keys(markup).length === 0) return svg;
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  for (const [id, m] of Object.entries(markup)) {
    const marker = Array.from(root.getElementsByTagName('g')).find((g) => g.getAttribute('id') === id);
    if (!marker) continue;
    const frag = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${m}</svg>`, 'image/svg+xml').documentElement;
    for (const n of Array.from(frag.childNodes)) marker.appendChild(doc.importNode(n, true));
  }
  return new XMLSerializer().serializeToString(root);
}
