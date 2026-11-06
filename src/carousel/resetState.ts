// Everything the carousel page keeps between sessions, and the one function that empties it. Reset page and Start over both call it.
// Kept on purpose (not cached state): saved styles and templates (the person saved them), and the person's settings (read mode, reference mode, flags).
import { clearActiveReference } from '../reference/active';
import { cacheClear } from '../reference/cache';
import { SKELETON_KEY } from '../reference/DescribePanel';
import { clearSaved, resetJobs } from '../live/jobs';
import { clearOriginals } from '../images/store';
import { clearCutouts } from '../image-engine/cutout/cutoutStore';
import { clearPictures } from './photoStore';
import { resetDesignedState } from './designed';
import { PASTE_KEY, writeStore } from './useProject';

/** Empties the in-memory stores (the active reference with its pack, report and pictures, the live job list, the design call's memory), the IndexedDB stores (pictures, cutouts, picture-slot images, saved reader answers, saved jobs) and the page's own storage keys. Returns what was cleared. */
export async function clearPageState(): Promise<string[]> {
  const done: string[] = [];
  const step = async (name: string, f: () => unknown | Promise<unknown>) => {
    try {
      await f();
      done.push(name);
    } catch {
      /* a store that cannot be opened has nothing to clear */
    }
  };
  await step('active reference (style, pack, report, read pictures)', () => clearActiveReference(true));
  await step('live job list', resetJobs);
  await step('design call memory', resetDesignedState);
  await step('pasted text', () => writeStore(PASTE_KEY, null));
  await step('skeleton choice', () => sessionStorage.removeItem(SKELETON_KEY));
  await step('stored pictures', clearPictures);
  await step('cutouts', clearCutouts);
  await step('picture-slot images', clearOriginals);
  await step('saved reader answers', cacheClear);
  await step('saved jobs', clearSaved);
  return done;
}
