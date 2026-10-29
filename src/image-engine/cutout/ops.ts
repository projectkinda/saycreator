// Edits to a cutout's mask, in code with no model: grow or shrink it, soften its edge, paint on it (erase and restore), and bake it back into a picture
// with an outline and a flip. A mask here is one alpha byte per pixel (255 is subject). Browser only (canvas).
export interface Alpha {
  w: number;
  h: number;
  a: Uint8ClampedArray;
}

const canvas = (w: number, h: number) => new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));

/** The mask picture as alpha values, scaled so its long side is at most `maxSide`. */
export async function alphaOfMask(blob: Blob, maxSide = 1000): Promise<Alpha> {
  const bm = await createImageBitmap(blob);
  const k = Math.min(1, maxSide / Math.max(bm.width, bm.height));
  const c = canvas(bm.width * k, bm.height * k);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bm, 0, 0, c.width, c.height);
  bm.close();
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const a = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4];
  return { w: c.width, h: c.height, a };
}
/** The alpha of a picture that already has a transparent background. */
export async function alphaOfPicture(bm: ImageBitmap, maxSide = 1000): Promise<Alpha> {
  const k = Math.min(1, maxSide / Math.max(bm.width, bm.height));
  const c = canvas(bm.width * k, bm.height * k);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bm, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const a = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  return { w: c.width, h: c.height, a };
}
export async function maskBlob(al: Alpha): Promise<Blob> {
  const c = canvas(al.w, al.h);
  const g = c.getContext('2d')!;
  const im = g.createImageData(al.w, al.h);
  for (let i = 0; i < al.a.length; i++) {
    im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = al.a[i];
    im.data[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}
/** The same mask at another size (smooth), for baking an edit made on a small copy into the full-size cutout. */
export async function resizeAlpha(al: Alpha, w: number, h: number): Promise<Alpha> {
  const src = await createImageBitmap(await maskBlob(al));
  const c = canvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  src.close();
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const a = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4];
  return { w: c.width, h: c.height, a };
}

/** A sliding maximum or minimum over a window of 2r+1 along one axis. */
function slide(src: Uint8ClampedArray, w: number, h: number, r: number, horizontal: boolean, max: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  for (let l = 0; l < lines; l++)
    for (let i = 0; i < len; i++) {
      let v = max ? 0 : 255;
      for (let k = Math.max(0, i - r); k <= Math.min(len - 1, i + r); k++) {
        const p = horizontal ? src[l * w + k] : src[k * w + l];
        v = max ? Math.max(v, p) : Math.min(v, p);
      }
      out[horizontal ? l * w + i : i * w + l] = v;
    }
  return out;
}
/** Makes the subject bigger (px above 0) or smaller (px below 0) by that many pixels all round. */
export function growShrink(al: Alpha, px: number): Alpha {
  const r = Math.round(Math.abs(px));
  if (r === 0) return al;
  const max = px > 0;
  return { w: al.w, h: al.h, a: slide(slide(al.a, al.w, al.h, r, true, max), al.w, al.h, r, false, max) };
}
/** Softens the edge: a blur of the mask (two passes of a box blur), so the cut-out meets the background gently. */
export function soften(al: Alpha, px: number): Alpha {
  const r = Math.round(px);
  if (r <= 0) return al;
  const pass = (src: Uint8ClampedArray, horizontal: boolean) => {
    const out = new Uint8ClampedArray(src.length);
    const len = horizontal ? al.w : al.h;
    const lines = horizontal ? al.h : al.w;
    for (let l = 0; l < lines; l++) {
      let sum = 0;
      const at = (i: number) => src[horizontal ? l * al.w + i : i * al.w + l];
      for (let k = -r; k <= r; k++) sum += at(Math.min(len - 1, Math.max(0, k)));
      for (let i = 0; i < len; i++) {
        out[horizontal ? l * al.w + i : i * al.w + l] = sum / (2 * r + 1);
        sum += at(Math.min(len - 1, i + r + 1)) - at(Math.max(0, i - r));
      }
    }
    return out;
  };
  return { w: al.w, h: al.h, a: pass(pass(pass(pass(al.a, true), false), true), false) };
}
/** Paints on the mask in place: erase takes the subject away inside the circle, restore puts it back. The edge of the brush is soft. */
export function paint(al: Alpha, cx: number, cy: number, r: number, mode: 'erase' | 'restore'): void {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(al.w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(al.h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d > 1) continue;
      const k = d < 0.7 ? 1 : (1 - d) / 0.3;
      const i = y * al.w + x;
      al.a[i] = mode === 'erase' ? Math.round(al.a[i] * (1 - k)) : Math.round(al.a[i] + (255 - al.a[i]) * k);
    }
}

/** The picture with this mask as its alpha, with an optional outline round the subject and an optional left-right flip. Same size as the mask. */
export async function bake(original: ImageBitmap, al: Alpha, o: { flip?: boolean; outline?: { color: string; width: number } } = {}): Promise<Blob> {
  const c = canvas(al.w, al.h);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(original, 0, 0, al.w, al.h);
  const im = g.getImageData(0, 0, al.w, al.h);
  const ring = o.outline && o.outline.width > 0 ? growShrink(al, o.outline.width).a : null;
  const oc = o.outline ? [parseInt(o.outline.color.slice(1, 3), 16), parseInt(o.outline.color.slice(3, 5), 16), parseInt(o.outline.color.slice(5, 7), 16)] : [0, 0, 0];
  for (let i = 0; i < al.a.length; i++) {
    const sa = al.a[i] / 255;
    if (!ring) {
      im.data[i * 4 + 3] = al.a[i];
      continue;
    }
    const oa = ring[i] / 255;
    const ra = sa + oa * (1 - sa);
    for (let ch = 0; ch < 3; ch++) im.data[i * 4 + ch] = ra > 0 ? (im.data[i * 4 + ch] * sa + oc[ch] * oa * (1 - sa)) / ra : 0;
    im.data[i * 4 + 3] = Math.round(ra * 255);
  }
  g.putImageData(im, 0, 0);
  if (!o.flip) return c.convertToBlob({ type: 'image/png' });
  const f = canvas(al.w, al.h);
  const fg = f.getContext('2d')!;
  fg.translate(al.w, 0);
  fg.scale(-1, 1);
  fg.drawImage(c, 0, 0);
  return f.convertToBlob({ type: 'image/png' });
}

/** Whether a picture already has a transparent background: a real cutout has plenty of clear pixels (more than 2%). */
export async function hasTransparency(blob: Blob): Promise<boolean> {
  const bm = await createImageBitmap(blob);
  const al = await alphaOfPicture(bm, 300);
  bm.close();
  let clear = 0;
  for (const v of al.a) if (v < 250) clear++;
  return clear / al.a.length > 0.02;
}
