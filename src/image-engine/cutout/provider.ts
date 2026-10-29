// A CutoutProvider removes the background from a picture, like the ReferenceReader answers questions about one: an interface, a fake for tests, and a local one
// that runs BiRefNet_lite on this computer through a dev route (see server/cutout-dev.ts). The browser prepares the picture and turns the model's answer into a
// transparent PNG; the original is never changed.
export interface CutoutTimes {
  prepare: number;
  infer: number;
  apply: number;
  total: number;
}
export interface CutoutResult {
  /** The picture with the background removed (PNG, same size as the original). */
  cutout: Blob;
  /** The mask as a greyscale PNG (white is subject). */
  mask: Blob;
  width: number;
  height: number;
  ms: CutoutTimes;
}
export class CutoutError extends Error {}
export interface CutoutProvider {
  id: string;
  label: string;
  available(): Promise<{ available: boolean; reason?: string }>;
  remove(image: Blob, signal?: AbortSignal): Promise<CutoutResult>;
}

const SIZE = 1024;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
/** The longest side of the picture the cutout is made at: bigger pictures are cut at this size (the original stays whole). */
export const CUTOUT_MAX_SIDE = 2600;

const canvasOf = (w: number, h: number) => new OffscreenCanvas(w, h);

/** Turns a mask (0 to 1 per pixel at SIZE by SIZE) and the original into the cutout and a greyscale mask picture, at the original's size. */
export async function applyMask(bitmap: ImageBitmap, mask: Float32Array): Promise<{ cutout: Blob; mask: Blob; width: number; height: number }> {
  const k = Math.min(1, CUTOUT_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * k);
  const h = Math.round(bitmap.height * k);
  // The mask at model size, drawn up to the picture's size (smooth), then read as the alpha.
  const m = canvasOf(SIZE, SIZE);
  const mg = m.getContext('2d')!;
  const md = mg.createImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const v = Math.round(Math.min(1, Math.max(0, mask[i])) * 255);
    md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = v;
    md.data[i * 4 + 3] = 255;
  }
  mg.putImageData(md, 0, 0);
  const big = canvasOf(w, h);
  const bg = big.getContext('2d', { willReadFrequently: true })!;
  bg.imageSmoothingQuality = 'high';
  bg.drawImage(m, 0, 0, w, h);
  const alpha = bg.getImageData(0, 0, w, h);
  const maskPng = await big.convertToBlob({ type: 'image/png' });
  const out = canvasOf(w, h);
  const og = out.getContext('2d', { willReadFrequently: true })!;
  og.drawImage(bitmap, 0, 0, w, h);
  const px = og.getImageData(0, 0, w, h);
  for (let i = 0; i < w * h; i++) px.data[i * 4 + 3] = alpha.data[i * 4];
  og.putImageData(px, 0, 0);
  return { cutout: await out.convertToBlob({ type: 'image/png' }), mask: maskPng, width: w, height: h };
}

/** A stand-in for tests: an ellipse in the middle is the subject. No model, a fixed small delay. */
export class FakeCutoutProvider implements CutoutProvider {
  id = 'fake';
  label = 'Test stand-in (an ellipse)';
  calls = 0;
  constructor(private delayMs = 5) {}
  async available() {
    return { available: true };
  }
  async remove(image: Blob): Promise<CutoutResult> {
    this.calls++;
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, this.delayMs));
    const bm = await createImageBitmap(image, { imageOrientation: 'from-image' });
    const mask = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const dx = (x - SIZE / 2) / (SIZE * 0.38);
        const dy = (y - SIZE / 2) / (SIZE * 0.45);
        mask[y * SIZE + x] = dx * dx + dy * dy <= 1 ? 1 : 0;
      }
    const t1 = performance.now();
    const r = await applyMask(bm, mask);
    bm.close();
    const t2 = performance.now();
    return { ...r, ms: { prepare: 0, infer: Math.round(t1 - t0), apply: Math.round(t2 - t1), total: Math.round(t2 - t0) } };
  }
}

/** Runs BiRefNet_lite on this computer through the dev route. */
export class LocalCutoutProvider implements CutoutProvider {
  id = 'local-birefnet-lite';
  label = 'BiRefNet_lite on this computer (dev)';
  async available() {
    try {
      const r = await fetch('/__cutout/status');
      if (!r.ok) return { available: false, reason: 'The cutout route is not running (it is part of the dev server).' };
      const b = (await r.json()) as { available: boolean; reason?: string };
      return b;
    } catch {
      return { available: false, reason: 'The cutout route could not be reached. Is the dev server running?' };
    }
  }
  async remove(image: Blob, signal?: AbortSignal): Promise<CutoutResult> {
    const t0 = performance.now();
    const bm = await createImageBitmap(image, { imageOrientation: 'from-image' });
    const c = canvasOf(SIZE, SIZE);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bm, 0, 0, SIZE, SIZE);
    const px = g.getImageData(0, 0, SIZE, SIZE).data;
    const input = new Float32Array(3 * SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++)
      for (let ch = 0; ch < 3; ch++) input[ch * SIZE * SIZE + i] = (px[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
    const t1 = performance.now();
    let res: Response;
    try {
      res = await fetch('/__cutout/infer', { method: 'POST', body: input.buffer, headers: { 'content-type': 'application/octet-stream' }, signal });
    } catch (e) {
      bm.close();
      if ((e as Error).name === 'AbortError') throw new CutoutError('Cancelled.');
      throw new CutoutError('The cutout route could not be reached. Is the dev server running?');
    }
    if (!res.ok) {
      bm.close();
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      throw new CutoutError(b.error ?? `The cutout route answered ${res.status}.`);
    }
    const logits = new Float32Array(await res.arrayBuffer());
    const t2 = performance.now();
    const mask = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < mask.length; i++) mask[i] = 1 / (1 + Math.exp(-logits[i]));
    const r = await applyMask(bm, mask);
    bm.close();
    const t3 = performance.now();
    return { ...r, ms: { prepare: Math.round(t1 - t0), infer: Math.round(t2 - t1), apply: Math.round(t3 - t2), total: Math.round(t3 - t0) } };
  }
}

let current: CutoutProvider | null = null;
/** The provider in use: the local one unless a test or the person has set another. */
export const getCutoutProvider = (): CutoutProvider => (current ??= new LocalCutoutProvider());
export const setCutoutProvider = (p: CutoutProvider | null) => {
  current = p;
};
if (typeof window !== 'undefined') (window as unknown as { __cutout: unknown }).__cutout = { set: setCutoutProvider, get: getCutoutProvider, Fake: FakeCutoutProvider, Local: LocalCutoutProvider };
