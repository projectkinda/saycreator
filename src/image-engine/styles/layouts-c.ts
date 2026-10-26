// Layout catalogue, part 3: layouts that use photos. Each takes the slide's photo from the composer (or draws a clean
// placeholder), treats and frames it as the style asks, and keeps the words readable (see photo/slot.ts).
import type { Palette, SlideScript } from '../carousel/types';
import { parseColor } from '../lint/color';
import { buildText, rect, solidOf } from '../carousel/toolbox';
import type { Layer, Mask } from '../types';
import { blockOffset, laptopFrame, phoneFrame, polaroid, strip, ticket } from '../photo/frames';
import { glassCard, protect, putPhoto, recordSlot, takePhotos, type Slot } from '../photo/slot';
import { add, bg, body, head, kicker, num, type LCtx } from './kit';
import { labelText } from './tools';

type S<T extends SlideScript['type']> = Extract<SlideScript, { type: T }>;
const words = (h?: string) => h?.split(/\s+/).filter(Boolean);
const mark = (c: LCtx, highlight?: string) => (c.params.bar === 'last' ? ('last-line' as const) : c.params.bar === 'all' ? ('all-lines' as const) : highlight ? ('words' as const) : ('none' as const));
const where = (c: LCtx) => (c.params.textAt === 'top' || c.params.textAt === 'bottom' || c.params.textAt === 'middle' ? c.params.textAt : undefined);

/** Cover: the photo fills the slide, the headline is big and sits low (or high, where the photo is calmer). */
export function coverPhotoFull(c: LCtx, s: S<'cover'>) {
  bg(c);
  const { M, W } = c;
  const cw = W - 2 * M;
  const sec = c.theme.spacing.section;
  const [slot] = takePhotos(c);
  add(c, ...putPhoto(c, 'photo', slot, 0, 0, W, c.H));
  const sub = s.sub ? body(c, 'sub', s.sub, { y: 0, width: cw * 0.84, size: c.theme.type.body, min: 32, maxH: 240, color: c.pal.text, dry: true }) : null;
  const subH = sub ? sub.height + sec : 0;
  const kickH = s.kicker ? 90 + sec : 0;
  const room: [number, number] = [c.top + kickH, c.bottom - subH];
  const probe = head(c, 'headline', s.headline, { region: [room[0], room[0] + (room[1] - room[0]) * 0.8], size: c.theme.type.cover, min: 84, dry: true });
  const block = probe.height + subH + (s.kicker ? kickH : 0);
  const p = slot.ref ? protect(c, slot, block, ['bottom', 'top'], where(c)) : { where: 'bottom' as const };
  let y = c.top;
  if (s.kicker) y += kicker(c, s.kicker, M, y) + sec;
  if (p.where === 'top') {
    head(c, 'headline', s.headline, { region: [y, y + probe.height], size: c.theme.type.cover, min: 84, mark: mark(c, s.highlight), words: words(s.highlight) });
    if (sub) add(c, { ...sub.layer, y: y + probe.height + sec });
  } else {
    head(c, 'headline', s.headline, { region: [Math.max(y, c.bottom - subH - probe.height), c.bottom - subH], anchor: 'bottom', size: c.theme.type.cover, min: 84, mark: mark(c, s.highlight), words: words(s.highlight) });
    if (sub) add(c, { ...sub.layer, y: c.bottom - sub.height });
  }
}

/** Cover: the photo cut to a shape (arch, flower, blob, oval, pill) with the headline under it. */
export function coverPhotoShape(c: LCtx, s: S<'cover'>) {
  bg(c);
  const { M, W } = c;
  const cw = W - 2 * M;
  const sec = c.theme.spacing.section;
  const gap = c.theme.spacing.gap;
  const [slot] = takePhotos(c);
  let y = c.top;
  if (s.kicker) y += kicker(c, s.kicker, M, y) + sec;
  const sub = s.sub ? body(c, 'sub', s.sub, { y: 0, width: cw * 0.84, size: c.theme.type.body, min: 32, maxH: 220, color: c.pal.muted, dry: true }) : null;
  const subH = sub ? sub.height + sec : 0;
  const hdRegion: [number, number] = [y + 420, c.bottom - subH];
  const probe = head(c, 'headline', s.headline, { region: hdRegion, size: c.theme.type.cover, min: 84, dry: true });
  const ph = Math.round(Math.max(380, Math.min(760, c.bottom - subH - probe.height - gap * 2 - y)));
  const shape = String(c.params.shape ?? 'arch') as Mask['shape'];
  const pw = shape === 'ellipse' || shape === 'flower' || shape === 'blob' || shape === 'diamond' || shape === 'starburst' ? Math.min(ph, cw) : Math.min(cw, Math.round(ph * 0.82));
  const px = c.params.side === 'left' ? M : W - M - pw;
  const mask: Mask = shape === 'roundRect' ? { shape, radius: c.theme.shape.radius || 32 } : { shape };
  add(c, ...putPhoto(c, 'photo', slot, px, y, pw, ph, { mask }));
  const yh = y + ph + gap * 1.5;
  head(c, 'headline', s.headline, { region: [yh, c.bottom - subH], anchor: 'bottom', size: c.theme.type.cover, min: 84, mark: mark(c, s.highlight), words: words(s.highlight) });
  if (sub) add(c, { ...sub.layer, y: c.bottom - sub.height });
}

/** The style's palette with the darkest background, for words that sit on a photo. */
function darkestPalette(c: LCtx): Palette {
  const lum = (p: Palette) => {
    const { rgb } = parseColor(solidOf(p.bg));
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  return Object.values(c.style.palettes).reduce((a, b) => (lum(b) < lum(a) ? b : a));
}

/** Cover: the photo fills the top, a solid colour block under it carries the headline. With `offset`, a colour block is shifted behind the photo. */
export function coverPhotoSplit(c: LCtx, s: S<'cover'>) {
  bg(c);
  const { M, W } = c;
  const cw = W - 2 * M;
  const sec = c.theme.spacing.section;
  const at = Math.round(c.H * num(c, 'at', 0.55));
  const [slot] = takePhotos(c);
  if (c.params.offset) {
    // The photo starts under the page chrome, with a colour block shifted behind it.
    const inset = M;
    const top = c.top;
    add(c, rect('photo-block', 'decor', inset + 28, top + 28, W - 2 * inset - 28, at - top - 28, c.pal.accent), ...putPhoto(c, 'photo', slot, inset, top, W - 2 * inset - 28, at - top - 28));
  } else {
    // The photo bleeds to the top edge, so the page chrome sits on it: it takes the style's darkest palette (light words).
    add(c, ...putPhoto(c, 'photo', slot, 0, 0, W, at));
    c.chromePal = darkestPalette(c);
  }
  let y = at + sec;
  if (s.kicker) y += kicker(c, s.kicker, M, y) + sec * 0.6;
  const sub = s.sub ? body(c, 'sub', s.sub, { y: 0, width: cw * 0.86, size: c.theme.type.body, min: 32, maxH: 200, color: c.pal.muted, dry: true }) : null;
  const subH = sub ? sub.height + sec * 0.6 : 0;
  head(c, 'headline', s.headline, { region: [y, c.bottom - subH], size: c.theme.type.cover, min: 80, mark: mark(c, s.highlight), words: words(s.highlight) });
  if (sub) add(c, { ...sub.layer, y: c.bottom - sub.height });
}

/** Content: a headline, one photo in a frame (phone, laptop, polaroid, ticket, offset block, plain, or a glass card over a full photo), and a caption. */
export function contentPhotoFrame(c: LCtx, s: S<'content'>) {
  const frame = String(c.params.frame ?? 'plain');
  if (frame === 'glass') return glassOverPhoto(c, s);
  bg(c);
  const { M, W } = c;
  const cw = W - 2 * M;
  const gap = c.theme.spacing.gap;
  const [slot] = takePhotos(c);
  const hd = head(c, 'headline', s.headline, { region: [c.top, c.top + 400], size: c.theme.type.headline, min: 64, mark: mark(c, s.highlight), words: words(s.highlight), dry: true });
  const cap = body(c, 'caption', s.body, { y: 0, width: cw, size: c.theme.type.body, min: 32, maxH: 240, dry: true });
  const top = c.top + hd.height + gap * 1.5;
  const bottom = c.bottom - cap.height - gap * 1.5;
  const area = bottom - top;
  head(c, 'headline', s.headline, { region: [c.top, c.top + hd.height], size: c.theme.type.headline, min: 64, mark: mark(c, s.highlight), words: words(s.highlight) });
  const tilt = num(c, 'tilt', 0);
  const mid = (h: number) => Math.round(top + (area - h) / 2);
  if (frame === 'phone' && area > 520) {
    const w = Math.round(Math.min(area / 2.05, 560));
    const x = Math.round((W - w) / 2);
    const y = mid(w * 2.05);
    const f = phoneFrame('frame', x, y, w, slot.ref ?? { src: '' }, { rotation: tilt });
    add(c, ...framed(c, slot, f.layers, 'frame-screen', x + w * 0.045, y + w * 0.045, w * 0.91, w * 2.05 - w * 0.09, { shape: 'roundRect', radius: Math.round(w * 0.11) }));
  } else if (frame === 'laptop' && area > 360) {
    const w = Math.round(Math.min(cw, area / 0.665));
    const x = Math.round((W - w) / 2);
    const y = mid(w * 0.665);
    const f = laptopFrame('frame', x, y, w, slot.ref ?? { src: '' });
    add(c, ...framed(c, slot, f.layers, 'frame-screen', x + w * 0.088, y + w * 0.028, w * 0.824, w * 0.564));
  } else if (frame === 'polaroid' && area > 380) {
    const w = Math.round(Math.min(area / 1.22, cw * 0.78));
    const x = Math.round((W - w) / 2);
    const y = mid(w * 1.14);
    const p = polaroid('frame', x, y, w, slot.ref ?? { src: '' }, { rotation: tilt || -4, card: c.pal.text });
    add(c, ...framed(c, slot, p.layers, 'frame-photo', x + w * 0.06, y + w * 0.06, w * 0.88, w * 0.88));
  } else if (frame === 'ticket' && area > 300) {
    const h = Math.round(Math.min(area, 560));
    const y = mid(h);
    add(c, ...ticket('frame', M, y, cw, h, { fill: c.pal.text, background: solidOf(c.pal.bg), line: c.pal.muted, tearAt: 0.72 }));
    const inset = Math.round(h * 0.11) + 28;
    add(c, ...putPhoto(c, 'frame-photo', slot, M + inset, y + 28, cw * 0.72 - inset - 28, h - 56, { mask: { shape: 'roundRect', radius: 18 } }));
    const stub = labelText(c.theme, c.pal, 'frame-stub', M + cw * 0.72 + 24, 0, 'ADMIT ONE', { color: c.pal.bg as string, width: cw * 0.28 - 40, upper: true });
    add(c, { ...stub.layer, y: Math.round(y + (h - stub.height) / 2) });
  } else if (frame === 'offset' && area > 300) {
    const h = Math.round(Math.min(area - 40, 700));
    const l = blockOffset('frame', M, mid(h + 28), cw - 28, h, slot.ref ?? { src: '' }, { block: c.pal.accent, dx: 28, dy: 28 });
    add(c, l[0], ...putPhoto(c, 'frame-photo', slot, M, mid(h + 28), cw - 28, h));
  } else {
    const h = Math.round(Math.min(area, 760));
    add(c, ...putPhoto(c, 'frame-photo', slot, M, mid(h), cw, h, { mask: { shape: 'roundRect', radius: c.theme.shape.radius || 24 } }));
  }
  add(c, { ...cap.layer, y: c.bottom - cap.height });
}

/** The photo fills the slide and the words sit in a glass card on it (a plain soft field when there is no photo). */
/** The frame's layers with its screen: the real photo as built, or (for an empty slot) a placeholder in its place. */
function framed(c: LCtx, slot: Slot, layers: Layer[], id: string, x: number, y: number, w: number, h: number, mask?: Mask): Layer[] {
  if (slot.ref) {
    recordSlot(c, id, slot);
    return layers;
  }
  const at = layers.findIndex((l) => l.id === id);
  const rest = layers.filter((l) => l.id !== id);
  rest.splice(Math.max(0, at), 0, ...putPhoto(c, id, slot, x, y, w, h, { mask }));
  return rest;
}

function glassOverPhoto(c: LCtx, s: S<'content'>) {
  bg(c);
  const { M, W } = c;
  const cw = W - 2 * M;
  const gap = c.theme.spacing.gap;
  const [slot] = takePhotos(c);
  add(c, ...putPhoto(c, 'photo', slot, 0, 0, W, c.H));
  const pad = 52;
  const inner = cw - 2 * pad;
  const hd = head(c, 'headline', s.headline, { region: [0, 520], x: M + pad, width: inner, size: c.theme.type.headline, min: 60, color: c.pal.text, dry: true });
  const cap = body(c, 'caption', s.body, { x: M + pad, y: 0, width: inner, size: c.theme.type.body, min: 32, maxH: 240, color: c.pal.text, dry: true });
  const h = Math.round(pad * 2 + hd.height + gap + cap.height);
  const y = c.bottom - h;
  // The overlay goes down first, under the glass and the words.
  if (slot.ref) protect(c, slot, h, ['bottom'], 'bottom');
  add(c, glassCard(c, 'glass', M, y, cw, h));
  head(c, 'headline', s.headline, { region: [y + pad, y + pad + hd.height], x: M + pad, width: inner, size: c.theme.type.headline, min: 60, color: c.pal.text, mark: mark(c, s.highlight), words: words(s.highlight) });
  add(c, { ...cap.layer, y: y + pad + hd.height + gap });
}

/** Content: a headline, three photos side by side (a strip), a caption under. */
export function contentPhotoStrip(c: LCtx, s: S<'content'>) {
  bg(c);
  const { M } = c;
  const cw = c.W - 2 * M;
  const gap = c.theme.spacing.gap;
  const slots = takePhotos(c, 3);
  const hd = head(c, 'headline', s.headline, { region: [c.top, c.top + 400], size: c.theme.type.headline, min: 64, mark: mark(c, s.highlight), words: words(s.highlight), dry: true });
  const cap = body(c, 'caption', s.body, { y: 0, width: cw, size: c.theme.type.body, min: 32, maxH: 240, dry: true });
  head(c, 'headline', s.headline, { region: [c.top, c.top + hd.height], size: c.theme.type.headline, min: 64, mark: mark(c, s.highlight), words: words(s.highlight) });
  const top = c.top + hd.height + gap * 1.5;
  const bottom = c.bottom - cap.height - gap * 1.5;
  const h = Math.round(Math.min(bottom - top, 760));
  const y = Math.round(top + (bottom - top - h) / 2);
  const g = num(c, 'stripGap', 16);
  const cell = (cw - 2 * g) / 3;
  const radius = num(c, 'radius', 0);
  const mask: Mask | undefined = radius ? { shape: 'roundRect', radius } : undefined;
  if (slots.every((x) => x.ref)) {
    slots.forEach((sl, i) => c.slots.push({ id: `strip-${i + 1}`, filled: true, ...(sl.input?.synthetic ? { synthetic: true } : {}) }));
    add(c, ...strip('strip', M, y, cw, h, g, slots.map((x) => x.ref!), { mask }));
  } else slots.forEach((sl, i) => add(c, ...putPhoto(c, `strip-${i + 1}`, sl, M + i * (cell + g), y, cell, h, { mask })));
  add(c, { ...cap.layer, y: c.bottom - cap.height });
}

/** Stat: the photo fills the slide, the big number sits over it where the photo is calmest. */
export function statPhoto(c: LCtx, s: S<'stat'>) {
  bg(c);
  const t = c.theme;
  const { M, W } = c;
  const cw = W - 2 * M;
  const gap = t.spacing.gap;
  const sec = t.spacing.section;
  const [slot] = takePhotos(c);
  add(c, ...putPhoto(c, 'photo', slot, 0, 0, W, c.H));
  const val = buildText({ id: 'value', x: M, y: 0, width: cw, text: s.value, font: t.fonts.headline, weight: t.fonts.headlineWeight, size: t.type.stat, minSize: 140, maxHeight: t.type.stat * 1.3, color: c.pal.accent, lineHeight: 1, balance: false });
  const lab = head(c, 'label', s.label, { region: [0, 360], size: 66, min: 48, asWritten: true, color: c.pal.text, dry: true });
  const note = s.note ? body(c, 'note', s.note, { y: 0, size: t.type.note ?? t.type.body - 4, min: 32, maxH: 200, color: c.pal.text, dry: true }) : null;
  const kick = s.kicker ? labelText(t, c.pal, 'kicker', M, 0, s.kicker, { width: cw, color: c.pal.text }) : null;
  const total = (kick ? kick.height + gap : 0) + val.height + gap + lab.height + (note ? sec + note.height : 0);
  const p = slot.ref ? protect(c, slot, total, ['bottom', 'top'], where(c)) : { where: 'bottom' as const };
  let y = p.where === 'top' ? c.top : c.bottom - total;
  if (kick) {
    add(c, { ...kick.layer, y });
    y += kick.height + gap;
  }
  c.notes.push(...val.notes);
  add(c, { ...val.layer, y });
  y += val.height + gap;
  head(c, 'label', s.label, { region: [y, y + lab.height], size: 66, min: 48, asWritten: true, color: c.pal.text });
  y += lab.height;
  if (note) add(c, { ...note.layer, y: y + sec });
}

/** Quote: the photo, blurred and darkened, fills the slide; the quote sits in the middle (on a glass card when the style has one). */
export function quotePhotoBlur(c: LCtx, s: S<'quote'>) {
  bg(c);
  const t = c.theme;
  const { M, W } = c;
  const cw = W - 2 * M;
  const gap = t.spacing.gap;
  const sec = t.spacing.section;
  const glass = !!c.params.glass;
  const [slot] = takePhotos(c);
  add(c, ...putPhoto(c, 'photo', slot, 0, 0, W, c.H));
  const pad = glass ? 56 : 0;
  const inner = cw - 2 * pad;
  const hq = head(c, 'quote', s.quote, { region: [0, 700], x: M + pad, width: inner, size: t.type.quote, min: 56, align: glass ? 'left' : 'center', color: c.pal.text, dry: true });
  const by = body(c, 'by', s.by, { x: M + pad, width: inner, y: 0, size: t.type.byline ?? t.type.body - 6, min: 32, maxH: 140, color: c.pal.text, align: glass ? 'left' : 'center', dry: true });
  const total = hq.height + sec + by.height + 2 * pad;
  const y0 = Math.round(c.top + Math.max(0, (c.bottom - c.top - total) * 0.5));
  if (slot.ref) protect(c, slot, total + 160, ['middle'], 'middle');
  if (glass) add(c, glassCard(c, 'glass', M, y0, cw, total));
  const yq = y0 + pad;
  head(c, 'quote', s.quote, { region: [yq, yq + hq.height], x: M + pad, width: inner, size: t.type.quote, min: 56, align: glass ? 'left' : 'center', color: c.pal.text, mark: s.highlight ? 'words' : 'none', words: words(s.highlight) });
  add(c, { ...by.layer, y: yq + hq.height + sec });
  void gap;
  void rect;
}
