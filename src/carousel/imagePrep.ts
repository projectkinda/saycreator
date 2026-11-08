// Getting a picture ready for the carousel's picture slots: only real pictures, at most 15 MB, turned the right way up, scaled to at most 2400 px on the long side and re-encoded
// (the new file carries no EXIF or other metadata: no location, no camera, no name of the owner). Browser only; nothing is sent anywhere.
export const SLOT_MAX_BYTES = 15 * 1024 * 1024;
export const SLOT_MAX_SIDE = 2400;
const mbText = (n: number) => `${(n / 1048576).toFixed(n >= 10485760 ? 0 : 1)} MB`;

export type Prepared = { file: File; note?: string } | { message: string };

/** One file made ready, or a plain-words message saying why it cannot be used. */
export async function prepareForSlots(file: File): Promise<Prepared> {
  if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name)) {
    return { message: /\.(heic|heif)$/i.test(file.name) ? `"${file.name}" is an HEIC photo. Convert it to JPG or PNG, then add it again.` : `"${file.name}" is not a picture (it is ${file.type || 'a file of an unknown type'}). Add JPEG, PNG, WebP or GIF pictures.` };
  }
  if (file.size === 0) return { message: `"${file.name}" is empty, so it cannot be used.` };
  if (file.size > SLOT_MAX_BYTES) return { message: `"${file.name}" is ${mbText(file.size)}. The limit is 15 MB: make it smaller and add it again.` };
  let bm: ImageBitmap;
  try {
    bm = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { message: `"${file.name}" could not be read as a picture. It may be damaged or not a picture.` };
  }
  try {
    const k = Math.min(1, SLOT_MAX_SIDE / Math.max(bm.width, bm.height));
    const w = Math.max(1, Math.round(bm.width * k));
    const h = Math.max(1, Math.round(bm.height * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = 'high';
    g.drawImage(bm, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) return { message: `"${file.name}" could not be prepared in this browser.` };
    const name = file.name.replace(/\.[^.]+$/, '') || 'picture';
    return { file: new File([blob], `${name}.jpg`, { type: 'image/jpeg' }), ...(k < 1 ? { note: `"${file.name}" was scaled down to ${w} by ${h} pixels.` } : {}) };
  } finally {
    bm.close();
  }
}
