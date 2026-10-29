// Cutouts kept in this browser (IndexedDB): the original picture and its cutout (and the mask), so the cutout can always be redone from the original and the
// original is never lost. Nothing leaves the device.
export interface CutoutRecord {
  id: string;
  /** The library picture this cutout was made from, if any. */
  sourceId?: string;
  /** The object picture that holds the cutout (so it can be edited, and is never cut out again). */
  pictureId?: string;
  /** How it was last placed and dressed in the editor. */
  look?: import('./look').CutoutLook;
  name: string;
  original: Blob;
  cutout: Blob;
  mask: Blob;
  provider: string;
  ms: number;
  at: number;
}

const DB = 'creator-cutouts';
const open = () =>
  Promise.race([
    new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('cutouts', { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('blocked'));
    }),
    new Promise<IDBDatabase>((_, reject) => setTimeout(() => reject(new Error('the store did not open')), 3000)),
  ]);

/** Saves a cutout. Returns false (and says why) when the browser would not keep it; the cutout still works in memory. */
export async function putCutout(r: CutoutRecord): Promise<{ ok: boolean; why?: string }> {
  try {
    const db = await open();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('cutouts', 'readwrite');
      tx.objectStore('cutouts').put(r);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, why: `This browser would not keep the cutout (${(e as Error).message}). It works until the page is closed.` };
  }
}
export async function getCutout(id: string): Promise<CutoutRecord | null> {
  try {
    const db = await open();
    return await new Promise((res) => {
      const q = db.transaction('cutouts').objectStore('cutouts').get(id);
      q.onsuccess = () => res((q.result as CutoutRecord) ?? null);
      q.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}
export async function listCutouts(): Promise<CutoutRecord[]> {
  try {
    const db = await open();
    return await new Promise((res) => {
      const q = db.transaction('cutouts').objectStore('cutouts').getAll();
      q.onsuccess = () => res((q.result as CutoutRecord[]).sort((a, b) => b.at - a.at));
      q.onerror = () => res([]);
    });
  } catch {
    return [];
  }
}
if (typeof window !== 'undefined') (window as unknown as { __cutouts: unknown }).__cutouts = { list: listCutouts, get: getCutout };
