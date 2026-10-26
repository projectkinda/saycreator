// Photo treatments, drawn in the browser with the 2D canvas. Each one is a small, plain operation on the pixels of the
// photo at the size it will be drawn, applied in the order the plan lists them. Nothing is sent anywhere.
import { parseColor, type RGB } from '../lint/color';
import type { Treatment } from '../types';
import { coverCrop } from './geometry';

type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
const ctxOf = (c: HTMLCanvasElement, readback = false): Ctx => c.getContext('2d', readback ? { willReadFrequently: true } : undefined)!;

/** A small, repeatable random number generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo = 0, hi = 255) => (v < lo ? lo : v > hi ? hi : v);
const lumOf = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const rgbOf = (css: string): RGB => parseColor(css).rgb;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** A copy of the canvas with its edge pixels stretched outwards by `p`, so a blur near the edge does not fade to transparent. */
function padded(src: HTMLCanvasElement, p: number): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const out = makeCanvas(w + 2 * p, h + 2 * p);
  const g = ctxOf(out);
  g.drawImage(src, p, p);
  g.drawImage(src, 0, 0, w, 1, p, 0, w, p); // top
  g.drawImage(src, 0, h - 1, w, 1, p, p + h, w, p); // bottom
  g.drawImage(src, 0, 0, 1, h, 0, p, p, h); // left
  g.drawImage(src, w - 1, 0, 1, h, p + w, p, p, h); // right
  g.drawImage(src, 0, 0, 1, 1, 0, 0, p, p);
  g.drawImage(src, w - 1, 0, 1, 1, p + w, 0, p, p);
  g.drawImage(src, 0, h - 1, 1, 1, 0, p + h, p, p);
  g.drawImage(src, w - 1, h - 1, 1, 1, p + w, p + h, p, p);
  return out;
}

function blurCanvas(c: HTMLCanvasElement, radius: number): void {
  if (radius <= 0) return;
  const p = Math.ceil(radius * 3);
  const big = padded(c, p);
  const tmp = makeCanvas(big.width, big.height);
  const g = ctxOf(tmp);
  g.filter = `blur(${radius}px)`;
  g.drawImage(big, 0, 0);
  const o = ctxOf(c);
  o.clearRect(0, 0, c.width, c.height);
  o.drawImage(tmp, -p, -p);
}

function eachPixel(c: HTMLCanvasElement, fn: (d: Uint8ClampedArray, i: number, x: number, y: number) => void): void {
  const g = ctxOf(c, true);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let y = 0, i = 0; y < c.height; y++) for (let x = 0; x < c.width; x++, i += 4) fn(d, i, x, y);
  g.putImageData(img, 0, 0);
}

function motionBlur(c: HTMLCanvasElement, length: number, angleDeg: number): void {
  if (length < 1) return;
  const p = Math.ceil(length / 2) + 2;
  const big = padded(c, p);
  const out = makeCanvas(big.width, big.height);
  const g = ctxOf(out);
  const steps = Math.min(40, Math.max(6, Math.round(length / 3)));
  const a = (angleDeg * Math.PI) / 180;
  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 0 : i / (steps - 1) - 0.5;
    g.globalAlpha = 1 / (i + 1); // a running average of the shifted copies
    g.drawImage(big, Math.cos(a) * length * t, Math.sin(a) * length * t);
  }
  const o = ctxOf(c);
  o.clearRect(0, 0, c.width, c.height);
  o.drawImage(out, -p, -p);
}

function halftone(c: HTMLCanvasElement, cell: number, angleDeg: number, dark: string, light: string, contrast: number): void {
  const w = c.width;
  const h = c.height;
  // Sample the tone from a blurred copy, so each dot reads the average of its cell.
  const probe = makeCanvas(w, h);
  ctxOf(probe).drawImage(c, 0, 0);
  blurCanvas(probe, Math.max(1, cell * 0.45));
  const data = ctxOf(probe, true).getImageData(0, 0, w, h).data;
  const g = ctxOf(c);
  g.fillStyle = light;
  g.fillRect(0, 0, w, h);
  g.fillStyle = dark;
  const a = (angleDeg * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const reach = Math.hypot(w, h);
  const n = Math.ceil(reach / cell) + 2;
  for (let v = -n; v <= n; v++)
    for (let u = -n; u <= n; u++) {
      const x = w / 2 + (u * ca - v * sa) * cell;
      const y = h / 2 + (u * sa + v * ca) * cell;
      if (x < -cell || y < -cell || x > w + cell || y > h + cell) continue;
      const ix = clamp(Math.round(x), 0, w - 1);
      const iy = clamp(Math.round(y), 0, h - 1);
      const k = (iy * w + ix) * 4;
      const tone = lumOf(data[k], data[k + 1], data[k + 2]);
      const ink = clamp((1 - tone - 0.5) * contrast + 0.5, 0, 1);
      const r = cell * 0.75 * Math.sqrt(ink);
      if (r < 0.35) continue;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
}

/** Applies one treatment to the canvas, in place. */
export function applyTreatment(c: HTMLCanvasElement, t: Treatment): void {
  const w = c.width;
  const h = c.height;
  const g = ctxOf(c);
  switch (t.op) {
    case 'grayscale': {
      const a = t.amount ?? 1;
      eachPixel(c, (d, i) => {
        const l = lumOf(d[i], d[i + 1], d[i + 2]) * 255;
        d[i] = mix(d[i], l, a);
        d[i + 1] = mix(d[i + 1], l, a);
        d[i + 2] = mix(d[i + 2], l, a);
      });
      return;
    }
    case 'duotone': {
      const dk = rgbOf(t.dark);
      const lt = rgbOf(t.light);
      const a = t.amount ?? 1;
      eachPixel(c, (d, i) => {
        const l = lumOf(d[i], d[i + 1], d[i + 2]);
        for (let k = 0; k < 3; k++) d[i + k] = mix(d[i + k], mix(dk[k], lt[k], l), a);
      });
      return;
    }
    case 'halftone':
      halftone(c, Math.max(3, t.cell), t.angle ?? 45, t.dark, t.light, t.contrast ?? 1.25);
      return;
    case 'grain': {
      const size = Math.max(1, Math.round(t.size ?? 1));
      const rnd = rng(t.seed ?? 7);
      const nw = Math.ceil(w / size);
      const nh = Math.ceil(h / size);
      const noise = new Float32Array(nw * nh);
      for (let i = 0; i < noise.length; i++) noise[i] = (rnd() - 0.5) * 2 * t.amount * 255 * 0.5;
      eachPixel(c, (d, i, x, y) => {
        const n = noise[Math.floor(y / size) * nw + Math.floor(x / size)];
        d[i] = clamp(d[i] + n);
        d[i + 1] = clamp(d[i + 1] + n);
        d[i + 2] = clamp(d[i + 2] + n);
      });
      return;
    }
    case 'levels': {
      const b = (t.brightness ?? 0) * 128;
      const cc = t.contrast ?? 0;
      const f = cc >= 0 ? 1 / (1 - cc * 0.9) : 1 + cc;
      const s = 1 + (t.saturation ?? 0);
      eachPixel(c, (d, i) => {
        const l = lumOf(d[i], d[i + 1], d[i + 2]) * 255;
        for (let k = 0; k < 3; k++) {
          const v = mix(l, d[i + k], s);
          d[i + k] = clamp((v - 128) * f + 128 + b);
        }
      });
      return;
    }
    case 'blur':
      blurCanvas(c, t.radius);
      return;
    case 'motionBlur':
      motionBlur(c, t.length, t.angle);
      return;
    case 'tint': {
      const tr = rgbOf(t.color);
      const norm = lumOf(tr[0], tr[1], tr[2]) || 0.5;
      eachPixel(c, (d, i) => {
        for (let k = 0; k < 3; k++) d[i + k] = clamp(mix(d[i + k], (d[i + k] * tr[k]) / 255 / norm, t.amount));
      });
      return;
    }
    case 'vignette': {
      const grad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.hypot(w, h) / 2);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${t.amount})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      return;
    }
    case 'fade': {
      const reach = t.start ?? 0.5;
      const [x0, y0, x1, y1] = t.from === 'bottom' ? [0, h, 0, h * (1 - reach)] : t.from === 'top' ? [0, 0, 0, h * reach] : t.from === 'left' ? [0, 0, w * reach, 0] : [w, 0, w * (1 - reach), 0];
      const col = rgbOf(t.color);
      const grad = g.createLinearGradient(x0, y0, x1, y1);
      // An eased fade, so there is no visible edge where it starts.
      for (let k = 0; k <= 8; k++) grad.addColorStop(k / 8, `rgba(${col[0]},${col[1]},${col[2]},${(t.amount * (1 - k / 8) ** 1.6).toFixed(4)})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      return;
    }
    case 'wash': {
      const col = rgbOf(t.color);
      g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${t.amount})`;
      g.fillRect(0, 0, w, h);
      return;
    }
  }
}

/**
 * The photo at the size of its layer, cropped to cover the box (or contained), then treated in order.
 * `source` is a loaded image. Large photos are drawn down in one step with high-quality smoothing.
 */
export function renderPhoto(source: HTMLImageElement, w: number, h: number, fit: 'cover' | 'contain', focal: { x: number; y: number } | undefined, treatments: Treatment[]): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const g = ctxOf(c);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const nw = source.naturalWidth || source.width;
  const nh = source.naturalHeight || source.height;
  if (fit === 'cover') {
    const k = coverCrop(nw, nh, c.width, c.height, focal);
    g.drawImage(source, k.sx, k.sy, k.sw, k.sh, 0, 0, c.width, c.height);
  } else {
    const s = Math.min(c.width / nw, c.height / nh);
    g.drawImage(source, (c.width - nw * s) / 2, (c.height - nh * s) / 2, nw * s, nh * s);
  }
  for (const t of treatments) applyTreatment(c, t);
  return c;
}

/**
 * A transparent object picture with a contact or drop shadow, a floor reflection and a glow, on a canvas the size of its box.
 * The object stands on a floor line near the bottom (higher when there is a reflection).
 */
export function renderObject(source: HTMLImageElement, w: number, h: number, fx: { shadow?: 'contact' | 'drop'; reflection?: number; glow?: { color: string; blur: number; amount: number } }): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const g = ctxOf(c);
  const nw = source.naturalWidth || source.width;
  const nh = source.naturalHeight || source.height;
  const floorY = h * (fx.reflection ? 0.62 : fx.shadow ? 0.88 : 1);
  const s = Math.min((w * 0.9) / nw, floorY / nh);
  const ow = nw * s;
  const oh = nh * s;
  const ox = (w - ow) / 2;
  const oy = floorY - oh;
  // glow: a blurred, coloured copy behind
  if (fx.glow) {
    const col = rgbOf(fx.glow.color);
    const tmp = makeCanvas(w, h);
    const tg = ctxOf(tmp);
    tg.drawImage(source, ox, oy, ow, oh);
    tg.globalCompositeOperation = 'source-in';
    tg.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    tg.fillRect(0, 0, w, h);
    g.save();
    g.filter = `blur(${fx.glow.blur}px)`;
    g.globalAlpha = fx.glow.amount;
    g.drawImage(tmp, 0, 0);
    g.restore();
  }
  if (fx.shadow === 'contact') {
    g.save();
    g.filter = `blur(${Math.max(4, ow * 0.04)}px)`;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.ellipse(w / 2, floorY + oh * 0.015, ow * 0.4, Math.max(5, oh * 0.035), 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  } else if (fx.shadow === 'drop') {
    g.save();
    g.filter = `blur(${Math.max(6, ow * 0.05)}px) brightness(0)`;
    g.globalAlpha = 0.4;
    g.drawImage(source, ox + ow * 0.05, oy + oh * 0.06, ow, oh);
    g.restore();
  }
  if (fx.reflection) {
    const rh = Math.min(h - floorY, oh * 0.6);
    const ref = makeCanvas(ow, rh);
    const rg = ctxOf(ref);
    rg.translate(0, rh);
    rg.scale(1, -1);
    rg.drawImage(source, 0, 0, nw, nh * (rh / oh), 0, 0, ow, rh);
    rg.setTransform(1, 0, 0, 1, 0, 0);
    rg.globalCompositeOperation = 'destination-in';
    const fade = rg.createLinearGradient(0, 0, 0, rh);
    fade.addColorStop(0, `rgba(0,0,0,${0.55 * fx.reflection})`);
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    rg.fillStyle = fade;
    rg.fillRect(0, 0, ow, rh);
    g.drawImage(ref, ox, floorY + 2);
  }
  g.drawImage(source, ox, oy, ow, oh);
  return c;
}

/** A blurred colour field: a base colour, soft blobs over it, then grain. */
export function renderField(w: number, h: number, base: string, blobs: { x: number; y: number; r: number; color: string; alpha?: number }[], blur: number, grain: number, seed: number): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const g = ctxOf(c);
  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);
  // The blobs are drawn on a canvas a little bigger than the field, then blurred, so they do not thin out at the edges.
  const p = Math.ceil(blur * 2);
  const big = makeCanvas(c.width + 2 * p, c.height + 2 * p);
  const lg = ctxOf(big);
  for (const b of blobs) {
    const col = rgbOf(b.color);
    lg.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${b.alpha ?? 1})`;
    lg.beginPath();
    lg.arc(p + b.x * c.width, p + b.y * c.height, b.r * c.width, 0, Math.PI * 2);
    lg.fill();
  }
  g.save();
  g.filter = `blur(${blur}px)`;
  g.drawImage(big, -p, -p);
  g.restore();
  if (grain > 0) applyTreatment(c, { op: 'grain', amount: grain, size: 2, seed });
  return c;
}
