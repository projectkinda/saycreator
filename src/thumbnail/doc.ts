// The thumbnail project: what the person chose, and every change to it as a patch with an inverse, so undo and redo always work.
// The document is plain JSON. The option pictures are not in it: they are drawn again from it (see render.ts).
import { applyRaw, type DocPatch } from '../carousel/doc';
import type { PictureMeta } from '../carousel/photoLibrary';
import type { TreatmentChoice } from '../carousel/photoChoices';
import type { ThumbnailAspect } from '../image-engine/types';

export type ThumbAspect = ThumbnailAspect;
export const AUTO_STYLE = 'auto';

export interface ThumbDoc {
  version: 1;
  aspect: ThumbAspect;
  /** A style folder name, or "auto" (Pick for me). */
  style: string;
  /** A topic, a script or an idea, kept as typed. Used by "Write titles" and "Pick for me". Not part of the undo history. */
  topic: string;
  /** Up to 4 words. */
  title: string;
  /** The one word to stress. Empty: the last word. */
  emphasis?: string;
  /** The ids of the pictures in use (the pictures are in the browser's storage). */
  photoId?: string;
  objectId?: string;
  /** How the object (a cutout) is placed and dressed: place, size, flip, tilt, outline, glow or shadow, title behind. */
  objectLook?: import('../image-engine/cutout/look').CutoutLook;
  /** What is behind a cutout, the palette and where the title goes in the cutout layouts. Left out: the style's own. */
  backdrop?: DocBackdrop;
  palette?: string;
  titlePlace?: import('../image-engine/thumbnail/v2/backdrop').TitlePlace;
  secondId?: string;
  /** The person's pointer on each photo, as a share of the photo. Left out: a guess from where the detail is. */
  subject?: { x: number; y: number };
  secondSubject?: { x: number; y: number };
  treatment: TreatmentChoice;
  /** The layout the person picked. */
  selected?: string;
  /** Every picture added to this project. Not part of the undo history. */
  photos: PictureMeta[];
}

export const emptyThumbDoc = (): ThumbDoc => ({ version: 1, aspect: '16:9', style: AUTO_STYLE, topic: '', title: '', emphasis: '', treatment: 'style', photos: [] });

export interface Entry {
  label: string;
  coalesce?: string;
  at: number;
  inverse: DocPatch;
  forward: DocPatch;
}
export interface ThumbProject {
  doc: ThumbDoc;
  past: Entry[];
  future: Entry[];
}
export const COALESCE_MS = 1500;
const MAX_HISTORY = 80;
export const newThumbProject = (): ThumbProject => ({ doc: emptyThumbDoc(), past: [], future: [] });

const TITLE_LIMIT = 80;

/** Does a change. Refuses it, in plain words, when it makes no sense. */
export function commitThumb(p: ThumbProject, patch: DocPatch, now = Date.now()): { ok: true; project: ThumbProject } | { ok: false; reasons: string[] } {
  if (!patch.label.trim() || patch.ops.length === 0) return { ok: false, reasons: ['The change is empty.'] };
  const r = applyRaw(p.doc, patch);
  if (r.doc.title.length > TITLE_LIMIT) return { ok: false, reasons: [`A thumbnail title is at most ${TITLE_LIMIT} characters.`] };
  const last = p.past[p.past.length - 1];
  const forward: DocPatch = { label: patch.label, ...(patch.coalesce ? { coalesce: patch.coalesce } : {}), ops: patch.ops };
  const past: Entry[] =
    patch.coalesce && last && last.coalesce === patch.coalesce && now - last.at < COALESCE_MS && p.future.length === 0
      ? [...p.past.slice(0, -1), { ...last, at: now, forward }]
      : [...p.past, { label: patch.label, coalesce: patch.coalesce, at: now, inverse: r.inverse, forward }].slice(-MAX_HISTORY);
  return { ok: true, project: { doc: r.doc, past, future: [] } };
}
export function undoThumb(p: ThumbProject): ThumbProject {
  const e = p.past[p.past.length - 1];
  if (!e) return p;
  const r = applyRaw(p.doc, e.inverse);
  return { doc: r.doc, past: p.past.slice(0, -1), future: [e, ...p.future] };
}
export function redoThumb(p: ThumbProject): ThumbProject {
  const e = p.future[0];
  if (!e) return p;
  const r = applyRaw(p.doc, e.forward);
  return { doc: r.doc, past: [...p.past, { ...e, inverse: r.inverse }], future: p.future.slice(1) };
}

const set = (label: string, path: string, value: unknown, coalesce?: string): DocPatch => ({ label, ...(coalesce ? { coalesce } : {}), ops: [{ path: [path], value }] });

/** Every change the screen makes. */
export const thumbPatches = {
  title: (title: string): DocPatch => ({ label: 'Edit the title', coalesce: 'title', ops: [{ path: ['title'], value: title }, { path: ['emphasis'], value: undefined }] }),
  titleAndEmphasis: (title: string, emphasis: string): DocPatch => ({ label: 'Use a written title', ops: [{ path: ['title'], value: title }, { path: ['emphasis'], value: emphasis }] }),
  emphasis: (word: string): DocPatch => set('Change the emphasis word', 'emphasis', word),
  aspect: (a: ThumbAspect): DocPatch => set(`Change the format to ${a === '16:9' ? 'wide' : 'tall'}`, 'aspect', a),
  style: (name: string): DocPatch => set(name === AUTO_STYLE ? 'Let the app pick the style' : 'Change the style', 'style', name),
  treatment: (t: TreatmentChoice): DocPatch => set('Change the photo treatment', 'treatment', t),
  subject: (s: { x: number; y: number } | undefined): DocPatch => ({ label: s ? 'Move the subject pointer' : 'Use the guessed subject', coalesce: 'subject', ops: [{ path: ['subject'], value: s }] }),
  secondSubject: (s: { x: number; y: number } | undefined): DocPatch => ({ label: 'Move the second subject pointer', coalesce: 'subject2', ops: [{ path: ['secondSubject'], value: s }] }),
  photo: (id: string | undefined): DocPatch => ({ label: id ? 'Use a photo' : 'Remove the photo', ops: [{ path: ['photoId'], value: id }, { path: ['subject'], value: undefined }] }),
  object: (id: string | undefined): DocPatch => ({ label: id ? 'Use an object' : 'Remove the object', ops: [{ path: ['objectId'], value: id }, { path: ['objectLook'], value: undefined }] }),
  backdrop: (b: DocBackdrop | undefined, label = 'Change the background'): DocPatch => ({ label, coalesce: `backdrop:${label}`, ops: [{ path: ['backdrop'], value: b }] }),
  /** A look from More looks: background, cutout dressing, palette and title place at once. */
  useLook: (v: import('../image-engine/thumbnail/v2/backdrop').VariantSpec, photoId: string | undefined, prior: import('../image-engine/cutout/look').CutoutLook | undefined): DocPatch => ({
    label: 'Use a look',
    ops: [
      { path: ['backdrop'], value: { ...v.backdrop, ...(v.backdrop.kind === 'photo' && photoId ? { photoId } : {}) } },
      { path: ['objectLook'], value: { ...(prior ?? {}), ...(v.look.fx ? { fx: v.look.fx } : {}), outline: v.look.outline ? { color: '#ffffff', width: 12 } : undefined, textBehind: !!v.look.textBehind } },
      { path: ['palette'], value: v.palette },
      { path: ['titlePlace'], value: v.titlePlace },
    ],
  }),
  objectLook: (look: import('../image-engine/cutout/look').CutoutLook | undefined, label = 'Change the cutout'): DocPatch => ({ label, coalesce: `objectLook:${label}`, ops: [{ path: ['objectLook'], value: look }] }),
  second: (id: string | undefined): DocPatch => ({ label: id ? 'Use a second photo' : 'Remove the second photo', ops: [{ path: ['secondId'], value: id }, { path: ['secondSubject'], value: undefined }] }),
  select: (layout: string | undefined): DocPatch => set('Pick an option', 'selected', layout),
};

/** The saved project, if it is still valid. Anything that no longer fits is dropped rather than crashing the page. */
export function parseSavedThumb(text: string | null): ThumbProject | null {
  if (!text) return null;
  try {
    const p = (JSON.parse(text) as { project?: ThumbProject }).project;
    if (!p || p.doc?.version !== 1 || (p.doc.aspect !== '16:9' && p.doc.aspect !== '9:16') || typeof p.doc.title !== 'string') return null;
    return { doc: { ...emptyThumbDoc(), ...p.doc, photos: Array.isArray(p.doc.photos) ? p.doc.photos : [] }, past: Array.isArray(p.past) ? p.past : [], future: Array.isArray(p.future) ? p.future : [] };
  } catch {
    return null;
  }
}

/** A background for the cutout layouts. A photo background keeps the id of the picture in this browser (never saved in a template). */
export type DocBackdrop = import('../image-engine/thumbnail/v2/backdrop').Backdrop & { photoId?: string };
