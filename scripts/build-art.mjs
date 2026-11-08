// Second stage of the art extraction (run scripts/extract-art.mjs first): filters the candidates (no text, no pictures), merges the glow orbs and the star row into one item each, replaces
// colours by tokens, removes duplicates and writes src/image-engine/art/<pack>/<name>.svg + src/image-engine/art/index.json.
import fs from 'node:fs';
import path from 'node:path';
import { tokenOf, parseColor } from './extract-art-lib.mjs';

const INV = 'out/art-inventory';
const ART = 'src/image-engine/art';
const all = JSON.parse(fs.readFileSync(path.join(INV, 'candidates-full.json'), 'utf8'));
const maxdim = (b) => Math.max(b.w, b.h);

const bySlide = {};
for (const c of all) (bySlide[c.pack + '/' + c.slide] ??= []).push(c);
const isRun = (c, list) => c.tag === 'path' && c.bbox.h <= 60 && list.some((o) => o !== c && o.tag === 'path' && o.bbox.h <= 60 && Math.abs(o.bbox.y + o.bbox.h / 2 - (c.bbox.y + c.bbox.h / 2)) <= 14 && Math.min(Math.abs(o.bbox.x - (c.bbox.x + c.bbox.w)), Math.abs(c.bbox.x - (o.bbox.x + o.bbox.w))) <= 22);

const skipped = {};
const skip = (why) => { skipped[why] = (skipped[why] ?? 0) + 1; };
/** @type {{c:any, group?:any[], kind:string}[]} */
const items = [];
for (const list of Object.values(bySlide)) {
  // glow orbs: five gradient ellipses and a solid one, merged into one item
  const orbs = list.filter((c) => c.tag === 'ellipse');
  const star = list.filter((c) => c.tag === 'path' && c.bbox.y < 0 && c.bbox.h > 80 && c.bbox.h < 100 && Math.abs(c.bbox.w - 88) < 8 && c.subpaths === 1);
  if (orbs.length >= 3) items.push({ c: orbs[0], group: orbs, kind: 'orbs' });
  if (star.length >= 8) items.push({ c: star[0], group: star, kind: 'star-row' });
  for (const c of list) {
    const b = c.bbox;
    if (b.w >= 1070 && b.h >= 1340) { skip('full-page ground'); continue; }
    if (c.tag === 'path' && (c.subpaths >= 8 || c.dlen > 6000)) { skip('outlined text (long path)'); continue; }
    if (c.tag === 'path' && c.subpaths >= 3 && maxdim(b) <= 70) { skip('outlined text or numeral (small, several contours)'); continue; }
    if (isRun(c, list)) { skip('outlined text (a run of small glyph paths)'); continue; }
    if (maxdim(b) < 12 && !(b.w < 3 || b.h < 3)) { skip('too small'); continue; }
    if (c.tag === 'rect' && !c.rx && !c.stroke && c.sw === 0 && !/url\(/.test(c.fill)) { skip('plain filled rectangle (a text backing, not art)'); continue; }
    if (c.tag === 'rect' && !c.rx && !c.stroke && b.w >= 1000) { skip('plain full-width band'); continue; }
    items.push({ c, kind: 'single' });
  }
}

// ---- tokens ----
const TOKEN_ATTRS = ['fill', 'stroke', 'stop-color'];
function tokenise(markup, c) {
  const used = new Set();
  const out = markup.replace(/\b(fill|stroke|stop-color)="([^"]*)"/g, (m, k, v) => {
    if (/^url\(/.test(v) || v === 'none' || v === 'currentColor') return m;
    const t = tokenOf(v, c.tokens, c.bg);
    if (!t) return m;
    used.add(t.slice(1));
    return `${k}="${t}"`;
  });
  return { markup: out, used };
}
/** A pure translate on the element is baked into its own numbers (so the path starts at the item's own 0,0 and carries no transform). */
function bakeTranslate(markup) {
  const m = /^<(path|rect|circle|ellipse|line|polygon|polyline)\b([^>]*?) transform="translate\(([-\d.]+)[ ,]([-\d.]+)\)"([^>]*)>/.exec(markup);
  if (!m) return markup;
  const [whole, tag, pre, dx, dy, post] = [m[0], m[1], m[2], parseFloat(m[3]), parseFloat(m[4]), m[5]];
  const attrs = pre + post;
  const num = (v) => String(Math.round(v * 100) / 100);
  const shiftAttr = (a, name, d) => a.replace(new RegExp('\\b' + name + '="([-\\d.]+)"'), (q, v) => name + '="' + num(parseFloat(v) + d) + '"');
  let out = attrs;
  if (tag === 'path') {
    out = out.replace(/\bd="([^"]*)"/, (q, d) => 'd="' + shiftPath(d, dx, dy) + '"');
  } else if (tag === 'rect') { out = shiftAttr(shiftAttr(out, 'x', dx), 'y', dy); if (!/\bx="/.test(attrs)) out += ' x="' + num(dx) + '"'; if (!/\by="/.test(attrs)) out += ' y="' + num(dy) + '"'; }
  else if (tag === 'circle' || tag === 'ellipse') { out = shiftAttr(shiftAttr(out, 'cx', dx), 'cy', dy); }
  else if (tag === 'line') { out = shiftAttr(shiftAttr(shiftAttr(shiftAttr(out, 'x1', dx), 'x2', dx), 'y1', dy), 'y2', dy); }
  else return markup;
  return markup.replace(whole, '<' + tag + out + '>');
}
/** Shifts an SVG path by (dx, dy): absolute commands move, relative ones stay. */
function shiftPath(d, dx, dy) {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const num = (v) => String(Math.round(v * 100) / 100);
  const arity = { M: 2, L: 2, T: 2, C: 6, S: 4, Q: 4, A: 7, H: 1, V: 1, Z: 0 };
  let out = '', cmd = '', i = 0;
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) { cmd = toks[i++]; out += cmd; if (cmd.toUpperCase() === 'Z') continue; }
    const up = cmd.toUpperCase(), rel = cmd !== up;
    const n = arity[up];
    const a = toks.slice(i, i + n).map(Number);
    i += n;
    const b = a.map((v, k) => {
      if (rel) return v;
      if (up === 'H') return v + dx;
      if (up === 'V') return v + dy;
      if (up === 'A') return k === 5 ? v + dx : k === 6 ? v + dy : v;
      return v + (k % 2 === 0 ? dx : dy);
    });
    out += b.map(num).join(' ') + ' ';
  }
  return out.trim();
}
const roundNums = (s) => s.replace(/-?\d+\.\d{3,}/g, (n) => String(Math.round(parseFloat(n) * 100) / 100));
/** Gradient ids renamed g0, g1 ... in order of appearance so two items never share an id after cleaning. */
function renameIds(defs, markup) {
  const ids = [...new Set([...defs.join('').matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))];
  let d = defs.join(''), m = markup;
  ids.forEach((id, i) => { const n = `g${i}`; d = d.split(`id="${id}"`).join(`id="${n}"`).split(`#${id})`).join(`#${n})`).split(`"#${id}"`).join(`"#${n}"`); m = m.split(`#${id})`).join(`#${n})`); });
  return { defs: d, markup: m };
}
const tokDefs = (defs, c) => defs.map((d) => tokenise(d, c));

function build(entry) {
  const c = entry.c;
  if (entry.kind === 'single') {
    const t = tokenise(c.markup, c);
    const dd = tokDefs(c.defs, c);
    const r = renameIds(dd.map((x) => x.markup), t.markup);
    const w = Math.max(1, Math.ceil(c.bbox.w)), h = Math.max(1, Math.ceil(c.bbox.h));
    r.markup = bakeTranslate(r.markup);
    const used = new Set([...t.used, ...dd.flatMap((x) => [...x.used])]);
    return { w, h, defs: r.defs, body: r.markup, used, geo: geoKey(r.markup + r.defs) };
  }
  // a merged item: every member keeps its own offset in the union box
  const U = { x: Math.min(...entry.group.map((g) => g.bbox.x)), y: Math.min(...entry.group.map((g) => g.bbox.y)), x2: Math.max(...entry.group.map((g) => g.bbox.x + g.bbox.w)), y2: Math.max(...entry.group.map((g) => g.bbox.y + g.bbox.h)) };
  let defs = '', body = '';
  const used = new Set();
  entry.group.forEach((g, i) => {
    const t = tokenise(g.markup, g);
    const dd = tokDefs(g.defs, g);
    // give each member's gradients their own prefix before the final rename
    let m = bakeTranslate(t.markup), d = dd.map((x) => x.markup).join('');
    for (const id of [...new Set([...d.matchAll(/\bid="([^"]+)"/g)].map((q) => q[1]))]) { m = m.split(`#${id})`).join(`#m${i}_${id})`); d = d.split(`id="${id}"`).join(`id="m${i}_${id}"`); }
    defs += d;
    body += `<g transform="translate(${Math.round((g.bbox.x - U.x) * 100) / 100} ${Math.round((g.bbox.y - U.y) * 100) / 100})">${m}</g>`;
    t.used.forEach((u) => used.add(u));
    dd.forEach((x) => x.used.forEach((u) => used.add(u)));
  });
  const r = renameIds([defs], body);
  return { w: Math.ceil(U.x2 - U.x), h: Math.ceil(U.y2 - U.y), defs: r.defs, body: r.markup, used, geo: geoKey(r.markup + r.defs), union: U };
}
const geoKey = (s) => s.replace(/\b(fill|stroke|stop-color)="\$[a-z]+"/g, '$1="T"').replace(/\s+/g, ' ');

// ---- role ----
function roleOf(c, kind, w, h, hasGradient) {
  const b = c.bbox;
  if (kind === 'orbs') return 'background';
  if (kind === 'star-row') return 'frame';
  if (hasGradient && (w >= 600 || h >= 600)) return 'background';
  if (hasGradient && w >= 1000) return 'background';
  if (c.tag === 'line' || w <= 8 || h <= 8) return 'divider';
  if (w >= 700 && h <= 14) return 'divider';
  if (c.fill === '' && c.stroke && c.tag !== 'path' && maxdim(b) >= 150) return 'frame';
  if (c.tag === 'path' && w / Math.max(1, h) > 5 && h <= 24) return 'divider';
  if (c.tag === 'path' && c.subpaths >= 2 && w / Math.max(1, h) > 1.4 && w / Math.max(1, h) < 3.5 && maxdim(b) >= 250) return 'sticker'; // a hand-drawn ring or scribble
  if (c.tag === 'rect' && c.rx && h <= 260) return 'badge';
  if (maxdim(b) >= 300 && (c.tag === 'rect' || c.tag === 'path')) return 'frame';
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const nearCorner = (cx < 260 || cx > 820) && (cy < 300 || cy > 1050);
  if (nearCorner && maxdim(b) <= 300) return 'corner';
  if (c.tag === 'rect' && c.rx) return 'badge';
  return 'sticker';
}

// ---- write ----
// only the generated folders and the index are rebuilt: the credits files (CREDITS.md, credits.json) are written by hand and stay
fs.mkdirSync(ART, { recursive: true });
for (const d of fs.readdirSync(ART, { withFileTypes: true })) if (d.isDirectory() && /^style-/.test(d.name)) fs.rmSync(path.join(ART, d.name), { recursive: true, force: true });
const PREF = ['ink', 'primary', 'accent', 'surface', 'bg'];
const rank = (used) => Math.min(...[...used].map((u) => PREF.indexOf(u)).filter((i) => i >= 0), 9);
const kept = new Map(); // pack -> geo -> {entry, built}
for (const e of items) {
  const bt = build(e);
  if (bt.w < 2 && bt.h < 2) { skip('empty'); continue; }
  if ([...bt.used].every((u) => u === 'bg') && bt.used.size) { skip('drawn in the ground colour (it sat on a picture)'); continue; }
  const pk = e.c.pack;
  const m = kept.get(pk) ?? new Map();
  kept.set(pk, m);
  // the same shape set again (the star row's stars differ by a rounding, a slide repeats the art of the one before): one item per kind, shape class and size (rectangles also by colour roles)
  const key = e.kind === 'single' ? ['single', e.c.tag, Math.round(bt.w / 12), Math.round(bt.h / 12), /gradient/i.test(bt.defs) ? 'grad' : ''].join('|') : e.kind + '|' + Math.round(bt.w / 12) + 'x' + Math.round(bt.h / 12);
  const prev = m.get(key);
  if (!prev) m.set(key, { e, bt, slides: new Set([e.c.slide]) });
  else { prev.slides.add(e.c.slide); if (rank(bt.used) < rank(prev.bt.used)) { prev.e = e; prev.bt = bt; } }
}
const index = [];
const counters = {};
const dedupedAway = {};
for (const [pk, m] of [...kept.entries()].sort()) {
  fs.mkdirSync(path.join(ART, pk), { recursive: true });
  const list = [...m.values()].sort((a, b) => a.e.c.slideNo - b.e.c.slideNo || a.e.c.order - b.e.c.order);
  for (const it of list) {
    const { e, bt } = it;
    const role = roleOf(e.c, e.kind, bt.w, bt.h, /gradient/i.test(bt.defs));
    const k = pk + role;
    counters[k] = (counters[k] ?? 0) + 1;
    const name = `${role}-${counters[k]}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bt.w} ${bt.h}" width="${bt.w}" height="${bt.h}">${bt.defs ? `<defs>${bt.defs}</defs>` : ''}${bt.body}</svg>\n`;
    fs.writeFileSync(path.join(ART, pk, name + '.svg'), roundNums(svg));
    const at = e.kind === 'single' ? e.c.bbox : { x: bt.union.x, y: bt.union.y, w: bt.union.x2 - bt.union.x, h: bt.union.y2 - bt.union.y };
    index.push({
      name, pack: pk, file: `${pk}/${name}.svg`, bbox: { w: bt.w, h: bt.h }, tokens: [...bt.used].sort(), role,
      shape: e.kind === 'orbs' ? 'glow orbs (six overlapping gradient ellipses)' : e.kind === 'star-row' ? 'a row of four-point stars' : e.c.tag,
      source: { slide: e.c.slide, at: { x: Math.round(at.x), y: Math.round(at.y), w: Math.round(at.w), h: Math.round(at.h) }, alsoOn: [...it.slides].filter((s) => s !== e.c.slide) },
    });
  }
}
fs.writeFileSync(path.join(ART, 'index.json'), JSON.stringify(index, null, 2) + '\n');
fs.writeFileSync(path.join(INV, 'skipped.json'), JSON.stringify(skipped, null, 2));
console.log('items', index.length, JSON.stringify(skipped));
const per = {};
for (const i of index) per[i.pack] = (per[i.pack] ?? 0) + 1;
console.log(JSON.stringify(per));
