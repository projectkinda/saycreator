// A cache of what the reader said when it first read a set of references, so the same references, with the same "learn from" choices and the same
// reader and prompt version, are not read twice. Kept in this browser (IndexedDB). What is stored is the reader's answer (a style and notes) and a
// hash of the pictures: never a picture, so nothing here holds a reference.
import type { ReadOutcome } from './reader';
import type { Target } from './types';

const DB = 'creator-reader-cache';
/** Bump when the prompt, the vocabulary or the checks change, so old answers are not reused for a different question. */
export const READER_VERSION = 'v4-14e';

/** Opens the cache, but never waits on it for long: a cache that cannot be opened (blocked, or storage off) is the same as no cache. */
const open = () =>
  Promise.race([
    new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('reads', { keyPath: 'key' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('blocked'));
    }),
    new Promise<IDBDatabase>((_, reject) => setTimeout(() => reject(new Error('the cache did not open')), 2000)),
  ]);

async function sha(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The key: the pictures' own bytes, the learn-from choice of each, the target, the base, the reader and the version. */
export async function cacheKey(o: { dataUrls: string[]; learn: string[]; target: Target; baseName: string; readerId: string }): Promise<string> {
  const pics = await Promise.all(o.dataUrls.map(sha));
  return sha([READER_VERSION, o.readerId, o.target, o.baseName, ...o.learn, ...pics].join('|'));
}

export async function cacheGet(key: string): Promise<ReadOutcome | null> {
  try {
    const db = await open();
    return await new Promise((res) => {
      const q = db.transaction('reads').objectStore('reads').get(key);
      q.onsuccess = () => res(q.result ? (q.result.outcome as ReadOutcome) : null);
      q.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}
export async function cachePut(key: string, outcome: ReadOutcome): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res) => {
      const tx = db.transaction('reads', 'readwrite');
      tx.objectStore('reads').put({ key, at: Date.now(), outcome });
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  } catch {
    /* no cache is not an error */
  }
}
export async function cacheCount(): Promise<number> {
  try {
    const db = await open();
    return await new Promise((res) => {
      const q = db.transaction('reads').objectStore('reads').count();
      q.onsuccess = () => res(q.result);
      q.onerror = () => res(0);
    });
  } catch {
    return 0;
  }
}
export async function cacheClear(): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res) => {
      const tx = db.transaction('reads', 'readwrite');
      tx.objectStore('reads').clear();
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  } catch {
    /* nothing to clear */
  }
}
