// Cheap, reusable tools added for the learned styles. Same rules as the first toolbox: plain layers, colours from the palette.
import type { Layer } from '../types';
import { buildText, ellipse, inkWidth, pathLayer, rect, TRANSPARENT } from '../carousel/toolbox';
import type { Palette, Theme } from '../carousel/types';

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A thin outlined pill with a label, and optionally an arrow inside. Returns the layers and its size. */
export function outlinePill(theme: Theme, pal: Palette, id: string, x: number, y: number, label: string, o: { arrow?: boolean; filled?: boolean; size?: number } = {}): { layers: Layer[]; width: number; height: number } {
  const fs = o.size ?? theme.type.small;
  const t = buildText({ id: `${id}-label`, x: 0, y: 0, width: 900, text: label, font: theme.fonts.body, weight: theme.fonts.strong, size: fs, color: o.filled ? pal.onAccent : pal.text, lineHeight: 1, balance: false });
  const tw = Math.ceil(inkWidth(t));
  const padX = Math.round(fs * 0.8);
  const arrow = o.arrow ? Math.round(fs * 0.9) : 0;
  const w = padX + tw + (arrow ? 16 + arrow : 0) + padX;
  const h = Math.round(fs * 2);
  const sw = Math.max(2, theme.shape.outline || 3);
  const layers: Layer[] = [
    rect(id, 'container', x, y, w, h, o.filled ? pal.accent : TRANSPARENT, { radius: h / 2, stroke: { color: o.filled ? pal.accent : pal.line, width: sw } }),
    { ...t.layer, x: r1(x + padX), y: r1(y + (h - fs) / 2), width: tw + 2 },
  ];
  if (arrow) {
    const ah = arrow * 0.7;
    layers.push(pathLayer(`${id}-arrow`, 'content', x + padX + tw + 16, y + (h - ah) / 2, arrow, ah, `M 0 ${r1(ah / 2)} L ${arrow} ${r1(ah / 2)} M ${r1(arrow * 0.62)} 0 L ${arrow} ${r1(ah / 2)} L ${r1(arrow * 0.62)} ${r1(ah)}`, { stroke: { color: o.filled ? pal.onAccent : pal.text, width: Math.max(3, theme.shape.stroke - 2), cap: 'round', join: 'round' } }));
  }
  return { layers, width: w, height: h };
}

/** A round button with a small up-right arrow inside. */
export function roundArrow(theme: Theme, pal: Palette, id: string, x: number, y: number, size: number, o: { filled?: boolean } = {}): Layer[] {
  const sw = Math.max(2, theme.shape.outline || 3);
  const c = o.filled ? pal.onAccent : pal.text;
  const s = size;
  return [
    ellipse(id, 'container', x, y, s, s, o.filled ? pal.accent : TRANSPARENT, { stroke: { color: o.filled ? pal.accent : pal.line, width: sw } }),
    pathLayer(`${id}-arrow`, 'content', x + s * 0.3, y + s * 0.3, s * 0.4, s * 0.4, `M 0 ${r1(s * 0.4)} L ${r1(s * 0.4)} 0 M ${r1(s * 0.06)} 0 L ${r1(s * 0.4)} 0 L ${r1(s * 0.4)} ${r1(s * 0.34)}`, { stroke: { color: c, width: Math.max(3, theme.shape.stroke - 2), cap: 'round', join: 'round' } }),
  ];
}

/** "03 / 07" in the label size, right aligned to `right`. */
export function pageNumber(theme: Theme, pal: Palette, id: string, right: number, y: number, index: number, count: number): Layer[] {
  const label = `${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`;
  const t = buildText({ id, x: 0, y: 0, width: 400, text: label, font: theme.fonts.body, weight: theme.fonts.strong, size: (theme.type.label ?? 32), color: pal.muted, lineHeight: 1, balance: false });
  const w = Math.ceil(inkWidth(t));
  return [{ ...t.layer, x: r1(right - w), y: r1(y), width: w + 2 }];
}

/** A line of small text, left aligned. */
export function labelText(theme: Theme, pal: Palette, id: string, x: number, y: number, text: string, o: { color?: string; upper?: boolean; width?: number } = {}) {
  return buildText({ id, x, y, width: o.width ?? 800, text, font: theme.fonts.body, weight: theme.fonts.strong, size: (theme.type.label ?? 32), color: o.color ?? pal.muted, lineHeight: 1, upper: o.upper ?? true, balance: false });
}

/** A strip that runs across the slide at an angle and repeats a short phrase. Decoration only. */
export function tapeBanner(theme: Theme, pal: Palette, id: string, y: number, W: number, angle: number, phrase: string): Layer[] {
  const h = 84;
  const fs = (theme.type.label ?? 32);
  const t = buildText({ id: `${id}-text`, x: 0, y: 0, width: 4000, text: Array(8).fill(`${phrase.toUpperCase()}  +  `).join(''), font: theme.fonts.body, weight: theme.fonts.strong, size: fs, color: pal.onAccent, lineHeight: 1, balance: false });
  const w = W + 500;
  const x = -250;
  return [
    { ...rect(id, 'decor', x, y, w, h, pal.accent, { rotation: angle }) },
    { ...t.layer, role: 'decor', x, y: y + (h - fs) / 2, width: w, height: Math.ceil(fs * 1.1), rotation: angle, style: { ...t.layer.style, align: 'left' } },
  ];
}

/** A soft glow made of stacked translucent circles. Decoration only. */
export function glow(id: string, cx: number, cy: number, radius: number, color: string, peak = 0.5, steps = 22): Layer[] {
  const a = 1 - (1 - peak) ** (1 / steps);
  return Array.from({ length: steps }, (_, i) => {
    const r = radius * (1 - i / steps);
    return ellipse(`${id}-${i + 1}`, 'decor', cx - r, cy - r, r * 2, r * 2, color, { opacity: Math.max(0.01, a) });
  });
}

/** A flat user-interface card: a title bar, a small chart, a chip. Not a 3D object and not a screenshot. Decoration only. */
export function uiCard(theme: Theme, pal: Palette, id: string, x: number, y: number, w: number, h: number, kind: 'bars' | 'line' = 'bars'): Layer[] {
  const out: Layer[] = [];
  const rad = Math.min(theme.shape.radius, 34);
  const d = theme.shape.hardShadow;
  if (d) out.push(rect(`${id}-shadow`, 'decor', x + d, y + d, w, h, pal.line, { radius: rad }));
  out.push(rect(id, 'decor', x, y, w, h, pal.surface, { radius: rad, stroke: { color: pal.line, width: Math.max(2, theme.shape.outline || 2) } }));
  const pad = w * 0.07;
  out.push(rect(`${id}-title`, 'decor', x + pad, y + pad, w * 0.34, h * 0.06, pal.muted, { radius: h * 0.03, opacity: 0.6 }));
  out.push(rect(`${id}-chip`, 'decor', x + w - pad - w * 0.18, y + pad - h * 0.01, w * 0.18, h * 0.08, pal.accent, { radius: h * 0.04 }));
  const top = y + pad + h * 0.16;
  const bottom = y + h - pad;
  if (kind === 'bars') {
    const n = 6;
    const gap = w * 0.03;
    const bw = (w - 2 * pad - gap * (n - 1)) / n;
    [0.35, 0.5, 0.42, 0.7, 0.62, 0.95].forEach((v, i) => out.push(rect(`${id}-bar-${i + 1}`, 'decor', x + pad + i * (bw + gap), bottom - (bottom - top) * v, bw, (bottom - top) * v, i === n - 1 ? pal.accent : pal.muted, { radius: Math.min(8, bw / 4), opacity: i === n - 1 ? 1 : 0.5 })));
  } else {
    const bw = w - 2 * pad;
    const bh = bottom - top;
    const pts = [[0, 0.8], [0.18, 0.62], [0.36, 0.7], [0.55, 0.35], [0.74, 0.45], [1, 0.08]];
    const dd = pts.map(([px, py], i) => `${i ? 'L' : 'M'} ${r1(px * bw)} ${r1(py * bh)}`).join(' ');
    out.push(pathLayer(`${id}-line`, 'decor', x + pad, top, bw, bh, dd, { stroke: { color: pal.accent, width: Math.max(5, theme.shape.stroke), cap: 'round', join: 'round' } }));
  }
  return out;
}

/** A hard rule across a given width. */
export function rule(theme: Theme, pal: Palette, id: string, x: number, y: number, width: number, w = Math.max(2, Math.round(theme.shape.stroke / 3))): Layer {
  return pathLayer(id, 'decor', x, y - w / 2, width, w, `M 0 ${r1(w / 2)} L ${width} ${r1(w / 2)}`, { stroke: { color: pal.line, width: w, cap: 'butt' } });
}
