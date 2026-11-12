// Screenshot or photo (Round 14), decided from the picture's own pixels when it is added. The rule (documented here, simple on purpose):
//   1. the picture is looked at on a copy of at most 160 px on its long side;
//   2. each pixel is put in a colour bucket (4 bits per channel: 4096 buckets); `top16` is the share of all pixels that fall in the 16 most common buckets;
//   3. `flat` is the share of 4x4 blocks whose three channels each vary by 6 or less (a flat area: a window, a card, a page background);
//   4. `edges` is the share of pixels that sit on a sharp horizontal or vertical edge (the luminance jumps by more than 40 to the next pixel to the right or below).
// A picture is a SCREENSHOT when top16 > 0.60, or when flat >= 0.50 and edges >= 0.02 (large flat areas with many sharp straight edges). Everything else is a PHOTO: a photo's smooth gradients and noise
// spread its pixels over hundreds of buckets, and a photo has few perfectly flat blocks. The numbers are returned so they can be shown and tested.
export type PictureContent = 'screenshot' | 'photo';
export interface ContentReading {
  content: PictureContent;
  top16: number;
  flat: number;
  edges: number;
  buckets: number;
}
export const SCREENSHOT_TOP16 = 0.6;
export const SCREENSHOT_FLAT = 0.5;
export const SCREENSHOT_EDGES = 0.02;
const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** The reading of RGBA pixel data (w x h). Pure, so tests and the app agree. */
export function readContent(d: Uint8ClampedArray, w: number, h: number): ContentReading {
  const counts = new Map<number, number>();
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] < 8) continue;
    const key = ((d[i * 4] >> 4) << 8) | ((d[i * 4 + 1] >> 4) << 4) | (d[i * 4 + 2] >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    n++;
  }
  const sorted = [...counts.values()].sort((a, b) => b - a);
  const top16 = n ? sorted.slice(0, 16).reduce((a, b) => a + b, 0) / n : 0;
  let blocks = 0, flatBlocks = 0;
  for (let by = 0; by + 4 <= h; by += 4) for (let bx = 0; bx + 4 <= w; bx += 4) {
    let lo = [255, 255, 255], hi = [0, 0, 0];
    for (let y = by; y < by + 4; y++) for (let x = bx; x < bx + 4; x++) for (let c = 0; c < 3; c++) { const v = d[(y * w + x) * 4 + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
    blocks++;
    if (hi[0] - lo[0] <= 6 && hi[1] - lo[1] <= 6 && hi[2] - lo[2] <= 6) flatBlocks++;
  }
  const flat = blocks ? flatBlocks / blocks : 0;
  let edgePx = 0;
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = (y * w + x) * 4;
    if (Math.abs(lum(d, i) - lum(d, i + 4)) > 40 || Math.abs(lum(d, i) - lum(d, i + w * 4)) > 40) edgePx++;
  }
  const edges = edgePx / Math.max(1, (w - 1) * (h - 1));
  const content: PictureContent = top16 > SCREENSHOT_TOP16 || (flat >= SCREENSHOT_FLAT && edges >= SCREENSHOT_EDGES) ? 'screenshot' : 'photo';
  return { content, top16: Math.round(top16 * 1000) / 1000, flat: Math.round(flat * 1000) / 1000, edges: Math.round(edges * 1000) / 1000, buckets: counts.size };
}

/** Reads a picture (any image source the canvas can draw) at 160 px and classifies it. */
export function readContentOf(src: CanvasImageSource & { width?: number; height?: number }, width: number, height: number): ContentReading {
  const k = Math.min(1, 160 / Math.max(width, height));
  const w = Math.max(8, Math.round(width * k)), h = Math.max(8, Math.round(height * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = true;
  g.drawImage(src, 0, 0, w, h);
  return readContent(g.getImageData(0, 0, w, h).data, w, h);
}
