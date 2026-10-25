// Recolouring of library elements. Elements are SVG text; this swaps their colours before they are drawn.
// Pure string work, so it also runs where there is no canvas (for the Results screen previews).

const COLOUR = /(\b(?:fill|stroke|stop-color|flood-color)\s*[=:]\s*)(["']?)([^"';>\s]+)(\2)/gi;
const KEEP = new Set(['none', 'transparent', 'inherit', 'context-fill', 'context-stroke']);

/** Presentation attributes that Fabric does not inherit from the root <svg>; they are moved onto a <g> that wraps everything. */
const PRESENTATION = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'fill-opacity', 'fill-rule', 'opacity', 'color'];

export function normaliseRoot(svg: string): string {
  const m = svg.match(/<svg\b([^>]*)>/);
  if (!m || m.index === undefined) return svg;
  let attrs = m[1];
  const moved: string[] = [];
  for (const k of PRESENTATION) {
    const re = new RegExp(`\\s${k}\\s*=\\s*"([^"]*)"`);
    const hit = attrs.match(re);
    if (hit) {
      moved.push(`${k}="${hit[1]}"`);
      attrs = attrs.replace(re, '');
    }
  }
  const rest = svg.slice(m.index + m[0].length).replace(/<\/svg>\s*$/, '');
  return `${svg.slice(0, m.index)}<svg${attrs}><g ${moved.join(' ')}>${rest}</g></svg>`;
}

/** Swaps colours inside attributes and style declarations. `tint` replaces every colour; `colors` swaps listed ones. */
export function recolourSvg(svgIn: string, colors?: Record<string, string>, tint?: string): string {
  const svg = normaliseRoot(svgIn);
  const map = new Map(Object.entries(colors ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  let out = svg.replace(COLOUR, (_m, pre: string, q: string, v: string, q2: string) => {
    const key = v.toLowerCase();
    if (KEEP.has(key) || key.startsWith('url(')) return `${pre}${q}${v}${q2}`;
    const next = tint ?? map.get(key) ?? v;
    return `${pre}${q}${next}${q2}`;
  });
  // An element with no fill anywhere draws black by default. When tinting, say so on the wrapper.
  if (tint && !/<g\s[^>]*\bfill=/.test(out)) out = out.replace(/<g\b/, `<g fill="${tint}"`);
  return out;
}

/** Makes the viewBox bigger on every side, so a thick outline is not cut off. The picture shrinks to fit the same box. */
export function growViewBox(svg: string, pad: number): string {
  return svg.replace(/viewBox\s*=\s*"([^"]+)"/i, (_m, vb: string) => {
    const [x, y, w, h] = vb.trim().split(/[\s,]+/).map(Number);
    return `viewBox="${x - pad} ${y - pad} ${w + 2 * pad} ${h + 2 * pad}"`;
  });
}

/** A one-colour copy of the element with a thick round stroke: the die-cut outline under a sticker. Faint parts (shadows) are left out. */
export function outlineSvg(svg: string, color: string, width: number): string {
  let s = recolourSvg(svg, undefined, color);
  s = s.replace(/<(?:path|circle|ellipse|rect|polygon|line|polyline)\b[^>]*?\s(?:fill-opacity|opacity)="0?\.[0-4]\d*"[^>]*\/>/g, '');
  s = s.replace(/stroke-width\s*=\s*"[^"]*"/gi, `stroke-width="${width}"`);
  s = s.replace(/<g\b([^>]*)>/, (_m, attrs: string) => `<g${attrs.replace(/\s(?:stroke|stroke-width|stroke-linejoin|stroke-linecap)="[^"]*"/g, '')} stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round">`);
  return s;
}

export interface PrepareOptions {
  colors?: Record<string, string>;
  tint?: string;
  sticker?: { color: string; width: number };
}

/** The main picture and, for a sticker, the outline picture that goes under it. Both share one viewBox. */
export function prepareElement(svg: string, o: PrepareOptions): { main: string; under?: string } {
  const grown = o.sticker ? growViewBox(svg, o.sticker.width) : svg;
  const main = recolourSvg(grown, o.colors, o.tint);
  return { main, ...(o.sticker ? { under: outlineSvg(grown, o.sticker.color, o.sticker.width * 2) } : {}) };
}

/** All the colours an element uses, lower-cased, in order of first appearance (for building a recolour map). */
export function coloursOf(svg: string): string[] {
  const seen: string[] = [];
  svg.replace(COLOUR, (m, _p: string, _q: string, v: string) => {
    const k = v.toLowerCase();
    if (!KEEP.has(k) && !k.startsWith('url(') && !seen.includes(k)) seen.push(k);
    return m;
  });
  return seen;
}

/** Mixes a #RRGGBB colour towards black (negative) or white (positive) by `amount` 0..1. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)));
  return '#' + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();
}
