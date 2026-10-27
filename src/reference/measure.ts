// The measured part of reading a reference: numbers taken from the pixels, with no model. Pure (no DOM): it works on pixel data.
// Every value is a measurement with a known method, not a judgement. Heuristics are said so where they are.
import { contrast, luminance } from '../image-engine/lint/color';
import type { Frac, Measured, MeasuredColour, Px } from './types';

type RGB = [number, number, number];
const hex = (c: RGB) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const px = (p: Px, x: number, y: number): RGB => {
  const k = (y * p.width + x) * 4;
  return [p.data[k], p.data[k + 1], p.data[k + 2]];
};
const l1 = (a: RGB, b: RGB) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const lum = (c: RGB) => luminance(c[0], c[1], c[2]);
const grey = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const sat = (c: RGB) => {
  const mx = Math.max(...c);
  return mx === 0 ? 0 : (mx - Math.min(...c)) / mx;
};

/** The few colours that make up the picture: 4-bit bins merged when their colours are close. Largest first. */
export function paletteOf(p: Px, max = 6, minShare = 0.008): { colours: { rgb: RGB; share: number }[]; ring: RGB } {
  const bins = new Map<number, { r: number; g: number; b: number; n: number }>();
  const step = Math.max(1, Math.floor(Math.sqrt((p.width * p.height) / 40000)));
  let total = 0;
  for (let y = 0; y < p.height; y += step)
    for (let x = 0; x < p.width; x += step) {
      const [r, g, b] = px(p, x, y);
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const e = bins.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
      e.r += r;
      e.g += g;
      e.b += b;
      e.n++;
      bins.set(key, e);
      total++;
    }
  const sorted = [...bins.values()].sort((a, b) => b.n - a.n).map((e) => ({ rgb: [e.r / e.n, e.g / e.n, e.b / e.n] as RGB, n: e.n }));
  const clusters: { sum: RGB; n: number; rgb: RGB }[] = [];
  for (const s of sorted) {
    const near = clusters.find((c) => l1(c.rgb, s.rgb) < 56);
    if (near) {
      near.sum = [near.sum[0] + s.rgb[0] * s.n, near.sum[1] + s.rgb[1] * s.n, near.sum[2] + s.rgb[2] * s.n];
      near.n += s.n;
      near.rgb = [near.sum[0] / near.n, near.sum[1] / near.n, near.sum[2] / near.n];
    } else clusters.push({ sum: [s.rgb[0] * s.n, s.rgb[1] * s.n, s.rgb[2] * s.n], n: s.n, rgb: s.rgb });
  }
  clusters.sort((a, b) => b.n - a.n);
  const colours = clusters.filter((c) => c.n / total >= minShare).slice(0, max).map((c) => ({ rgb: c.rgb, share: c.n / total }));
  // The ring: the outer 3% of the frame, where the background shows even when a photo fills the middle.
  const ringN = new Map<number, number>();
  const bx = Math.max(1, Math.round(p.width * 0.03));
  const by = Math.max(1, Math.round(p.height * 0.03));
  for (let y = 0; y < p.height; y += 2)
    for (let x = 0; x < p.width; x += 2) {
      if (x >= bx && x < p.width - bx && y >= by && y < p.height - by) continue;
      const i = colours.reduce((best, c, k) => (l1(c.rgb, px(p, x, y)) < l1(colours[best].rgb, px(p, x, y)) ? k : best), 0);
      ringN.set(i, (ringN.get(i) ?? 0) + 1);
    }
  const top = [...ringN.entries()].sort((a, b) => b[1] - a[1])[0];
  return { colours, ring: colours[top ? top[0] : 0]?.rgb ?? [255, 255, 255] };
}

const BLOCK = 8;
/** Per 8 by 8 block: how much the brightness varies (flat colour has almost none) and the mean saturation. */
function blocks(p: Px) {
  const cols = Math.floor(p.width / BLOCK);
  const rows = Math.floor(p.height / BLOCK);
  const std = new Float32Array(cols * rows);
  const mean = new Float32Array(cols * rows);
  const satM = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let s = 0;
      let s2 = 0;
      let sa = 0;
      for (let y = 0; y < BLOCK; y++)
        for (let x = 0; x < BLOCK; x++) {
          const v = px(p, c * BLOCK + x, r * BLOCK + y);
          const g = grey(v);
          s += g;
          s2 += g * g;
          sa += sat(v);
        }
      const n = BLOCK * BLOCK;
      mean[r * cols + c] = s / n;
      std[r * cols + c] = Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
      satM[r * cols + c] = sa / n;
    }
  return { cols, rows, std, mean, sat: satM };
}

/** Rows of text: the horizontal bands where pixels of the text colour are dense. Returns bands as [y0, y1) in pixels. */
function textBands(mask: Uint8Array, w: number, h: number): { y0: number; y1: number; x0: number; x1: number }[] {
  const bands: { y0: number; y1: number; x0: number; x1: number }[] = [];
  let cur: { y0: number; x0: number; x1: number } | null = null;
  for (let y = 0; y <= h; y++) {
    let n = 0;
    let x0 = w;
    let x1 = -1;
    if (y < h) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
    const on = y < h && n / w >= 0.006;
    if (on) {
      cur = cur ? { y0: cur.y0, x0: Math.min(cur.x0, x0), x1: Math.max(cur.x1, x1) } : { y0: y, x0, x1 };
    } else if (cur) {
      bands.push({ y0: cur.y0, y1: y, x0: cur.x0, x1: cur.x1 });
      cur = null;
    }
  }
  return bands.filter((b) => b.y1 - b.y0 >= Math.max(3, h * 0.008));
}

const placement = (f: Frac) => {
  const cx = f.x + f.width / 2;
  const cy = f.y + f.height / 2;
  return `${cy < 0.36 ? 'top' : cy > 0.64 ? 'bottom' : 'middle'}-${cx < 0.36 ? 'left' : cx > 0.64 ? 'right' : 'centre'}`;
};

/** Everything the code can measure about one picture. `p` should be a downscaled copy (about 300 to 500 px wide). */
export function measure(p: Px): Measured {
  const W = p.width;
  const H = p.height;
  const { colours, ring } = paletteOf(p);
  const palette: MeasuredColour[] = colours.map((c) => ({ hex: hex(c.rgb), share: Math.round(c.share * 1000) / 1000 }));
  const bg = ring;
  const others = colours.filter((c) => l1(c.rgb, bg) > 60 && c.share >= 0.004);
  const best = others.reduce<{ rgb: RGB; r: number } | null>((b, c) => {
    const r = contrast(lum(c.rgb), lum(bg));
    return !b || r > b.r ? { rgb: c.rgb, r } : b;
  }, null);
  const textRgb = best && best.r >= 3 ? best.rgb : null;

  // Which blocks look like a photo: busy (not flat colour) and not thin lines of text.
  const B = blocks(p);
  const busy = new Uint8Array(B.cols * B.rows);
  let busyN = 0;
  let flatN = 0;
  for (let i = 0; i < busy.length; i++) {
    if (B.std[i] > 0.075) {
      busy[i] = 1;
      busyN++;
    } else if (B.std[i] < 0.02) flatN++;
  }
  const area = B.cols * B.rows || 1;
  // Text-like strokes are thin; a photo is a large region of busy blocks. Look for the biggest connected busy region.
  const seen = new Uint8Array(busy.length);
  let biggest = 0;
  const photoBlocks: number[] = [];
  for (let s = 0; s < busy.length; s++) {
    if (!busy[s] || seen[s]) continue;
    const comp: number[] = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      const cx = c % B.cols;
      const cy = (c - cx) / B.cols;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= B.cols || ny >= B.rows) continue;
        const n = ny * B.cols + nx;
        if (busy[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (comp.length > biggest) {
      biggest = comp.length;
      photoBlocks.length = 0;
      photoBlocks.push(...comp);
    }
  }
  const photoShare = photoBlocks.length / area;
  const photoPresent = photoShare >= 0.12;

  // Text mask and the lines of text.
  const mask = new Uint8Array(W * H);
  if (textRgb)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) if (l1(px(p, x, y), textRgb) < 90) mask[y * W + x] = 1;
  // On a photo the text colour appears everywhere in the photo: only trust text bands outside the photo region.
  if (photoPresent && photoShare > 0.6) mask.fill(0);
  const bands = textBands(mask, W, H);
  const tallest = bands.reduce<(typeof bands)[number] | null>((t, b) => (!t || b.y1 - b.y0 > t.y1 - t.y0 ? b : t), null);
  // Blocks of text: bands close together belong to one block.
  const groups: { y0: number; y1: number; x0: number; x1: number }[] = [];
  for (const b of bands) {
    const g = groups[groups.length - 1];
    if (g && b.y0 - g.y1 < Math.max(b.y1 - b.y0, 6) * 0.9) {
      g.y1 = b.y1;
      g.x0 = Math.min(g.x0, b.x0);
      g.x1 = Math.max(g.x1, b.x1);
    } else groups.push({ ...b });
  }
  const frac = (g: { y0: number; y1: number; x0: number; x1: number }): Frac => ({ x: g.x0 / W, y: g.y0 / H, width: (g.x1 - g.x0 + 1) / W, height: (g.y1 - g.y0) / H });
  const zones = groups.map(frac);
  const titleGroup = tallest ? groups.find((g) => tallest.y0 >= g.y0 && tallest.y1 <= g.y1) ?? null : null;

  // Margins: where the content (anything unlike the background) begins, from each edge.
  let margins: Measured['margins'] = null;
  const differs = (x: number, y: number) => l1(px(p, x, y), bg) > 70;
  let nonBg = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (differs(x, y)) nonBg++;
  if (nonBg / ((W * H) / 4) < 0.9) {
    const colHas = (x: number) => { let n = 0; for (let y = 0; y < H; y += 2) if (differs(x, y)) n++; return n / (H / 2) > 0.012; };
    const rowHas = (y: number) => { let n = 0; for (let x = 0; x < W; x += 2) if (differs(x, y)) n++; return n / (W / 2) > 0.012; };
    let l = 0; while (l < W && !colHas(l)) l++;
    let r = W - 1; while (r > l && !colHas(r)) r--;
    let t = 0; while (t < H && !rowHas(t)) t++;
    let bt = H - 1; while (bt > t && !rowHas(bt)) bt--;
    margins = { left: Math.round((l / W) * 1000) / 1000, top: Math.round((t / H) * 1000) / 1000, right: Math.round(((W - 1 - r) / W) * 1000) / 1000, bottom: Math.round(((H - 1 - bt) / H) * 1000) / 1000 };
  }

  // The photo's look, measured on the photo-like blocks only.
  let satSum = 0;
  let meanSum = 0;
  let meanSq = 0;
  let lapSum = 0;
  let lapN = 0;
  for (const b of photoBlocks) {
    satSum += B.sat[b];
    meanSum += B.mean[b];
    meanSq += B.mean[b] * B.mean[b];
  }
  const nPB = Math.max(1, photoBlocks.length);
  const meanSat = satSum / nPB;
  const spread = Math.sqrt(Math.max(0, meanSq / nPB - (meanSum / nPB) ** 2));
  // Sharpness: variance of the Laplacian of the brightness inside photo blocks.
  for (const b of photoBlocks.filter((_, i) => i % 3 === 0)) {
    const bx = (b % B.cols) * BLOCK;
    const by = Math.floor(b / B.cols) * BLOCK;
    for (let y = 1; y < BLOCK - 1; y++)
      for (let x = 1; x < BLOCK - 1; x++) {
        const c = grey(px(p, bx + x, by + y));
        const v = 4 * c - grey(px(p, bx + x - 1, by + y)) - grey(px(p, bx + x + 1, by + y)) - grey(px(p, bx + x, by + y - 1)) - grey(px(p, bx + x, by + y + 1));
        lapSum += v * v;
        lapN++;
      }
  }
  const sharp = lapN ? lapSum / lapN : 0;
  // Halftone: a regular dot screen makes the brightness repeat along a row; look for a strong repeat at a short distance.
  let halftoneRows = 0;
  let rowsTried = 0;
  for (const b of photoBlocks.filter((_, i) => i % 7 === 0).slice(0, 40)) {
    const bx = (b % B.cols) * BLOCK;
    const by = Math.floor(b / B.cols) * BLOCK + 4;
    if (bx + 40 > W) continue;
    const row: number[] = [];
    for (let x = 0; x < 40; x++) row.push(grey(px(p, bx + x, by)));
    const m = row.reduce((a, c) => a + c, 0) / row.length;
    const v = row.reduce((a, c) => a + (c - m) ** 2, 0) || 1;
    let peak = 0;
    for (let lag = 4; lag <= 16; lag++) {
      let s = 0;
      for (let x = 0; x + lag < row.length; x++) s += (row[x] - m) * (row[x + lag] - m);
      peak = Math.max(peak, s / v);
    }
    rowsTried++;
    if (peak > 0.55) halftoneRows++;
  }
  // Duotone: the saturated pixels of the photo all have nearly the same hue.
  const hues: number[] = [];
  for (const b of photoBlocks.filter((_, i) => i % 4 === 0)) {
    const bx = (b % B.cols) * BLOCK;
    const by = Math.floor(b / B.cols) * BLOCK;
    for (let y = 0; y < BLOCK; y += 2)
      for (let x = 0; x < BLOCK; x += 2) {
        const [r, g, bl] = px(p, bx + x, by + y);
        const mx = Math.max(r, g, bl);
        const d = mx - Math.min(r, g, bl);
        if (mx < 30 || d / mx < 0.2) continue;
        const h = mx === r ? ((g - bl) / d) % 6 : mx === g ? (bl - r) / d + 2 : (r - g) / d + 4;
        hues.push(((h * 60) % 360 + 360) % 360);
      }
  }
  let hueSpread = 360;
  if (hues.length > 30) {
    const sx = hues.reduce((a, h) => a + Math.cos((h * Math.PI) / 180), 0) / hues.length;
    const sy = hues.reduce((a, h) => a + Math.sin((h * Math.PI) / 180), 0) / hues.length;
    hueSpread = (Math.sqrt(-2 * Math.log(Math.max(1e-6, Math.hypot(sx, sy)))) * 180) / Math.PI;
  }

  // The centre of detail among the photo blocks (a guess at where the subject is).
  let dx = 0;
  let dy = 0;
  let dn = 0;
  for (const b of photoBlocks) {
    const wgt = B.std[b] * (0.5 + B.sat[b]);
    dx += wgt * ((b % B.cols) + 0.5);
    dy += wgt * (Math.floor(b / B.cols) + 0.5);
    dn += wgt;
  }

  const photo: Measured['photo'] = {
    present: photoPresent,
    share: Math.round(photoShare * 1000) / 1000,
    blackAndWhite: photoPresent && meanSat < 0.08,
    highContrast: photoPresent && spread > 0.28,
    blurred: photoPresent && sharp < 0.0006,
    halftone: rowsTried >= 4 && halftoneRows / rowsTried > 0.4,
    duotone: photoPresent && meanSat >= 0.12 && hueSpread < 22,
    meanSaturation: Math.round(meanSat * 1000) / 1000,
    brightnessSpread: Math.round(spread * 1000) / 1000,
    detailCentre: photoPresent && dn > 0 ? { x: Math.round((dx / dn / B.cols) * 1000) / 1000, y: Math.round((dy / dn / B.rows) * 1000) / 1000 } : null,
  };

  return {
    size: { width: W, height: H },
    palette,
    background: hex(bg),
    textColour: textRgb ? hex(textRgb) : null,
    contrast: others.map((c) => ({ hex: hex(c.rgb), ratio: Math.round(contrast(lum(c.rgb), lum(bg)) * 10) / 10 })),
    margins,
    titleHeight: tallest ? Math.round(((tallest.y1 - tallest.y0) / H) * 1000) / 1000 : null,
    titleWidth: tallest ? Math.round(((tallest.x1 - tallest.x0 + 1) / W) * 1000) / 1000 : null,
    title: titleGroup ? frac(titleGroup) : null,
    titlePlacement: titleGroup ? placement(frac(titleGroup)) : null,
    textZones: zones,
    textBlocks: groups.length,
    emptySpace: Math.round((flatN / area) * 1000) / 1000,
    photo,
  };
}

/** Plain lines for the screen: every value with its name, as MEASURED. */
export function describeMeasured(m: Measured): { label: string; value: string }[] {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const rows: { label: string; value: string }[] = [
    { label: 'Palette', value: m.palette.map((c) => `${c.hex} (${pct(c.share)})`).join(', ') },
    { label: 'Background', value: m.background },
    { label: 'Text colour', value: m.textColour ?? 'none stands out from the background' },
    { label: 'Contrast against the background', value: m.contrast.length ? m.contrast.map((c) => `${c.hex} ${c.ratio}:1`).join(', ') : 'only one colour' },
    { label: 'Margins (left, top, right, bottom)', value: m.margins ? [m.margins.left, m.margins.top, m.margins.right, m.margins.bottom].map(pct).join(', ') : 'a picture fills the frame' },
    { label: 'Biggest line of text', value: m.titleHeight !== null ? `${pct(m.titleHeight)} of the height, ${pct(m.titleWidth ?? 0)} of the width` : 'none found' },
    { label: 'Title place', value: m.titlePlacement ?? 'none found' },
    { label: 'Text blocks', value: String(m.textBlocks) },
    { label: 'Empty space', value: pct(m.emptySpace) },
    { label: 'Photo', value: m.photo.present ? `${pct(m.photo.share)} of the frame` : 'none found' },
  ];
  if (m.photo.present)
    rows.push({
      label: 'Photo look',
      value: [m.photo.blackAndWhite && 'black and white', m.photo.highContrast && 'high contrast', m.photo.blurred && 'blurred', m.photo.halftone && 'halftone dots', m.photo.duotone && 'two-colour tint'].filter(Boolean).join(', ') || 'no special treatment found',
    });
  return rows;
}
