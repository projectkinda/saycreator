// Turning a source picture plus a mask into a cutout PNG, with the optional clean-ups. Browser only.
import { applyMaskOptions } from './mask';
import type { Alpha, MaskOptions } from './types';

type Source = Blob | ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;

/** Draws the source at the mask's size, applies the options, and returns the PNG and the final alpha. */
export async function composeCutout(source: Source, mask: Alpha, options: MaskOptions = {}): Promise<{ png: Blob; alpha: Alpha }> {
  const bitmap = source instanceof ImageBitmap ? source : await createImageBitmap(source as ImageBitmapSource);
  const c = new OffscreenCanvas(mask.width, mask.height);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, mask.width, mask.height);
  if (bitmap !== source) bitmap.close();
  const rgba = ctx.getImageData(0, 0, mask.width, mask.height);
  const { image, alpha } = applyMaskOptions({ data: rgba.data, width: rgba.width, height: rgba.height }, mask, options);
  const out = new Uint8ClampedArray(image.data);
  for (let i = 0; i < mask.width * mask.height; i++) out[i * 4 + 3] = alpha.data[i];
  ctx.putImageData(new ImageData(out, mask.width, mask.height), 0, 0);
  return { png: await c.convertToBlob({ type: 'image/png' }), alpha };
}

/** The mask as a grey PNG, for looking at. */
export async function maskToPng(mask: Alpha): Promise<Blob> {
  const px = new Uint8ClampedArray(mask.width * mask.height * 4);
  for (let i = 0; i < mask.width * mask.height; i++) {
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = mask.data[i];
    px[i * 4 + 3] = 255;
  }
  const c = new OffscreenCanvas(mask.width, mask.height);
  c.getContext('2d')!.putImageData(new ImageData(px, mask.width, mask.height), 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}
