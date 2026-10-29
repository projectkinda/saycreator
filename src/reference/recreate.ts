// Recreate mode: the model draws a carousel reference as one SVG slide; the code makes it safe, turns it into editable plan layers (text with roles, graphic
// groups as path sub-layers, background and shapes), and fills those layers with the person's own words. The reference pixels are never embedded anywhere.
import type { FontFamily, Layer, ShapeLayer, TextLayer } from '../image-engine/types';
import { FONT_WEIGHTS, loadFonts } from '../image-engine/fonts';
import { layoutText } from '../image-engine/draw/text';
import { activeReference } from './active';
import { templateOfStyle } from './templates';
import { ACTIVE_STYLE } from './active';
import type { ReaderImage, ReferenceReader } from './reader';

export const FONT_NAMES = Object.keys(FONT_WEIGHTS) as FontFamily[];
export const ROLES = ['kicker', 'tag', 'title', 'body', 'caption', 'number'] as const;
export type RecreateRole = (typeof ROLES)[number];
/** Calls the recreate flow may make for one reference: the read, one look-and-fix by itself, and one more when the person presses Improve. */
export const RECREATE_CAP = 3;
export const SVG_LIMIT = 200_000;

export interface RecreateCtx {
  w: number;
  h: number;
  /** The text roles the person's own slides have (said to the model so the roles it uses are ones that can be filled). */
  ownRoles: string[];
}

const fontLine = () => FONT_NAMES.map((f) => `"${f}" (weights ${FONT_WEIGHTS[f].join(', ')})`).join('; ');
const RULES = [
  'Allowed elements only: svg, g, path, circle, ellipse, rect, line, polyline, polygon, defs, linearGradient, radialGradient, stop, clipPath, mask, pattern, text, tspan, filter (with feGaussianBlur, feTurbulence, feColorMatrix, feDropShadow, feOffset). No script, no event attributes, no image elements, no links or external references, no data: URLs. The reference picture is never embedded.',
  'Every piece of text is a real <text> element with a data-role from: kicker, tag, title, body, caption, number. Write the words you read. One <text> per line. Use font-family names ONLY from the bundled list; if none fits a text, use the nearest one and add data-font-wish="the family you would have wanted".',
  'Every icon, doodle or logo is a <g id="short-name"> of plain paths and shapes with fill and stroke colours. Dots, bars and panels are plain elements. Colours are plain hex values. Put the background first as a full-size <rect>.',
];
export function buildRecreatePrompt(x: RecreateCtx): string {
  return [
    '[recreate:new] You recreate a carousel slide from a reference picture as ONE SVG document. You are drawing, not describing. Reply with the SVG only (no code fence, no explanation).',
    `The slide is ${x.w} x ${x.h} px (4:5). Use viewBox="0 0 686 857" (or 0 0 ${x.w} ${x.h}) and match the reference's layout, proportions, colours, text sizes and spacing as exactly as you can. The reference is the first picture (the file in the current folder; look at it with your Read tool).`,
    `Bundled fonts: ${fontLine()}.`,
    ...RULES,
    x.ownRoles.length ? `The person's own slides have these text roles: ${x.ownRoles.join(', ')}; prefer those roles.` : '',
  ].filter(Boolean).join('\n');
}
export function buildFixPrompt(x: RecreateCtx, feedback: string): string {
  return [
    '[recreate:fix] You recreated a carousel slide as SVG. You now get TWO pictures, two files in the current folder: reference.jpg (the REFERENCE) and render.jpg (a render of YOUR SVG). Look at BOTH with your Read tool, then compare them carefully: positions, sizes, colours, text, fonts, graphics, spacing. Reply with the corrected, complete SVG only.',
    `The slide is ${x.w} x ${x.h} px (4:5). Bundled fonts: ${fontLine()}.`,
    ...RULES,
    feedback.trim() ? `The person says: "${feedback.trim().slice(0, 300)}"` : '',
  ].filter(Boolean).join('\n');
}

// ----- sanitising -----

const TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'text', 'tspan', 'filter', 'fegaussianblur', 'feturbulence', 'fecolormatrix', 'fedropshadow', 'feoffset']);
const ATTRS = new Set(['id', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'fx', 'fy', 'points', 'd', 'transform', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline', 'textlength', 'lengthadjust', 'data-role', 'data-font-wish', 'viewbox', 'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'clip-path', 'mask', 'filter', 'stddeviation', 'basefrequency', 'numoctaves', 'type', 'values', 'dx', 'dy', 'flood-color', 'flood-opacity', 'in', 'in2', 'result', 'patternunits', 'patterntransform', 'clippathunits', 'seed']);
const CSS_PROPS = new Set(['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'opacity', 'text-anchor', 'fill-opacity', 'stroke-opacity']);
const REF_ATTRS = new Set(['fill', 'stroke', 'filter', 'mask', 'clip-path']);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function mapFont(family: string): FontFamily {
  const f = family.split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
  const exact = FONT_NAMES.find((n) => n.toLowerCase() === f);
  if (exact) return exact;
  if (/bebas|impact|oswald|anton|condensed|league gothic/.test(f)) return 'Bebas Neue';
  if (/caveat|brush|script|hand|marker/.test(f)) return 'Caveat Brush';
  if (/mono|courier|menlo|consolas|code/.test(f)) return 'Space Mono';
  if (/serif|georgia|times|newsreader|charter|garamond|playfair|instrument serif/.test(f) && !/sans/.test(f)) return 'Instrument Serif Italic';
  if (/schibsted|grotesk|neue|archivo|dm sans|poppins/.test(f)) return /hanken/.test(f) ? 'Hanken Grotesk' : 'Schibsted Grotesk';
  if (/hanken/.test(f)) return 'Hanken Grotesk';
  return 'Instrument Sans';
}
const nearestWeight = (font: FontFamily, w: number) => FONT_WEIGHTS[font].reduce((b, x) => (Math.abs(x - w) < Math.abs(b - w) ? x : b));

export interface Sanitised {
  svg: string | null;
  reasons: string[];
  stats: { texts: number; groups: number; shapes: number; paths: number };
  wished: { wish: string; used: string }[];
}

function safeValue(name: string, v: string): boolean {
  if (/javascript:|data:|@import|expression\(|<|&#/i.test(v)) return false;
  if (/url\(/i.test(v)) return REF_ATTRS.has(name) && /^url\(#[\w-]+\)$/.test(v.trim());
  if (/https?:|\/\//i.test(v)) return false;
  return true;
}

/** Whitelist rebuild: nothing in the answer is kept unless it is on the lists above. The reasons say, in plain words, why a picture was refused or what was left out. */
export function sanitizeSvg(raw: string): Sanitised {
  const out: Sanitised = { svg: null, reasons: [], stats: { texts: 0, groups: 0, shapes: 0, paths: 0 }, wished: [] };
  const m = /<svg[\s\S]*<\/svg>/i.exec(raw);
  if (!m) return { ...out, reasons: ['The answer has no <svg> picture in it.'] };
  if (m[0].length > SVG_LIMIT) return { ...out, reasons: [`The picture is ${Math.round(m[0].length / 1000)} kB, over the ${SVG_LIMIT / 1000} kB limit.`] };
  const doc = new DOMParser().parseFromString(m[0], 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length) return { ...out, reasons: ['The SVG could not be read (it is not well-formed).'] };
  const root = doc.documentElement;
  // The <style> rules (class selectors only) are copied onto the elements that use the class, then dropped.
  const rules = new Map<string, Record<string, string>>();
  for (const st of Array.from(doc.getElementsByTagName('style'))) {
    for (const r of (st.textContent ?? '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const decls: Record<string, string> = {};
      for (const d of r[2].split(';')) {
        const [p, ...v] = d.split(':');
        const prop = p?.trim().toLowerCase();
        const val = v.join(':').trim();
        if (prop && CSS_PROPS.has(prop) && safeValue(prop, val)) decls[prop] = val;
      }
      for (const sel of r[1].split(',')) {
        const mm = /^\s*\.([\w-]+)\s*$/.exec(sel);
        if (mm) rules.set(mm[1], { ...(rules.get(mm[1]) ?? {}), ...decls });
      }
    }
  }
  let nodes = 0;
  const dropped = new Set<string>();
  const build = (el: Element): string => {
    const tag = el.localName.toLowerCase();
    if (!TAGS.has(tag)) {
      dropped.add(tag);
      return '';
    }
    if (++nodes > 1500) return '';
    const attrs: Record<string, string> = {};
    const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    for (const c of cls) Object.assign(attrs, rules.get(c) ?? {});
    for (const a of Array.from(el.attributes)) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on') || n === 'href' || n.endsWith(':href') || n === 'style' || n === 'class' || n.startsWith('xmlns')) continue;
      if (!ATTRS.has(n)) {
        dropped.add(`@${n}`);
        continue;
      }
      if (!safeValue(n, a.value)) {
        dropped.add(`@${n}`);
        continue;
      }
      attrs[n === 'viewbox' ? 'viewBox' : n === 'textlength' ? 'textLength' : n === 'lengthadjust' ? 'lengthAdjust' : n] = a.value;
    }
    // Inline style="" is never read; the font is always one of the bundled ones.
    if (tag === 'text' || tag === 'tspan' || attrs['font-family']) {
      if (attrs['font-family']) {
        const used = mapFont(attrs['font-family']);
        const first = attrs['font-family'].split(',')[0].replace(/['"]/g, '').trim();
        const wish = attrs['data-font-wish'] ?? (first.toLowerCase() !== used.toLowerCase() ? first : '');
        if (wish && !out.wished.some((w) => w.wish === wish)) out.wished.push({ wish, used });
        attrs['font-family'] = used;
        if (attrs['font-weight']) attrs['font-weight'] = String(nearestWeight(used, Number(attrs['font-weight']) || 400));
      }
    }
    if (tag === 'text') out.stats.texts++;
    else if (tag === 'g') out.stats.groups++;
    else if (['rect', 'circle', 'ellipse'].includes(tag)) out.stats.shapes++;
    else if (['path', 'line', 'polyline', 'polygon'].includes(tag)) out.stats.paths++;
    let inner = '';
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType === 3 && (tag === 'text' || tag === 'tspan')) inner += esc((c.textContent ?? '').slice(0, 400));
      else if (c.nodeType === 1) inner += build(c as Element);
    }
    const at = Object.entries(attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
    return `<${el.localName}${at}>${inner}</${el.localName}>`;
  };
  if (root.localName.toLowerCase() !== 'svg') return { ...out, reasons: ['The answer is not an SVG picture.'] };
  let svg = build(root);
  const vb = root.getAttribute('viewBox') ?? (root.getAttribute('width') && root.getAttribute('height') ? `0 0 ${parseFloat(root.getAttribute('width')!)} ${parseFloat(root.getAttribute('height')!)}` : '');
  if (!/^[\d.\s-]+$/.test(vb) || vb.trim().split(/\s+/).length !== 4) return { ...out, reasons: ['The SVG has no usable viewBox, so its size is unknown.'] };
  svg = svg.replace(/^<svg[^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.trim()}">`);
  if (dropped.size) out.reasons.push(`Left out because it is not allowed: ${[...dropped].slice(0, 8).join(', ')}.`);
  const drawn = out.stats.texts + out.stats.shapes + out.stats.paths;
  if (drawn < 2) return { ...out, svg: null, reasons: [...out.reasons, `The picture is nearly empty: only ${drawn} drawn part${drawn === 1 ? '' : 's'} (text, shapes or paths) were found.`] };
  return { ...out, svg };
}

// ----- paths -----

type Seg = { c: 'M' | 'L' | 'C' | 'Q' | 'A' | 'Z'; a: number[] };
type Mat = [number, number, number, number, number, number];
const ID: Mat = [1, 0, 0, 1, 0, 0];
const mul = (m: Mat, n: Mat): Mat => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const pt = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const scaleOf = (m: Mat) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

export function parseTransform(t: string | null): Mat {
  let m = ID;
  for (const r of (t ?? '').matchAll(/(translate|scale|rotate|matrix)\s*\(([^)]*)\)/g)) {
    const a = r[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (a.some((v) => !Number.isFinite(v))) continue;
    if (r[1] === 'translate') m = mul(m, [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0]);
    else if (r[1] === 'scale') m = mul(m, [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]);
    else if (r[1] === 'rotate') {
      const c = Math.cos(((a[0] ?? 0) * Math.PI) / 180);
      const s = Math.sin(((a[0] ?? 0) * Math.PI) / 180);
      m = mul(m, [1, 0, 0, 1, a[1] ?? 0, a[2] ?? 0]);
      m = mul(m, [c, s, -s, c, 0, 0]);
      m = mul(m, [1, 0, 0, 1, -(a[1] ?? 0), -(a[2] ?? 0)]);
    } else if (a.length === 6) m = mul(m, a as Mat);
  }
  return m;
}

/** An SVG arc as cubic curves (the standard end-point to centre conversion, one curve per quarter turn). */
function arcToCubics(x1: number, y1: number, rx0: number, ry0: number, phiDeg: number, fa: boolean, fs: boolean, x2: number, y2: number): number[][] {
  if (!rx0 || !ry0 || (x1 === x2 && y1 === y2)) return [[x1, y1, x2, y2, x2, y2]];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  let rx = Math.abs(rx0);
  let ry = Math.abs(ry0);
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dth > 0) dth -= 2 * Math.PI;
  else if (fs && dth < 0) dth += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2)));
  const d = dth / n;
  const t = (4 / 3) * Math.tan(d / 4);
  const at = (px: number, py: number): [number, number] => [cx + cos * rx * px - sin * ry * py, cy + sin * rx * px + cos * ry * py];
  const out: number[][] = [];
  let a = th1;
  for (let i = 0; i < n; i++) {
    const b = a + d;
    const p1 = at(Math.cos(a) - t * Math.sin(a), Math.sin(a) + t * Math.cos(a));
    const p2 = at(Math.cos(b) + t * Math.sin(b), Math.sin(b) - t * Math.cos(b));
    const p3 = at(Math.cos(b), Math.sin(b));
    out.push([...p1, ...p2, ...p3]);
    a = b;
  }
  return out;
}

const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
/** A path as absolute segments (M L C Q A Z only). */
export function parsePath(d: string): Seg[] {
  const toks = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const segs: Seg[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lcx = 0;
  let lcy = 0;
  let prev = '';
  let cmd = '';
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    else if (!cmd) break;
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    if (up === 'Z') {
      segs.push({ c: 'Z', a: [] });
      cx = sx;
      cy = sy;
      prev = 'Z';
      continue;
    }
    const n = ARGS[up];
    const a = toks.slice(i, i + n).map(Number);
    if (a.length < n || a.some((v) => !Number.isFinite(v))) break;
    i += n;
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    if (up === 'M') {
      cx = a[0] + ox;
      cy = a[1] + oy;
      sx = cx;
      sy = cy;
      segs.push({ c: 'M', a: [cx, cy] });
      cmd = rel ? 'l' : 'L';
    } else if (up === 'L') {
      cx = a[0] + ox;
      cy = a[1] + oy;
      segs.push({ c: 'L', a: [cx, cy] });
    } else if (up === 'H') {
      cx = a[0] + ox;
      segs.push({ c: 'L', a: [cx, cy] });
    } else if (up === 'V') {
      cy = a[0] + oy;
      segs.push({ c: 'L', a: [cx, cy] });
    } else if (up === 'C') {
      segs.push({ c: 'C', a: [a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy, a[4] + ox, a[5] + oy] });
      lcx = a[2] + ox;
      lcy = a[3] + oy;
      cx = a[4] + ox;
      cy = a[5] + oy;
    } else if (up === 'S') {
      const x1 = prev === 'C' ? 2 * cx - lcx : cx;
      const y1 = prev === 'C' ? 2 * cy - lcy : cy;
      segs.push({ c: 'C', a: [x1, y1, a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy] });
      lcx = a[0] + ox;
      lcy = a[1] + oy;
      cx = a[2] + ox;
      cy = a[3] + oy;
    } else if (up === 'Q') {
      segs.push({ c: 'Q', a: [a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy] });
      lcx = a[0] + ox;
      lcy = a[1] + oy;
      cx = a[2] + ox;
      cy = a[3] + oy;
    } else if (up === 'T') {
      const x1 = prev === 'Q' ? 2 * cx - lcx : cx;
      const y1 = prev === 'Q' ? 2 * cy - lcy : cy;
      segs.push({ c: 'Q', a: [x1, y1, a[0] + ox, a[1] + oy] });
      lcx = x1;
      lcy = y1;
      cx = a[0] + ox;
      cy = a[1] + oy;
    } else {
      // The plan's paths have no arcs: an arc is drawn as up to four curves.
      for (const c of arcToCubics(cx, cy, a[0], a[1], a[2], a[3] !== 0, a[4] !== 0, a[5] + ox, a[6] + oy)) segs.push({ c: 'C', a: c });
      cx = a[5] + ox;
      cy = a[6] + oy;
    }
    prev = up === 'S' ? 'C' : up === 'T' ? 'Q' : up;
  }
  return segs;
}
export function transformSegs(segs: Seg[], m: Mat): Seg[] {
  const k = scaleOf(m);
  const rot = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
  const flip = m[0] * m[3] - m[1] * m[2] < 0;
  return segs.map((s) => {
    if (s.c === 'Z') return s;
    if (s.c === 'A') {
      const [x, y] = pt(m, s.a[5], s.a[6]);
      return { c: 'A', a: [s.a[0] * k, s.a[1] * k, s.a[2] + rot, s.a[3], flip ? 1 - s.a[4] : s.a[4], x, y] };
    }
    const out: number[] = [];
    for (let i = 0; i < s.a.length; i += 2) out.push(...pt(m, s.a[i], s.a[i + 1]));
    return { c: s.c, a: out };
  });
}
export const segsToD = (segs: Seg[]) => segs.map((s) => (s.c === 'Z' ? 'Z' : `${s.c}${s.a.map((v) => Math.round(v * 100) / 100).join(' ')}`)).join(' ');

// ----- layers -----

/** A layer of the recreated slide. Colours may be palette tokens like "$accent"; the layer's `name` is its role (text) or its group (graphics). */
export type RLayer = Layer & { name: string };
export interface RecreateSpec {
  layers: RLayer[];
  palette: Record<string, string>;
  canvas: { w: number; h: number };
  notes: string[];
}

const isHex = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
const norm = (c: string) => (/^#[0-9a-fA-F]{3}$/.test(c) ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c).toUpperCase();

interface Inh {
  fill: string;
  stroke: string;
  sw: number;
  cap?: string;
  join?: string;
  opacity: number;
  font: FontFamily;
  size: number;
  weight: number;
  anchor: string;
  role?: string;
  gid: string;
  ls: number;
}

function measure(text: string, font: FontFamily, weight: number, size: number): number {
  const c = new OffscreenCanvas(8, 8).getContext('2d')!;
  c.font = `${weight} ${size}px "${font}"`;
  return c.measureText(text).width;
}

/** The clean SVG as plan layers at the target size. Fonts must be loaded (loadFonts) before this is called. */
export function svgToLayers(svg: string, W: number, H: number): { layers: RLayer[]; notes: string[] } {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const vb = (root.getAttribute('viewBox') ?? '0 0 1 1').split(/\s+/).map(Number);
  const s = W / vb[2];
  const notes: string[] = [];
  const grads = new Map<string, { angle: number; stops: { at: number; color: string }[] }>();
  for (const g of Array.from(doc.getElementsByTagName('linearGradient'))) {
    const x1 = parseFloat(g.getAttribute('x1') ?? '0');
    const y1 = parseFloat(g.getAttribute('y1') ?? '0');
    const x2 = parseFloat(g.getAttribute('x2') ?? '1');
    const y2 = parseFloat(g.getAttribute('y2') ?? '0');
    const stops = Array.from(g.getElementsByTagName('stop')).map((st) => ({ at: Math.min(1, Math.max(0, parseFloat(st.getAttribute('offset') ?? '0') / (/%/.test(st.getAttribute('offset') ?? '') ? 100 : 1))), color: st.getAttribute('stop-color') ?? '#000000' }));
    if (g.id && stops.length >= 2) grads.set(g.id, { angle: Math.round((Math.atan2(x2 - x1, -(y2 - y1)) * 180) / Math.PI + 360) % 360, stops });
  }
  const colour = (v: string | null, dflt: string): string => {
    if (!v) return dflt;
    return v.trim();
  };
  const fillOf = (v: string): ShapeLayer['fill'] | null => {
    const u = /^url\(#([\w-]+)\)$/.exec(v);
    if (u) {
      const g = grads.get(u[1]);
      return g ? { type: 'linear', angle: g.angle, stops: g.stops } : null;
    }
    return v === 'none' ? null : v;
  };
  const layers: RLayer[] = [];
  const texts: { x: number; y: number; size: number; weight: number; font: FontFamily; fill: string; anchor: string; line: string; role?: string; gid: string; ls: number; textLength?: number; opacity: number; parent: Element }[] = [];
  let n = 0;
  let effects = 0;
  let invisible = 0;
  const walk = (el: Element, M: Mat, inh: Inh) => {
    const tag = el.localName.toLowerCase();
    if (['defs', 'lineargradient', 'radialgradient', 'clippath', 'mask', 'pattern', 'filter'].includes(tag)) return;
    const m = mul(M, parseTransform(el.getAttribute('transform')));
    const cur: Inh = {
      fill: colour(el.getAttribute('fill'), inh.fill),
      stroke: colour(el.getAttribute('stroke'), inh.stroke),
      sw: el.getAttribute('stroke-width') ? parseFloat(el.getAttribute('stroke-width')!) : inh.sw,
      cap: el.getAttribute('stroke-linecap') ?? inh.cap,
      join: el.getAttribute('stroke-linejoin') ?? inh.join,
      opacity: inh.opacity * (el.getAttribute('opacity') ? Math.min(1, Math.max(0, parseFloat(el.getAttribute('opacity')!))) : 1),
      font: el.getAttribute('font-family') ? mapFont(el.getAttribute('font-family')!) : inh.font,
      size: el.getAttribute('font-size') ? parseFloat(el.getAttribute('font-size')!) : inh.size,
      weight: el.getAttribute('font-weight') ? Number(el.getAttribute('font-weight')) || inh.weight : inh.weight,
      anchor: el.getAttribute('text-anchor') ?? inh.anchor,
      role: el.getAttribute('data-role') ?? inh.role,
      gid: tag === 'g' && el.id ? el.id : inh.gid,
      ls: el.getAttribute('letter-spacing') ? parseFloat(el.getAttribute('letter-spacing')!) : inh.ls,
    };
    if (el.getAttribute('filter')) effects++;
    const num = (a: string, d = 0) => parseFloat(el.getAttribute(a) ?? '') || d;
    const stroke = cur.stroke !== 'none' && cur.sw > 0 ? { color: cur.stroke, width: Math.max(1, Math.round(cur.sw * scaleOf(m) * 10) / 10) } : undefined;
    if (tag === 'rect' || tag === 'circle' || tag === 'ellipse') {
      const w = tag === 'rect' ? num('width') : tag === 'circle' ? 2 * num('r') : 2 * num('rx');
      const h = tag === 'rect' ? num('height') : tag === 'circle' ? 2 * num('r') : 2 * num('ry');
      const x0 = tag === 'rect' ? num('x') : num('cx') - w / 2;
      const y0 = tag === 'rect' ? num('y') : num('cy') - h / 2;
      const [cx, cy] = pt(m, x0 + w / 2, y0 + h / 2);
      const pw = w * Math.hypot(m[0], m[1]);
      const ph = h * Math.hypot(m[2], m[3]);
      const fill = fillOf(cur.fill) ?? 'rgba(0,0,0,0)';
      if (fill === 'rgba(0,0,0,0)' && !stroke) {
        invisible++;
        return;
      }
      const full = tag === 'rect' && pw >= W * 0.97 && ph >= H * 0.97;
      layers.push({ kind: 'shape', id: full && !layers.some((l) => l.id === 'bg') ? 'bg' : `shape${++n}`, name: full ? 'background' : cur.gid || 'shape', role: full ? 'decor' : 'content', x: cx - pw / 2, y: cy - ph / 2, width: pw, height: ph, rotation: Math.round((Math.atan2(m[1], m[0]) * 180) / Math.PI * 10) / 10, opacity: cur.opacity, shape: tag === 'rect' ? 'rect' : 'ellipse', fill, ...(stroke ? { stroke } : {}), ...(tag === 'rect' && num('rx') ? { radius: num('rx') * scaleOf(m) } : {}) } as RLayer);
    } else if (tag === 'path' || tag === 'line' || tag === 'polyline' || tag === 'polygon') {
      let d = el.getAttribute('d') ?? '';
      if (tag === 'line') d = `M${num('x1')} ${num('y1')} L${num('x2')} ${num('y2')}`;
      if (tag === 'polyline' || tag === 'polygon') {
        const p = (el.getAttribute('points') ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
        d = p.length >= 4 ? `M${p[0]} ${p[1]} ${p.slice(2).reduce((a, v, i) => a + (i % 2 ? ` ${v}` : ` L${v}`), '')}${tag === 'polygon' ? ' Z' : ''}` : '';
      }
      const segs = d ? transformSegs(parsePath(d), m) : [];
      if (segs.length >= 2) {
        // The path's box is where its points are; its own coordinates are inside that box.
        const xs: number[] = [];
        const ys: number[] = [];
        for (const sg of segs) if (sg.c !== 'Z') for (let i = 0; i < sg.a.length - (sg.c === 'A' ? 0 : 0); i += 2) if (sg.c !== 'A') { xs.push(sg.a[i]); ys.push(sg.a[i + 1]); } else if (i === 5) { xs.push(sg.a[5]); ys.push(sg.a[6]); }
        if (xs.length) {
          const x0 = Math.min(...xs);
          const y0 = Math.min(...ys);
          const moved = transformSegs(segs, [1, 0, 0, 1, -x0, -y0]);
          const fill = fillOf(cur.fill);
          // A path with neither a fill nor a stroke draws nothing (and the plan refuses it): it is left out and counted.
          if (!(typeof fill === 'string' && tag !== 'line') && !stroke) {
            invisible++;
            return;
          }
          layers.push({ kind: 'path', id: `${cur.gid || 'path'}:${++n}`, name: cur.gid || 'drawing', role: 'decor', x: x0, y: y0, width: Math.max(1, Math.max(...xs) - x0), height: Math.max(1, Math.max(...ys) - y0), rotation: 0, opacity: cur.opacity, d: segsToD(moved), ...(typeof fill === 'string' && tag !== 'line' ? { fill } : {}), ...(stroke ? { stroke: { ...stroke, cap: (cur.cap === 'butt' ? 'butt' : 'round') as 'round' | 'butt', join: (cur.join === 'miter' ? 'miter' : 'round') as 'round' | 'miter' } } : {}) } as RLayer);
        }
      }
    } else if (tag === 'text') {
      const [x, y] = pt(m, num('x'), num('y'));
      const line = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (line) texts.push({ x, y, size: cur.size * scaleOf(m), weight: cur.weight, font: cur.font, fill: cur.fill, anchor: cur.anchor, line, role: cur.role, gid: cur.gid, ls: cur.ls * scaleOf(m), textLength: el.getAttribute('textLength') ? parseFloat(el.getAttribute('textLength')!) * scaleOf(m) : undefined, opacity: cur.opacity, parent: el.parentElement! });
      return;
    }
    for (const c of Array.from(el.children)) walk(c, m, cur);
  };
  walk(root, [s, 0, 0, s, -vb[0] * s, -vb[1] * s], { fill: '#000000', stroke: 'none', sw: 1, opacity: 1, font: 'Instrument Sans', size: 16, weight: 400, anchor: 'start', gid: '', ls: 0 });
  // Lines of the same block (same place, size and look, one under the other) become one text layer.
  const blocks: (typeof texts)[] = [];
  for (const t of texts) {
    const b = blocks[blocks.length - 1];
    const p = b?.[b.length - 1];
    if (p && p.parent === t.parent && p.anchor === t.anchor && Math.abs(p.size - t.size) < 1 && p.weight === t.weight && p.fill === t.fill && Math.abs(p.x - t.x) < 3 && t.y - p.y > p.size * 0.9 && t.y - p.y < p.size * 2.2) b.push(t);
    else blocks.push([t]);
  }
  const roleOf = (b: typeof texts, biggest: number): string => {
    const r = b[0].role;
    if ((ROLES as readonly string[]).includes(r ?? '')) return r!;
    const line = b[0].line;
    if (b[0].size >= biggest * 0.95) return 'title';
    if (/^\d{1,3}$/.test(line)) return 'number';
    if (/^(step|tip|part)\b/i.test(line)) return 'tag';
    return b.length > 1 || b[0].size >= 24 ? 'body' : 'caption';
  };
  const biggest = Math.max(0, ...texts.map((t) => t.size));
  const used = new Set<string>();
  for (const b of blocks) {
    const t = b[0];
    const step = b.length > 1 ? (b[b.length - 1].y - b[0].y) / (b.length - 1) : t.size * 1.2;
    const lh = Math.min(1.6, Math.max(1, step / t.size));
    const wid = Math.max(...b.map((l) => l.textLength ?? measure(l.line, t.font, t.weight, t.size) + Math.max(0, l.line.length - 1) * l.ls));
    const w = Math.ceil(wid * 1.04) + 8;
    const x = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
    const role = roleOf(b, biggest);
    let id = role;
    for (let k = 2; used.has(id); k++) id = `${role}${k}`;
    used.add(id);
    const top = t.y - t.size * 0.82;
    layers.push({ kind: 'text', id, name: role, role: 'content', x, y: top, width: w, height: Math.ceil(t.size * lh * b.length + t.size * 0.2), rotation: 0, opacity: t.opacity, text: b.map((l) => l.line).join('\n'), style: { font: t.font, weight: nearestWeight(t.font, t.weight), size: Math.round(t.size), color: t.fill, align: t.anchor === 'middle' ? 'center' : t.anchor === 'end' ? 'right' : 'left', valign: 'top', lineHeight: Math.round(lh * 100) / 100 }, autoFit: { minSize: Math.min(Math.round(t.size), 32) } } as RLayer);
    if (t.ls) notes.push(`Letter spacing on the ${role} text is not drawn (the toolbox has none).`);
  }
  if (invisible) notes.push(`${invisible} part${invisible === 1 ? '' : 's'} of the picture had neither a fill nor a line, so nothing was drawn for ${invisible === 1 ? 'it' : 'them'}.`);
  if (effects) notes.push(`${effects} filter effect${effects === 1 ? '' : 's'} (blur, shadow, grain) in the picture ${effects === 1 ? 'was' : 'were'} not applied to the layers.`);
  // Graphics first, text on top (the order of the picture is kept within each).
  layers.sort((a, b) => (a.kind === 'text' ? 1 : 0) - (b.kind === 'text' ? 1 : 0));
  return { layers, notes };
}

// ----- palette tokens -----

const colourFields = (l: Layer): string[] => {
  const o: string[] = [];
  if (l.kind === 'shape') {
    if (typeof l.fill === 'string') o.push(l.fill);
    else o.push(...l.fill.stops.map((s) => s.color));
    if (l.stroke) o.push(l.stroke.color);
  } else if (l.kind === 'path') {
    if (l.fill) o.push(l.fill);
    if (l.stroke) o.push(l.stroke.color);
  } else if (l.kind === 'text') o.push(l.style.color);
  else if (l.kind === 'element' && l.tint) o.push(l.tint);
  return o;
};
const mapColours = (l: RLayer, f: (c: string) => string): RLayer => {
  const x = JSON.parse(JSON.stringify(l)) as RLayer;
  if (x.kind === 'shape') {
    if (typeof x.fill === 'string') x.fill = f(x.fill);
    else x.fill = { ...x.fill, stops: x.fill.stops.map((s) => ({ ...s, color: f(s.color) })) };
    if (x.stroke) x.stroke.color = f(x.stroke.color);
  } else if (x.kind === 'path') {
    if (x.fill) x.fill = f(x.fill);
    if (x.stroke) x.stroke.color = f(x.stroke.color);
  } else if (x.kind === 'text') x.style.color = f(x.style.color);
  else if (x.kind === 'element' && x.tint) x.tint = f(x.tint);
  return x;
};
/** The colours that matter become named palette entries (bg, text, accent, accent2, ...), and the layers use the names. */
export function tokenise(layers: RLayer[]): { layers: RLayer[]; palette: Record<string, string> } {
  const count = new Map<string, number>();
  for (const l of layers) for (const c of colourFields(l)) if (isHex(norm(c)) && /^#/.test(c)) count.set(norm(c), (count.get(norm(c)) ?? 0) + 1);
  const bgLayer = layers.find((l) => l.id === 'bg');
  const bg = bgLayer && bgLayer.kind === 'shape' && typeof bgLayer.fill === 'string' && /^#/.test(bgLayer.fill) ? norm(bgLayer.fill) : [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const textC = new Map<string, number>();
  for (const l of layers) if (l.kind === 'text' && /^#/.test(l.style.color)) textC.set(norm(l.style.color), (textC.get(norm(l.style.color)) ?? 0) + 1);
  const text = [...textC.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const palette: Record<string, string> = {};
  if (bg) palette.bg = bg;
  if (text && text !== bg) palette.text = text;
  let k = 0;
  for (const [c] of [...count.entries()].sort((a, b) => b[1] - a[1])) {
    if (Object.values(palette).includes(c) || k >= 4) continue;
    palette[k === 0 ? 'accent' : `accent${k + 1}`] = c;
    k++;
  }
  const byColour = new Map(Object.entries(palette).map(([r, c]) => [c, `$${r}`]));
  return { layers: layers.map((l) => mapColours(l, (c) => (/^#/.test(c) ? (byColour.get(norm(c)) ?? c) : c))), palette };
}
export const resolveTokens = (layers: RLayer[], palette: Record<string, string>): RLayer[] => layers.map((l) => mapColours(l, (c) => (c.startsWith('$') ? (palette[c.slice(1)] ?? '#000000') : c)));

// ----- the person's own words in the layers -----

type SlideLike = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
export function textsOf(s: SlideLike, handle: string): Partial<Record<RecreateRole, string>> {
  const items = Array.isArray(s.items) ? (s.items as unknown[]).map(str).filter(Boolean) : [];
  const body = str(s.body) || str(s.sub) || str(s.note) || str(s.cta) || items.join('\n') || str(s.author);
  return {
    kicker: str(s.kicker) || handle,
    tag: typeof s.number === 'number' ? `STEP ${s.number}` : '',
    title: str(s.headline) || str(s.value) || str(s.quote) || str(s.label),
    body,
    caption: str(s.label) && str(s.value) ? str(s.label) : items[0] ?? '',
    number: typeof s.number === 'number' ? String(s.number) : str(s.value),
  };
}

/** The recreated layers with the slide's own words in the text slots. Text that does not fit shrinks (never under 32 px) or wraps, and is said in `notes`. */
export function fillRecreate(rec: RecreateSpec, texts: Partial<Record<RecreateRole, string>>): { layers: Layer[]; notes: string[] } {
  const notes: string[] = [];
  const layers = resolveTokens(rec.layers, rec.palette).map((l): Layer => {
    if (l.kind !== 'text') return l;
    const role = l.name as RecreateRole;
    if (!(ROLES as readonly string[]).includes(role) || !(role in texts)) return l;
    const text = texts[role] ?? '';
    if (!text) return { ...l, visible: false };
    const filled = { ...l, text, autoFit: { minSize: 32 } } as TextLayer;
    try {
      const b = layoutText(filled);
      if (b.size < l.style.size * 0.97) notes.push(`The ${role} text was made smaller (${l.style.size} to ${Math.round(b.size)} px) to fit its place.`);
      if (b.lines.length > l.text.split('\n').length) notes.push(`The ${role} text wraps onto ${b.lines.length} lines.`);
      if (b.size <= 32 && b.height > l.height * 1.1) notes.push(`The ${role} text does not fit its place even at the smallest size (32 px).`);
    } catch {
      /* fonts not ready: no note */
    }
    return filled;
  });
  return { layers, notes };
}

/** The recreated look to use for a style name: the active one, or a saved template's. */
export function recreateFor(styleName: string): RecreateSpec | null {
  if (styleName === ACTIVE_STYLE) return activeReference()?.recreate ?? null;
  return templateOfStyle(styleName)?.recreate ?? null;
}

// ----- the calls -----

export interface RecreateResult {
  svg: string;
  layers: RLayer[];
  palette: Record<string, string>;
  notes: string[];
  wished: { wish: string; used: string }[];
}

/** From the model's answer to layers, or the reasons in plain words. */
export async function answerToLayers(text: string, ctx: RecreateCtx): Promise<{ ok: true; result: RecreateResult } | { ok: false; reasons: string[] }> {
  const s = sanitizeSvg(text);
  if (!s.svg) return { ok: false, reasons: [...s.reasons, ...(s.reasons.some((r) => /no <svg>/.test(r)) ? [`The reader said: "${text.replace(/\s+/g, ' ').slice(0, 160)}"`] : [])] };
  await loadFonts();
  const { layers, notes } = svgToLayers(s.svg, ctx.w, ctx.h);
  if (layers.length < 2) return { ok: false, reasons: [...s.reasons, 'No layer could be made from the picture (nothing drawable was inside the canvas).'] };
  const t = tokenise(layers);
  return { ok: true, result: { svg: s.svg, layers: t.layers, palette: t.palette, notes: [...s.reasons, ...notes], wished: s.wished } };
}

export async function callRecreate(reader: ReferenceReader, prompt: string, images: ReaderImage[], signal: AbortSignal): Promise<string> {
  return (await reader.read({ prompt, images }, signal)).text;
}
