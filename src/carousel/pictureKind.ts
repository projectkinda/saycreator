// Screenshot or photo, decided from the picture's own pixels when it is added. SAFE BY DEFAULT (Round 15): a wrong "screenshot" is harmless (the picture just never goes under text), a wrong "photo" breaks a slide
// (text over a screenshot's own text). So a picture is a PHOTO only when it is clearly one; everything else, and everything we cannot read, is a SCREENSHOT.
//   1. the picture is looked at on a copy of at most 160 px on its long side;
//   2. `top16` = share of pixels in the 16 most common colour buckets (4 bits per channel); `buckets` = number of distinct buckets used;
//   3. `flat` = share of 4x4 blocks whose three channels each vary by 6 or less (a window, a card, a page background);
//   4. `edges` = share of pixels on a sharp horizontal or vertical edge (luminance jumps by more than 40 to the next pixel);
//   5. `grain` = share of neighbouring pixel pairs whose luminance differs by a small, non-zero amount (1 to 12): the texture of a camera sensor. A screenshot is exactly flat (0) or a hard jump.
// Round L: GRAIN FIRST. The old rule (top16 < 0.50 and flat < 0.12 and 150+ colours and grain >= 0.30) called 5 of 7 real photos screenshots: flat sky and shadows put 54 to 73% of a real photo
// in 16 colours. On a labelled set (7 real photos, 22 real screenshots of the app in PNG and JPEG, 10 code-drawn graphics; out/round-l/rule.md) grain separates them under both decodes:
// every real photo 0.537 or more, every screenshot or graphic 0.431 or less. So:
//   - a PNG, or a file whose name contains "screenshot": a screenshot (not read further);
//   - grain >= 0.50 and top16 < 0.85: a PHOTO (top16 is only a guard: a very flat picture whose compression lifts its grain keeps a top16 near 1; real photos are 0.73 at most, non-photos 0.89 or more);
//   - 0.47 <= grain < 0.50: UNSURE, which is a screenshot (safe by default);
//   - grain < 0.47: a screenshot.
// Round AB: DARK PHOTOS. Flat near-black areas (a night sky, a black arch, a dark background) have no grain and pack into a few colour buckets, so 4 real dark photos read as screenshots
// (grain 0.314, or top16 0.878 to 0.932). So the picture is read a second time leaving out its flat near-black pixels (`litGrain`, `litTop16`), and it is ALSO a photo when there
//   - litGrain >= 0.62 and litTop16 < 0.90.
// On 96 labelled pictures (out/round-ab/classify.md) the 4 dark photos have litGrain 0.672 or more and litTop16 0.843 or less; every true screenshot has litGrain 0.574 or less; the two
// stand-ins with litGrain over 0.62 have litTop16 1.0. Anything below 0.62 stays a screenshot (safe by default). A picture with no dark part reads the same both times.
// A picture whose content is unknown (added before this rule, or unreadable) counts as a screenshot: see `contentOr`.
export type PictureContent = 'screenshot' | 'photo';
export interface ContentReading {
  content: PictureContent;
  top16: number;
  flat: number;
  edges: number;
  buckets: number;
  grain: number;
  /** Round AB: grain and top16 leaving out the flat near-black pixels. */
  litGrain?: number;
  litTop16?: number;
  /** Round L: true when the grain is in the unsure band (the picture is then a screenshot). */
  unsure?: boolean;
  /** Round L: why, in a few words (for the report and the tests). */
  why?: string;
}
/** Round L: a photo from this much grain up (with top16 under `top16Max`); between `grainUnsure` and `grainPhoto` the reading is unsure, which is a screenshot. */
export const PHOTO_RULE = { grainPhoto: 0.5, grainUnsure: 0.47, top16Max: 0.85, litGrainPhoto: 0.62, litTop16Max: 0.9 };
/** Round AB: a pixel this dark (luminance 0..255) is near black; a pair of near-black pixels within 2 of each other is a flat dark part. */
const DARK_LUM = 20;
/** A file that is a screenshot by its type or its name, whatever its pixels say. */
export const screenshotByFile = (png: boolean, name = ''): boolean => png || /screenshot/i.test(name);
/** Unknown content is a screenshot (safe by default). */
export const contentOr = (c?: PictureContent | null): PictureContent => (c === 'photo' ? 'photo' : 'screenshot');
const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** The reading of RGBA pixel data (w x h). Pure, so tests and the app agree. `png`: the file is a PNG (a stricter test for "photo"). */
export function readContent(d: Uint8ClampedArray, w: number, h: number, png = false, name = ''): ContentReading {
  const counts = new Map<number, number>(), litCounts = new Map<number, number>();
  let n = 0, litN = 0;
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] < 8) continue;
    const key = ((d[i * 4] >> 4) << 8) | ((d[i * 4 + 1] >> 4) << 4) | (d[i * 4 + 2] >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    n++;
    if (lum(d, i * 4) < DARK_LUM) continue;
    litCounts.set(key, (litCounts.get(key) ?? 0) + 1);
    litN++;
  }
  const top16Of = (m: Map<number, number>, total: number) => (total ? [...m.values()].sort((a, b) => b - a).slice(0, 16).reduce((a, b) => a + b, 0) / total : 1);
  const top16 = top16Of(counts, n), litTop16 = top16Of(litCounts, litN);
  let blocks = 0, flatBlocks = 0;
  for (let by = 0; by + 4 <= h; by += 4) for (let bx = 0; bx + 4 <= w; bx += 4) {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    for (let y = by; y < by + 4; y++) for (let x = bx; x < bx + 4; x++) for (let c = 0; c < 3; c++) { const v = d[(y * w + x) * 4 + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
    blocks++;
    if (hi[0] - lo[0] <= 6 && hi[1] - lo[1] <= 6 && hi[2] - lo[2] <= 6) flatBlocks++;
  }
  const flat = blocks ? flatBlocks / blocks : 1;
  let edgePx = 0, grainPx = 0, litPairs = 0, litGrainPx = 0;
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = (y * w + x) * 4;
    const a = lum(d, i), bx = lum(d, i + 4), by = lum(d, i + w * 4);
    const dx = Math.abs(a - bx), dy = Math.abs(a - by);
    const g = (dx >= 1 && dx <= 12) || (dy >= 1 && dy <= 12);
    if (dx > 40 || dy > 40) edgePx++;
    if (g) grainPx++;
    if (a < DARK_LUM && bx < DARK_LUM && by < DARK_LUM && dx <= 2 && dy <= 2) continue; // a flat near-black part
    litPairs++;
    if (g) litGrainPx++;
  }
  const pairs = Math.max(1, (w - 1) * (h - 1));
  const edges = edgePx / pairs, grain = grainPx / pairs, litGrain = litGrainPx / Math.max(1, litPairs);
  const R = PHOTO_RULE;
  const byFile = screenshotByFile(png, name);
  const grainPhoto = n > 0 && grain >= R.grainPhoto && top16 < R.top16Max;
  const darkPhoto = n > 0 && litN > 0 && !grainPhoto && litGrain >= R.litGrainPhoto && litTop16 < R.litTop16Max;
  const clearlyPhoto = !byFile && (grainPhoto || darkPhoto);
  const unsure = !byFile && !clearlyPhoto && grain >= R.grainUnsure && grain < R.grainPhoto;
  const why = byFile ? (png ? 'a PNG' : 'named a screenshot') : clearlyPhoto ? (darkPhoto ? 'camera grain outside its dark parts' : 'camera grain') : unsure ? 'unsure (grain between ' + R.grainUnsure + ' and ' + R.grainPhoto + ')' : grain >= R.grainPhoto ? 'too few colours for a photo' : 'no camera grain';
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return { content: clearlyPhoto ? 'photo' : 'screenshot', top16: r3(top16), flat: r3(flat), edges: r3(edges), buckets: counts.size, grain: r3(grain), litGrain: r3(litGrain), litTop16: r3(litTop16), ...(unsure ? { unsure: true } : {}), why };
}

/** Reads a picture (any image source the canvas can draw) at 160 px and classifies it. Unreadable: a screenshot. */
export function readContentOf(src: CanvasImageSource & { width?: number; height?: number }, width: number, height: number, png = false, name = ''): ContentReading {
  const k = Math.min(1, 160 / Math.max(width, height));
  const w = Math.max(8, Math.round(width * k)), h = Math.max(8, Math.round(height * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = true;
  g.drawImage(src, 0, 0, w, h);
  return readContent(g.getImageData(0, 0, w, h).data, w, h, png, name);
}
