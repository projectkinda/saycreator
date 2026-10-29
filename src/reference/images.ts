// Picture helpers for the reference screen (browser only): reading a file, cutting a cell out of a collage, making the small copies that are
// measured, the JPEGs the reader is sent, and the side-by-side picture of a reference and its replica. Nothing here is stored.
import type { ReaderImage } from './reader';
import type { Px, Rect } from './types';
import { speed } from './speed';

export async function bitmapOf(blob: Blob): Promise<ImageBitmap> {
  // 'from-image' turns a phone photo the right way up from its EXIF orientation.
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

function canvasOf(w: number, h: number): OffscreenCanvas {
  return new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/** A piece of a picture, scaled so its long side is at most `max`. */
export function cut(src: ImageBitmap | HTMLImageElement | ImageBitmap, rect: Rect | null, max: number): OffscreenCanvas {
  const sw = (src as ImageBitmap).width;
  const sh = (src as ImageBitmap).height;
  const r = rect ?? { x: 0, y: 0, width: sw, height: sh };
  const k = Math.min(1, max / Math.max(r.width, r.height));
  const c = canvasOf(r.width * k, r.height * k);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, r.x, r.y, r.width, r.height, 0, 0, c.width, c.height);
  return c;
}

export const pxOfCanvas = (c: OffscreenCanvas): Px => {
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
  return { width: d.width, height: d.height, data: d.data };
};

async function blobOf(c: OffscreenCanvas, quality = 0.85): Promise<Blob> {
  return c.convertToBlob({ type: 'image/jpeg', quality });
}
export const dataUrlOf = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

/** A JPEG data URL of a piece of a picture (the copy the screen keeps in memory and the reader is sent). */
export async function jpegUrl(src: ImageBitmap, rect: Rect | null, max = 1400): Promise<{ url: string; width: number; height: number }> {
  const c = cut(src, rect, max);
  return { url: await dataUrlOf(await blobOf(c)), width: c.width, height: c.height };
}

export async function bitmapFromUrl(url: string): Promise<ImageBitmap> {
  const r = await fetch(url);
  return bitmapOf(await r.blob());
}

/** The reader's picture of one pair: the reference on the left, our replica on the right, the same height. */
export async function pairImage(referenceUrl: string, replica: Blob, name: string): Promise<ReaderImage> {
  const [a, b] = await Promise.all([bitmapFromUrl(referenceUrl), bitmapOf(replica)]);
  const H = speed.pairH;
  const wa = Math.round((a.width / a.height) * H);
  const wb = Math.round((b.width / b.height) * H);
  const c = canvasOf(wa + wb + 24, H);
  const g = c.getContext('2d')!;
  g.fillStyle = '#888888';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(a, 0, 0, wa, H);
  g.drawImage(b, wa + 24, 0, wb, H);
  a.close();
  b.close();
  const url = await dataUrlOf(await blobOf(c, 0.82));
  return { name, mime: 'image/jpeg', base64: url.split(',')[1] };
}

export const readerImageOf = (url: string, name: string): ReaderImage => ({ name, mime: 'image/jpeg', base64: url.split(',')[1] });

/** A small JPEG of a replica, for the template's preview. */
export async function previewOf(blob: Blob, max = 360): Promise<string> {
  const bm = await bitmapOf(blob);
  const u = await jpegUrl(bm, null, max);
  bm.close();
  return u.url;
}

/** A built-in sample photo (a drawn landscape, not a person), for when there is no photo of the person's own. */
export async function samplePhoto(): Promise<{ url: string; width: number; height: number }> {
  const W = 1600;
  const H = 1000;
  const c = canvasOf(W, H);
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, H * 0.65);
  sky.addColorStop(0, '#2b5a8a');
  sky.addColorStop(1, '#f0b27a');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#f7d9a6';
  g.beginPath();
  g.arc(W * 0.66, H * 0.42, 110, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2f3f4f';
  g.beginPath();
  g.moveTo(0, H * 0.7);
  g.lineTo(W * 0.2, H * 0.45);
  g.lineTo(W * 0.42, H * 0.68);
  g.lineTo(W * 0.62, H * 0.5);
  g.lineTo(W, H * 0.72);
  g.lineTo(W, H);
  g.lineTo(0, H);
  g.fill();
  g.fillStyle = '#1b2733';
  g.fillRect(0, H * 0.82, W, H * 0.18);
  // Fine film grain, so the sample reads as a photograph (a smooth drawing has no texture and the detection would not call it a photo).
  const px = g.getImageData(0, 0, W, H);
  let seed = 12345;
  for (let i = 0; i < px.data.length; i += 4)
    for (let k = 0; k < 3; k++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      px.data[i + k] = Math.max(0, Math.min(255, px.data[i + k] + ((seed >>> 24) % 41) - 20));
    }
  g.putImageData(px, 0, 0);
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return { url: URL.createObjectURL(blob), width: W, height: H };
}
