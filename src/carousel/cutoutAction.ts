// Remove background, shared by the carousel's and the thumbnail maker's photo strips: refuses a picture that is already a cutout, runs the cutout provider, keeps
// the original and the cutout in IndexedDB, and hands the cutout to the screen to add as an object.
import { useCallback, useEffect, useState } from 'react';
import { listCutouts, putCutout, type CutoutRecord } from '../image-engine/cutout/cutoutStore';
import { hasTransparency } from '../image-engine/cutout/ops';
import { getCutoutProvider } from '../image-engine/cutout/provider';
import { nameOf, originalBlobOf, workBlobOf } from './photoLibrary';

/** What a screen does with a made cutout: add it as an object picture and say which one it is. */
export type AddCutout = (file: File) => Promise<{ id?: string; messages: string[] }>;

export async function cutoutPicture(id: string, add: AddCutout): Promise<string> {
  const blob = workBlobOf(id);
  const name = (nameOf(id) ?? 'photo').replace(/\.[^.]+$/, '');
  if (!blob) return 'That picture is not in memory, so its background cannot be removed.';
  // Already a cutout: made by this tool, or a picture that already has a transparent background.
  if ((await listCutouts()).some((r) => r.pictureId === id)) return `${name} is already a cutout, so there is nothing more to remove. Use Edit cutout to change it.`;
  // The photo's work copy is a JPEG: look at the file as it was added (a picture the browser cannot decode counts as not transparent).
  const asAdded = originalBlobOf(id);
  if (await hasTransparency(asAdded ?? blob).catch(() => false)) return `${name} already has a transparent background, so it is already a cutout. Use it as an object.`;
  const provider = getCutoutProvider();
  const a = await provider.available();
  if (!a.available) return a.reason ?? 'No cutout provider is available.';
  try {
    const r = await provider.remove(blob);
    const rec: CutoutRecord = { id: `cut-${Date.now().toString(36)}`, sourceId: id, name, original: blob, cutout: r.cutout, mask: r.mask, provider: provider.id, ms: r.ms.total, at: Date.now() };
    const res = await add(new File([r.cutout], `${name}-cutout.png`, { type: 'image/png' }));
    rec.pictureId = res.id;
    const saved = await putCutout(rec);
    return `Cutout of ${name} made in ${(r.ms.total / 1000).toFixed(1)} s and added as an object.${saved.ok ? '' : ` ${saved.why}`}${res.messages.length ? ` ${res.messages.join(' ')}` : ''}`;
  } catch (e) {
    return (e as Error).message;
  }
}

/** The ids of the object pictures that came from a cutout (they can be edited), and a way to read them again after a change. */
export function useCutoutIds(): { ids: Set<string>; refresh: () => void } {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const refresh = useCallback(() => {
    void listCutouts().then((l) => setIds(new Set(l.flatMap((r) => (r.pictureId ? [r.pictureId] : [])))));
  }, []);
  useEffect(refresh, [refresh]);
  return { ids, refresh };
}
