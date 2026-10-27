// The project a person is working on, and every change to it as a patch with an inverse, so undo and redo always work.
// The document is plain JSON: format, style, the script, and per-slide choices (layout, element shuffle, element swaps).
import type { CarouselScript } from '../image-engine/carousel/types';
import { validateScript, type Format } from './script';
import type { Platform } from './platform';

export interface SlideChoice {
  layout?: string;
  salt?: string;
  swaps?: Record<string, string>;
}
export type Tone = 'clear' | 'bold' | 'friendly' | 'expert';
export interface GenerateOptions {
  slides: number;
  tone: Tone;
  /** true: the writer picks a style when it generates. */
  autoStyle: boolean;
  /** Shown on the last slide, for example "@maya.builds". Empty: a placeholder is used and the person is told. */
  handle: string;
  /** Where it will be posted. null: nowhere in particular, so no slide limit. Saved with the project. */
  platform: Platform | null;
}
export const DEFAULT_OPTIONS: GenerateOptions = { slides: 7, tone: 'clear', autoStyle: true, handle: '', platform: null };

export interface Doc {
  version: 1;
  format: Format;
  /** A style folder name. */
  style: string;
  /** What the person pasted: a paragraph, a rough idea or an article. Kept as typed, not part of the undo history. */
  topic: string;
  /** Generate options (not part of the undo history). */
  options?: GenerateOptions;
  script: CarouselScript | null;
  /** By slide number, "0" for the first slide. */
  choices: Record<string, SlideChoice>;
}
export const emptyDoc = (style: string): Doc => ({ version: 1, format: 'carousel', style, topic: '', script: null, choices: {} });

export type Path = (string | number)[];
export interface DocPatch {
  /** Plain words for the undo button, for example "Edit headline on slide 2". */
  label: string;
  /** Edits with the same key in quick succession become one undo step (typing). */
  coalesce?: string;
  /** Sets the value at the path. `undefined` removes it. Missing objects on the path are created. */
  ops: { path: Path; value: unknown }[];
}
export type PatchResult = { ok: true; doc: Doc; inverse: DocPatch } | { ok: false; reasons: string[] };

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
type Bag = Record<string | number, unknown>;

function getAt(root: unknown, path: Path): unknown {
  let cur = root;
  for (const k of path) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Bag)[k];
  }
  return cur;
}
function setAt(root: Bag, path: Path, value: unknown): void {
  let cur = root;
  path.slice(0, -1).forEach((k, i) => {
    let next = cur[k];
    if (typeof next !== 'object' || next === null) {
      next = typeof path[i + 1] === 'number' ? [] : {};
      cur[k] = next;
    }
    cur = next as Bag;
  });
  const last = path[path.length - 1];
  if (value === undefined) {
    if (Array.isArray(cur)) cur.splice(Number(last), 1);
    else delete cur[last];
  } else cur[last] = value;
}

/** Applies the steps and returns the inverse. No validation: used for undo and redo, which restore states that were valid. */
export function applyRaw(doc: Doc, patch: DocPatch): { doc: Doc; inverse: DocPatch } {
  const next = structuredClone(doc);
  const inverse: DocPatch = { label: patch.label, ...(patch.coalesce ? { coalesce: patch.coalesce } : {}), ops: [] };
  for (const op of patch.ops) {
    inverse.ops.unshift({ path: op.path, value: structuredClone(getAt(next, op.path)) });
    setAt(next as unknown as Bag, op.path, structuredClone(op.value));
  }
  return { doc: next, inverse };
}

/** Applies a patch the user made. Refuses it, in plain words, if the script would no longer be valid. */
export function applyDocPatch(doc: Doc, patch: DocPatch): PatchResult {
  if (!patch || typeof patch.label !== 'string' || patch.label.trim() === '') return { ok: false, reasons: ['The change needs a short name.'] };
  if (!Array.isArray(patch.ops) || patch.ops.length === 0) return { ok: false, reasons: ['The change does not contain any steps.'] };
  for (const op of patch.ops) {
    if (!Array.isArray(op.path) || op.path.length === 0) return { ok: false, reasons: ['A step has no place to change.'] };
    if (op.path.some((k) => typeof k === 'string' && FORBIDDEN.has(k))) return { ok: false, reasons: ['A step points at a place that cannot be changed.'] };
  }
  const r = applyRaw(doc, patch);
  if (r.doc.script) {
    const v = validateScript(r.doc.script, r.doc.format);
    if (v.errors.length) return { ok: false, reasons: v.errors.map((e) => e.message) };
  }
  return { ok: true, ...r };
}

// ---- history ----

export interface Entry {
  label: string;
  coalesce?: string;
  at: number;
  /** Applying this undoes the change. */
  inverse: DocPatch;
  /** Applying this does the change again. */
  forward: DocPatch;
}
export interface Project {
  doc: Doc;
  past: Entry[];
  future: Entry[];
}
export const COALESCE_MS = 1500;
const MAX_HISTORY = 80;

export function newProject(style: string): Project {
  return { doc: emptyDoc(style), past: [], future: [] };
}

/** Does a change. Returns the new project, or the reasons it was refused. */
export function commit(p: Project, patch: DocPatch, now = Date.now()): { ok: true; project: Project } | { ok: false; reasons: string[] } {
  const r = applyDocPatch(p.doc, patch);
  if (!r.ok) return r;
  const last = p.past[p.past.length - 1];
  const forward: DocPatch = { label: patch.label, ...(patch.coalesce ? { coalesce: patch.coalesce } : {}), ops: patch.ops };
  let past: Entry[];
  if (patch.coalesce && last && last.coalesce === patch.coalesce && now - last.at < COALESCE_MS && p.future.length === 0) {
    // Typing in the same field: one undo step that goes back to before the first keystroke.
    past = [...p.past.slice(0, -1), { ...last, at: now, forward }];
  } else past = [...p.past, { label: patch.label, coalesce: patch.coalesce, at: now, inverse: r.inverse, forward }].slice(-MAX_HISTORY);
  return { ok: true, project: { doc: r.doc, past, future: [] } };
}

export function undo(p: Project): Project {
  const e = p.past[p.past.length - 1];
  if (!e) return p;
  const r = applyRaw(p.doc, e.inverse);
  return { doc: r.doc, past: p.past.slice(0, -1), future: [{ ...e, forward: { ...e.forward } }, ...p.future] };
}
export function redo(p: Project): Project {
  const e = p.future[0];
  if (!e) return p;
  const r = applyRaw(p.doc, e.forward);
  return { doc: r.doc, past: [...p.past, { ...e, inverse: r.inverse }], future: p.future.slice(1) };
}

// ---- the patches the editor makes ----

const slidePath = (i: number, ...rest: Path): Path => ['script', 'slides', i, ...rest];

export const patches = {
  editField: (i: number, field: string, label: string, value: unknown): DocPatch => ({ label: `Edit ${label.toLowerCase()} on slide ${i + 1}`, coalesce: `field:${i}:${field}`, ops: [{ path: slidePath(i, field), value }] }),
  editTags: (i: number, tags: string[]): DocPatch => ({ label: `Change tags on slide ${i + 1}`, coalesce: `tags:${i}`, ops: [{ path: slidePath(i, 'element_tags'), value: tags }] }),
  layout: (i: number, layout: string): DocPatch => ({ label: `Change layout on slide ${i + 1}`, ops: [{ path: ['choices', String(i), 'layout'], value: layout }] }),
  swap: (i: number, from: string, to: string): DocPatch => ({ label: `Swap an element on slide ${i + 1}`, ops: [{ path: ['choices', String(i), 'swaps', from], value: to }] }),
  shuffle: (i: number, salt: string): DocPatch => ({ label: `Shuffle elements on slide ${i + 1}`, ops: [{ path: ['choices', String(i), 'swaps'], value: undefined }, { path: ['choices', String(i), 'salt'], value: salt }] }),
  regenerate: (i: number): DocPatch => ({ label: `Regenerate slide ${i + 1} from the plan`, ops: [{ path: ['choices', String(i)], value: undefined }] }),
  style: (name: string, title: string): DocPatch => ({ label: `Change style to ${title}`, ops: [{ path: ['style'], value: name }] }),
  topic: (topic: string): DocPatch => ({ label: 'Edit topic', coalesce: 'topic', ops: [{ path: ['topic'], value: topic }] }),
  handle: (handle: string): DocPatch => ({ label: 'Change the handle', coalesce: 'handle', ops: [{ path: ['script', 'brand', 'handle'], value: handle }] }),
  /** The whole result of one Generate, so one Undo takes it back. */
  generate: (script: CarouselScript, style: string | null, title: string): DocPatch => ({ label: title, ops: [{ path: ['script'], value: script }, { path: ['choices'], value: {} }, ...(style ? [{ path: ['style'] as Path, value: style }] : [])] }),
  format: (format: Format, clearScript: boolean): DocPatch => ({ label: `Change format to ${format === 'carousel' ? 'carousel' : 'quote card'}`, ops: [{ path: ['format'], value: format }, ...(clearScript ? [{ path: ['script'] as Path, value: null }, { path: ['choices'] as Path, value: {} }] : [])] }),
  useScript: (script: CarouselScript): DocPatch => ({ label: 'Load the script', ops: [{ path: ['script'], value: script }, { path: ['choices'], value: {} }] }),
};
