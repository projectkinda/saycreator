// The graphics toolbox. Everything is drawn in code as plain plan layers (shapes, paths, text): no external images.
// Every function takes colours, sizes and shape style from the theme it is given. Nothing here hard-codes a look.
import { fitText, layoutText, measureWidth, wrapText } from '../draw/text';
import type { Fill, FontFamily, Highlight, Layer, PathLayer, Role, ShapeLayer, TextLayer } from '../types';
import type { Palette, Theme } from './types';

export const TRANSPARENT = 'rgba(0,0,0,0)';
const r1 = (n: number) => Math.round(n * 10) / 10;

export function solidOf(fill: Fill): string {
  return typeof fill === 'string' ? fill : fill.stops[0].color;
}

export const rect = (
  id: string,
  role: Role,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: Fill,
  o: { radius?: number; stroke?: { color: string; width: number }; opacity?: number; rotation?: number } = {},
): ShapeLayer => ({
  id, kind: 'shape', role, shape: 'rect', x: r1(x), y: r1(y), width: r1(width), height: r1(height), rotation: o.rotation ?? 0, opacity: o.opacity ?? 1, fill, radius: o.radius ?? 0,
  ...(o.stroke && o.stroke.width > 0 ? { stroke: o.stroke } : {}),
});

export const ellipse = (
  id: string,
  role: Role,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: Fill,
  o: { stroke?: { color: string; width: number }; opacity?: number } = {},
): ShapeLayer => ({
  id, kind: 'shape', role, shape: 'ellipse', x: r1(x), y: r1(y), width: r1(width), height: r1(height), rotation: 0, opacity: o.opacity ?? 1, fill,
  ...(o.stroke && o.stroke.width > 0 ? { stroke: o.stroke } : {}),
});

export const pathLayer = (
  id: string,
  role: Role,
  x: number,
  y: number,
  width: number,
  height: number,
  d: string,
  o: { fill?: string; stroke?: PathLayer['stroke']; opacity?: number; rotation?: number } = {},
): PathLayer => ({
  id, kind: 'path', role, x: r1(x), y: r1(y), width: r1(width), height: r1(height), rotation: o.rotation ?? 0, opacity: o.opacity ?? 1, d,
  ...(o.fill ? { fill: o.fill } : {}),
  ...(o.stroke ? { stroke: o.stroke } : {}),
});

/** Multiplies every number in path data. Only uniform scaling, so the commands (M L C Q H V Z) stay as they are. */
export const scalePath = (d: string, k: number) => d.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, (m) => String(r1(Number(m) * k)));

/** A circle as four curves (our path data has no circle command). */
export function circleD(cx: number, cy: number, r: number): string {
  const k = 0.5523 * r;
  const p = (x: number, y: number) => `${r1(x)} ${r1(y)}`;
  return `M ${p(cx + r, cy)} C ${p(cx + r, cy + k)} ${p(cx + k, cy + r)} ${p(cx, cy + r)} C ${p(cx - k, cy + r)} ${p(cx - r, cy + k)} ${p(cx - r, cy)} C ${p(cx - r, cy - k)} ${p(cx - k, cy - r)} ${p(cx, cy - r)} C ${p(cx + k, cy - r)} ${p(cx + r, cy - k)} ${p(cx + r, cy)} Z`;
}

// ---------- text ----------

export interface TextSpec {
  id: string;
  x: number;
  y: number;
  /** Widest the text may be. */
  width: number;
  text: string;
  font: FontFamily;
  weight: number;
  size: number;
  /** Smallest size to shrink to. Defaults to the size (no shrinking). */
  minSize?: number;
  /** Tallest the text block may be. Defaults to unlimited. */
  maxHeight?: number;
  color: string;
  lineHeight?: number;
  align?: 'left' | 'center' | 'right';
  role?: Role;
  highlight?: Highlight;
  /** Narrow the box a little if that avoids a one-word last line. Default true. */
  balance?: boolean;
  upper?: boolean;
}

export interface Built {
  layer: TextLayer;
  size: number;
  lines: string[];
  height: number;
  width: number;
  notes: string[];
}

const lastIsOrphan = (lines: string[]) => lines.length >= 2 && lines[lines.length - 1].trim().split(/\s+/).length === 1;

/**
 * Line breaks with the last line at least two words, using the fewest lines possible (or one more) and the most even lines.
 * Returns null if no way exists at this width.
 */
function balancedLines(text: string, maxWidth: number, font: FontFamily, weight: number, size: number, minLines: number): string[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  const m = words.length;
  if (m < 3) return null;
  const memo = new Map<string, number>();
  const wid = (i: number, j: number) => {
    const k = `${i}-${j}`;
    let v = memo.get(k);
    if (v === undefined) memo.set(k, (v = measureWidth(words.slice(i, j).join(' '), font, weight, size)));
    return v;
  };
  let best = null as { cost: number; cuts: number[] } | null;
  for (const n of [minLines, minLines + 1]) {
    // cost[l][j]: cheapest way to set the first j words in l lines; every line must fit.
    const cost: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(Infinity));
    const from: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(-1));
    cost[0][0] = 0;
    for (let l = 1; l <= n; l++)
      for (let j = l; j <= m; j++)
        for (let i = l - 1; i < j; i++) {
          if (cost[l - 1][i] === Infinity) continue;
          const w = wid(i, j);
          if (w > maxWidth) continue;
          if (l === n && j === m && j - i < 2) continue;
          const slack = l === n ? 0 : maxWidth - w;
          const c = cost[l - 1][i] + slack * slack;
          if (c < cost[l][j]) {
            cost[l][j] = c;
            from[l][j] = i;
          }
        }
    if (cost[n][m] === Infinity) continue;
    const cuts: number[] = [];
    for (let l = n, j = m; l > 0; j = from[l][j], l--) cuts.unshift(j);
    if (!best || cost[n][m] < best.cost) best = { cost: cost[n][m], cuts };
    break;
  }
  if (!best) return null;
  const out: string[] = [];
  let prev = 0;
  for (const c of best.cuts) {
    out.push(words.slice(prev, c).join(' '));
    prev = c;
  }
  return out;
}

/** Measures with the real font and returns a text layer whose box is exactly as tall as its text. */
export function buildText(s: TextSpec): Built {
  const lh = s.lineHeight ?? 1.1;
  let text = s.upper ? s.text.toUpperCase() : s.text;
  const notes: string[] = [];
  const f = fitText({ text, font: s.font, weight: s.weight, maxSize: s.size, minSize: s.minSize ?? s.size, lineHeight: lh, width: s.width, height: s.maxHeight ?? 10000 });
  if (f.size < s.size) notes.push(`"${text.slice(0, 28)}" was shrunk from ${s.size} to ${f.size} px to fit.`);
  if (!f.fits) notes.push(`"${text.slice(0, 28)}" does not fit even at ${f.size} px.`);
  let width = s.width;
  let lines = f.lines;
  if (s.balance !== false && lastIsOrphan(lines)) {
    for (let k = 1; k <= 14; k++) {
      const w = Math.floor(s.width * (1 - 0.03 * k));
      const t = wrapText(text, w, s.font, s.weight, f.size);
      if (t.wordTooWide) break;
      if (!lastIsOrphan(t.lines) && t.lines.length <= lines.length + 1 && t.lines.length * f.size * lh <= (s.maxHeight ?? 10000)) {
        width = w;
        lines = t.lines;
        notes.push(`"${text.slice(0, 28)}": the box was narrowed to ${w} px so the last line is not a single word.`);
        break;
      }
    }
    // Narrowing cannot always do it ("Rewrite your headline" only ever breaks as "Rewrite your / headline"), so choose the breaks by hand.
    if (lastIsOrphan(lines) && !text.includes('\n')) {
      const by = balancedLines(text, s.width, s.font, s.weight, f.size, lines.length);
      if (by && by.length * f.size * lh <= (s.maxHeight ?? 10000)) {
        text = by.join('\n');
        lines = by;
        notes.push(`"${by[0].slice(0, 28)}": line breaks were set by hand so the last line is not a single word.`);
      }
    }
  }
  const height = Math.ceil(lines.length * f.size * lh);
  const layer: TextLayer = {
    id: s.id, kind: 'text', role: s.role ?? 'content', x: r1(s.x), y: r1(s.y), width: Math.ceil(width), height, rotation: 0, opacity: 1, text,
    style: { font: s.font, weight: s.weight, size: f.size, color: s.color, align: s.align ?? 'left', lineHeight: lh },
    ...(s.highlight ? { highlight: s.highlight } : {}),
  };
  return { layer, size: f.size, lines, height, width: Math.ceil(width), notes };
}

/** Width of the widest line of a built text, for sizing a container around it. */
export const inkWidth = (b: Built) => Math.max(...b.lines.map((l) => measureWidth(l, b.layer.style.font, b.layer.style.weight, b.size)));

// ---------- markers (highlight, underline, brush) ----------

/**
 * Gives marked words the theme's marker style.
 * Returns the highlight to put on the text layer and the layers to draw behind it.
 */
export function marker(theme: Theme, pal: Palette, layer: TextLayer, words: string[] | undefined, idPrefix: string): { highlight?: Highlight; behind: Layer[] } {
  if (!words || words.length === 0) return { behind: [] };
  const style = theme.shape.marker;
  // For underline and brush the highlight itself is invisible; it only switches the word's colour.
  const highlight: Highlight =
    style === 'box'
      ? { words, color: pal.marker, textColor: pal.onMarker, paddingX: 4, paddingY: 2, radius: Math.round(theme.shape.radius / 3) }
      : style === 'underline'
        ? { words, color: TRANSPARENT, textColor: pal.accent, paddingX: 0, paddingY: 0, radius: 0 }
        : { words, color: TRANSPARENT, textColor: pal.onMarker, paddingX: 0, paddingY: 0, radius: 0 };
  if (style === 'box') return { highlight, behind: [] };
  const block = layoutText({ ...layer, highlight });
  const behind: Layer[] = [];
  let n = 0;
  for (const line of block.lines) {
    for (const m of line.marks) {
      n++;
      const size = block.size;
      const mid = layer.y + line.y + block.lineStep / 2;
      const id = `${idPrefix}-${n}`;
      if (style === 'underline') {
        const w = m.width;
        const amp = size * 0.05;
        const d = `M 0 ${r1(amp)} Q ${r1(w * 0.25)} ${r1(-amp)} ${r1(w * 0.5)} ${r1(amp)} Q ${r1(w * 0.75)} ${r1(amp * 3)} ${r1(w)} 0`;
        behind.push(pathLayer(id, 'decor', layer.x + m.x, mid + size * 0.4, w, amp * 4, d, { stroke: { color: pal.accent, width: theme.shape.stroke, cap: 'round', join: 'round' } }));
      } else {
        // A rough brush stroke. It is taller than the letters and sticks out 6 px each side, so the word always sits fully on it.
        const h = size * 0.98;
        const w = m.width + 12;
        const d = `M 0 ${r1(h * 0.06)} L ${r1(w * 0.3)} 0 L ${r1(w * 0.7)} ${r1(h * 0.05)} L ${r1(w)} ${r1(h * 0.01)} L ${r1(w * 0.98)} ${r1(h * 0.5)} L ${r1(w)} ${r1(h * 0.97)} L ${r1(w * 0.62)} ${r1(h)} L ${r1(w * 0.28)} ${r1(h * 0.95)} L ${r1(w * 0.02)} ${r1(h)} L ${r1(w * 0.01)} ${r1(h * 0.5)} Z`;
        behind.push(pathLayer(id, 'decor', layer.x + m.x - 6, mid - h * 0.5, w, h, d, { fill: pal.marker }));
      }
    }
  }
  return { highlight, behind };
}

// ---------- containers: badge, sticker, button ----------

function shadow(theme: Theme, pal: Palette, id: string, x: number, y: number, w: number, h: number, radius: number, round = false): Layer[] {
  const d = theme.shape.hardShadow;
  if (!d) return [];
  return [round ? ellipse(`${id}-shadow`, 'decor', x + d, y + d, w, h, pal.line) : rect(`${id}-shadow`, 'decor', x + d, y + d, w, h, pal.line, { radius })];
}

/** A numbered badge: a container in the theme's badge style with the number inside. */
export function badge(theme: Theme, pal: Palette, id: string, x: number, y: number, size: number, label: string): Layer[] {
  const o = theme.shape.outline;
  const stroke = o ? { color: pal.line, width: o } : undefined;
  const circle = theme.shape.badge === 'circle';
  const radius = circle ? size / 2 : theme.shape.badge === 'rounded' ? Math.round(size * 0.3) : 0;
  const out: Layer[] = [...shadow(theme, pal, id, x, y, size, size, radius, circle)];
  out.push(circle ? ellipse(id, 'container', x, y, size, size, pal.accent, { stroke }) : rect(id, 'container', x, y, size, size, pal.accent, { radius, stroke }));
  const fs = Math.round(size * 0.52);
  const t = buildText({ id: `${id}-number`, x: x + o, y: y + (size - fs) / 2, width: size - 2 * o, text: label, font: theme.fonts.headline, weight: theme.fonts.headlineWeight, size: fs, color: pal.onAccent, lineHeight: 1, align: 'center', balance: false });
  out.push(t.layer);
  return out;
}

/** A small label sticker: pill, tag or starburst depending on the theme. */
export function sticker(theme: Theme, pal: Palette, id: string, x: number, y: number, label: string): { layers: Layer[]; width: number; height: number } {
  const fs = theme.type.small;
  const t = buildText({ id: `${id}-label`, x: 0, y: 0, width: 900, text: label, font: theme.fonts.body, weight: theme.fonts.strong, size: fs, color: pal.onAccent, lineHeight: 1, upper: true, balance: false });
  const tw = Math.ceil(inkWidth(t));
  const o = theme.shape.outline;
  const layers: Layer[] = [];
  if (theme.shape.sticker === 'burst') {
    const padX = 54;
    const w = tw + 2 * padX;
    const h = Math.round(fs * 3.4);
    const pts = 14;
    let d = '';
    for (let i = 0; i < pts * 2; i++) {
      const a = (i / (pts * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? 1 : 0.82;
      d += `${i === 0 ? 'M' : 'L'} ${r1(w / 2 + (Math.cos(a) * w * rr) / 2)} ${r1(h / 2 + (Math.sin(a) * h * rr) / 2)} `;
    }
    d += 'Z';

    layers.push(pathLayer(id, 'container', x, y, w, h, d, { fill: pal.accent, stroke: o ? { color: pal.line, width: o, cap: 'round', join: 'round' } : undefined }));
    layers.push({ ...t.layer, x: r1(x + (w - tw) / 2), y: r1(y + (h - fs) / 2), width: tw + 2 });
    return { layers, width: w, height: h };
  }
  const padX = Math.round(fs * 0.7);
  const h = Math.round(fs * 1.9);
  const w = tw + 2 * padX;
  const radius = theme.shape.sticker === 'pill' ? h / 2 : Math.min(theme.shape.radius, 14);
  layers.push(...shadow(theme, pal, id, x, y, w, h, radius));
  layers.push(rect(id, 'container', x, y, w, h, pal.accent, { radius, stroke: o ? { color: pal.line, width: o } : undefined }));
  layers.push({ ...t.layer, x: r1(x + padX), y: r1(y + (h - fs) / 2), width: tw + 2 });
  return { layers, width: w, height: h };
}

/** A call-to-action button with an arrow, sized around its label. */
export function button(theme: Theme, pal: Palette, id: string, x: number, y: number, label: string, maxWidth: number): { layers: Layer[]; width: number; height: number } {
  const fs = theme.type.body;
  const padX = 44;
  const arrow = Math.round(fs * 0.9);
  const t = buildText({ id: `${id}-label`, x: 0, y: 0, width: maxWidth - 2 * padX - arrow - 24, text: label, font: theme.fonts.headline, weight: theme.fonts.headlineWeight, size: fs, minSize: 36, color: pal.onAccent, lineHeight: 1.1 });
  const tw = Math.ceil(inkWidth(t));
  const w = padX + tw + 24 + arrow + padX;
  // One line: the usual button. A long label wraps and the button grows taller to hold it.
  const h = Math.round(t.height + fs * 1.2);
  const o = theme.shape.outline;
  const radius = theme.shape.radius >= 30 ? h / 2 : theme.shape.radius;
  const layers: Layer[] = [...shadow(theme, pal, id, x, y, w, h, radius)];
  layers.push(rect(id, 'container', x, y, w, h, pal.accent, { radius, stroke: o ? { color: pal.line, width: o } : undefined }));
  layers.push({ ...t.layer, x: r1(x + padX), y: r1(y + (h - t.height) / 2), width: t.layer.width });
  layers.push(arrowRight(`${id}-arrow`, x + padX + tw + 24, y + (h - arrow * 0.7) / 2, arrow, pal.onAccent, theme.shape.stroke));
  return { layers, width: w, height: h };
}

// ---------- arrows, swipe cue, dots, quote marks, dividers, icons ----------

export function arrowRight(id: string, x: number, y: number, w: number, color: string, stroke: number, role: Role = 'content'): PathLayer {
  const h = w * 0.7;
  const d = `M 0 ${r1(h / 2)} L ${r1(w)} ${r1(h / 2)} M ${r1(w * 0.62)} 0 L ${r1(w)} ${r1(h / 2)} L ${r1(w * 0.62)} ${r1(h)}`;
  return pathLayer(id, role, x, y, w, h, d, { stroke: { color, width: stroke, cap: 'round', join: 'round' } });
}

/** "Swipe" and an arrow, right aligned to `right`. */
export function swipeCue(theme: Theme, pal: Palette, id: string, right: number, midY: number): Layer[] {
  const fs = theme.type.small;
  const t = buildText({ id: `${id}-label`, x: 0, y: 0, width: 400, text: 'Swipe', font: theme.fonts.body, weight: theme.fonts.strong, size: fs, color: pal.muted, lineHeight: 1, balance: false });
  const tw = Math.ceil(inkWidth(t));
  const aw = 50;
  return [{ ...t.layer, x: r1(right - aw - 14 - tw), y: r1(midY - fs / 2), width: tw + 2 }, arrowRight(`${id}-arrow`, right - aw, midY - aw * 0.35, aw, pal.accent, theme.shape.stroke)];
}

/** One dot per slide. The current one is longer and in the accent colour. */
export function progressDots(pal: Palette, id: string, x: number, midY: number, index: number, count: number): Layer[] {
  const d = 16;
  const gap = 12;
  const out: Layer[] = [];
  let cx = x;
  for (let i = 0; i < count; i++) {
    const on = i === index;
    const w = on ? 44 : d;
    out.push(rect(`${id}-${i + 1}`, 'content', cx, midY - d / 2, w, d, on ? pal.accent : pal.muted, { radius: d / 2, opacity: on ? 1 : 0.55 }));
    cx += w + gap;
  }
  return out;
}

/** Opening quote marks: two teardrops. About 2.3 x size wide. */
export function quoteMarks(id: string, x: number, y: number, size: number, color: string): Layer[] {
  const one = 'M 0.12 1.2 C 0 0.9 0 0.7 0 0.5 C 0 0.22 0.22 0 0.5 0 C 0.78 0 1 0.22 1 0.5 C 1 0.78 0.78 1 0.5 1 C 0.4 1 0.32 0.98 0.26 0.95 C 0.24 1.05 0.2 1.12 0.12 1.2 Z';
  const d = scalePath(one, size);
  return [0, 1].map((i) => pathLayer(`${id}-${i + 1}`, 'content', x + i * size * 1.3, y, size, size * 1.2, d, { fill: color }));
}

/** A short rule in the accent colour. */
export function divider(theme: Theme, pal: Palette, id: string, x: number, y: number, width: number): Layer {
  const sw = theme.shape.stroke;
  return pathLayer(id, 'decor', x, y - sw / 2, width, sw, `M ${r1(sw / 2)} ${r1(sw / 2)} L ${r1(width - sw / 2)} ${r1(sw / 2)}`, {
    stroke: { color: pal.accent, width: sw, cap: theme.shape.badge === 'square' ? 'butt' : 'round' },
  });
}

export type IconName = 'check' | 'cross' | 'bulb' | 'clock' | 'star' | 'bookmark' | 'chat' | 'arrow-down';

/** Icons are drawn on a 24 x 24 grid as strokes. */
const ICONS: Record<IconName, string> = {
  check: 'M 4 12.5 L 9.5 18 L 20 6',
  cross: 'M 5 5 L 19 19 M 19 5 L 5 19',
  bulb: 'M 9 18 L 15 18 M 10 21 L 14 21 M 12 3 C 8 3 5.5 6 5.5 9 C 5.5 11.5 7 13 8.5 14.5 C 9.2 15.2 9 16.5 9 17 L 15 17 C 15 16.5 14.8 15.2 15.5 14.5 C 17 13 18.5 11.5 18.5 9 C 18.5 6 16 3 12 3 Z',
  clock: `${circleD(12, 12, 9)} M 12 7 L 12 12 L 15.5 14`,
  star: 'M 12 3 L 14.6 9 L 21 9.6 L 16.2 13.8 L 17.7 20.2 L 12 16.8 L 6.3 20.2 L 7.8 13.8 L 3 9.6 L 9.4 9 Z',
  bookmark: 'M 6 3 L 18 3 L 18 21 L 12 16.5 L 6 21 Z',
  chat: 'M 4 5 L 20 5 L 20 16 L 11 16 L 6.5 20 L 6.5 16 L 4 16 Z',
  'arrow-down': 'M 12 4 L 12 20 M 5.5 13.5 L 12 20 L 18.5 13.5',
};

export function icon(name: IconName, id: string, x: number, y: number, size: number, color: string, stroke: number, role: Role = 'content'): PathLayer {
  return pathLayer(id, role, x, y, size, size, scalePath(ICONS[name], size / 24), { stroke: { color, width: stroke, cap: 'round', join: 'round' } });
}

// ---------- backgrounds and decoration ----------

/** Full-bleed background layer. The plan's canvas colour is only the fallback; this draws the real one, so it can be a gradient. */
export const background = (pal: Palette, W: number, H: number, id = 'bg'): ShapeLayer => rect(id, 'decor', 0, 0, W, H, pal.bg);

/** Decoration stays inside the top 360 px, in the right half, so slides can start their text below it. */
export const DECOR_BAND = 360;

/** Big quiet shapes that bleed off the top-right corner. Decoration only, so they may sit under anything. */
export function decor(theme: Theme, pal: Palette, W: number): Layer[] {
  const cx = W - 40;
  const cy = 60;
  const kind = theme.shape.decor;
  if (kind === 'rings') return [600, 440, 280].map((s, i) => ellipse(`decor-ring-${i + 1}`, 'decor', cx - s / 2, cy - s / 2, s, s, TRANSPARENT, { stroke: { color: pal.accent, width: 4 }, opacity: 0.55 }));
  if (kind === 'orbs')
    return [
      ellipse('decor-orb-1', 'decor', cx - 420, cy - 300, 560, 560, pal.accent, { opacity: 0.16 }),
      ellipse('decor-orb-2', 'decor', cx - 330, cy + 90, 220, 220, pal.marker, { opacity: 0.22 }),
    ];
  return [
    rect('decor-block-1', 'decor', cx - 230, cy - 230, 300, 300, pal.accent, { rotation: 14, stroke: { color: pal.line, width: 6 } }),
    rect('decor-block-2', 'decor', cx - 440, cy + 70, 190, 190, pal.marker, { rotation: -10, stroke: { color: pal.line, width: 6 } }),
  ];
}
