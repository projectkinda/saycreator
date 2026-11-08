// Colour helpers shared by the art extraction scripts (nearest colour in Lab, the palette tokens of a slide's ground).
import fs from 'node:fs';

// ---- colour helpers (nearest colour in Lab) ----
export const NAMED = { white: '#FFFFFF', black: '#000000', none: null, transparent: null };
export const hex2rgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); if (h.length === 8) h = h.slice(0, 6); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
export const parseColor = (c) => {
  if (!c) return null;
  c = c.trim().toLowerCase();
  if (c in NAMED) return NAMED[c] ? hex2rgb(NAMED[c]) : null;
  if (c[0] === '#') return hex2rgb(c);
  const m = /^rgba?\(([^)]+)\)/.exec(c);
  if (m) return m[1].split(',').slice(0, 3).map((x) => Math.round(parseFloat(x)));
  return null;
};
export const lab = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [f(r), f(g), f(b)];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const g2 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * g2(Y) - 16, 500 * (g2(X) - g2(Y)), 200 * (g2(Y) - g2(Z))];
};
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ---- the pack palettes (from the presets made from these packs: src/image-engine/styles/style-N/style.json) ----
export const palettesOf = (n) => {
  const s = JSON.parse(fs.readFileSync(`src/image-engine/styles/style-${n}/style.json`, 'utf8'));
  return Object.values(s.palettes).map((p) => ({ bg: p.bg, ink: p.text, surface: p.surface, primary: p.accent, accent: p.marker ?? p.accent }));
};
export const bgHexOf = (p) => (typeof p.bg === 'string' ? p.bg : '#FFFFFF');
/** The tokens of one slide: the palette of the preset whose ground is nearest the slide's own ground colour. */
export const tokensFor = (n, slideBg) => {
  const ps = palettesOf(n).map((p) => ({ ...p, bg: bgHexOf(p) }));
  const lb = lab(slideBg);
  return ps.reduce((best, p) => (dist(lab(hex2rgb(p.bg)), lb) < dist(lab(hex2rgb(best.bg)), lb) ? p : best), ps[0]);
};
export const PRIORITY = ['primary', 'accent', 'ink', 'surface', 'bg'];
export function tokenOf(color, tokens, slideBg) {
  const rgb = parseColor(color);
  if (!rgb) return null;
  // the slide's own ground colour is the "bg" token; the others come from the palette of that ground
  const entries = PRIORITY.map((k) => [k, k === 'bg' ? slideBg : hex2rgb(tokens[k])]);
  const l = lab(rgb);
  let best = entries[0], bd = Infinity;
  for (const e of entries) { const d = dist(l, lab(e[1])); if (d < bd - 1e-9) { bd = d; best = e; } }
  return '$' + best[0];
}

