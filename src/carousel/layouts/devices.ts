// The generic design devices (reference/deco.ts), drawn by the code on a finished slide: from our own shapes, never from a picture. Each device is switched by the style's `deco`.
// Behind the content: glow, scallop, inset card, rule. Over it (but never on text): arrow header, side label, footer logo, contact block, pen circle, stickers.
// Accent devices change the headline's runs: an italic serif for the accent words, a gradient fill, a pen circle. Every placed device reports its box so the checks can see it.
import { measureWidth } from '../../image-engine/draw/text';
import type { Deco } from '../../reference/deco';
import { contrast } from './draw';
import type { FontFamily } from '../../image-engine/types';

export interface Box { x: number; y: number; w: number; h: number; /** For a text box: the clear gap a device keeps from it (one line height of that text). */ gap?: number }
export interface PlacedDevice { id: string; kind: 'chrome' | 'decor' | 'accent' | 'sticker'; box: Box; /** What it is drawn in, to be checked against the ground. */ ink?: string }
export interface DevicePlan { svg: string; placed: PlacedDevice[]; notes: string[] }

export interface DeviceCtx {
  deco: Deco;
  index: number;
  total: number;
  handle: string;
  /** The colours the slide is drawn in (hex). */
  c: { bg: string; text: string; muted: string; accent: string; surface: string };
  /** The text boxes of the slide (content and chrome): nothing is ever placed on them. */
  textBoxes: Box[];
  /** The headline's box, when there is one. */
  title?: Box;
  /** Whether the style draws the accent as a marker bar (the italic device then stays off: the bar is measured on the upright word). */
  marker: boolean;
  /** Fonts of the style. */
  fonts: { headline: FontFamily; body: FontFamily };
  /** Where the thin rule sits (px). */
  ruleY?: number;
}

const SERIF_ITALIC: FontFamily = 'Instrument Serif Italic';
const r1 = (n: number) => Math.round(n * 10) / 10;
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return Math.abs(h); };
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
export const hit = (a: Box, b: Box, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
/** The first colour of a list that reads on the ground at `min`:1, else the best one. */
const readable = (cands: string[], bg: string, min: number) => cands.find((c) => contrast(c, bg) >= min) ?? cands.reduce((b, c) => (contrast(c, bg) > contrast(b, bg) ? c : b));

export const siteOf = (handle: string) => (handle.replace(/^@/, '').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'yourname') + '.com';
export const brandOf = (handle: string) => { const w = handle.replace(/^@/, '').split(/[._\-\s]+/).filter(Boolean)[0] || 'yourname'; return w[0].toUpperCase() + w.slice(1); };

/** A hand-drawn loop around a box: one stroke that goes round and overshoots its start. Deterministic for a given text. */
export function penLoop(b: Box, seed: number): string {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const rx = b.w / 2 + 14, ry = b.h / 2 + 8;
  const ph = (seed % 628) / 100;
  const a0 = -2.5 + ((seed >> 3) % 100) / 200;
  const pts: string[] = [];
  const n = 56;
  for (let i = 0; i <= n; i++) {
    const t = a0 + (i / n) * (Math.PI * 2 + 0.55);
    const wob = 1 + 0.035 * Math.sin(2 * t + ph) + 0.02 * Math.sin(5 * t + ph * 2) + (i / n) * 0.05;
    pts.push(`${r1(cx + rx * wob * Math.cos(t))} ${r1(cy + ry * wob * Math.sin(t))}`);
  }
  return 'M ' + pts.join(' L ');
}

const STICKERS = ['\u{1F525}', '✨', '\u{1F4A1}', '\u{1F3AF}', '\u{1F680}', '\u{1F4AC}', '\u{1F440}', '⭐', '\u{1F389}', '❤', '\u{1F449}', '✅', '\u{1F353}', '\u{1F422}', '☂', '\u{1F4A5}'];

/** Device markup that sits behind the content (right after the ground). */
export function behindDevices(x: DeviceCtx): DevicePlan {
  const d = x.deco, placed: PlacedDevice[] = [], notes: string[] = [];
  let svg = '';
  if (d.glow) {
    const dark = contrast(x.c.bg, '#000000') < contrast(x.c.bg, '#FFFFFF');
    const [gx, gy] = d.glow.corner === 'tl' ? [0.08, 0.06] : d.glow.corner === 'tr' ? [0.92, 0.06] : d.glow.corner === 'bl' ? [0.08, 0.94] : [0.92, 0.94];
    svg += `<defs><radialGradient id="cglow" cx="${gx}" cy="${gy}" r="0.62" gradientTransform="translate(${gx} ${gy}) scale(1 0.8) translate(${-gx} ${-gy})"><stop offset="0" stop-color="${d.glow.color}" stop-opacity="${dark ? 0.24 : 1}"/><stop offset="1" stop-color="${d.glow.color}" stop-opacity="0"/></radialGradient></defs><rect width="1080" height="1350" fill="url(#cglow)"/>`;
    placed.push({ id: 'glow', kind: 'decor', box: { x: 0, y: 0, w: 1080, h: 1350 } });
  }
  if (d.scallop) {
    const R = 27;
    let p = 'M 0 0 H 1080 V 6';
    const n = Math.ceil(1080 / (R * 2));
    for (let i = n; i > 0; i--) p += ` A ${R} ${R} 0 0 1 ${Math.max(0, 1080 - (n - i + 1) * R * 2) > 0 ? 1080 - (n - i + 1) * R * 2 : 0} 6`;
    svg += `<path d="${p} Z" fill="${x.c.text}"/>`;
    placed.push({ id: 'scallop', kind: 'decor', box: { x: 0, y: 0, w: 1080, h: 6 + R }, ink: x.c.text });
  }
  if (d.rule) {
    const y = x.ruleY ?? (d.rule === 'lower-two-thirds' ? 420 : 140);
    svg += `<rect x="48" y="${y}" width="984" height="3" fill="${x.c.muted}"/>`;
    placed.push({ id: 'rule', kind: 'decor', box: { x: 48, y: y, w: 984, h: 3 }, ink: x.c.muted });
  }
  return { svg, placed, notes };
}

/** The ground: with an inset card the ground colour is a rounded card on a page of another colour. */
export function insetGround(svg: string, deco: Deco, bgHex: string): { svg: string; applied: boolean } {
  const ic = deco.insetCard;
  if (!ic || ic.page.toUpperCase() === bgHex.toUpperCase()) return { svg, applied: false };
  const re = /<rect id="bg" ([^>]*?)fill="([^"]+)"\/>/;
  const m = re.exec(svg);
  if (!m) return { svg, applied: false };
  const out = svg.replace(re, () => `<rect id="bg" ${m[1]}fill="${ic.page}"/><rect x="${ic.margin}" y="${ic.margin}" width="${1080 - 2 * ic.margin}" height="${1350 - 2 * ic.margin}" rx="${ic.radius}" fill="${m[2]}"/>`);
  return { svg: out, applied: true };
}

/** The accent devices on the headline: italic serif for the accent runs, a gradient fill, a pen circle. Returns the new text element, the extra markup and what was placed. */
export function accentDevices(svg: string, x: DeviceCtx): { svg: string; over: string; placed: PlacedDevice[]; notes: string[] } {
  let d = x.deco;
  const placed: PlacedDevice[] = [], notes: string[] = [];
  const re = /<text data-role="title"([^>]*)>([\s\S]*?)<\/text>/;
  const m = re.exec(svg);
  if (!m || !(d.italicAccent || d.penCircle || d.gradientText)) return { svg, over: '', placed, notes };
  // an accent set on a marker bar (the engine puts a bar behind a word that cannot differ in colour) already marks the word: no ring, and no italic (the bar is measured on the upright word)
  const bar = /<rect [^>]*rx="[\d.]+"[^>]*\/><text data-role="title"/.test(svg);
  if (bar) { d = { ...d, penCircle: false, italicAccent: false }; }
  let attrs = m[1];
  let inner = m[2];
  const fam = (/font-family="([^"]+)"/.exec(attrs)?.[1] ?? x.fonts.headline) as FontFamily;
  const size = Number(/font-size="([\d.]+)"/.exec(attrs)?.[1] ?? 100);
  const weight = Number(/font-weight="(\d+)"/.exec(attrs)?.[1] ?? 700);
  type Span = { x: number; y: number; fill?: string; text: string; raw: string };
  const spans: Span[] = [...inner.matchAll(/<tspan x="([\d.-]+)" y="([\d.-]+)"(?: fill="([^"]+)")?>([\s\S]*?)<\/tspan>/g)].map((s) => ({ x: Number(s[1]), y: Number(s[2]), fill: s[3], text: unesc(s[4]), raw: s[0] }));
  let over = '';
  // italic accent runs: the run is set in the italic serif; what follows it on its line moves by the difference in width; if the line would run past the margin the run stays upright
  // an italic that matches the headline face: EB Garamond Italic (medium) over EB Garamond, else the thin Instrument Serif Italic
  const ital: { fam: FontFamily; w: number; k: number } = fam === 'EB Garamond' ? { fam: 'EB Garamond Italic', w: 500, k: 1 } : { fam: SERIF_ITALIC, w: 400, k: 1.06 };
  if (d.italicAccent && !x.marker && fam !== SERIF_ITALIC && fam !== 'EB Garamond Italic') {
    const out = spans.map((s) => ({ ...s }));
    let any = false;
    spans.forEach((s, i) => {
      if (!s.fill) return;
      const was = measureWidth(s.text, fam, weight, size);
      const now = measureWidth(s.text, ital.fam, ital.w, Math.round(size * ital.k));
      const shift = now - was;
      const line = out.filter((o, k) => k > i && Math.abs(o.y - s.y) < 2);
      const endX = Math.max(s.x + now, ...line.map((o) => o.x + shift + measureWidth(o.text, fam, weight, size)));
      if (endX > 1032) { notes.push('Italic accent kept upright on this slide: the line would run past the margin.'); return; }
      line.forEach((o) => { o.x = r1(o.x + shift); });
      out[i] = { ...out[i], raw: s.raw.replace('<tspan ', `<tspan font-family="${ital.fam}" font-weight="${ital.w}" font-size="${Math.round(size * ital.k)}" `) };
      any = true;
      placed.push({ id: 'italic-accent', kind: 'accent', box: { x: s.x, y: s.y - size * 0.86, w: now, h: size * 1.1 }, ink: s.fill });
    });
    if (any) {
      inner = out.map((o) => o.raw.replace(/ x="[\d.-]+"/, ` x="${o.x}"`)).join('');
      spans.splice(0, spans.length, ...out);
    }
  }
  // gradient fill of the headline (the accent runs keep their own colour)
  if (d.gradientText && d.gradientText.length >= 2 && x.title) {
    const t = x.title;
    const stops = d.gradientText.map((c, i, a) => `<stop offset="${r1(i / (a.length - 1))}" stop-color="${c}"/>`).join('');
    over += '';
    svg = svg.replace(/(<svg[^>]*>)/, (m0) => `${m0}<defs><linearGradient id="htext" gradientUnits="userSpaceOnUse" x1="${t.x}" y1="${t.y}" x2="${t.x + t.w}" y2="${t.y + t.h}">${stops}</linearGradient></defs>`);
    attrs = attrs.replace(/ fill="[^"]*"/, '') + ' fill="url(#htext)"';
    placed.push({ id: 'gradient-text', kind: 'accent', box: t, ink: d.gradientText.join(',') });
  }
  svg = svg.replace(re, () => `<text data-role="title"${attrs}>${inner}</text>`);
  // pen circle round the (first) accent run
  if (d.penCircle) {
    const s = spans.find((q) => q.fill);
    if (s) {
      const isItal = /font-family="(Instrument Serif Italic|EB Garamond Italic)"/.test(s.raw);
      const w = isItal ? measureWidth(s.text, ital.fam, ital.w, Math.round(size * ital.k)) : measureWidth(s.text, fam, weight, size);
      const b: Box = { x: s.x, y: s.y - size * 0.8, w, h: size * 0.98 };
      const ink = readable([x.c.accent, x.c.text], x.c.bg, 3);
      over += `<path d="${penLoop(b, hash(s.text + x.index))}" fill="none" stroke="${ink}" stroke-width="${Math.max(5, Math.round(size / 18))}" stroke-linecap="round" stroke-linejoin="round"/>`;
      placed.push({ id: 'pen-circle', kind: 'accent', box: { x: b.x - 16, y: b.y - 10, w: b.w + 32, h: b.h + 20 }, ink });
    }
  }
  return { svg, over, placed, notes };
}

/** A star logo placeholder (our own four-point shape) at the centre cx, cy. */
export const star = (cx: number, cy: number, r: number, fill: string) => `<path d="M ${cx} ${cy - r} Q ${cx + r * 0.18} ${cy - r * 0.18} ${cx + r} ${cy} Q ${cx + r * 0.18} ${cy + r * 0.18} ${cx} ${cy + r} Q ${cx - r * 0.18} ${cy + r * 0.18} ${cx - r} ${cy} Q ${cx - r * 0.18} ${cy - r * 0.18} ${cx} ${cy - r} Z" fill="${fill}"/>`;

/** Device markup drawn over the content: arrow header, side label, footer logo, contact block, stickers. Placed only where no text is. */
export function overDevices(x: DeviceCtx, taken: PlacedDevice[], shapeBoxes: Box[], photo?: Box): DevicePlan {
  const d = x.deco, placed: PlacedDevice[] = [], notes: string[] = [];
  let svg = '';
  const last = x.index === x.total - 1;
  const ink = x.c.muted;
  if (d.arrowHeader) {
    const y = 132, cx = 1032 - 22;
    svg += `<rect x="48" y="${y - 1.5}" width="${cx - 22 - 48}" height="3" fill="${x.c.text}"/><circle cx="${cx}" cy="${y}" r="22" fill="none" stroke="${x.c.text}" stroke-width="3"/><path d="M ${cx - 9} ${y} H ${cx + 9} M ${cx + 2} ${y - 7} L ${cx + 10} ${y} L ${cx + 2} ${y + 7}" fill="none" stroke="${x.c.text}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    placed.push({ id: 'arrow-header', kind: 'chrome', box: { x: 48, y: y - 22, w: 984, h: 44 }, ink: x.c.text });
  }
  if (d.sideLabel) {
    const label = x.handle || '@yourname';
    const wText = measureWidth(label, x.fonts.body, 500, 36);
    const cx = 1054, cy = 690;
    svg += `<text transform="translate(${cx} ${cy}) rotate(-90)" text-anchor="middle" font-family="${x.fonts.body}" font-size="36" font-weight="500" fill="${ink}">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
    placed.push({ id: 'side-label', kind: 'chrome', box: { x: cx - 27, y: cy - wText / 2, w: 34, h: wText }, ink });
  }
  if (d.footerRow || (d.contactClosing && last)) {
    const brand = brandOf(x.handle);
    const wB = measureWidth(brand, x.fonts.body, 600, 36);
    const sx = 1032 - Math.max(wB, brand.length * 36 * 0.58) - 24 - 32;
    svg += star(sx + 16, 1272, 16, x.c.text);
    placed.push({ id: 'footer-logo', kind: 'chrome', box: { x: sx, y: 1256, w: 32, h: 32 }, ink: x.c.text });
  }
  if (d.contactClosing && last) {
    // two plain contact lines with small drawn icons (a camera-like frame for the socials, a globe for the site)
    const c = x.c.text;
    svg += `<rect x="52" y="1210" width="32" height="32" rx="9" fill="none" stroke="${c}" stroke-width="3"/><circle cx="68" cy="1226" r="7" fill="none" stroke="${c}" stroke-width="3"/>`;
    svg += `<circle cx="68" cy="1272" r="16" fill="none" stroke="${c}" stroke-width="3"/><ellipse cx="68" cy="1272" rx="7" ry="16" fill="none" stroke="${c}" stroke-width="3"/><path d="M 52 1272 H 84" stroke="${c}" stroke-width="3"/>`;
    placed.push({ id: 'contact-icons', kind: 'chrome', box: { x: 50, y: 1208, w: 36, h: 82 }, ink: c });
  }
  // stickers: one emoji glyph in an empty corner. It keeps a clear gap from every text (at least one line height of that text, and from the headline's whole box), 24 px from shapes and pictures
  if (d.stickers) {
    const seed = hash(x.handle + x.index);
    const glyph = STICKERS[(seed + x.index * 5) % STICKERS.length];
    const S = 118;
    const busy: Box[] = [...x.textBoxes.map((b) => ({ ...b, gap: Math.max(b.gap ?? 0, 24) })), ...shapeBoxes.map((b) => ({ ...b, gap: 24 })), ...taken.filter((p) => p.id !== 'glow' && p.id !== 'rule' && p.id !== 'scallop' && p.id !== 'inset-card').map((p) => ({ ...p.box, gap: 24 })), ...(photo ? [{ ...photo, gap: 24 }] : [])];
    const free = (c: Box) => !busy.some((b) => hit(c, b, b.gap ?? 24));
    const corners = [{ x: 48, y: 150 }, { x: 1032 - S, y: 150 }, { x: 1032 - S, y: 1250 - S }, { x: 48, y: 1250 - S }];
    let spot: Box | null = null;
    for (let k = 0; k < 4 && !spot; k++) {
      const c = corners[(seed + k) % 4];
      let best: Box | null = null;
      for (let dx = 0; dx <= 240; dx += 24) for (let dy = 0; dy <= 240; dy += 24) {
        const cand: Box = { x: c.x + (c.x < 500 ? dx : -dx), y: c.y + (c.y < 700 ? dy : -dy), w: S, h: S };
        if (cand.x < 48 || cand.x + S > 1032 || cand.y < 150 || cand.y + S > 1250) continue;
        if (free(cand) && (!best || dx + dy < Math.abs(best.x - c.x) + Math.abs(best.y - c.y))) best = cand;
      }
      spot = best;
    }
    if (spot) {
      const col = readable([x.c.accent, x.c.text], x.c.bg, 3);
      const rot = ((seed >> 4) % 25) - 12;
      const cx = spot.x + S / 2, cy = spot.y + S / 2;
      svg += `<text x="${cx}" y="${cy + S * 0.36}" text-anchor="middle" font-family="Noto Emoji" font-size="${S}" font-weight="400" fill="${col}" transform="rotate(${rot} ${cx} ${cy})">${glyph}</text>`;
      placed.push({ id: 'sticker', kind: 'sticker', box: spot, ink: col });
    } else notes.push('No empty corner with a clear gap for a sticker on this slide.');
  }
  return { svg, placed, notes };
}

/** The boxes of the drawn shapes of a slide (rects, circles, ellipses, paths, lines), measured by the browser; the ground and anything over half the canvas are left out. */
export function shapeBoxesOf(svg: string): Box[] {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-9999px;top:0;width:1080px;height:1350px;visibility:hidden';
  host.innerHTML = svg;
  document.body.appendChild(host);
  const out: Box[] = [];
  try {
    host.querySelectorAll('rect,circle,ellipse,path,line,polygon,polyline').forEach((el) => {
      if (el.id === 'bg' || el.closest('defs,clipPath,mask,pattern,linearGradient,radialGradient')) return;
      try {
        const b = (el as unknown as SVGGraphicsElement).getBBox();
        if (b.width * b.height > 1080 * 1350 * 0.5 || b.width < 1 && b.height < 1) return;
        out.push({ x: b.x, y: b.y, w: b.width, h: b.height });
      } catch { /* not measurable */ }
    });
  } finally {
    host.remove();
  }
  return out;
}
