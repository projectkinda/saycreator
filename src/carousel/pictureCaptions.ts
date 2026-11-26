// Round AE: pictures described automatically. When the person adds pictures and leaves a name box empty, the dev route /__picture/describe (Claude Code on this computer, dev only) is asked
// ONCE for all the new pictures together; each caption goes into that picture's name box, marked automatic, and the existing name pipeline places it (the writer's `named "..."` and its
// "picture": N, the code's checks, the word match). A name the person typed always wins and is never overwritten. Captions are kept in this browser by the picture's content (a hash of its
// stored working copy), so a reload, an edit, a style change, a removal or a move makes no call, and the same picture added again is not described again. A failed call, a route that is
// not there (a production build) or a reached cap leaves the boxes empty and says nothing. The caption is never drawn on a slide and is not slide text.

const CACHE_KEY = 'creator.carousel.captions.v1';
const SWITCH_KEY = 'creator.carousel.describe.v1';
/** The long side of the copy sent to the describer. */
export const DESCRIBE_SIZE = 768;
/** At most this many pictures in one request (the route's own limit). */
export const DESCRIBE_BATCH = 12;

/** "Describe my pictures automatically" (default on), kept in this browser. */
export function describeOn(): boolean {
  try {
    return localStorage.getItem(SWITCH_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setDescribeOn(on: boolean) {
  try {
    localStorage.setItem(SWITCH_KEY, on ? 'on' : 'off');
  } catch {
    /* the switch then lasts for this page only */
  }
}

type Cache = Record<string, string>;
const readCache = (): Cache => {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
    return v && typeof v === 'object' ? (v as Cache) : {};
  } catch {
    return {};
  }
};
const writeCache = (c: Cache) => {
  try {
    // at most 500 captions are kept (the oldest go first)
    const keys = Object.keys(c);
    const kept = keys.length > 500 ? Object.fromEntries(keys.slice(keys.length - 500).map((k) => [k, c[k]])) : c;
    localStorage.setItem(CACHE_KEY, JSON.stringify(kept));
  } catch {
    /* no room: the caption is still used, it is only not remembered */
  }
};

/** The content key of a picture: a SHA-256 of its stored working copy. */
export async function contentKey(blob: Blob): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A JPEG copy at most 768 px on its long side, as base64. */
async function smallCopy(blob: Blob): Promise<string> {
  const bm = await createImageBitmap(blob);
  const k = Math.min(1, DESCRIBE_SIZE / Math.max(bm.width, bm.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bm.width * k));
  c.height = Math.max(1, Math.round(bm.height * k));
  c.getContext('2d')!.drawImage(bm, 0, 0, c.width, c.height);
  bm.close?.();
  const url = c.toDataURL('image/jpeg', 0.85);
  return url.slice(url.indexOf(',') + 1);
}

export interface DescribeIn { id: string; blob: Blob }
/**
 * Captions for pictures (id -> caption; a picture with no usable caption is left out). Cached captions are used first; the rest go to the describer in ONE request (or one per 12).
 * Never throws: a failure, a missing route or a cap gives no caption.
 */
export async function describePictures(pics: DescribeIn[], fetchImpl: typeof fetch = fetch): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!pics.length) return out;
  const cache = readCache();
  const todo: { id: string; key: string; blob: Blob }[] = [];
  for (const p of pics) {
    try {
      const key = await contentKey(p.blob);
      if (cache[key]) out[p.id] = cache[key];
      else todo.push({ id: p.id, key, blob: p.blob }); // the same picture twice in one add is described once (below) and given to both
    } catch {
      /* a picture that cannot be read is left without a caption */
    }
  }
  const unique = todo.filter((t, k) => todo.findIndex((u) => u.key === t.key) === k);
  for (let s = 0; s < unique.length; s += DESCRIBE_BATCH) {
    const batch = unique.slice(s, s + DESCRIBE_BATCH);
    try {
      const images = await Promise.all(batch.map(async (b) => ({ mime: 'image/jpeg', base64: await smallCopy(b.blob) })));
      const r = await fetchImpl('/__picture/describe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ images }) });
      if (!r.ok) break; // the route is not there, the cap is reached, or it failed: no captions, nothing said
      const j = (await r.json()) as { captions?: unknown };
      const caps = Array.isArray(j.captions) ? j.captions : [];
      batch.forEach((b, k) => {
        const c = typeof caps[k] === 'string' ? (caps[k] as string).trim().slice(0, 40) : '';
        if (c) cache[b.key] = c;
      });
    } catch {
      break;
    }
  }
  writeCache(cache);
  for (const t of todo) if (cache[t.key]) out[t.id] = cache[t.key];
  return out;
}
