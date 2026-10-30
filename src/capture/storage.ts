import type { CaptureManifest, RecoverySession } from './types';

const DB = 'creator-capture-v1';
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'sessionId' });
      if (!db.objectStoreNames.contains('chunks')) {
        const store = db.createObjectStore('chunks', { keyPath: ['sessionId', 'index'] });
        store.createIndex('sessionId', 'sessionId');
      }
      if (!db.objectStoreNames.contains('manifests')) db.createObjectStore('manifests', { keyPath: 'sessionId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = run(tx.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function startSession(session: RecoverySession) {
  await transaction('sessions', 'readwrite', (store) => store.put(session));
}

export async function saveChunk(sessionId: string, index: number, blob: Blob) {
  await transaction('chunks', 'readwrite', (store) => store.put({ sessionId, index, blob }));
  const session = await getSession(sessionId);
  if (session) await startSession({ ...session, chunks: Math.max(session.chunks, index + 1) });
}

export async function getSession(sessionId: string) {
  return transaction<RecoverySession | undefined>('sessions', 'readonly', (store) => store.get(sessionId));
}

export async function findRecovery(): Promise<RecoverySession | undefined> {
  const sessions = await transaction<RecoverySession[]>('sessions', 'readonly', (store) => store.getAll());
  return sessions.filter((s) => !s.complete && s.chunks > 0).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export async function assembleRecording(sessionId: string, mimeType: string): Promise<Blob> {
  const db = await openDb();
  const chunks = await new Promise<Array<{ sessionId: string; index: number; blob: Blob }>>((resolve, reject) => {
    const tx = db.transaction('chunks', 'readonly');
    const request = tx.objectStore('chunks').index('sessionId').getAll(sessionId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
  return new Blob(chunks.sort((a, b) => a.index - b.index).map((c) => c.blob), { type: mimeType });
}

export async function completeSession(sessionId: string, manifest: CaptureManifest) {
  await transaction('manifests', 'readwrite', (store) => store.put(manifest));
  const session = await getSession(sessionId);
  if (session) await startSession({ ...session, complete: true });
}

export async function getManifest(sessionId: string) {
  return transaction<CaptureManifest | undefined>('manifests', 'readonly', (store) => store.get(sessionId));
}
