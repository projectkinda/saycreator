// Drawing helpers shared by every layout: measuring text with the engine's own text layout, stacking blocks, the part (plane) split, and the small graphics
// (bar, slider, check icon, pill button, quote mark, question mark). Colours are palette names ("$accent"), never hex.
import { layoutText } from '../../image-engine/draw/text';
import { FONT_WEIGHTS } from '../../image-engine/fonts';
import { contrastRgb, parseColor } from '../../image-engine/lint/color';
import type { FontFamily, TextLayer } from '../../image-engine/types';
import type { Cx, LayoutStyle, Slot } from './types';

export const SIDE = 48;
/** Content width: the engine never lets a text box reach past 95% of the slide (x 1026), so everything ends there. */
export const WIDTH = 978;
/** Padding inside a card: the engine keeps text 4% of the slide clear of a card's edge, so cards are padded a little more. */
export const CARD_PAD = 44;
export const TOP = 190;
export const BOTTOM = 1190;

export const contrast = (a: string, b: string): number => contrastRgb(parseColor(a).rgb, parseColor(b).rgb);
/** The weights of the drawing being planned (the style's headline and body weight); null = the layouts' own (800 heavy, 500 body). Set around each plan by the builder. */
let WT: { headline: number; body: number } | null = null;
export const setWeights = (w: { headline: number; body: number } | null | undefined) => {
  WT = w ?? null;
};
/** The nearest bundled weight. With style weights set, a heavy request (700 and up) takes the headline weight and a regular one (400-500) the body weight; light and semi-bold stay. */
export const nearestWeight = (font: FontFamily, want: number): number => {
  const w = WT ? (want >= 700 ? WT.headline : want >= 400 && want <= 500 ? WT.body : want) : want;
  return FONT_WEIGHTS[font].reduce((b, x) => (Math.abs(x - w) < Math.abs(b - w) ? x : b), FONT_WEIGHTS[font][0]);
};
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Accent as text colour when it reads (3:1 on the ground), else plain text colour (the engine sets accent phrases on a marker in that case). */
export const accentInk = (_st: LayoutStyle): string => '$accentText';

/** The type scale of the drawing being planned (1.15 steps up to each text's own largest size): place() sets it, text() and measure() apply it. */
let K = 1;
export const setScale = (k: number) => {
  K = k;
};
export const getScale = () => K;
/** A size or length that grows with the type scale (icon radii, row heights, quote marks). */
export const S = (n: number) => Math.round(n * K);
/** The largest a text of each role may grow to (the engine's own caps: titles 150 px). */
const ROLE_MAX: Record<string, number> = { kicker: 48, tag: 48, caption: 56, body: 64, title: 150, number: 600 };
/** Measures text at the scaled size. */
export function measure(text: string, font: FontFamily, weight: number, size: number, width: number, lh: number): { n: number; h: number } {
  return measureRaw(text, font, weight, Math.round(size * K), width, lh);
}
function measureRaw(text: string, font: FontFamily, weight: number, size: number, width: number, lh: number): { n: number; h: number } {
  const l = { kind: 'text', id: 'm', name: 'm', role: 'content', x: 0, y: 0, width, height: 6000, rotation: 0, opacity: 1, text, style: { font, weight, size, color: '#000000', align: 'left', valign: 'top', lineHeight: lh } } as unknown as TextLayer;
  const b = layoutText(l);
  return { n: Math.max(1, b.lines.length), h: Math.max(1, b.lines.length) * b.lineStep };
}

/** The lines a text wraps into (at the scaled size), for checks such as a lone short word on a line. */
export function lineTexts(text: string, font: FontFamily, weight: number, size: number, width: number, lh: number, accents?: { phrases: string[]; marker: boolean }): string[] {
  const l = { kind: 'text', id: 'm', name: 'm', role: 'content', x: 0, y: 0, width, height: 6000, rotation: 0, opacity: 1, text, style: { font, weight, size, color: '#000000', align: 'left', valign: 'top', lineHeight: lh } } as unknown as TextLayer & { balance?: boolean };
  // a headline is laid out like the engine lays it out: balanced, its accent phrases glued, and (on a marker) with the bar's padding and clear space
  if (accents) {
    const runs: { start: number; end: number; color: string }[] = [];
    for (const p of accents.phrases) {
      const at = text.toLowerCase().indexOf(p.toLowerCase());
      if (at >= 0 && !runs.some((r) => at < r.end && at + p.length > r.start)) runs.push({ start: at, end: at + p.length, color: '#000000' });
    }
    (l as unknown as { balance: boolean }).balance = true;
    if (runs.length) (l as unknown as { runs: unknown }).runs = runs.sort((a, b) => a.start - b.start);
    if (runs.length && accents.marker) (l as unknown as { highlight: unknown }).highlight = { words: runs.flatMap((r) => text.slice(r.start, r.end).split(/\s+/).filter(Boolean)), color: '#000000', textColor: '#000000', paddingX: Math.round(size * 0.16), paddingY: 0, radius: 4, hugLine: true };
  }
  return layoutText(l).lines.map((q) => q.text);
}

export interface TextOpts {
  x?: number;
  w?: number;
  size: number;
  weight?: number;
  font?: 'h' | 'b';
  fill?: string;
  align?: 'left' | 'center';
  lines?: number;
  min?: number;
  lh?: number;
  gap?: number;
  /** Place at this y instead of the flow position (the flow position does not move). */
  at?: number;
  /** Shrink in steps of 4 until it fits `lines` (down to `min`). */
  fit?: boolean;
  /** Box height to use instead of the measured one (the text is centred in it). */
  boxH?: number;
  /** The largest size the type scale may take this text to (default by role). */
  max?: number;
}

const r = (n: number) => Math.round(n * 10) / 10;

/**
 * One layout drawing: a cursor, the planned slots and the static shapes. A layout may call `part()` once: everything drawn after it is "part B" and sits on the plane
 * when the slide has a cut (the engine moves B onto the plane and gives it the plane's colours); with no cut `part()` does nothing.
 */
export class Draw {
  slots: Slot[] = [];
  shapes: string[] = [];
  /** Shapes drawn after part(): they sit on the plane. */
  planeShapes: string[] = [];
  y = 0;
  /** False in the measuring run, true in the run that places the layout. */
  real = false;
  maxY = 0;
  minY = 1e9;
  onPlane = false;
  /** The cursor where part() was called, and where part B starts. */
  partFrom?: number;
  partStart?: number;
  gapSum = 0;
  gapSumA = 0;
  /** Gaps grow by this factor so a short layout fills its field (set by place()). */
  gapScale = 1;
  /** The type scale this drawing was planned at. */
  k = 1;
  constructor(public st: LayoutStyle, public field: { x0: number; w: number; y0: number; y1: number } = { x0: SIDE, w: WIDTH, y0: TOP, y1: BOTTOM }, public cxo?: Cx) {}
  get x0() { return this.field.x0; }
  get w() { return this.field.w; }
  get cx() { return this.field.x0 + this.field.w / 2; }
  get fy0() { return this.field.y0; }
  get fy1() { return this.field.y1; }
  /** The bottom of the content area: the foot of the plane band when part B sits on a plane, else the bottom of the field. */
  get by1() { return this.cxo?.partTop !== undefined ? BOTTOM : this.field.y1; }
  get hasB() { return this.partFrom !== undefined; }
  private track(y0: number, y1: number) {
    this.minY = Math.min(this.minY, y0);
    this.maxY = Math.max(this.maxY, y1);
  }
  gap(n: number) {
    this.gapSum += n;
    this.y += n * this.gapScale;
  }
  /** Marks the split between the field part (A, above) and the plane part (B, below). */
  part() {
    const cx = this.cxo;
    if (!cx || cx.cut === 'plain' || cx.cut === 'edge-v' || cx.noPart || this.partFrom !== undefined) return;
    this.partFrom = this.y;
    this.gapSumA = this.gapSum;
    this.onPlane = true;
    this.gapScale = 1;
    if (this.real && cx.partTop !== undefined) this.y = cx.partTop;
    else this.y += 40;
    this.partStart = this.y;
  }
  /** Reserves vertical room (for a drawing made elsewhere, like the stepper). */
  reserve(h: number) {
    this.track(this.y, this.y + h);
    this.y += h;
  }
  /** Plans a text slot, measured with the real text. Returns the slot. */
  text(role: Slot['role'], text: string, o: TextOpts): Slot {
    const st = this.st;
    const font = (o.font ?? 'b') === 'h' ? st.fonts.headline : st.fonts.body;
    const weight = nearestWeight(font, o.weight ?? ((o.font ?? 'b') === 'h' ? 800 : 500));
    const lh = o.lh ?? ((o.font ?? 'b') === 'h' ? 1.05 : 1.25);
    const x = o.x ?? this.x0;
    const w = o.w ?? this.w;
    const maxLines = o.lines ?? 3;
    const min = o.min ?? 32;
    // the type scale: up to the text's own largest size, never below the size the layout asked for
    let size = Math.max(o.size, Math.min(o.max ?? ROLE_MAX[role] ?? 150, Math.round(o.size * K)));
    let m = measureRaw(text, font, weight, size, w, lh);
    while (o.fit !== false && m.n > maxLines && size - 4 >= min) {
      size -= 4;
      m = measureRaw(text, font, weight, size, w, lh);
    }
    const y = o.at ?? this.y;
    // Display text (96 px and up) takes the display accent, smaller text the small-text accent
    const fill0 = o.fill ?? '$text';
    const fill = fill0 === '$accentText' && size >= 96 ? '$accentDisplay' : fill0;
    const slot: Slot = { role, text, x, y, w, h: o.boxH ?? Math.ceil(m.h) + 2, size, weight, font, fill, align: o.align ?? 'left', lines: Math.max(maxLines, m.n), min, lh, plane: this.onPlane, ...(o.boxH ? { valign: 'middle' as const } : {}) };
    this.slots.push(slot);
    this.track(y, y + slot.h);
    if (o.at === undefined) {
      this.gapSum += o.gap ?? 0;
      this.y += slot.h + (o.gap ?? 0) * this.gapScale;
    }
    return slot;
  }
  /** A static shape (rect, circle, path ...) at an absolute place; `box` is for the extent. */
  shape(markup: string, box?: { y0: number; y1: number }) {
    (this.onPlane ? this.planeShapes : this.shapes).push(markup);
    if (box) this.track(box.y0, box.y1);
  }
  rect(x: number, y: number, w: number, h: number, fill: string, o: { rx?: number; stroke?: string; sw?: number; opacity?: number } = {}) {
    this.shape(`<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}"${o.rx ? ` rx="${o.rx}"` : ''} fill="${fill}"${o.opacity !== undefined ? ` fill-opacity="${o.opacity}"` : ''}${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 4}"` : ''}/>`, { y0: y, y1: y + h });
  }
  circle(cx: number, cy: number, rad: number, fill: string, o: { stroke?: string; sw?: number } = {}) {
    this.shape(`<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(rad)}" fill="${fill}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 4}"` : ''}/>`, { y0: cy - rad, y1: cy + rad });
  }
  path(d: string, o: { fill?: string; stroke?: string; sw?: number; y0: number; y1: number; cap?: boolean }) {
    this.shape(`<path d="${d}" fill="${o.fill ?? 'none'}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 4}"${o.cap ? ' stroke-linecap="round" stroke-linejoin="round"' : ''}` : ''}/>`, { y0: o.y0, y1: o.y1 });
  }
  /** The signature underline: a thin accent rule under the last block of text. */
  underline(x?: number, align: 'left' | 'center' = 'left') {
    if (!this.st.devices.underline) return;
    this.y += 24;
    const w = 180;
    this.rect(align === 'center' ? this.cx - w / 2 : x ?? this.x0, this.y, w, 10, '$accent', { rx: 5 });
    this.y += 10;
  }
}

// ----- small graphics -----
/** A round check icon: accent disc with a tick in the ink that reads on the accent. */
export function checkIcon(d: Draw, cx: number, cy: number, rad = 28) {
  d.circle(cx, cy, rad, '$accent');
  d.path(`M ${r(cx - 0.42 * rad)} ${r(cy)} L ${r(cx - 0.1 * rad)} ${r(cy + 0.34 * rad)} L ${r(cx + 0.46 * rad)} ${r(cy - 0.3 * rad)}`, { stroke: '$onAccent', sw: Math.round(rad * 0.22), cap: true, y0: cy - rad, y1: cy + rad });
}
/** Segment bar: `n` segments, `value` percent filled with the accent. */
export function segmentBar(d: Draw, y: number, value: number, n = 20, h = 64) {
  const gap = 8;
  const w = (d.w - gap * (n - 1)) / n;
  const filled = value <= 0 ? 0 : Math.max(1, Math.round((value / 100) * n));
  for (let i = 0; i < n; i++) d.rect(d.x0 + i * (w + gap), y, w, h, i < filled ? '$accent' : '$surface', { rx: 6 });
}
/** Solid bar: a track with a filled part. */
export function solidBar(d: Draw, y: number, value: number, h = 64) {
  d.rect(d.x0, y, d.w, h, '$surface', { rx: h / 2 });
  const w = Math.max(h, (d.w * value) / 100);
  d.rect(d.x0, y, w, h, '$accent', { rx: h / 2 });
}
/** Slider: track, filled part and a handle at `pos` percent. */
export function sliderGraphic(d: Draw, y: number, pos: number) {
  const h = 28;
  const hr = 64;
  const x = d.x0 + hr + ((d.w - 2 * hr) * pos) / 100;
  const cy = y + hr;
  d.rect(d.x0, cy - h / 2, d.w, h, '$surface', { rx: h / 2 });
  d.rect(d.x0, cy - h / 2, x - d.x0, h, '$accent', { rx: h / 2 });
  d.circle(x, cy, hr, '$text');
  d.circle(x, cy, hr * 0.38, '$accent');
  return 2 * hr;
}
/** Toggle: a pill with a knob on the right (on). */
export function toggleGraphic(d: Draw, x: number, y: number, w = 320, h = 160) {
  d.rect(x, y, w, h, '$accent', { rx: h / 2 });
  d.circle(x + w - h / 2, y + h / 2, h / 2 - 14, '$onAccent');
  return h;
}
/** The arrow inside a pill button. */
export function arrow(d: Draw, x1: number, cy: number, len = 56) {
  d.path(`M ${r(x1)} ${r(cy)} L ${r(x1 + len)} ${r(cy)} M ${r(x1 + len - 22)} ${r(cy - 22)} L ${r(x1 + len)} ${r(cy)} L ${r(x1 + len - 22)} ${r(cy + 22)}`, { stroke: '$onAccent', sw: 8, cap: true, y0: cy - 22, y1: cy + 22 });
}
/** A quote mark drawn as two filled shapes (height 86 k). */
export function quoteMark(d: Draw, x: number, y: number, k = 1) {
  const one = (ox: number) => `M ${r(ox)} ${r(y + 86 * k)} V ${r(y + 46 * k)} Q ${r(ox)} ${r(y + 6 * k)} ${r(ox + 50 * k)} ${r(y)} V ${r(y + 20 * k)} Q ${r(ox + 24 * k)} ${r(y + 26 * k)} ${r(ox + 24 * k)} ${r(y + 46 * k)} H ${r(ox + 50 * k)} V ${r(y + 86 * k)} Z`;
  d.path(one(x) + ' ' + one(x + 76 * k), { fill: '$accent', y0: y, y1: y + 86 * k });
}
/** A big question mark drawn as a graphic (a hook and a dot), `h` px tall, in the accent when it reads on the ground, else in the text colour. */
export function questionMark(d: Draw, x: number, y: number, h: number, align: 'left' | 'center') {
  const s = h / 200;
  const x0 = align === 'center' ? x - 60 * s : x;
  const c = accentInk(d.st);
  d.path(`M ${r(x0 + 20 * s)} ${r(y + 56 * s)} C ${r(x0 + 20 * s)} ${r(y + 2 * s)} ${r(x0 + 100 * s)} ${r(y + 2 * s)} ${r(x0 + 100 * s)} ${r(y + 54 * s)} C ${r(x0 + 100 * s)} ${r(y + 98 * s)} ${r(x0 + 60 * s)} ${r(y + 104 * s)} ${r(x0 + 60 * s)} ${r(y + 138 * s)}`, { stroke: c, sw: Math.round(26 * s), cap: true, y0: y, y1: y + h });
  d.circle(x0 + 60 * s, y + h - 16 * s, 15 * s, c);
}
