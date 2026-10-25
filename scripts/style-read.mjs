// npm run style:read
// Phase 1 of style learning. Cuts every reference mosaic into slides and MEASURES each slide from its pixels
// (colours, background, empty space, text-line bands, margins). Runs in the installed Chrome through Playwright.
// Writes out/image-engine/style/measurements.json and overlay pictures showing where each slide was cut.
// Nothing is read from the pictures except pixels: no text, logos or faces are copied anywhere.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REFS = path.join(root, 'Reference carousels likes');
const OUT = path.join(root, 'out/image-engine/style');
const GRIDS = path.join(REFS, 'grids.json'); // how each mosaic is cut (hints and manual overrides)
fs.mkdirSync(OUT, { recursive: true });

const grids = JSON.parse(fs.readFileSync(GRIDS, 'utf8'));
const files = fs.readdirSync(REFS).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();

/** Runs inside Chrome. Everything here is computed from pixels. */
async function analyse({ b64, mime, spec }) {
  const blob = await (await fetch(`data:${mime};base64,${b64}`)).blob();
  const bm = await createImageBitmap(blob);
  const W = bm.width;
  const H = bm.height;
  const full = new OffscreenCanvas(W, H);
  const fctx = full.getContext('2d', { willReadFrequently: true });
  fctx.drawImage(bm, 0, 0);

  // ---- helpers
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => {
    const [hi, lo] = lum(...a) > lum(...b) ? [a, b] : [b, a];
    return (lum(...hi) + 0.05) / (lum(...lo) + 0.05);
  };
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const sat = ([r, g, b]) => {
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    return mx === 0 ? 0 : (mx - mn) / mx;
  };
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

  // ---- 1. cut the mosaic into slides
  let rects = [];
  let method = '';
  if (spec.rects) {
    rects = spec.rects.map((r) => ({ x: r[0], y: r[1], w: r[2], h: r[3] }));
    method = 'manual rectangles (GUESS: read by eye from the picture)';
  } else if (spec.grid) {
    const g = spec.grid;
    const x0 = g.x0 ?? 0;
    const y0 = g.y0 ?? 0;
    const x1 = g.x1 ?? W;
    const y1 = g.y1 ?? H;
    const cw = (x1 - x0 - g.gapX * (g.cols - 1)) / g.cols;
    const ch = (y1 - y0 - g.gapY * (g.rows - 1)) / g.rows;
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) rects.push({ x: Math.round(x0 + c * (cw + g.gapX)), y: Math.round(y0 + r * (ch + g.gapY)), w: Math.round(cw), h: Math.round(ch) });
    if (g.skip) rects = rects.filter((_, i) => !g.skip.includes(i));
    method = `equal grid ${g.cols}x${g.rows} inside a box I gave (GUESS: box read by eye; cells are computed)`;
  } else {
    // Find the slides as blobs that differ from the border colour.
    const sw = Math.max(1, Math.round(W / 4));
    const sh = Math.max(1, Math.round(H / 4));
    const sm = new OffscreenCanvas(sw, sh).getContext('2d', { willReadFrequently: true });
    sm.drawImage(bm, 0, 0, sw, sh);
    const d = sm.getImageData(0, 0, sw, sh).data;
    const border = new Map();
    for (let x = 0; x < sw; x++) for (const y of [0, sh - 1]) {
      const k = `${d[(y * sw + x) * 4] >> 4},${d[(y * sw + x) * 4 + 1] >> 4},${d[(y * sw + x) * 4 + 2] >> 4}`;
      border.set(k, (border.get(k) ?? 0) + 1);
    }
    for (let y = 0; y < sh; y++) for (const x of [0, sw - 1]) {
      const k = `${d[(y * sw + x) * 4] >> 4},${d[(y * sw + x) * 4 + 1] >> 4},${d[(y * sw + x) * 4 + 2] >> 4}`;
      border.set(k, (border.get(k) ?? 0) + 1);
    }
    const top = [...border.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map((v) => Number(v) * 16 + 8);
    const mask = new Uint8Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) mask[i] = dist([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]], top) > (spec.threshold ?? 36) ? 1 : 0;
    const seen = new Uint8Array(sw * sh);
    const comps = [];
    for (let s = 0; s < sw * sh; s++) {
      if (!mask[s] || seen[s]) continue;
      const stack = [s];
      seen[s] = 1;
      let minx = sw, miny = sh, maxx = 0, maxy = 0, n = 0;
      while (stack.length) {
        const p = stack.pop();
        const x = p % sw;
        const y = (p / sw) | 0;
        n++;
        minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y);
        for (const q of [p - 1, p + 1, p - sw, p + sw]) if (q >= 0 && q < sw * sh && mask[q] && !seen[q] && !(Math.abs((q % sw) - x) > 1)) { seen[q] = 1; stack.push(q); }
      }
      const bw = maxx - minx + 1;
      const bh = maxy - miny + 1;
      if (n >= sw * sh * 0.01 && bw * bh >= sw * sh * 0.012) comps.push({ x: minx * 4, y: miny * 4, w: bw * 4, h: bh * 4 });
    }
    rects = comps.sort((a, b) => a.y - b.y || a.x - b.x);
    method = `found as blobs that differ from the border colour ${hex(top)} (MEASURED)`;
  }
  rects = rects.map((r) => ({ x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(W - r.x, r.w), h: Math.min(H - r.y, r.h) })).filter((r) => r.w > 40 && r.h > 40);

  // ---- 2. measure each slide
  const slides = [];
  for (const [index, r] of rects.entries()) {
    const inset = Math.round(Math.min(r.w, r.h) * 0.012); // skip the slide's own hairline edge and the cut error
    const cw = 160;
    const ch = Math.max(8, Math.round((cw * r.h) / r.w));
    const c = new OffscreenCanvas(cw, ch);
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(bm, r.x + inset, r.y + inset, r.w - 2 * inset, r.h - 2 * inset, 0, 0, cw, ch);
    const px = cx.getImageData(0, 0, cw, ch).data;
    const N = cw * ch;
    const at = (i) => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];

    // palette: k-means on pixels, fixed starting points so a re-run gives the same answer
    const K = 6;
    let cent = [];
    for (let k = 0; k < K; k++) cent.push(at(Math.floor(((k + 0.5) * N) / K)));
    const assign = new Uint8Array(N);
    for (let it = 0; it < 12; it++) {
      const sum = Array.from({ length: K }, () => [0, 0, 0, 0]);
      for (let i = 0; i < N; i++) {
        const p = at(i);
        let best = 0, bd = 1e9;
        for (let k = 0; k < K; k++) { const dd = dist(p, cent[k]); if (dd < bd) { bd = dd; best = k; } }
        assign[i] = best;
        sum[best][0] += p[0]; sum[best][1] += p[1]; sum[best][2] += p[2]; sum[best][3]++;
      }
      cent = cent.map((old, k) => (sum[k][3] ? [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]] : old));
    }
    const share = Array(K).fill(0);
    for (let i = 0; i < N; i++) share[assign[i]]++;
    let clusters = cent.map((col, k) => ({ rgb: col, share: share[k] / N })).filter((x) => x.share > 0.004).sort((a, b) => b.share - a.share);
    // merge clusters that are visually the same colour
    const merged = [];
    for (const cl of clusters) {
      const m = merged.find((x) => dist(x.rgb, cl.rgb) < 40);
      if (m) { m.rgb = m.rgb.map((v, j) => (v * m.share + cl.rgb[j] * cl.share) / (m.share + cl.share)); m.share += cl.share; } else merged.push({ ...cl });
    }
    clusters = merged.sort((a, b) => b.share - a.share);

    // background: the colour of the slide's outer ring
    const ring = new Map();
    const ringW = Math.max(2, Math.round(cw * 0.03));
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      if (x >= ringW && x < cw - ringW && y >= ringW && y < ch - ringW) continue;
      const i = y * cw + x;
      const ki = assign[i];
      ring.set(ki, (ring.get(ki) ?? 0) + 1);
    }
    const ringTop = [...ring.entries()].sort((a, b) => b[1] - a[1])[0];
    const bgRgb = cent[ringTop[0]];
    const ringTotal = [...ring.values()].reduce((a, b) => a + b, 0);
    // "flat" = the outer ring is one colour (a plain background), so margins and text bands can be measured
    let flatCount = 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      if (x >= ringW && x < cw - ringW && y >= ringW && y < ch - ringW) continue;
      if (dist(at(y * cw + x), bgRgb) < 45) flatCount++;
    }
    const flatRing = flatCount / ringTotal;
    const flat = flatRing >= 0.9;

    // text colour: the palette colour furthest from the background in contrast, with at least 1% of the slide
    const cand = clusters.filter((x) => x.share >= 0.01 && dist(x.rgb, bgRgb) > 60);
    const text = cand.length ? cand.reduce((a, b) => (ratio(a.rgb, bgRgb) >= ratio(b.rgb, bgRgb) ? a : b)) : null;
    const accent = cand.filter((x) => x !== text && sat(x.rgb) > 0.35).sort((a, b) => b.share - a.share)[0] ?? null;

    // ink: pixels that differ from the flat background
    let inkBox = null;
    let inkShare = null;
    const bands = [];
    let alignment = null;
    if (flat) {
      let minx = cw, miny = ch, maxx = -1, maxy = -1, ink = 0;
      const rowInk = new Float32Array(ch);
      const rowMin = new Int32Array(ch).fill(cw);
      const rowMax = new Int32Array(ch).fill(-1);
      for (let y = ringW; y < ch - ringW; y++) for (let x = ringW; x < cw - ringW; x++) {
        if (dist(at(y * cw + x), bgRgb) > 90) {
          ink++;
          rowInk[y]++;
          rowMin[y] = Math.min(rowMin[y], x);
          rowMax[y] = Math.max(rowMax[y], x);
          minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y);
        }
      }
      inkShare = ink / ((cw - 2 * ringW) * (ch - 2 * ringW));
      if (maxx >= 0) inkBox = { left: minx / cw, right: 1 - (maxx + 1) / cw, top: miny / ch, bottom: 1 - (maxy + 1) / ch };
      // bands: runs of rows that contain ink = lines of text or graphics
      let start = -1;
      for (let y = ringW; y <= ch - ringW; y++) {
        const on = y < ch - ringW && rowInk[y] > 0;
        if (on && start < 0) start = y;
        if (!on && start >= 0) {
          let l = cw, rr = -1, area = 0;
          for (let yy = start; yy < y; yy++) { l = Math.min(l, rowMin[yy]); rr = Math.max(rr, rowMax[yy]); area += rowInk[yy]; }
          bands.push({ top: start / ch, height: (y - start) / ch, left: l / cw, right: (rr + 1) / cw, ink: area });
          start = -1;
        }
      }
      const real = bands.filter((b) => b.height * ch >= 2);
      if (real.length >= 2) {
        const lefts = real.map((b) => b.left);
        const centres = real.map((b) => (b.left + b.right) / 2);
        const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
        alignment = sd(lefts) < 0.025 ? 'left' : sd(centres) < 0.025 ? 'centre' : 'mixed';
        alignment = { value: alignment, leftSpread: +sd(lefts).toFixed(3), centreSpread: +sd(centres).toFixed(3) };
      }
    }

    // palette size on the slide's own colours, and how much of it is photo-like (many colours, no flat background)
    slides.push({
      index: index + 1,
      rect: r,
      aspect: +(r.w / r.h).toFixed(3),
      flatBackground: flat,
      flatRingShare: +flatRing.toFixed(2),
      background: hex(bgRgb),
      text: text ? hex(text.rgb) : null,
      textContrast: text ? +ratio(text.rgb, bgRgb).toFixed(2) : null,
      accent: accent ? hex(accent.rgb) : null,
      accentContrast: accent ? +ratio(accent.rgb, bgRgb).toFixed(2) : null,
      palette: clusters.slice(0, 5).map((x) => ({ hex: hex(x.rgb), share: +x.share.toFixed(3) })),
      inkShare: inkShare === null ? null : +inkShare.toFixed(3),
      emptyShare: inkShare === null ? null : +(1 - inkShare).toFixed(3),
      inkBox: inkBox && Object.fromEntries(Object.entries(inkBox).map(([k, v]) => [k, +v.toFixed(3)])),
      bands: bands.filter((b) => b.height * ch >= 2).map((b) => ({ top: +b.top.toFixed(3), height: +b.height.toFixed(3), left: +b.left.toFixed(3), right: +b.right.toFixed(3) })),
      alignment,
    });
  }

  // ---- 3. overlay picture: where each slide was cut
  const over = new OffscreenCanvas(W, H);
  const o = over.getContext('2d');
  o.drawImage(bm, 0, 0);
  o.lineWidth = Math.max(3, W / 300);
  o.font = `${Math.max(16, Math.round(W / 40))}px sans-serif`;
  slides.forEach((s) => {
    o.strokeStyle = '#ff00cc';
    o.strokeRect(s.rect.x, s.rect.y, s.rect.w, s.rect.h);
    o.fillStyle = '#ff00cc';
    o.fillRect(s.rect.x, s.rect.y, o.measureText(String(s.index)).width + 16, Math.max(24, W / 36));
    o.fillStyle = '#fff';
    o.fillText(String(s.index), s.rect.x + 8, s.rect.y + Math.max(18, W / 48));
  });
  const ob = await over.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  const buf = new Uint8Array(await ob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { width: W, height: H, method, slides, overlay: btoa(bin) };
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto('about:blank');
const result = { generatedAt: new Date().toISOString(), note: 'Every number here is MEASURED from pixels. Slide rectangles are MEASURED where the method says blobs or equal grid; manual rectangles are a GUESS read by eye. Text, logos and faces are never read.', files: {} };
for (const f of files) {
  const spec = grids[f] ?? {};
  const buf = fs.readFileSync(path.join(REFS, f));
  const mime = /\.png$/i.test(f) ? 'image/png' : 'image/jpeg';
  const r = await page.evaluate(analyse, { b64: buf.toString('base64'), mime, spec });
  fs.writeFileSync(path.join(OUT, `overlay-${f.replace(/\.[^.]+$/, '')}.jpg`), Buffer.from(r.overlay, 'base64'));
  delete r.overlay;
  result.files[f] = { ...r, hint: spec.hint ?? null };
  console.log(f, `${r.width}x${r.height}`, r.slides.length, 'slides;', r.method);
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify(result, null, 2));
console.log('written', path.join(OUT, 'measurements.json'));
