// Round N: letterbox bars. A photo (never a screenshot) can carry black bars baked into the file (a film still, a video frame): rows or columns at its edges that are near black AND flat
// (almost no variation across the row). Found when the picture is added, they are cut off before the picture is fitted into a slot (a crop rectangle stored with the picture; the file itself is
// never changed), so the bars are not drawn as part of the photo. A real dark photo (night, silhouettes, dark trees) has detail in its dark rows, so it is never cropped.

/** A row is a bar row when its mean luminance (0..255) is under this ... */
export const BAR_LUM = 8;
/** ... and its luminance varies by less than this (standard deviation across the row). */
export const BAR_FLAT = 3;
/** A side counts only when its bars are at least this share of the picture's height (top, bottom) or width (left, right). */
export const BAR_MIN_SHARE = 0.03;
/** The two bars of a pair (top and bottom, or left and right) differ by at most this share of the larger one. */
export const BAR_PAIR = 0.25;
/** The crop never removes more than this share of either side's length in all (a nearly black picture is not "all bars"). */
export const BAR_MAX_SHARE = 0.4;

export interface Bars { top: number; bottom: number; left: number; right: number }
export interface CropRect { x: number; y: number; w: number; h: number }

/** The bars of an RGBA image (pixel counts on each side; 0 where a side has none or too little). */
export function findBars(d: Uint8ClampedArray, w: number, h: number): Bars {
  const lum = (i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const flatDark = (n: number, at: (k: number) => number): boolean => {
    let s = 0, s2 = 0;
    for (let k = 0; k < n; k++) { const v = lum(at(k)); s += v; s2 += v * v; }
    const m = s / n;
    return m < BAR_LUM && Math.sqrt(Math.max(0, s2 / n - m * m)) < BAR_FLAT;
  };
  const row = (y: number) => flatDark(w, (x) => (y * w + x) * 4);
  const col = (x: number) => flatDark(h, (y) => (y * w + x) * 4);
  let top = 0; while (top < h * BAR_MAX_SHARE && row(top)) top++;
  let bottom = 0; while (bottom < h * BAR_MAX_SHARE && row(h - 1 - bottom)) bottom++;
  let left = 0; while (left < w * BAR_MAX_SHARE && col(left)) left++;
  let right = 0; while (right < w * BAR_MAX_SHARE && col(w - 1 - right)) right++;
  // bars come in pairs of about the same size (a letterbox top and bottom, a pillarbox left and right); a dark sky or a dark ground on one side only is part of the photo
  const pair = (a: number, b: number, len: number): [number, number] => (a >= len * BAR_MIN_SHARE && b >= len * BAR_MIN_SHARE && Math.abs(a - b) <= BAR_PAIR * Math.max(a, b) ? [a, b] : [0, 0]);
  const [t, bo] = pair(top, bottom, h);
  const [l, ri] = pair(left, right, w);
  return { top: t, bottom: bo, left: l, right: ri };
}

/** The crop rectangle (in the picture's own pixels, `W` x `H`) that leaves the bars out, from bars found on a copy `w` x `h`; null when there are none. */
export function cropOfBars(b: Bars, w: number, h: number, W: number, H: number): CropRect | null {
  if (!b.top && !b.bottom && !b.left && !b.right) return null;
  const kx = W / w, ky = H / h;
  // one pixel more on each cropped side, so a soft edge of the bar (JPEG ringing) is not kept
  const x = b.left ? Math.ceil((b.left + 1) * kx) : 0, y = b.top ? Math.ceil((b.top + 1) * ky) : 0;
  const x1 = b.right ? Math.floor((w - b.right - 1) * kx) : W, y1 = b.bottom ? Math.floor((h - b.bottom - 1) * ky) : H;
  return x1 - x > W * 0.2 && y1 - y > H * 0.2 ? { x, y, w: x1 - x, h: y1 - y } : null;
}

/** The size the picture is drawn at: its crop when it has one and the person did not ask for the full picture (and it is a photo). */
export function drawnSize(m: { width: number; height: number; crop?: CropRect; fullPicture?: boolean; content?: string }): { width: number; height: number } {
  return m.crop && !m.fullPicture && m.content !== 'screenshot' ? { width: m.crop.w, height: m.crop.h } : { width: m.width, height: m.height };
}
