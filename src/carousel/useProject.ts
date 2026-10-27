// The project in React: current doc, undo and redo, and autosave in this browser. A refresh never loses the script.
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_OPTIONS, commit, newProject, redo as redoP, undo as undoP, type DocPatch, type GenerateOptions, type Project } from './doc';
import { validateScript } from './script';
import { styleByName } from './render';
import type { PictureMeta } from './photoLibrary';

export const STORE_KEY = 'creator.carousel.project.v1';
export const PASTE_KEY = 'creator.carousel.paste.v1';

/** Reads storage without ever throwing (private windows and blocked storage give null). */
export function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeStore(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** The saved project, if it is still valid. Anything that no longer fits is dropped rather than crashing the page. */
export function loadSaved(defaultStyle: string): Project | null {
  const text = readStore(STORE_KEY);
  if (!text) return null;
  try {
    const p = JSON.parse(text) as { project?: Project };
    const proj = p.project;
    if (!proj || proj.doc?.version !== 1) return null;
    const doc = proj.doc;
    if (doc.format !== 'carousel' && doc.format !== 'quote') return null;
    if (!styleByName(doc.style)) doc.style = defaultStyle;
    if (doc.script) {
      const v = validateScript(doc.script, doc.format);
      if (v.errors.length) return { doc: { ...doc, script: null, choices: {} }, past: [], future: [] };
      doc.script = v.script!;
    }
    return { doc, past: Array.isArray(proj.past) ? proj.past : [], future: Array.isArray(proj.future) ? proj.future : [] };
  } catch {
    return null;
  }
}

export interface ProjectApi {
  project: Project;
  /** Does a change. `ok: false` carries plain reasons (for example "Slide 2 headline is missing"). */
  apply(patch: DocPatch): { ok: true } | { ok: false; reasons: string[] };
  undo(): void;
  redo(): void;
  /** The topic is a note for the prompt, not part of the history. */
  setTopic(topic: string): void;
  /** Generate options (slides, tone, style choice): saved, but not part of the undo history. */
  setOptions(o: Partial<GenerateOptions>): void;
  /** The list of the person's pictures: saved, but not part of the undo history (the pictures live in the browser's storage). */
  setPhotos(change: (before: PictureMeta[]) => PictureMeta[]): void;
  /** A fresh project (kept: nothing). The old one is gone, so ask first. */
  startOver(style: string): void;
  saved: string;
  saveFailed: boolean;
}

export function useProject(defaultStyle: string): ProjectApi {
  const [project, setProject] = useState<Project>(() => loadSaved(defaultStyle) ?? newProject(defaultStyle));
  const ref = useRef(project);
  const [saved, setSaved] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const set = useCallback((p: Project) => {
    ref.current = p;
    setProject(p);
  }, []);

  const save = useCallback(() => {
    const ok = writeStore(STORE_KEY, JSON.stringify({ project: ref.current }));
    setSaveFailed(!ok);
    if (ok) setSaved(`Saved in this browser at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
  }, []);

  // Autosave shortly after every change, and straight away when the page is hidden or closed.
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
      const r = commit(ref.current, patch);
      if (!r.ok) return r;
      set(r.project);
      return { ok: true as const };
    },
    [set],
  );
  const undo = useCallback(() => set(undoP(ref.current)), [set]);
  const redo = useCallback(() => set(redoP(ref.current)), [set]);
  const setTopic = useCallback((topic: string) => set({ ...ref.current, doc: { ...ref.current.doc, topic } }), [set]);
  const setOptions = useCallback((o: Partial<GenerateOptions>) => set({ ...ref.current, doc: { ...ref.current.doc, options: { ...DEFAULT_OPTIONS, ...ref.current.doc.options, ...o } } }), [set]);
  const setPhotos = useCallback((change: (before: PictureMeta[]) => PictureMeta[]) => set({ ...ref.current, doc: { ...ref.current.doc, photos: change(ref.current.doc.photos ?? []) } }), [set]);
  const startOver = useCallback((style: string) => set(newProject(style)), [set]);

  return { project, apply, undo, redo, setTopic, setOptions, setPhotos, startOver, saved, saveFailed };
}
