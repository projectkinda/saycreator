// Where the person's own photos are kept: in this browser (IndexedDB) and nowhere else. Nothing here makes a network request.
// Each record holds the original file exactly as it was added, and a working copy (turned the right way up, at most 3000 px on
// the long side) that is what gets drawn.
export interface StoredPicture {
  id: string;
  kind: 'photo' | 'object';
  name: string;
  /** The file as added. */
  original: Blob;
  /** What is drawn: EXIF rotation already applied, long side at most 3000 px. */
  work: Blob;
  /** Size of the original (after rotation), in pixels. */
  width: number;
  height: number;
  workWidth: number;
  workHeight: number;
  addedAt: number;
}

const DB = 'creator-carousel-pictures';
const STORE = 'pictures';

let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('This browser has no place to keep pictures.'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('This browser would not open its picture storage.'));
    req.onblocked = () => reject(new Error('The picture storage is busy in another tab.'));
  });
  opening.catch(() => (opening = null));
  return opening;
}

const run = <T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = work(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error ?? new Error('The picture could not be stored.'));
        tx.onabort = () => reject(tx.error ?? new Error('The picture could not be stored.'));
      }),
  );

export const putPicture = (p: StoredPicture) => run('readwrite', (s) => s.put(p));
export const getPicture = (id: string) => run<StoredPicture | undefined>('readonly', (s) => s.get(id));
export const deletePicture = (id: string) => run('readwrite', (s) => s.delete(id));
export const clearPictures = () => run('readwrite', (s) => s.clear());

/** What the browser says about its room (null when it does not say). */
export async function storageRoom(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e && e.quota ? { used: e.usage ?? 0, quota: e.quota } : null;
  } catch {
    return null;
  }
}

/** True when an error means the browser has no room left. */
export const isQuotaError = (e: unknown) => {
  const n = (e as { name?: string })?.name ?? '';
  return n === 'QuotaExceededError' || /quota/i.test(String((e as Error)?.message ?? ''));
};
