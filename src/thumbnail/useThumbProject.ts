// The thumbnail project in React: current doc, undo and redo, and autosave in this browser. A refresh never loses the work.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocPatch } from '../carousel/doc';
import type { PictureMeta } from '../carousel/photoLibrary';
import { readStore, writeStore } from '../carousel/useProject';
import { commitThumb, newThumbProject, parseSavedThumb, redoThumb, undoThumb, type ThumbProject } from './doc';

export const THUMB_STORE_KEY = 'creator.thumbnail.project.v1';

export interface ThumbProjectApi {
  project: ThumbProject;
  apply(patch: DocPatch): { ok: true } | { ok: false; reasons: string[] };
  undo(): void;
  redo(): void;
  /** The topic is a note for the writer, not part of the history. */
  setTopic(topic: string): void;
  /** The list of the person's pictures: saved, but not part of the undo history (the pictures live in the browser's storage). */
  setPhotos(change: (before: PictureMeta[]) => PictureMeta[]): void;
  startOver(): void;
  saved: string;
  saveFailed: boolean;
}

export function useThumbProject(): ThumbProjectApi {
  const [project, setProject] = useState<ThumbProject>(() => parseSavedThumb(readStore(THUMB_STORE_KEY)) ?? newThumbProject());
  const ref = useRef(project);
  const [saved, setSaved] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const set = useCallback((p: ThumbProject) => {
    ref.current = p;
    setProject(p);
  }, []);
  const save = useCallback(() => {
    const ok = writeStore(THUMB_STORE_KEY, JSON.stringify({ project: ref.current }));
    setSaveFailed(!ok);
    if (ok) setSaved(`Saved in this browser at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
  }, []);
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 250);
    return () => window.clearTimeout(timer.current);
  }, [project, save]);
  useEffect(() => {
    const flush = () => save();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [save]);

  const apply = useCallback(
    (patch: DocPatch) => {
      const r = commitThumb(ref.current, patch);
      if (!r.ok) return r;
      set(r.project);
      return { ok: true as const };
    },
    [set],
  );
  const undo = useCallback(() => set(undoThumb(ref.current)), [set]);
  const redo = useCallback(() => set(redoThumb(ref.current)), [set]);
  const setTopic = useCallback((topic: string) => set({ ...ref.current, doc: { ...ref.current.doc, topic } }), [set]);
  const setPhotos = useCallback((change: (before: PictureMeta[]) => PictureMeta[]) => set({ ...ref.current, doc: { ...ref.current.doc, photos: change(ref.current.doc.photos) } }), [set]);
  const startOver = useCallback(() => set(newThumbProject()), [set]);
  return { project, apply, undo, redo, setTopic, setPhotos, startOver, saved, saveFailed };
}
