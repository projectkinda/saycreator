// Reads a photo into the coarse grid the text placement uses (browser only). The photo is cropped to the slide's shape first,
// the same way it will be drawn, so a cell of the grid is a cell of the slide.
import { coverCrop } from '../draw/geometry';
import { makeCanvas } from '../draw/treat';
import type { PhotoInput, PhotoStats } from './zones';

const COLS = 12;
const ROWS = 15;
const SUB = 4; // sampled pixels per cell side

export function loadPicture(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(`Could not load the picture ${src}`));
    i.src = src;
  });
}

/** The brightness and busyness grid for `img` cropped to a box of `aspect` (width over height). */
export function analyseImage(img: CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width: number; height: number }, aspect = 1080 / 1350, focal?: { x: number; y: number }, cols = COLS, rows = ROWS): PhotoStats {
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  const W = cols * SUB;
  const H = rows * SUB;
  const crop = coverCrop(nw, nh, aspect * 1000, 1000, focal);
  const c = makeCanvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const grey = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) grey[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  const lum = new Array<number>(cols * rows).fill(0);
  const detail = new Array<number>(cols * rows).fill(0);
  for (let r = 0; r < rows; r++)
    for (let q = 0; q < cols; q++) {
      let sum = 0;
      let edge = 0;
      for (let y = 0; y < SUB; y++)
        for (let x = 0; x < SUB; x++) {
          const px = q * SUB + x;
          const py = r * SUB + y;
          const v = grey[py * W + px];
          sum += v;
          const right = px + 1 < W ? grey[py * W + px + 1] : v;
          const down = py + 1 < H ? grey[(py + 1) * W + px] : v;
          edge += Math.abs(right - v) + Math.abs(down - v);
        }
      const n = SUB * SUB;
      lum[r * cols + q] = Math.round((sum / n) * 1000) / 1000;
      // A pixel step of about 0.12 between neighbours already looks busy; scale so that is near 1.
      detail[r * cols + q] = Math.round(Math.min(1, edge / n / 0.24) * 1000) / 1000;
    }
  return { cols, rows, lum, detail };
}

/** Loads a picture and reads its grid. `id` and `label` are only names. */
export async function analysePhoto(src: string, id: string, o: { label?: string; focal?: { x: number; y: number }; synthetic?: boolean } = {}): Promise<PhotoInput> {
  const img = await loadPicture(src);
  const stats = analyseImage(img, 1080 / 1350, o.focal);
  return { id, src, width: img.naturalWidth, height: img.naturalHeight, stats, ...(o.focal ? { focal: o.focal } : {}), ...(o.label ? { label: o.label } : {}), ...(o.synthetic ? { synthetic: true } : {}) };
}
