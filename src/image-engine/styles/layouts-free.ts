// Draws a free layout (see free-spec.ts): the background, the photo regions, the flat shapes, then the person's own text in the slots, each fitted into
// its box (never under 32 px). Graphics that the toolbox draws as marks are added by the marks code, at their own boxes. The font is the style's own.
import { buildText, ellipse, rect, solidOf, TRANSPARENT } from '../carousel/toolbox';
import type { SlideScript } from '../carousel/types';
import { FONT_WEIGHTS } from '../fonts';
import { putPhoto, scrim, takePhotos } from '../photo/slot';
import type { Layer, Mask } from '../types';
import type { FreeBox, FreeLayout, FreeRole, FreeSlot } from './free-spec';
import type { MarkSpec } from './marks-spec';
import { add, bg, type LCtx } from './kit';

const nearest = (list: readonly number[], want: number) => list.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), list[0]);

/** The slide's own words for each role; what a slot of that role is filled with. */
function wordsFor(s: SlideScript): Record<FreeRole, string | undefined> {
  const r = s as unknown as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);
  const items = Array.isArray(r.items) ? (r.items as unknown[]).filter((x) => typeof x === 'string').join('\n') : undefined;
  return {
    title: str(r.headline) ?? str(r.quote) ?? str(r.value),
    subtitle: str(r.sub) ?? str(r.label) ?? str(r.note) ?? str(r.by),
    body: str(r.body) ?? str(r.after) ?? items,
    label: str(r.kicker) ?? str(r.beforeLabel),
    number: str(r.number) ?? (str(r.headline) ? str(r.value) : undefined),
    button: str(r.cta),
    decoration: undefined,
  };
}

/** Splits text into k parts of about the same number of words, for a title set in several stacked slots. */
function splitWords(text: string, k: number): string[] {
  const w = text.split(/\s+/).filter(Boolean);
  if (k <= 1 || w.length <= 1) return [text];
  const out: string[] = [];
  let at = 0;
  for (let i = 0; i < k; i++) {
    const take = Math.round((w.length - at) / (k - i));
    out.push(w.slice(at, at + take).join(' '));
    at += take;
  }
  return out.filter(Boolean);
}

/** The graphics of a free layout as marks the toolbox draws, each at its own box. */
export function freeMarks(f: FreeLayout): MarkSpec[] {
  return f.graphics.map((g) => ({ kind: g.kind as MarkSpec['kind'], zone: 'centre' as const, size: Math.max(40, Math.round(g.box.w * 10.8)), colour: g.colour, colour2: '#FFFFFF', box: g.box, ...(g.angle ? { rotate: g.angle } : {}), ...(g.text ? { text: g.text } : {}) }));
}

export function freeSlide(c: LCtx, s: SlideScript, f: FreeLayout) {
  const { W, H } = c;
  const X = (v: number) => (v / 100) * W;
  const Y = (v: number) => (v / 100) * H;
  const box = (b: FreeBox) => ({ x: X(b.x), y: Y(b.y), w: X(b.w), h: Y(b.h) });

  // ---- background ----
  if (f.background.kind === 'gradient' && f.background.colours.length >= 2) {
    add(c, { ...rect('bg', 'decor', 0, 0, W, H, { type: 'linear', angle: f.background.direction === 'horizontal' ? 90 : 180, stops: [{ at: 0, color: f.background.colours[0] }, { at: 1, color: f.background.colours[1] }] }) });
  } else if (f.background.kind === 'split' && f.background.colours.length >= 2) {
    const at = (f.background.split ?? 50) / 100;
    add(c, rect('bg', 'decor', 0, 0, W, H, f.background.colours[0]));
    if (f.background.direction === 'vertical') add(c, rect('bg-2', 'decor', 0, H * at, W, H * (1 - at), f.background.colours[1]));
    else add(c, rect('bg-2', 'decor', W * at, 0, W * (1 - at), H, f.background.colours[1]));
  } else bg(c);

  // ---- photo regions: the person's photo, in the detected shape and the style's treatment ----
  if (f.photos.length) {
    const slots = takePhotos(c, f.photos.length);
    f.photos.forEach((p, i) => {
      const b = p.shape === 'full-bleed' ? { x: 0, y: 0, w: W, h: H } : box(p.box);
      const mask: Mask | undefined = p.shape === 'circle' ? { shape: 'ellipse' } : p.shape === 'rounded' ? { shape: 'roundRect', radius: Math.round(Math.min(b.w, b.h) * 0.06) } : undefined;
      add(c, ...putPhoto(c, i === 0 ? 'photo' : `photo-${i + 1}`, slots[i] ?? slots[0], b.x, b.y, b.w, b.h, mask ? { mask } : {}));
      if (p.shape === 'full-bleed') add(c, scrim(c, 'photo-scrim', 0, H, 'full', 0.38));
    });
  }

  // ---- flat shapes at their measured boxes and colours ----
  const shapeLayers: Layer[] = f.shapes.map((sh) => {
    const b = box(sh.box);
    const rot = sh.angle ?? 0;
    if (sh.kind === 'circle') return { ...ellipse(`shape-${sh.id}`, 'decor', b.x, b.y, b.w, b.h, sh.colour), rotation: rot };
    if (sh.kind === 'ring') return { ...ellipse(`shape-${sh.id}`, 'decor', b.x, b.y, b.w, b.h, TRANSPARENT, { stroke: { color: sh.colour, width: Math.max(4, Math.round(W * 0.008)) } }), rotation: rot };
    const radius = sh.kind === 'pill' ? Math.min(b.w, b.h) / 2 : sh.kind === 'rounded' ? Math.min(b.w, b.h) * 0.15 : 0;
    return rect(`shape-${sh.id}`, 'decor', b.x, b.y, b.w, b.h, sh.colour, { radius, rotation: rot });
  });
  add(c, ...shapeLayers);

  // ---- the person's words into the slots ----
  const words = wordsFor(s);
  const byRole = new Map<FreeRole, FreeSlot[]>();
  for (const sl of f.slots) byRole.set(sl.role, [...(byRole.get(sl.role) ?? []), sl].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x));
  const assigned = new Map<string, string>();
  const spare: string[] = [];
  for (const role of ['title', 'subtitle', 'body', 'label', 'number', 'button'] as FreeRole[]) {
    const text = words[role];
    const slots = byRole.get(role) ?? [];
    if (!text) continue;
    if (slots.length === 0) {
      // More words than slots: they are merged into the nearest bigger slot below, or dropped (and said).
      spare.push(text);
      continue;
    }
    if (slots.length === 1 || role === 'body') assigned.set(slots[0].id, text);
    else splitWords(text, slots.length).forEach((part, i) => slots[i] && assigned.set(slots[i].id, part));
  }
  if (spare.length) {
    const host = [...(byRole.get('body') ?? []), ...(byRole.get('subtitle') ?? [])][0];
    if (host && assigned.has(host.id)) assigned.set(host.id, `${assigned.get(host.id)}\n${spare.join('\n')}`);
    else if (host) assigned.set(host.id, spare.join('\n'));
    else c.notes.push(`The reference has no place for: ${spare.map((t) => `"${t.slice(0, 24)}"`).join(', ')}, so it is left out of this slide.`);
  }
  for (const sl of f.slots) {
    const text = assigned.get(sl.id);
    if (!text) continue;
    const b = box(sl.box);
    const headline = sl.role === 'title' || sl.role === 'number' || sl.role === 'button';
    const font = headline ? c.theme.fonts.headline : c.theme.fonts.body;
    const weight = sl.weight ? nearest(FONT_WEIGHTS[font], sl.weight) : headline ? c.theme.fonts.headlineWeight : c.theme.fonts.bodyWeight;
    const on = (k: string) => sl.treatments.find((t) => t.kind === k && !t.off);
    const size = Math.max(32, Math.round(sl.sizePx * (H / 1350)));
    const built = buildText({ id: `free-${sl.id}`, x: b.x, y: b.y, width: Math.max(40, b.w), text, font, weight, size, minSize: 32, maxHeight: Math.max(40, b.h), color: sl.colour ?? c.pal.text, lineHeight: c.style.headlineLineHeight || 1.05, align: sl.align === 'centre' ? 'center' : sl.align, role: 'content', upper: !!on('caps') || (c.style.caseStyle === 'upper' && headline), balance: false });
    const y = sl.anchor === 'middle' ? b.y + (b.h - built.height) / 2 : sl.anchor === 'bottom' ? b.y + b.h - built.height : b.y;
    const layer = { ...built.layer, y: Math.round(y * 10) / 10 };
    const st = on('outline');
    const sh = on('shadow');
    const tilt = on('tilt');
    if (st) layer.style = { ...layer.style, stroke: { color: st.colour ?? solidOf(c.pal.bg), width: Math.max(2, Math.round(built.size * 0.05)) } };
    if (sh) layer.style = { ...layer.style, shadow: { color: sh.colour ?? '#000000', blur: 0, offsetX: Math.round(built.size * 0.06), offsetY: Math.round(built.size * 0.06) } };
    if (tilt) layer.rotation = tilt.angle ?? 0;
    add(c, layer);
    if (built.height > b.h * 1.08 + 4) c.notes.push(`The ${sl.role} text does not fit its box at ${built.size} px (the smallest allowed is 32 px), so it runs past the box.`);
    else if (built.size < size) c.notes.push(`The ${sl.role} text was made smaller (${size} to ${built.size} px) to fit its box.`);
  }
}
