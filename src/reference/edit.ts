// Editing the style live, with no model: every change is a list of style patches (the same patch system the reader's refinements use), applied at
// once, with undo and redo, and each value remembers where it came from: MEASURED (the code), READER (the model) or PERSON (the person's own edit).
import type { StyleSpec } from '../image-engine/styles/format';
import type { Treatment } from '../image-engine/types';
import { applyPatches, type SpecPatch } from './spec';
import type { Target } from './types';

export type Origin = 'MEASURED' | 'READER' | 'PERSON';
export interface Snap {
  spec: StyleSpec;
  prov: Record<string, Origin>;
  label: string;
}
export interface EditState {
  spec: StyleSpec;
  /** Where each value came from, by spec path (a path stands for everything under it). */
  prov: Record<string, Origin>;
  past: Snap[];
  future: Snap[];
  /** Photo treatments switched off in the editor, kept so they can be switched on again. */
  parked: Record<string, Treatment[]>;
}

export const startEdit = (spec: StyleSpec, prov: Record<string, Origin>): EditState => ({ spec, prov, past: [], future: [], parked: {} });

/** Where a value came from: the nearest path that was recorded (a mark's size answers to "marks"). */
export function originOf(prov: Record<string, Origin>, path: string): Origin | null {
  const keys = path.split('.');
  for (let n = keys.length; n > 0; n--) {
    const o = prov[keys.slice(0, n).join('.')];
    if (o) return o;
  }
  return null;
}

/** Applies patches as one undoable change. Returns the new state, or the reasons it was refused. */
export function edit(state: EditState, label: string, patches: SpecPatch[], origin: Origin, target: Target): { ok: true; state: EditState; notes: string[] } | { ok: false; reasons: string[] } {
  const notes: string[] = [];
  const { spec, refused } = applyPatches(state.spec, patches, target, notes);
  if (refused.length) return { ok: false, reasons: refused };
  const prov = { ...state.prov };
  for (const p of patches) prov[p.path] = origin;
  return { ok: true, notes, state: { ...state, spec, prov, past: [...state.past, { spec: state.spec, prov: state.prov, label }].slice(-60), future: [] } };
}
export function undo(state: EditState): EditState {
  const last = state.past[state.past.length - 1];
  if (!last) return state;
  return { ...state, spec: last.spec, prov: last.prov, past: state.past.slice(0, -1), future: [{ spec: state.spec, prov: state.prov, label: last.label }, ...state.future] };
}
export function redo(state: EditState): EditState {
  const next = state.future[0];
  if (!next) return state;
  return { ...state, spec: next.spec, prov: next.prov, past: [...state.past, { spec: state.spec, prov: state.prov, label: next.label }], future: state.future.slice(1) };
}

/** A new state that replaces the spec without being an edit (the reader's answer): the history starts again from it. */
export function replaceSpec(state: EditState, spec: StyleSpec, origins: Record<string, Origin>): EditState {
  return { ...state, spec, prov: { ...state.prov, ...origins }, past: [{ spec: state.spec, prov: state.prov, label: 'Before the reader’s answer' }, ...state.past].slice(-60), future: [] };
}

/** The top-level and second-level paths whose values differ between two styles (for marking what the reader changed). */
export function changedPaths(a: StyleSpec, b: StyleSpec): string[] {
  const out: string[] = [];
  const A = a as unknown as Record<string, unknown>;
  const B = b as unknown as Record<string, unknown>;
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (['name', 'title', 'version', 'basedOn', 'assets', 'schema'].includes(k)) continue;
    if (JSON.stringify(A[k]) === JSON.stringify(B[k])) continue;
    if (isObj(A[k]) && isObj(B[k]) && k !== 'palettes') {
      for (const kk of new Set([...Object.keys(A[k] as object), ...Object.keys(B[k] as object)])) if (JSON.stringify((A[k] as Record<string, unknown>)[kk]) !== JSON.stringify((B[k] as Record<string, unknown>)[kk])) out.push(`${k}.${kk}`);
    } else out.push(k);
  }
  return out;
}

/** The layouts.cover value that puts the title at the top, in the middle or at the bottom. */
export function coverPlaced(spec: StyleSpec, place: 'top' | 'middle' | 'bottom'): SpecPatch {
  const use = place === 'top' ? 'cover-top' : place === 'middle' ? 'cover-centre' : 'cover-stack';
  const rules = spec.layouts.cover.filter((r) => r.use !== 'cover-top' && r.use !== 'cover-centre' && r.use !== use);
  const photo = rules.filter((r) => r.when?.photo);
  const rest = rules.filter((r) => !r.when?.photo);
  const fallback = rest.length ? rest.slice(-1) : [{ use: 'cover-stack' }];
  const chosen = use === 'cover-stack' ? [] : [{ use, when: { headlineWordsMax: 9 } }];
  return { path: 'layouts.cover', value: [...photo, ...chosen, ...(use === 'cover-stack' ? [{ use }] : fallback.filter((r) => r.use !== use))] };
}
/** Which of the three places the cover's title is in, by the first layout that is not a photo layout. */
export function coverPlace(spec: StyleSpec): 'top' | 'middle' | 'bottom' {
  const r = spec.layouts.cover.find((x) => !x.when?.photo);
  return r?.use === 'cover-top' ? 'top' : r?.use === 'cover-centre' ? 'middle' : 'bottom';
}
