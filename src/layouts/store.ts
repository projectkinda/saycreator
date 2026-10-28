// Loading the test set and the person's favourites (kept in this browser only; a browser that will not store them just forgets them).
import { useSyncExternalStore } from 'react';
import { checkGalleryLayout, LAYOUT_DATA_URL, type GalleryFile, type GalleryLayout } from './types';

export interface Loaded {
  file: Omit<GalleryFile, 'layouts'>;
  layouts: GalleryLayout[];
  /** Layouts left out because they failed the free-layout checks, with the first reason. */
  rejected: string[];
}

/** Reads the test set. Resolves to null with a reason when there is none (a built app, or the set was never made). */
export async function loadLayouts(): Promise<{ data: Loaded | null; reason: string }> {
  let res: Response;
  try {
    res = await fetch(LAYOUT_DATA_URL, { cache: 'no-store' });
  } catch {
    return { data: null, reason: 'The layout test set could not be read.' };
  }
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return { data: null, reason: 'There is no layout test set here. It is a local test file that only the development server serves; make it with npm run crello:fetch and npm run crello:build.' };
  let raw: GalleryFile;
  try {
    raw = (await res.json()) as GalleryFile;
  } catch {
    return { data: null, reason: 'The layout test set is not valid JSON.' };
  }
  if (!Array.isArray(raw.layouts)) return { data: null, reason: 'The layout test set has no layouts.' };
  const rejected: string[] = [];
  const layouts = raw.layouts.filter((l) => {
    const p = checkGalleryLayout(l);
    if (p.length) rejected.push(`${l.id}: ${p[0]}`);
    return !p.length;
  });
  const { layouts: _drop, ...file } = raw;
  return { data: { file, layouts, rejected }, reason: '' };
}

// ---------- favourites ----------
const KEY = 'creator.layouts.favourites.v1';
let favs = new Set<string>();
try {
  favs = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
} catch {
  /* no storage: favourites last until the page closes */
}
let version = 0;
const listeners = new Set<() => void>();
export function toggleFavourite(id: string) {
  favs = new Set(favs);
  if (favs.has(id)) favs.delete(id);
  else favs.add(id);
  version++;
  try {
    localStorage.setItem(KEY, JSON.stringify([...favs]));
  } catch {
    /* kept in memory only */
  }
  listeners.forEach((l) => l());
}
export const isFavourite = (id: string) => favs.has(id);
/** Re-renders a page when a favourite changes. */
export function useFavouritesVersion() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}
