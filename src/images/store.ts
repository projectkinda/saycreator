// Image requests and their pictures. The request list lives in the document (so it is saved and can be undone); the pictures live in the browser's storage (IndexedDB), cached:
// a picture is made only when the person asks, and is never made again silently. A "baked" picture is the original cropped to its slot, with the treatments applied.
import { useSyncExternalStore } from 'react';
import { bakeImage, slotCells, treatmentList, type Baked, type ImageSlot, type SlotKind } from './slots';

export interface ImageRequest {
  id: string;
  /** Slide number, 0 for the first. */
  slide: number;
  kind: SlotKind;
  /** Short: mood and palette words, never the person's script or anything personal. This is what is sent to the provider. */
  prompt: string;
  alt: string;
  /** Set once the slot has a picture: made here, or uploaded by the person. */
  source?: 'generated' | 'uploaded';
  /** How many times the provider was called for this request (counts against the cap). */
  generations: number;
  treatments?: string[];
  focal?: { x: number; y: number };
  fit?: 'cover' | 'contain';
}
/** Pictures made per carousel unless the person raises it. */
export const IMAGE_CAP = 5;
export const SECONDS_PER_IMAGE = 12;
export const callsUsed = (rs: ImageRequest[]) => rs.reduce((n, r) => n + (r.generations ?? 0), 0);

// ----- the cache (IndexedDB) -----

const DB = 'creator-images';
const STORE = 'images';
const open = () =>
  new Promise<IDBDatabase>((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((ok, no) => {
    const r = f(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
const originals = new Map<string, Blob>();
export async function saveOriginal(id: string, blob: Blob) {
  originals.set(id, blob);
  try {
    await tx('readwrite', (s) => s.put({ id, blob }));
  } catch {
    /* kept in memory for this visit */
  }
  bump();
}
export async function loadOriginal(id: string): Promise<Blob | null> {
  if (originals.has(id)) return originals.get(id)!;
  try {
    const r = await tx<{ id: string; blob: Blob } | undefined>('readonly', (s) => s.get(id));
    if (r?.blob) originals.set(id, r.blob);
    return r?.blob ?? null;
  } catch {
    return null;
  }
}
export async function removeOriginal(id: string) {
  originals.delete(id);
  for (const k of [...baked.keys()]) if (k.startsWith(`${id}|`)) baked.delete(k);
  try {
    await tx('readwrite', (s) => s.delete(id));
  } catch {
    /* nothing to remove */
  }
  bump();
}

// ----- change notice -----

let version = 0;
const subs = new Set<() => void>();
export const bump = () => {
  version++;
  subs.forEach((l) => l());
};
export const useImagesVersion = () => useSyncExternalStore((l) => (subs.add(l), () => void subs.delete(l)), () => version);

// ----- baked pictures -----

const baked = new Map<string, Baked>();
const keyOf = (r: ImageRequest, cell: { w: number; h: number }, slot: ImageSlot, palette: Record<string, string>) =>
  `${r.id}|${Math.round(cell.w)}x${Math.round(cell.h)}|${r.fit ?? slot.fit}|${(r.focal ?? slot.focal).x.toFixed(2)},${(r.focal ?? slot.focal).y.toFixed(2)}|${(r.treatments ?? []).join('+')}|${palette.bg}${palette.accent}`;

/** Which request fills which cell of which slot: the slide's requests of a slot's kind, in order. */
export function assign(requests: ImageRequest[], slide: number, slots: ImageSlot[]): { req: ImageRequest; slot: ImageSlot; cell: number }[] {
  const out: { req: ImageRequest; slot: ImageSlot; cell: number }[] = [];
  for (const slot of slots) {
    const mine = requests.filter((r) => r.slide === slide && r.kind === slot.kind);
    const n = slotCells(slot).length;
    mine.slice(0, n).forEach((req, cell) => out.push({ req, slot, cell }));
  }
  return out;
}
/** The pictures to draw in each slot of a slide, already baked (null where there is none yet): what the drawing reads. */
export function fillsFor(requests: ImageRequest[] | undefined, slide: number, slots: ImageSlot[], palette: Record<string, string>): Record<string, (Baked | null)[]> {
  const out: Record<string, (Baked | null)[]> = {};
  for (const slot of slots) out[slot.id] = slotCells(slot).map(() => null);
  for (const { req, slot, cell } of assign(requests ?? [], slide, slots)) {
    if (!req.source) continue;
    out[slot.id][cell] = baked.get(keyOf(req, slotCells(slot)[cell], slot, palette)) ?? null;
  }
  return out;
}
/** Bakes every filled request whose picture is not baked yet; says when something new is ready so the slides redraw. */
export async function ensureBaked(requests: ImageRequest[], slotsOf: (slide: number) => ImageSlot[], palette: Record<string, string>): Promise<number> {
  let fresh = 0;
  for (const slide of new Set(requests.map((r) => r.slide)))
    for (const { req, slot, cell } of assign(requests, slide, slotsOf(slide))) {
      if (!req.source) continue;
      const box = slotCells(slot)[cell];
      const key = keyOf(req, box, slot, palette);
      if (baked.has(key)) continue;
      const blob = await loadOriginal(req.id);
      if (!blob) continue;
      try {
        baked.set(key, await bakeImage(blob, box, { fit: req.fit ?? slot.fit, focal: req.focal ?? slot.focal, treatments: treatmentList(req.treatments, palette) }));
        fresh++;
      } catch {
        /* an unreadable picture stays a placeholder */
      }
    }
  if (fresh) bump();
  return fresh;
}

// ----- planning requests from the script -----

const NAMES = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];
export function colourWord(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 'neutral';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d < 0.08) return l < 0.25 ? 'near black' : l > 0.8 ? 'off white' : 'grey';
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const name = h < 15 || h >= 345 ? 'red' : h < 40 ? 'orange' : h < 65 ? 'yellow' : h < 160 ? 'green' : h < 195 ? 'teal' : h < 255 ? 'blue' : h < 295 ? 'purple' : h < 345 ? 'pink' : NAMES[0];
  return `${l < 0.3 ? 'deep ' : l > 0.75 ? 'soft ' : ''}${name}`;
}
/** Takes out anything personal (addresses, links, @handles, long numbers) and keeps a few words. */
export function scrub(s: string, words = 8): string {
  return s
    .replace(/\S+@\S+\.\S+/g, ' ')
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/@\w+/g, ' ')
    .replace(/\d{4,}/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, words)
    .join(' ');
}
const HINT: Record<SlotKind, string> = {
  background: 'wide background picture with calm empty space for text',
  inset: 'one clear subject, simple composition',
  'half-bleed': 'bold composition that fills half the slide',
  strip: 'one of a matching set of pictures',
  cutout: 'a single object on a plain background',
};
const kindOf = (t: string) => (t === 'closing' ? 'cta' : t === 'checklist' ? 'list' : t);
export interface DesignSlots {
  (slideType: string): ImageSlot[];
}
/** One image request per slide whose design has an image slot (up to `max`). The prompt holds a few topic words, the mood and the palette, never the script. */
export function planImageRequests(script: { title?: string; slides: { type: string; headline?: string; quote?: string }[] }, slotsOf: DesignSlots, palette: Record<string, string>, max = IMAGE_CAP): ImageRequest[] {
  const subject = scrub(script.title ?? '') || 'abstract shapes';
  const colours = [...new Set([palette.bg, palette.accent, palette.surface].filter(Boolean).map((c) => colourWord(c)))].slice(0, 3).join(', ');
  const out: ImageRequest[] = [];
  script.slides.forEach((s, i) => {
    const slot = slotsOf(s.type)[0];
    if (!slot || out.length >= max) return;
    const n = slot.kind === 'strip' ? (slot.count ?? 3) : 1;
    for (let k = 0; k < n && out.length < max; k++)
      out.push({
        id: `img-${Date.now().toString(36)}-${i}-${k}-${Math.random().toString(36).slice(2, 5)}`,
        slide: i,
        kind: slot.kind,
        prompt: `${subject}; ${HINT[slot.kind]}; ${colours}; soft light; no text`,
        alt: `${slot.kind} picture for slide ${i + 1}: ${subject}`,
        generations: 0,
      });
  });
  void kindOf;
  return out;
}
const KIND_WORDS = /^(?:put|use|add)\s+(.+?)\s+(?:as|for)\s+(?:the\s+)?(background|inset|half-bleed|half bleed|strip|cutout)(?:\s+here)?\.?$/i;
/** "put a sunrise as the background here" (or just "a sunrise") becomes a request for this slide. */
export function requestFromText(text: string, slide: number, palette: Record<string, string>): ImageRequest | null {
  const t = text.trim();
  if (!t) return null;
  const m = KIND_WORDS.exec(t);
  const kind = (m ? m[2].toLowerCase().replace(' ', '-') : 'background') as SlotKind;
  const what = scrub(m ? m[1] : t.replace(/\s+as the background( here)?$/i, ''), 14);
  if (!what) return null;
  const colours = [...new Set([palette.bg, palette.accent].filter(Boolean).map((c) => colourWord(c)))].join(', ');
  return { id: `img-${Date.now().toString(36)}-${slide}-${Math.random().toString(36).slice(2, 5)}`, slide, kind, prompt: `${what}; ${HINT[kind]}; ${colours}; no text`, alt: `${kind} picture for slide ${slide + 1}: ${what}`, generations: 0 };
}

/** Empties the picture-slot images (the originals kept in the browser and in memory). Used by Reset page and Start over. */
export async function clearOriginals() {
  originals.clear();
  await tx('readwrite', (s) => s.clear());
  bump();
}
