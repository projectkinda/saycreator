// A cheap guess at where the interesting part of a picture is, so a crop does not cut it off.
// Not face detection and not understanding: it looks for where there is the most detail and colour.
import type { Pixels } from '../lint/metrics';

export interface Focal {
  x: number;
  y: number;
  note: string;
}

/**
 * Chooses where a box of the given shape should sit on the picture. Only the long axis can move
 * (if the picture is wider than the box, the crop slides left and right).
 */
export function suggestFocal(img: Pixels, boxW: number, boxH: number): Focal {
  const { width: w, height: h, data } = img;
  const srcRatio = w / h;
  const boxRatio = boxW / boxH;
  if (Math.abs(srcRatio - boxRatio) < 0.02) return { x: 0.5, y: 0.5, note: 'The picture already has this shape, so nothing is cropped.' };

  const gray = new Float32Array(w * h);
  const sat = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    sat[i] = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  }
  const horizontal = srcRatio > boxRatio; // crop slides along x
  const along = horizontal ? w : h;
  const across = horizontal ? h : w;
  const energy = new Float64Array(along);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const e = (Math.abs(gray[i + 1] - gray[i - 1]) + Math.abs(gray[i + w] - gray[i - w])) * (0.5 + sat[i]);
      energy[horizontal ? x : y] += e;
    }
  const win = Math.max(1, Math.round(along * (horizontal ? boxRatio / srcRatio : srcRatio / boxRatio)));
  const prefix = new Float64Array(along + 1);
  for (let i = 0; i < along; i++) prefix[i + 1] = prefix[i] + energy[i];
  let best = 0;
  let bestScore = -1;
  for (let start = 0; start + win <= along; start++) {
    const centre = (start + win / 2) / along;
    const score = (prefix[start + win] - prefix[start]) * (1 - 0.6 * Math.abs(centre - 0.5) * 2); // strong pull towards the middle: most subjects sit near it
    if (score > bestScore) {
      bestScore = score;
      best = start;
    }
  }
  const centre = (best + win / 2) / along;
  void across;
  return {
    x: horizontal ? centre : 0.5,
    y: horizontal ? 0.5 : centre,
    note: `Crop centred ${Math.round(centre * 100)}% ${horizontal ? 'across' : 'down'} the picture, where most detail is (a guess, not face detection).`,
  };
}
