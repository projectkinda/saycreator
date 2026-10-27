// The person's own pictures, in the app. Adding turns a file into a stored picture (original kept, a working copy made, EXIF
// rotation applied, very large ones scaled down for drawing), keeps it in this browser, and hands the composer the numbers it
// needs. Browser only. Nothing here sends a picture anywhere.
import { useSyncExternalStore } from 'react';
import { analyseImage } from '../image-engine/photo/analyse';
import { coverCrop } from '../image-engine/draw/geometry';
import { THRESHOLDS } from '../image-engine/lint/thumbnail-lint';
import type { ObjectInput } from '../image-engine/photo/objects';
import type { PhotoInput } from '../image-engine/photo/zones';
import { deletePicture, getPicture, isQuotaError, putPicture, storageRoom, type StoredPicture } from './photoStore';

/** What the project remembers about a picture (the picture itself is in the browser's storage). */
export interface PictureMeta {
  id: string;
  kind: 'photo' | 'object';
  name: string;
  width: number;
  height: number;
  bytes: number;
}

export const MAX_FILE_BYTES = 60 * 1024 * 1024;
export const MAX_PIXELS = 120_000_000;
export const WORK_MAX = 3000;
/** The longest side the working copy keeps. The final slide is 1080 by 1350, so nothing is drawn below that unless the original was. */
export class PictureError extends Error {}

const SAME_BROWSER = 'Your pictures stay in this browser. They are never sent anywhere.';
export const PRIVACY_LINE = SAME_BROWSER;

export interface Prepared {
  stored: StoredPicture;
  /** Plain notes (for example a photo that is small, or an object with no transparent parts). */
  notes: string[];
}

const newId = () => 'p-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

const canvasBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new PictureError('This browser could not make a copy of the picture.'))), type, q));

/** Turns a file into a stored picture. Throws PictureError with a plain message when the file cannot be used. */
export async function prepare(file: File, kind: 'photo' | 'object'): Promise<Prepared> {
  if (file.size === 0) throw new PictureError(`"${file.name}" is empty, so it cannot be used.`);
  if (file.size > MAX_FILE_BYTES) throw new PictureError(`"${file.name}" is ${(file.size / 1048576).toFixed(0)} MB. The limit is ${MAX_FILE_BYTES / 1048576} MB: make it smaller and add it again.`);
  let bm: ImageBitmap;
  try {
    // 'from-image' turns a phone photo the right way up from its EXIF orientation.
    bm = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const heic = /heic|heif/i.test(file.type + file.name);
    throw new PictureError(heic ? `"${file.name}" is a HEIC picture, which this browser cannot read. Save it as a JPEG and add it again.` : `"${file.name}" could not be read as a picture. It may be damaged or not a picture. JPEG, PNG and WebP files work.`);
  }
  try {
    const { width, height } = bm;
    if (width * height > MAX_PIXELS) throw new PictureError(`"${file.name}" is ${width} by ${height} pixels, which is too big to open safely (the limit is ${MAX_PIXELS / 1e6} million pixels). Make it smaller and add it again.`);
    const k = Math.min(1, WORK_MAX / Math.max(width, height));
    const ww = Math.max(1, Math.round(width * k));
    const wh = Math.max(1, Math.round(height * k));
    const c = document.createElement('canvas');
    c.width = ww;
    c.height = wh;
    const g = c.getContext('2d')!;
    if (kind === 'photo') {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, ww, wh);
    }
    g.imageSmoothingQuality = 'high';
    g.drawImage(bm, 0, 0, ww, wh);
    const notes: string[] = [];
    if (kind === 'object') {
      // Does it have any see-through part? Looked for on a small copy.
      const s = document.createElement('canvas');
      s.width = 48;
      s.height = 48;
      const sg = s.getContext('2d', { willReadFrequently: true })!;
      sg.drawImage(bm, 0, 0, 48, 48);
      const d = sg.getImageData(0, 0, 48, 48).data;
      let clear = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 250) clear++;
      if (clear === 0) notes.push(`"${file.name}" has no transparent parts, so it will show as a plain rectangle. A PNG with a see-through background works best.`);
    }
    const work = kind === 'photo' ? await canvasBlob(c, 'image/jpeg', 0.92) : await canvasBlob(c, 'image/png');
    if (kind === 'photo' && Math.min(width, height) < 700) notes.push(`"${file.name}" is small (${width} by ${height} pixels), so it will look soft on a full slide.`);
    return { stored: { id: newId(), kind, name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'picture', original: file, work, width, height, workWidth: ww, workHeight: wh, addedAt: Date.now() }, notes };
  } finally {
    bm.close();
  }
}

// ---------- what is in memory ----------

interface Live {
  meta: PictureMeta;
  url: string;
  work: Blob;
  stats?: PhotoInput['stats'];
  /** Kept only in this tab: the browser would not store it. */
  memoryOnly: boolean;
  workWidth: number;
  workHeight: number;
}
const live = new Map<string, Live>();
const missing = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
let storageProblem = '';
const bump = () => {
  version++;
  listeners.forEach((l) => l());
};

async function statsOf(work: Blob): Promise<PhotoInput['stats']> {
  const bm = await createImageBitmap(work);
  try {
    return analyseImage(bm as unknown as Parameters<typeof analyseImage>[0], 1080 / 1350);
  } finally {
    bm.close();
  }
}

function toLive(p: StoredPicture, memoryOnly: boolean): Live {
  return { meta: { id: p.id, kind: p.kind, name: p.name, width: p.width, height: p.height, bytes: p.original.size }, url: URL.createObjectURL(p.work), work: p.work, memoryOnly, workWidth: p.workWidth, workHeight: p.workHeight };
}

/** Adds a picture. Resolves with its meta, whether the browser kept it, and notes; rejects with a PictureError for an unusable file. */
export async function addPicture(file: File, kind: 'photo' | 'object'): Promise<{ meta: PictureMeta; kept: boolean; notes: string[] }> {
  const { stored, notes } = await prepare(file, kind);
  let kept = true;
  try {
    await putPicture(stored);
  } catch (e) {
    kept = false;
    storageProblem = isQuotaError(e) ? 'This browser has no room left for your pictures, so they will be lost when you refresh. Remove some, or free space, and add them again.' : 'This browser would not keep your pictures, so they will be lost when you refresh. The project still works here.';
  }
  const l = toLive(stored, !kept);
  if (kind === 'photo') l.stats = await statsOf(stored.work).catch(() => undefined);
  live.set(stored.id, l);
  bump();
  return { meta: l.meta, kept, notes };
}

export async function removePicture(id: string) {
  const l = live.get(id);
  if (l) URL.revokeObjectURL(l.url);
  live.delete(id);
  missing.delete(id);
  bump();
  await deletePicture(id).catch(() => undefined);
}

/** After a refresh: gets the pictures the project remembers back out of the browser's storage. */
export async function hydrate(metas: PictureMeta[]) {
  for (const m of metas) {
    if (live.has(m.id)) continue;
    try {
      const p = await getPicture(m.id);
      if (!p) {
        missing.add(m.id);
        continue;
      }
      const l = toLive(p, false);
      if (p.kind === 'photo') l.stats = await statsOf(p.work).catch(() => undefined);
      live.set(m.id, l);
      missing.delete(m.id);
    } catch {
      missing.add(m.id);
    }
  }
  bump();
}

export const isMissing = (id: string) => missing.has(id);
export const memoryOnlyCount = () => [...live.values()].filter((l) => l.memoryOnly).length;

/** The photos in the order of the project's list, as the composer takes them. */
export function photoInputs(metas: PictureMeta[]): PhotoInput[] {
  const out: PhotoInput[] = [];
  for (const m of metas) {
    const l = live.get(m.id);
    if (l && l.meta.kind === 'photo') out.push({ id: m.id, src: l.url, width: l.workWidth, height: l.workHeight, label: m.name, ...(l.stats ? { stats: l.stats } : {}) });
  }
  return out;
}
export function objectInputs(metas: PictureMeta[]): ObjectInput[] {
  const out: ObjectInput[] = [];
  for (const m of metas) {
    const l = live.get(m.id);
    if (l && l.meta.kind === 'object') out.push({ id: m.id, src: l.url, width: l.workWidth, height: l.workHeight });
  }
  return out;
}
export const urlOf = (id: string) => live.get(id)?.url ?? null;
export const workBlobOf = (id: string) => live.get(id)?.work ?? null;
export const sizeOf = (id: string) => (live.get(id) ? { width: live.get(id)!.meta.width, height: live.get(id)!.meta.height } : null);
export const nameOf = (id: string) => live.get(id)?.meta.name ?? null;

/** The existing "photo resolution for this crop" rule, applied to a photo in a box on a slide: is it stretched too much? */
export function resolutionNote(id: string, boxWidth: number, boxHeight: number, focal?: { x: number; y: number }): string | null {
  const s = sizeOf(id);
  if (!s) return null;
  const crop = coverCrop(s.width, s.height, boxWidth, boxHeight, focal);
  const upscale = boxWidth / crop.sw;
  if (upscale <= THRESHOLDS.maxUpscale) return null;
  return `After cropping, the photo is only ${Math.round(crop.sw)} px wide and is stretched ${upscale.toFixed(2)}x to fill ${Math.round(boxWidth)} px, so it will look soft. Use a bigger photo.`;
}

export const currentStorageProblem = () => storageProblem;

// ---------- React ----------

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
/** Re-renders when pictures are added, removed or read back. Returns a number that changes each time. */
export const useLibraryVersion = () => useSyncExternalStore(subscribe, () => version);

/** Test hook: forget everything in memory (the stored pictures stay). */
export function forgetMemory() {
  live.forEach((l) => URL.revokeObjectURL(l.url));
  live.clear();
  missing.clear();
  storageProblem = '';
  bump();
}

/** A plain sentence when the browser's storage is nearly full (null when there is plenty of room or it does not say). */
export async function storageRoomNote(): Promise<string> {
  const r = await storageRoom();
  if (!r || r.used / r.quota < 0.8) return '';
  return `This browser’s storage for this site is ${Math.round((r.used / r.quota) * 100)}% full. Remove pictures you no longer need so new ones can be kept.`;
}
