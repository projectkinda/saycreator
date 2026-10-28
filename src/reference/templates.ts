// Saved templates: styles made from references. Only the style spec is kept (never the reference pictures), with a name, a small preview and
// the target. They live in this browser (IndexedDB); if that fails the person is told and the templates stay in memory until the page closes.
// Templates appear in the style pickers (carousel and thumbnail) tagged "Mine", through the registry at the bottom of this file.
import { useSyncExternalStore } from 'react';
import type { LoadedStyle } from '../image-engine/styles/load';
import type { StyleSpec } from '../image-engine/styles/format';
import type { FreeLayout } from '../image-engine/styles/free-spec';
import { checkSpec } from './spec';
import { TARGET_LABEL, type Target } from './types';

export interface Template {
  id: string;
  /** What the person calls it. The style's own name (spec.name) never changes. */
  name: string;
  target: Target;
  spec: StyleSpec;
  /** A small JPEG data URL of a sample slide or thumbnail. */
  preview: string;
  createdAt: number;
  updatedAt: number;
  /** Built from one image: the other slide types are extrapolated from it. */
  singleImage?: boolean;
  /** The slide types the references did not show (so they are extrapolated). */
  extrapolated?: string[];
  /** Plain words from the closeness panel, kept so the template remembers what it could not do. */
  missing?: string[];
  /** A stored layout of a shape the carousel and thumbnail screens cannot draw (not 4:5): kept in the template, not applied, never stretched. */
  layoutKept?: { id: string; ratio: string; w: number; h: number; free: FreeLayout };
}

const DB = 'creator-style-templates';
const STORE = 'templates';
export const TEMPLATE_PREFIX = 'mine-';

let list: Template[] = [];
let loaded: Promise<void> | null = null;
let problem = '';
let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version++;
  cache = null;
  listeners.forEach((l) => l());
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('This browser has no storage for templates.'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('The browser would not open its storage.'));
  });
}
const tx = async <T,>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    t.onerror = t.onabort = () => {
      db.close();
      reject(t.error ?? new Error('The browser could not save.'));
    };
  });
};

const STORAGE_MESSAGE = 'This browser would not save your templates, so they are kept only until you close this page. Export them to a file to keep them.';

/** Reads the saved templates (once). Never throws: a browser that cannot read its storage just starts with none and says so. */
export function ensureTemplatesLoaded(): Promise<void> {
  loaded ??= (async () => {
    try {
      const all = await tx<Template[]>('readonly', (s) => s.getAll() as IDBRequest<Template[]>);
      // A template whose style no longer passes the checks is kept out of the pickers rather than crashing them.
      list = all.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      problem = STORAGE_MESSAGE;
    }
    bump();
  })();
  return loaded;
}

async function persist(t: Template) {
  try {
    await tx('readwrite', (s) => s.put(t));
    problem = '';
  } catch {
    problem = STORAGE_MESSAGE;
  }
}

export const templates = () => list;
export const templateProblem = () => problem;
export const templateById = (id: string) => list.find((t) => t.id === id) ?? null;
export const isUserStyle = (name: string) => name.startsWith(TEMPLATE_PREFIX);

const newId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'style';
/** A unique style name for a new template. */
export const styleNameFor = (title: string) => `${TEMPLATE_PREFIX}${slug(title)}-${newId().slice(0, 4)}`;

export async function saveTemplate(o: { name: string; target: Target; spec: StyleSpec; preview: string; singleImage?: boolean; extrapolated?: string[]; missing?: string[]; layoutKept?: Template['layoutKept'] }): Promise<Template> {
  await ensureTemplatesLoaded();
  const now = Date.now();
  const t: Template = { id: newId(), name: o.name.trim() || 'My style', target: o.target, spec: { ...o.spec, title: o.name.trim() || 'My style' }, preview: o.preview, createdAt: now, updatedAt: now, ...(o.singleImage ? { singleImage: true } : {}), ...(o.extrapolated ? { extrapolated: o.extrapolated } : {}), ...(o.missing ? { missing: o.missing } : {}), ...(o.layoutKept ? { layoutKept: o.layoutKept } : {}) };
  list = [t, ...list];
  bump();
  await persist(t);
  bump();
  return t;
}
export async function renameTemplate(id: string, name: string) {
  const t = templateById(id);
  if (!t || !name.trim()) return;
  const next = { ...t, name: name.trim(), spec: { ...t.spec, title: name.trim() }, updatedAt: Date.now() };
  list = list.map((x) => (x.id === id ? next : x));
  bump();
  await persist(next);
  bump();
}
export async function duplicateTemplate(id: string): Promise<Template | null> {
  const t = templateById(id);
  if (!t) return null;
  const name = `${t.name} (copy)`;
  return saveTemplate({ name, target: t.target, spec: { ...t.spec, name: styleNameFor(name) }, preview: t.preview, singleImage: t.singleImage, extrapolated: t.extrapolated, missing: t.missing, layoutKept: t.layoutKept });
}
export async function deleteTemplate(id: string) {
  list = list.filter((x) => x.id !== id);
  bump();
  try {
    await tx('readwrite', (s) => s.delete(id));
    problem = '';
  } catch {
    problem = STORAGE_MESSAGE;
  }
  bump();
}

// ---------- export and import ----------

export const EXPORT_FORMAT = 'creator-style-templates';
export function exportTemplates(ids?: string[]): Blob {
  const chosen = list.filter((t) => !ids || ids.includes(t.id));
  return new Blob([JSON.stringify({ format: EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(), templates: chosen }, null, 2)], { type: 'application/json' });
}

/** Reads an exported file. Every template is checked with the style validator; the ones that fail are named with the reason and skipped. */
export async function importTemplates(text: string): Promise<{ added: Template[]; rejected: string[] }> {
  await ensureTemplatesLoaded();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { added: [], rejected: ['The file is not a templates file (it is not valid JSON).'] };
  }
  const f = raw as { format?: unknown; templates?: unknown };
  if (f?.format !== EXPORT_FORMAT || !Array.isArray(f.templates)) return { added: [], rejected: ['The file is not a templates file from this app.'] };
  const added: Template[] = [];
  const rejected: string[] = [];
  for (const item of f.templates as Partial<Template>[]) {
    const label = typeof item?.name === 'string' && item.name ? item.name : 'A template';
    if (!item || !item.spec || typeof item.spec !== 'object' || !['carousel', 'thumbnail', 'both'].includes(item.target as string)) {
      rejected.push(`${label}: it is missing its style or its target.`);
      continue;
    }
    // A new style name, so an imported copy never collides with one already here.
    const spec = { ...(item.spec as StyleSpec), name: styleNameFor(label) };
    const c = checkSpec(spec);
    if (c.errors.length) {
      rejected.push(`${label}: ${c.errors[0]}`);
      continue;
    }
    added.push(await saveTemplate({ name: label, target: item.target as Target, spec, preview: typeof item.preview === 'string' ? item.preview : '', singleImage: item.singleImage, extrapolated: item.extrapolated, missing: item.missing, layoutKept: item.layoutKept }));
  }
  return { added, rejected };
}

// ---------- the registry the style pickers read ----------

let cache: LoadedStyle[] | null = null;
/** The templates as styles, ready to use. A template that does not pass the style checks is left out. */
export function userStyles(): LoadedStyle[] {
  if (cache) return cache;
  cache = list.flatMap((t) => {
    const c = checkSpec(t.spec);
    return c.errors.length ? [] : [{ spec: t.spec, assets: {}, warnings: c.warnings }];
  });
  return cache;
}
/** Which format a template was made for, or null when the style is not a template. */
export const targetOfStyle = (name: string): Target | null => list.find((t) => t.spec.name === name)?.target ?? null;
export const templateOfStyle = (name: string) => list.find((t) => t.spec.name === name) ?? null;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
/** Re-renders a page when the templates change. */
export const useTemplatesVersion = () => useSyncExternalStore(subscribe, () => version);

/** A plain warning when a template made for one format is about to be used for the other, or null. */
export function targetWarning(name: string, use: 'carousel' | 'thumbnail'): string | null {
  const t = targetOfStyle(name);
  if (!t || t === 'both' || t === use) return null;
  return `This template was made for ${TARGET_LABEL[t].toLowerCase()} only. ${use === 'carousel' ? 'Carousel slides' : 'Thumbnails'} use the base style for everything it does not say, so the result may not look like your references.`;
}
