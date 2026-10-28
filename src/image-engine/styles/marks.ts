// Draws a style's marks (see marks-spec.ts) as ordinary plan layers: paths, shapes and text. Nothing is a picture. Needs the fonts loaded (it measures letters).
import { buildText, ellipse, pathLayer, rect, solidOf, TRANSPARENT } from '../carousel/toolbox';
import type { Palette, Theme } from '../carousel/types';
import { measureWidth } from '../draw/text';
import type { Layer, TextLayer } from '../types';
import { outlinePill } from './tools';
import { TEXTURE_SET, type MarkSpec } from './marks-spec';

const r1 = (n: number) => Math.round(n * 10) / 10;
const PI = Math.PI;

export interface MarkCtx {
  theme: Theme;
  pal: Palette;
  W: number;
  H: number;
  M: number;
  /** The content area (clear of page chrome). */
  top: number;
  bottom: number;
  /** The slide type, for marks that apply to some types. */
  type: string;
  /** Same seed, same marks (grain and wobble are drawn from it). */
  seed: string;
}
export interface MarkLayers {
  /** Textures: they go right above the background. */
  under: Layer[];
  /** Badges, stamps and shapes: they go over the slide's content. */
  over: Layer[];
  notes: string[];
}

function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A palette role name, or a hex colour (free layouts carry the colour they measured). */
const colourOf = (pal: Palette, role: string): string => (role.startsWith('#') ? role : role === 'bg' ? solidOf(pal.bg) : ((pal as unknown as Record<string, string>)[role] ?? pal.accent));

/** The box a texture fills: the whole slide, or a part of it. */
function regionOf(zone: MarkSpec['zone'], c: MarkCtx) {
  const { W, H } = c;
  switch (zone) {
    case 'full': return { x: 0, y: 0, w: W, h: H };
    case 'top': return { x: 0, y: 0, w: W, h: Math.round(H * 0.4) };
    case 'bottom': return { x: 0, y: Math.round(H * 0.6), w: W, h: H - Math.round(H * 0.6) };
    case 'left': return { x: 0, y: 0, w: Math.round(W * 0.45), h: H };
    case 'right': return { x: Math.round(W * 0.55), y: 0, w: W - Math.round(W * 0.55), h: H };
    case 'top-left': return { x: 0, y: 0, w: Math.round(W * 0.55), h: Math.round(H * 0.4) };
    case 'top-right': return { x: Math.round(W * 0.45), y: 0, w: W - Math.round(W * 0.45), h: Math.round(H * 0.4) };
    case 'bottom-left': return { x: 0, y: Math.round(H * 0.6), w: Math.round(W * 0.55), h: H - Math.round(H * 0.6) };
    case 'bottom-right': return { x: Math.round(W * 0.45), y: Math.round(H * 0.6), w: W - Math.round(W * 0.45), h: H - Math.round(H * 0.6) };
    default: return { x: Math.round(W * 0.15), y: Math.round(H * 0.25), w: Math.round(W * 0.7), h: Math.round(H * 0.5) };
  }
}

/** Where a shape of this size sits for a zone (top left corner). */
function placeBox(zone: MarkSpec['zone'], w: number, h: number, bleed: boolean, c: MarkCtx): { x: number; y: number } {
  const { W, H, M } = c;
  const gx = bleed ? -w * 0.25 : M;
  const gy = bleed ? -h * 0.25 : c.top;
  const left = gx;
  const right = bleed ? W - w * 0.75 : W - M - w;
  const topY = gy;
  const botY = bleed ? H - h * 0.75 : c.bottom - h;
  const midX = (W - w) / 2;
  const midY = (H - h) / 2;
  switch (zone) {
    case 'top-left': return { x: left, y: topY };
    case 'top-right': return { x: right, y: topY };
    case 'bottom-left': return { x: left, y: botY };
    case 'bottom-right': return { x: right, y: botY };
    case 'top': return { x: midX, y: topY };
    case 'bottom': return { x: midX, y: botY };
    case 'left': return { x: left, y: midY };
    case 'right': return { x: right, y: midY };
    default: return { x: midX, y: midY };
  }
}

const poly = (pts: [number, number][]) => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${r1(x)} ${r1(y)}`).join(' ') + ' Z';
const dotD = (cx: number, cy: number, r: number) => {
  const n = r < 3 ? 6 : 10;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) pts.push([cx + Math.cos((i / n) * 2 * PI) * r, cy + Math.sin((i / n) * 2 * PI) * r]);
  return poly(pts);
};

/** A convex or concave polygon clipped to one side of a line: keep points where nx*x + ny*y >= k (or <= k). */
function clip(pts: [number, number][], nx: number, ny: number, k: number, keepGreater: boolean): [number, number][] {
  const val = (p: [number, number]) => (nx * p[0] + ny * p[1] - k) * (keepGreater ? 1 : -1);
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const va = val(a);
    const vb = val(b);
    if (va >= 0) out.push(a);
    if ((va >= 0) !== (vb >= 0)) {
      const t = va / (va - vb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function textRow(c: MarkCtx, id: string, m: MarkSpec, x: number, y: number, width: number, text: string, size: number, colour: string, extra: Partial<TextLayer> = {}): TextLayer {
  const f = m.font === 'body' ? { font: c.theme.fonts.body, weight: c.theme.fonts.strong } : { font: c.theme.fonts.headline, weight: c.theme.fonts.headlineWeight };
  const t = buildText({ id, x, y, width, text, font: f.font, weight: f.weight, size, color: colour, lineHeight: 1, balance: false, role: 'decor' });
  return { ...t.layer, ...extra, x: r1(x), y: r1(y), width: r1(width), height: Math.ceil(size * 1.15) };
}

function drawOne(m: MarkSpec, i: number, c: MarkCtx, out: MarkLayers) {
  const id = `mark${i + 1}-${m.kind}`;
  const col = colourOf(c.pal, m.colour);
  const col2 = colourOf(c.pal, m.colour2 ?? (m.colour === 'accent' ? 'onAccent' : 'text'));
  const s = m.box ? Math.max(40, Math.round((m.box.w / 100) * c.W)) : m.size;
  const rot = m.rotate ?? 0;
  // A mark with a box goes exactly there; one with a zone goes where the zone says.
  const place = (w: number, h: number) => (m.box ? { x: (m.box.x / 100) * c.W, y: (m.box.y / 100) * c.H } : placeBox(m.zone, w, h, bleed, c));
  const bleed = m.bleed === true;
  const stroke = (w: number) => ({ color: col, width: Math.max(2, r1(w)), cap: 'round' as const, join: 'round' as const });
  const fontPick = m.font === 'body' ? { font: c.theme.fonts.body, weight: c.theme.fonts.strong } : { font: c.theme.fonts.headline, weight: c.theme.fonts.headlineWeight };
  const R = rng(`${c.seed}|${id}`);

  // ----- textures -----
  if (TEXTURE_SET.has(m.kind)) {
    const g = regionOf(m.zone, c);
    const op = m.opacity ?? 0.35;
    if (m.kind === 'dot-grid' || m.kind === 'halftone-field') {
      let p = s;
      while ((g.w / p) * (g.h / p) > 1800) p += 2;
      let d = '';
      for (let y = p / 2; y < g.h; y += p)
        for (let x = p / 2; x < g.w; x += p) {
          let r = p * 0.13;
          if (m.kind === 'halftone-field') {
            const u = x / g.w;
            const v = y / g.h;
            const z = m.zone;
            const t = z === 'top' ? 1 - v : z === 'bottom' ? v : z === 'left' ? 1 - u : z === 'right' ? u
              : z === 'centre' ? 1 - Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2)
              : z === 'top-left' ? 1 - Math.min(1, Math.hypot(u, v) / 1.1) : z === 'top-right' ? 1 - Math.min(1, Math.hypot(1 - u, v) / 1.1)
              : z === 'bottom-left' ? 1 - Math.min(1, Math.hypot(u, 1 - v) / 1.1) : z === 'bottom-right' ? 1 - Math.min(1, Math.hypot(1 - u, 1 - v) / 1.1)
              : 1 - (u + v) / 2;
            r = p * 0.5 * Math.max(0, t) ** 1.2;
          }
          if (r >= 0.8) d += dotD(x, y, r) + ' ';
        }
      if (d) out.under.push(pathLayer(id, 'decor', g.x, g.y, g.w, g.h, d.trim(), { fill: col, opacity: op }));
      return;
    }
    if (m.kind === 'stripes') {
      const a = ((m.rotate ?? 45) * PI) / 180;
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      const corners: [number, number][] = [[0, 0], [g.w, 0], [g.w, g.h], [0, g.h]];
      const proj = corners.map(([x, y]) => nx * x + ny * y);
      const lo = Math.min(...proj);
      const hi = Math.max(...proj);
      let p = s;
      while ((hi - lo) / p > 160) p += 2;
      let d = '';
      for (let k = Math.floor(lo / p); k * p < hi; k++) {
        let pg = clip(corners, nx, ny, k * p, true);
        if (pg.length) pg = clip(pg, nx, ny, k * p + p / 2, false);
        if (pg.length >= 3) d += poly(pg) + ' ';
      }
      if (d) out.under.push(pathLayer(id, 'decor', g.x, g.y, g.w, g.h, d.trim(), { fill: col, opacity: op }));
      return;
    }
    if (m.kind === 'grain') {
      const sp = Math.max(2, Math.round(s / 4));
      const n = Math.min(2500, Math.round(((g.w * g.h) / (s * s)) * 0.9));
      let d = '';
      for (let k = 0; k < n; k++) {
        const x = R() * (g.w - sp);
        const y = R() * (g.h - sp);
        d += `M ${r1(x)} ${r1(y)} L ${r1(x + sp)} ${r1(y)} L ${r1(x + sp)} ${r1(y + sp)} L ${r1(x)} ${r1(y + sp)} Z `;
      }
      out.under.push(pathLayer(id, 'decor', g.x, g.y, g.w, g.h, d.trim(), { fill: col, opacity: Math.min(op, 0.6) }));
      return;
    }
    // text-rows
    const unitText = `${(m.text ?? '').toUpperCase()}   `;
    const unit = Math.max(8, measureWidth(unitText, fontPick.font, fontPick.weight, s));
    const reps = Math.max(1, Math.floor((g.w + unit) / unit));
    const row = unitText.repeat(reps);
    const rows = Math.min(16, Math.max(1, Math.ceil(g.h / (s * 1.02))));
    for (let k = 0; k < rows; k++) {
      const shift = k % 2 ? -unit / 2 : 0;
      out.under.push(textRow(c, `${id}-${k + 1}`, m, g.x + shift, g.y + k * s * 1.02, reps * unit + 4, row, s, col, { opacity: op }));
    }
    return;
  }

  // ----- shapes and marks -----
  if (m.kind === 'asterisk') {
    const n = m.points ?? 8;
    let d = '';
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * PI - PI / 2;
      d += `M ${r1(s / 2)} ${r1(s / 2)} L ${r1(s / 2 + (Math.cos(a) * s) / 2)} ${r1(s / 2 + (Math.sin(a) * s) / 2)} `;
    }
    const p = place(s, s);
    out.over.push(pathLayer(id, 'decor', p.x, p.y, s, s, d.trim(), { stroke: stroke(s * 0.1), opacity: m.opacity ?? 1, rotation: rot }));
    return;
  }
  if (m.kind === 'sparkle') {
    const k = s / 2;
    const d = `M ${k} 0 Q ${k} ${k} ${s} ${k} Q ${k} ${k} ${k} ${s} Q ${k} ${k} 0 ${k} Q ${k} ${k} ${k} 0 Z`;
    const p = place(s, s);
    out.over.push(pathLayer(id, 'decor', p.x, p.y, s, s, d, { fill: col, opacity: m.opacity ?? 1, rotation: rot }));
    // A smaller companion, up and to the right.
    const s2 = Math.round(s * 0.4);
    const k2 = s2 / 2;
    out.over.push(pathLayer(`${id}-small`, 'decor', p.x + s * 0.82, p.y - s2 * 0.5, s2, s2, `M ${k2} 0 Q ${k2} ${k2} ${s2} ${k2} Q ${k2} ${k2} ${k2} ${s2} Q ${k2} ${k2} 0 ${k2} Q ${k2} ${k2} ${k2} 0 Z`, { fill: col, opacity: m.opacity ?? 1, rotation: rot }));
    return;
  }
  if (m.kind === 'round-badge' || m.kind === 'starburst-badge') {
    const p = place(s, s);
    if (m.kind === 'round-badge') out.over.push(ellipse(id, 'container', p.x, p.y, s, s, col, { opacity: m.opacity ?? 1 }));
    else {
      const n = m.points ?? 16;
      const pts: [number, number][] = [];
      for (let k = 0; k < n * 2; k++) {
        const a = (k / (n * 2)) * 2 * PI;
        const rr = k % 2 === 0 ? 1 : 0.84;
        pts.push([s / 2 + (Math.cos(a) * s * rr) / 2, s / 2 + (Math.sin(a) * s * rr) / 2]);
      }
      out.over.push(pathLayer(id, 'container', p.x, p.y, s, s, poly(pts), { fill: col, opacity: m.opacity ?? 1, rotation: rot }));
    }
    if (m.text) {
      const t = buildText({ id: `${id}-text`, x: 0, y: 0, width: s * 0.7, text: m.text, font: fontPick.font, weight: fontPick.weight, size: Math.max(28, Math.round(s * 0.22)), minSize: 24, color: col2, lineHeight: 1.02, align: 'center', balance: false, upper: true });
      out.over.push({ ...t.layer, x: r1(p.x + s * 0.15), y: r1(p.y + (s - t.height) / 2), width: r1(s * 0.7), rotation: rot });
    }
    return;
  }
  if (m.kind === 'circular-text') {
    const fs = Math.max(24, Math.round(s * 0.11));
    const Rr = s / 2 - fs * 0.8;
    const p = place(s, s);
    const cx = p.x + s / 2;
    const cy = p.y + s / 2;
    const unitText = `${m.text!.toUpperCase()} • `;
    const chars = [...unitText];
    const widths = chars.map((ch) => measureWidth(ch, fontPick.font, fontPick.weight, fs));
    const unit = widths.reduce((a, b) => a + b, 0);
    const L = 2 * PI * Rr;
    let reps = Math.max(1, Math.round(L / unit));
    while (reps * chars.length > 90 && reps > 1) reps--;
    const extra = (L - reps * unit) / (reps * chars.length);
    let at = 0;
    const base = (rot * PI) / 180;
    for (let k = 0; k < reps * chars.length; k++) {
      const w = widths[k % chars.length];
      const mid = at + w / 2;
      at += w + extra;
      const th = base - PI / 2 + mid / Rr;
      if (chars[k % chars.length] === ' ') continue;
      const bw = Math.ceil(w) + 6;
      const bh = Math.ceil(fs * 1.2);
      const t = buildText({ id: `${id}-${k}`, x: 0, y: 0, width: bw, text: chars[k % chars.length], font: fontPick.font, weight: fontPick.weight, size: fs, color: col, lineHeight: 1, align: 'center', balance: false });
      out.over.push({ ...t.layer, role: 'decor', x: r1(cx + Math.cos(th) * Rr - bw / 2), y: r1(cy + Math.sin(th) * Rr - bh / 2), width: bw, height: bh, rotation: r1((th * 180) / PI + 90), opacity: m.opacity ?? 1 });
    }
    out.over.push(ellipse(`${id}-ring`, 'decor', cx - (Rr - fs * 0.95), cy - (Rr - fs * 0.95), 2 * (Rr - fs * 0.95), 2 * (Rr - fs * 0.95), TRANSPARENT, { stroke: { color: col, width: 3 }, opacity: (m.opacity ?? 1) * 0.7 }));
    return;
  }
  if (m.kind === 'stamp') {
    const w = s;
    const h = Math.round(s * 0.4);
    const p = place(w, h);
    const sw = Math.max(3, s * 0.022);
    out.over.push({ ...rect(id, 'container', p.x, p.y, w, h, TRANSPARENT, { radius: s * 0.04, stroke: { color: col, width: sw }, opacity: m.opacity ?? 1, rotation: rot || -8 }) });
    out.over.push({ ...rect(`${id}-inner`, 'decor', p.x + s * 0.03, p.y + s * 0.03, w - s * 0.06, h - s * 0.06, TRANSPARENT, { radius: s * 0.025, stroke: { color: col, width: Math.max(2, sw / 2) }, opacity: m.opacity ?? 1, rotation: rot || -8 }) });
    const t = buildText({ id: `${id}-text`, x: 0, y: 0, width: w * 0.84, text: m.text!, font: fontPick.font, weight: fontPick.weight, size: Math.round(h * 0.5), minSize: 24, color: col, lineHeight: 1, align: 'center', balance: false, upper: true });
    out.over.push({ ...t.layer, x: r1(p.x + w * 0.08), y: r1(p.y + (h - t.height) / 2), width: r1(w * 0.84), rotation: rot || -8, opacity: m.opacity ?? 1 });
    return;
  }
  if (m.kind === 'ticket' || m.kind === 'label') {
    const w = s;
    const h = Math.round(s * (m.kind === 'ticket' ? 0.42 : 0.34));
    const p = place(w, h);
    let d: string;
    if (m.kind === 'ticket') {
      const r = h * 0.17;
      const my = h / 2;
      d = `M 0 0 L ${w} 0 L ${w} ${r1(my - r)} C ${r1(w - r * 1.5)} ${r1(my - r * 0.9)} ${r1(w - r * 1.5)} ${r1(my + r * 0.9)} ${w} ${r1(my + r)} L ${w} ${h} L 0 ${h} L 0 ${r1(my + r)} C ${r1(r * 1.5)} ${r1(my + r * 0.9)} ${r1(r * 1.5)} ${r1(my - r * 0.9)} 0 ${r1(my - r)} Z`;
    } else d = `M ${r1(h * 0.5)} 0 L ${w} 0 L ${w} ${h} L ${r1(h * 0.5)} ${h} L 0 ${r1(h / 2)} Z`;
    out.over.push(pathLayer(id, 'container', p.x, p.y, w, h, d, { fill: col, opacity: m.opacity ?? 1, rotation: rot || (m.kind === 'ticket' ? -6 : 0) }));
    if (m.kind === 'ticket') {
      let dash = '';
      const px = w * 0.76;
      for (let y = h * 0.14; y < h * 0.86; y += h * 0.14) dash += `M ${r1(px)} ${r1(y)} L ${r1(px)} ${r1(y + h * 0.07)} `;
      out.over.push(pathLayer(`${id}-perforation`, 'decor', p.x, p.y, w, h, dash.trim(), { stroke: { color: col2, width: 3, cap: 'round' }, opacity: 0.7 * (m.opacity ?? 1), rotation: rot || -6 }));
    } else out.over.push(ellipse(`${id}-hole`, 'decor', p.x + h * 0.32, p.y + h / 2 - h * 0.07, h * 0.14, h * 0.14, solidOf(c.pal.bg), { opacity: 1 }));
    const tx = m.kind === 'ticket' ? w * 0.06 : h * 0.62;
    const tw = (m.kind === 'ticket' ? w * 0.66 : w - h * 0.62 - w * 0.06);
    const t = buildText({ id: `${id}-text`, x: 0, y: 0, width: tw, text: m.text!, font: fontPick.font, weight: fontPick.weight, size: Math.round(h * 0.42), minSize: 24, maxHeight: Math.round(h * 0.55), color: col2, lineHeight: 1, align: 'center', balance: false, upper: true });
    const cxBox = p.x + tx + tw / 2;
    const cyBox = p.y + h / 2;
    // Turn the words about the same centre as the shape, so they stay on it.
    const ang = ((rot || (m.kind === 'ticket' ? -6 : 0)) * PI) / 180;
    const ox = cxBox - (p.x + w / 2);
    const oy = cyBox - (p.y + h / 2);
    const rx = ox * Math.cos(ang) - oy * Math.sin(ang);
    const ry = ox * Math.sin(ang) + oy * Math.cos(ang);
    out.over.push({ ...t.layer, x: r1(p.x + w / 2 + rx - tw / 2), y: r1(p.y + h / 2 + ry - t.height / 2), width: r1(tw), rotation: rot || (m.kind === 'ticket' ? -6 : 0), opacity: m.opacity ?? 1 });
    return;
  }
  if (m.kind === 'outline-button') {
    const fs = Math.max(28, Math.min(80, Math.round(s * 0.13)));
    const probe = outlinePill(c.theme, c.pal, id, 0, 0, m.text!, { arrow: true, size: fs });
    const p = place(probe.width, probe.height);
    const pill = outlinePill(c.theme, c.pal, id, p.x, p.y, m.text!, { arrow: true, size: fs });
    // The button is drawn in the colour asked for, not the style's line colour.
    out.over.push(...pill.layers.map((l) => (l.kind === 'shape' ? { ...l, stroke: l.stroke ? { ...l.stroke, color: col } : l.stroke } : l.kind === 'path' ? { ...l, stroke: l.stroke ? { ...l.stroke, color: col } : l.stroke } : l.kind === 'text' ? { ...l, style: { ...l.style, color: col } } : l)));
    return;
  }
  if (m.kind === 'arrow') {
    const w = s;
    const h = Math.round(s * 0.6);
    const p = place(w, h);
    const ex = w * 0.92;
    const ey = h * 0.62;
    const c2x = w * 0.62;
    const c2y = h * 0.02;
    const tx = ex - c2x;
    const ty = ey - c2y;
    const ang = Math.atan2(ty, tx);
    const hl = w * 0.16;
    const head = (da: number) => `L ${r1(ex - Math.cos(ang + da) * hl)} ${r1(ey - Math.sin(ang + da) * hl)}`;
    const d = `M 0 ${r1(h * 0.85)} C ${r1(w * 0.22)} ${r1(h * 0.1)} ${r1(c2x)} ${r1(c2y)} ${r1(ex)} ${r1(ey)} M ${r1(ex)} ${r1(ey)} ${head(0.5)} M ${r1(ex)} ${r1(ey)} ${head(-0.5)}`;
    out.over.push(pathLayer(id, 'decor', p.x, p.y, w, h, d, { stroke: stroke(Math.max(6, s * 0.035)), opacity: m.opacity ?? 1, rotation: rot }));
    return;
  }
  if (m.kind === 'scribble-circle') {
    const w = s;
    const h = Math.round(s * 0.5);
    const p = place(w, h);
    const pts: [number, number][] = [];
    const turns = 1.18;
    const steps = 46;
    const a0 = R() * PI;
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (k / steps) * turns * 2 * PI;
      const wob = 1 + (R() - 0.5) * 0.06 + (k / steps) * 0.05;
      pts.push([w / 2 + (Math.cos(a) * w * 0.47 * wob), h / 2 + Math.sin(a) * h * 0.47 * wob]);
    }
    const d = pts.map(([x, y], k) => `${k === 0 ? 'M' : 'L'} ${r1(x)} ${r1(y)}`).join(' ');
    out.over.push(pathLayer(id, 'decor', p.x, p.y, w, h, d, { stroke: stroke(Math.max(4, s * 0.025)), opacity: m.opacity ?? 1, rotation: rot }));
    return;
  }
  if (m.kind === 'ribbon') {
    const h = s;
    const W2 = c.W + 700;
    const y = m.zone.startsWith('top') || m.zone === 'top' ? c.top + h : m.zone.startsWith('bottom') || m.zone === 'bottom' ? c.bottom - h * 2 : (c.H - h) / 2;
    const a = rot || -6;
    out.over.push({ ...rect(id, 'decor', -350, y, W2, h, col, { rotation: a, opacity: m.opacity ?? 1 }) });
    if (m.text) {
      const fs = Math.max(24, Math.round(h * 0.4));
      const unitText = `${m.text.toUpperCase()}  +  `;
      const unit = measureWidth(unitText, fontPick.font, fontPick.weight, fs);
      const reps = Math.max(1, Math.floor(W2 / unit));
      const t = buildText({ id: `${id}-text`, x: 0, y: 0, width: reps * unit + 4, text: unitText.repeat(reps), font: fontPick.font, weight: fontPick.weight, size: fs, color: col2, lineHeight: 1, balance: false });
      out.over.push({ ...t.layer, role: 'decor', x: r1(-350 + (W2 - reps * unit) / 2), y: r1(y + (h - fs) / 2), width: r1(reps * unit + 4), height: Math.ceil(fs * 1.15), rotation: a, opacity: m.opacity ?? 1, style: { ...t.layer.style, align: 'left' } });
    }
    return;
  }
  if (m.kind === 'tape') {
    const w = s;
    const h = Math.round(s * 0.3);
    const p = place(w, h);
    const d = `M 0 0 L ${w} 0 L ${r1(w * 0.985)} ${r1(h * 0.25)} L ${w} ${r1(h * 0.5)} L ${r1(w * 0.985)} ${r1(h * 0.75)} L ${w} ${h} L 0 ${h} L ${r1(w * 0.015)} ${r1(h * 0.75)} L 0 ${r1(h * 0.5)} L ${r1(w * 0.015)} ${r1(h * 0.25)} Z`;
    out.over.push(pathLayer(id, 'decor', p.x, p.y, w, h, d, { fill: col, opacity: m.opacity ?? 0.8, rotation: rot || -10 }));
    return;
  }
  // two-tone-text
  const lines = m.lines ?? [];
  const lh = Math.round(s * 1.02);
  const bw = c.W - 2 * c.M;
  const block = lh * lines.length;
  const y0 = m.zone.startsWith('top') || m.zone === 'top' ? c.top : m.zone.startsWith('bottom') || m.zone === 'bottom' ? c.bottom - block : (c.H - block) / 2;
  const align = m.zone.endsWith('left') || m.zone === 'left' ? 'left' : m.zone.endsWith('right') || m.zone === 'right' ? 'right' : 'center';
  lines.forEach((line, k) => {
    const t = buildText({ id: `${id}-${k + 1}`, x: c.M, y: y0 + k * lh, width: bw, text: line, font: fontPick.font, weight: fontPick.weight, size: s, minSize: Math.max(24, Math.round(s * 0.5)), color: k % 2 === 0 ? col : col2, lineHeight: 1, align, balance: false, role: 'content' });
    out.over.push({ ...t.layer, x: c.M, y: r1(y0 + k * lh), width: bw, rotation: rot });
  });
}

/** The layers for a style's marks on one slide, sorted into those that go under the content and those that go over it. */
export function drawMarks(marks: MarkSpec[], c: MarkCtx): MarkLayers {
  const out: MarkLayers = { under: [], over: [], notes: [] };
  marks.forEach((m, i) => {
    if (m.off || (m.types && !m.types.includes(c.type))) return;
    try {
      drawOne(m, i, c, out);
    } catch (e) {
      out.notes.push(`The ${m.kind} mark could not be drawn (${(e as Error).message}).`);
    }
  });
  return out;
}
