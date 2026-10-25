// Style assets are small SVG files. They are turned into ordinary path layers, so they are drawn like everything else
// and take their colours from the style's palette. Allowed: path (absolute M L C Q H V Z only), line, polyline, polygon,
// rect (no rounded corners), circle, ellipse. Colours are palette names ("accent", "text", ...) or "none", never hex.
import type { Layer, Role } from '../types';
import { circleD, pathLayer, scalePath, solidOf } from '../carousel/toolbox';
import type { Palette } from '../carousel/types';
import { PALETTE_ROLES } from './format';

export interface SvgShape {
  d: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cap: 'round' | 'butt';
  join: 'round' | 'miter';
  opacity: number;
}
export interface SvgAsset {
  name: string;
  width: number;
  height: number;
  shapes: SvgShape[];
}

const r1 = (n: number) => Math.round(n * 100) / 100;
const numAttr = (e: Element, k: string, d = 0) => (e.hasAttribute(k) ? Number(e.getAttribute(k)) : d);
const NAMES = new Set<string>([...PALETTE_ROLES, 'none']);

/** Parses one SVG file. Returns the asset or the plain-language problems. */
export function parseSvg(name: string, text: string): { asset?: SvgAsset; errors: string[] } {
  const errors: string[] = [];
  const err = (m: string) => errors.push(`Asset "${name}": ${m}`);
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (doc.querySelector('parsererror') || svg.tagName.toLowerCase() !== 'svg') return { errors: [`Asset "${name}": this is not a valid SVG file.`] };
  const vb = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v)) || vb[0] !== 0 || vb[1] !== 0 || vb[2] <= 0 || vb[3] <= 0) err('it needs a viewBox that starts at 0 0, for example viewBox="0 0 100 100".');
  const shapes: SvgShape[] = [];
  for (const e of Array.from(svg.querySelectorAll('*'))) {
    const tag = e.tagName.toLowerCase();
    let d = '';
    if (tag === 'path') {
      d = (e.getAttribute('d') ?? '').trim();
      if (!/^[MLCQHVZ0-9eE.,\s+-]+$/.test(d)) err('a <path> uses commands other than M L C Q H V Z in capital letters. Rewrite it with absolute commands (no arcs, no lower-case).');
    } else if (tag === 'line') d = `M ${numAttr(e, 'x1')} ${numAttr(e, 'y1')} L ${numAttr(e, 'x2')} ${numAttr(e, 'y2')}`;
    else if (tag === 'polyline' || tag === 'polygon') {
      const pts = (e.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
      if (pts.length < 4 || pts.length % 2 || pts.some((v) => !Number.isFinite(v))) err(`a <${tag}> has bad points.`);
      else d = pts.reduce((a, v, i) => a + (i % 2 === 0 ? `${i === 0 ? 'M' : 'L'} ${v}` : ` ${v} `), '').trim() + (tag === 'polygon' ? ' Z' : '');
    } else if (tag === 'rect') {
      if (e.hasAttribute('rx') || e.hasAttribute('ry')) err('a <rect> has rounded corners (rx). Use a <path> instead.');
      const x = numAttr(e, 'x'), y = numAttr(e, 'y'), w = numAttr(e, 'width'), h = numAttr(e, 'height');
      d = `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
    } else if (tag === 'circle') d = circleD(numAttr(e, 'cx'), numAttr(e, 'cy'), numAttr(e, 'r'));
    else if (tag === 'ellipse') {
      const cx = numAttr(e, 'cx'), cy = numAttr(e, 'cy'), rx = numAttr(e, 'rx'), ry = numAttr(e, 'ry');
      const kx = 0.5523 * rx, ky = 0.5523 * ry;
      d = `M ${r1(cx + rx)} ${cy} C ${r1(cx + rx)} ${r1(cy + ky)} ${r1(cx + kx)} ${r1(cy + ry)} ${cx} ${r1(cy + ry)} C ${r1(cx - kx)} ${r1(cy + ry)} ${r1(cx - rx)} ${r1(cy + ky)} ${r1(cx - rx)} ${cy} C ${r1(cx - rx)} ${r1(cy - ky)} ${r1(cx - kx)} ${r1(cy - ry)} ${cx} ${r1(cy - ry)} C ${r1(cx + kx)} ${r1(cy - ry)} ${r1(cx + rx)} ${r1(cy - ky)} ${r1(cx + rx)} ${cy} Z`;
    } else if (tag === 'svg' || tag === 'title' || tag === 'desc') continue;
    else {
      err(`it uses <${tag}>, which is not supported. Allowed: path, line, polyline, polygon, rect, circle, ellipse.`);
      continue;
    }
    if (!d) continue;
    const fill = e.getAttribute('fill') ?? 'none';
    const stroke = e.getAttribute('stroke') ?? 'none';
    for (const [k, v] of [['fill', fill], ['stroke', stroke]]) if (!NAMES.has(v)) err(`a <${tag}> has ${k}="${v}". Use a colour name from the palette (${PALETTE_ROLES.join(', ')}) or "none", so the graphic takes the style's colours.`);
    if (fill === 'none' && stroke === 'none') err(`a <${tag}> has neither fill nor stroke, so nothing would be drawn.`);
    const cap = e.getAttribute('stroke-linecap') === 'butt' ? 'butt' : 'round';
    const join = e.getAttribute('stroke-linejoin') === 'miter' ? 'miter' : 'round';
    shapes.push({ d, fill, stroke, strokeWidth: numAttr(e, 'stroke-width', 1), cap, join, opacity: e.hasAttribute('opacity') ? numAttr(e, 'opacity') : 1 });
  }
  if (shapes.length === 0) err('it contains no shapes.');
  return errors.length ? { errors } : { asset: { name, width: vb[2], height: vb[3], shapes }, errors };
}

/** The asset as path layers, `width` px wide at (x, y). Colours come from the palette. */
export function assetLayers(asset: SvgAsset, id: string, x: number, y: number, width: number, pal: Palette, role: Role = 'decor', strokeScale = 1): Layer[] {
  const k = width / asset.width;
  const colour = (n: string) => (n === 'bg' ? solidOf(pal.bg) : (pal as unknown as Record<string, string>)[n]);
  return asset.shapes.map((s, i) =>
    pathLayer(`${id}-${i + 1}`, role, x, y, asset.width * k, asset.height * k, scalePath(s.d, k), {
      ...(s.fill !== 'none' ? { fill: colour(s.fill) } : {}),
      ...(s.stroke !== 'none' ? { stroke: { color: colour(s.stroke), width: Math.max(1, s.strokeWidth * k * strokeScale), cap: s.cap, join: s.join } } : {}),
      opacity: s.opacity,
    }),
  );
}
