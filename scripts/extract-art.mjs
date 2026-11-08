// Extracts the VECTOR art of the SVG style packs (REFS/Styles, read-only) as recolourable items, and lists the embedded rasters (never bundled).
//   node scripts/extract-art.mjs            -> src/image-engine/art/<pack>/<name>.svg, src/image-engine/art/index.json, out/art-inventory/rasters.md, out/art-inventory/candidates.json
// A vector item is a path, rect, circle, ellipse, line, polygon or polyline that is not text (text in these packs is outlined to paths: those runs are recognised and skipped) and not a picture
// (a shape filled by a <pattern> that holds an <image> is a raster). Each item is normalised to its own bounding box (viewBox 0 0 w h), its transform baked into one matrix, its numbers
// rounded, and its colours replaced by tokens ($bg $ink $surface $primary $accent) by the nearest colour of THAT slide's own ground palette. Nothing is copied from the originals: they are only read.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from '@playwright/test';

const ROOT = 'REFS/Styles';
const ART = 'src/image-engine/art';
const INV = 'out/art-inventory';
fs.mkdirSync(INV, { recursive: true });

import { parseColor, tokensFor, tokenOf, hex2rgb } from './extract-art-lib.mjs';

// ---- raster dimensions from a data URI (png / jpeg / webp / gif) ----
function dims(buf, mime) {
  try {
    if (/png/.test(mime)) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    if (/gif/.test(mime)) return [buf.readUInt16LE(6), buf.readUInt16LE(8)];
    if (/jpe?g/.test(mime)) { let i = 2; while (i < buf.length) { if (buf[i] !== 0xff) { i++; continue; } const m = buf[i + 1]; if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]; i += 2 + buf.readUInt16BE(i + 2); } }
    if (/webp/.test(mime)) { if (buf.toString('ascii', 12, 16) === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)]; if (buf.toString('ascii', 12, 16) === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff]; }
  } catch { /* unknown */ }
  return [0, 0];
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });

const candidates = [];
const rasters = [];
const packs = fs.readdirSync(ROOT).filter((d) => /^Style \d+$/.test(d)).sort((a, b) => parseInt(a.slice(6)) - parseInt(b.slice(6)));

for (const dir of packs) {
  const n = parseInt(dir.slice(6));
  const pack = `style-${n}`;
  const files = fs.readdirSync(path.join(ROOT, dir)).filter((x) => x.endsWith('.svg')).sort((a, b) => parseInt(a) - parseInt(b));
  for (const f of files) {
    const raw = fs.readFileSync(path.join(ROOT, dir, f), 'utf8');
    // rasters: every <image> payload (kept out of the page: only its size is read)
    const imgs = new Map();
    for (const m of raw.matchAll(/<image\b[^>]*?id="([^"]+)"[^>]*?(?:xlink:)?href="data:([^;]+);base64,([^"]+)"/g)) {
      const buf = Buffer.from(m[3], 'base64');
      imgs.set(m[1], { id: m[1], mime: m[2], bytes: buf.length, dims: dims(buf, m[2]), sha: crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10) });
    }
    const stripped = raw.replace(/(href|xlink:href)="data:[^"]*"/g, '$1="data:,"');
    const res = await page.evaluate(({ svg, pack }) => {
      document.body.innerHTML = '<div id="h" style="position:absolute;left:0;top:0;width:1080px;height:1350px">' + svg + '</div>';
      const root = document.querySelector('#h svg');
      const rootInv = root.getScreenCTM().inverse();
      const fmt = (v) => String(Math.round(v * 100) / 100);
      const patternsWithImage = new Set([...root.querySelectorAll('pattern')].filter((p) => p.querySelector('image, use')).map((p) => p.id));
      // use -> image id of each pattern
      const patImg = {};
      for (const p of root.querySelectorAll('pattern')) { const u = p.querySelector('use'); if (u) patImg[p.id] = (u.getAttribute('xlink:href') || u.getAttribute('href') || '').replace('#', ''); const im = p.querySelector('image'); if (im) patImg[p.id] = im.id; }
      // image id -> the <use> inside <defs> pointing to an <image> (Figma: pattern -> use -> image)
      const imageOfUse = {};
      for (const im of root.querySelectorAll('defs > image')) imageOfUse[im.id] = im.id;
      const out = [];
      const rasterUses = [];
      let order = 0;
      for (const el of root.querySelectorAll('path,rect,circle,ellipse,line,polygon,polyline')) {
        if (el.closest('defs,mask,clipPath,pattern,filter,symbol')) continue;
        const fill = el.getAttribute('fill') || '';
        const pm = /url\(#([^)]+)\)/.exec(fill);
        const b = el.getBoundingClientRect();
        const sc = 1080 / root.getBoundingClientRect().width;
        const rx0 = root.getBoundingClientRect();
        const box = { x: (b.x - rx0.x) * sc, y: (b.y - rx0.y) * sc, w: b.width * sc, h: b.height * sc };
        if (pm && patternsWithImage.has(pm[1])) { rasterUses.push({ tag: el.tagName, pattern: pm[1], image: patImg[pm[1]] || '', box }); continue; }
        order++;
        const stroke = el.getAttribute('stroke') || '';
        const sw = parseFloat(el.getAttribute('stroke-width') || (stroke ? '1' : '0')) || 0;
        // geometry in root user space: the element's own transform chain baked into one matrix
        const m = rootInv.multiply(el.getScreenCTM());
        const ge = el.getBBox();
        // corners of the local bbox in root space (stroke included)
        const pts = [[ge.x - sw / 2, ge.y - sw / 2], [ge.x + ge.width + sw / 2, ge.y - sw / 2], [ge.x - sw / 2, ge.y + ge.height + sw / 2], [ge.x + ge.width + sw / 2, ge.y + ge.height + sw / 2]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
        const x0 = Math.min(...pts.map((p) => p[0])), y0 = Math.min(...pts.map((p) => p[1])), x1 = Math.max(...pts.map((p) => p[0])), y1 = Math.max(...pts.map((p) => p[1]));
        // referenced defs (gradients) of this element
        const refs = new Set();
        const scan = (node) => { for (const a of node.getAttributeNames()) { const v = node.getAttribute(a); for (const r of v.matchAll(/url\(#([^)]+)\)/g)) refs.add(r[1]); } };
        scan(el);
        const defsOut = [];
        const seen = new Set();
        const addDef = (id) => {
          if (seen.has(id)) return; seen.add(id);
          const d = root.querySelector('#' + CSS.escape(id));
          if (!d) return;
          if (!/gradient/i.test(d.tagName)) return;
          const href = d.getAttribute('xlink:href') || d.getAttribute('href');
          if (href) addDef(href.replace('#', ''));
          defsOut.push(d.outerHTML);
        };
        refs.forEach(addDef);
        const clone = el.cloneNode(false);
        for (const a of ['clip-path', 'mask', 'filter', 'id', 'style', 'transform']) clone.removeAttribute(a);
        // fill and stroke inherited from the page (the root says fill="none") are written on the item itself
        const cs = getComputedStyle(el);
        if (!clone.hasAttribute('fill')) clone.setAttribute('fill', cs.fill === 'none' ? 'none' : cs.fill);
        if (!clone.hasAttribute('stroke') && cs.stroke !== 'none') clone.setAttribute('stroke', cs.stroke);
        if (clone.hasAttribute('stroke') && !clone.hasAttribute('stroke-width') && parseFloat(cs.strokeWidth) !== 1) clone.setAttribute('stroke-width', cs.strokeWidth);
        const mat = [m.a, m.b, m.c, m.d, m.e - x0, m.f - y0].map(fmt).join(' ');
        const identity = Math.abs(m.a - 1) < 1e-6 && Math.abs(m.d - 1) < 1e-6 && Math.abs(m.b) < 1e-6 && Math.abs(m.c) < 1e-6;
        if (identity) { if (Math.abs(m.e - x0) > 1e-3 || Math.abs(m.f - y0) > 1e-3) clone.setAttribute('transform', `translate(${fmt(m.e - x0)} ${fmt(m.f - y0)})`); } else clone.setAttribute('transform', `matrix(${mat})`);
        const siblings = el.parentElement ? el.parentElement.children.length : 0;
        out.push({
          order, tag: el.tagName, fill, stroke, sw, d: el.getAttribute('d') || '', subpaths: ((el.getAttribute('d') || '').match(/M/gi) || []).length, dlen: (el.getAttribute('d') || '').length,
          opacity: el.getAttribute('opacity') || '', rx: el.getAttribute('rx') || '', bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, markup: clone.outerHTML, defs: defsOut, parent: (el.parentElement?.tagName || '') + ':' + siblings,
        });
      }
      const bgEl = [...root.querySelectorAll('rect,path')].find((e) => { const b = e.getBoundingClientRect(); return b.width >= 1070 && b.height >= 1340 && /^#|^white|^black/i.test(e.getAttribute('fill') || ''); });
      const bgFill = bgEl ? bgEl.getAttribute('fill') : '#FFFFFF';
      // the last full-page filled shape is the ground (the first is often a white base)
      const grounds = [...root.querySelectorAll('rect,path')].filter((e) => { const b = e.getBoundingClientRect(); return b.width >= 1070 && b.height >= 1340 && /^#|^white|^black/i.test(e.getAttribute('fill') || ''); }).map((e) => e.getAttribute('fill'));
      return { items: out, rasterUses, ground: grounds[grounds.length - 1] || bgFill };
    }, { svg: stripped, pack });
    const slideBg = parseColor(res.ground) ?? [255, 255, 255];
    const tokens = tokensFor(n, slideBg);
    for (const it of res.items) candidates.push({ pack, slide: f, slideNo: parseInt(f), bg: slideBg, tokens, ...it });
    for (const u of res.rasterUses) {
      const im = imgs.get(u.image) ?? [...imgs.values()][0];
      rasters.push({ pack, slide: f, tag: u.tag, box: u.box, image: im ? { ...im } : null });
    }
    // raster fills whose payload could not be matched to an id are still listed
  }
}
await browser.close();
fs.writeFileSync(path.join(INV, 'candidates.json'), JSON.stringify(candidates.map((c) => ({ ...c, defs: undefined, markup: undefined, d: undefined })), null, 1));
fs.writeFileSync(path.join(INV, 'candidates-full.json'), JSON.stringify(candidates));
fs.writeFileSync(path.join(INV, 'rasters.json'), JSON.stringify(rasters, null, 1));
console.log('candidates', candidates.length, 'raster uses', rasters.length);
