// The reference that is active on a working screen (Make a thumbnail, Carousel): its style is in memory only, offered by getStyles() under one fixed name, until the
// person removes it or saves it as a template. Nothing here is stored.
import { useSyncExternalStore } from 'react';
import type { LoadedStyle } from '../image-engine/styles/load';
import { checkSpec } from './spec';
import type { StyleSpec } from '../image-engine/styles/format';
import type { LearnFrom, Target } from './types';

export const ACTIVE_STYLE = 'mine-reference-active';

export interface ActiveReference {
  spec: StyleSpec;
  /** A small picture of the first reference, as a data URL. */
  thumb: string;
  learn: LearnFrom;
  target: Target;
  /** Said in the panel when the references were another shape than the target. */
  ratioNote: string | null;
  /** The biggest photo found in the first reference, as shares of that reference (0 to 1). Null when none, or when it covers nearly everything. */
  photoRegion: { x: number; y: number; width: number; height: number } | null;
  /** Where the style came from: references the person added, or a description they typed. Left out: references. */
  source?: 'reference' | 'description' | 'recreate';
  /** A recreated look: layers (colours as palette names), the palette, the size. Used on every carousel slide with the slide's own words. */
  recreate?: import('./recreate').RecreateSpec;
  /** The layout of a description (the thumbnail maker draws it itself; carousels get it as the style's free layouts). */
  free?: import('../image-engine/styles/free-spec').FreeLayout;
}

let current: (ActiveReference & { style: LoadedStyle }) | null = null;
let version = 0;
let showDetected = false;
let clears = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version++;
  listeners.forEach((l) => l());
};

export function setActiveReference(a: ActiveReference) {
  const spec = { ...a.spec, name: ACTIVE_STYLE, title: 'Reference' } as StyleSpec;
  const c = checkSpec(spec);
  if (c.errors.length) return;
  current = { ...a, spec, style: { spec, assets: {}, warnings: c.warnings } };
  bump();
}
export function clearActiveReference(removed = false, only?: 'reference' | 'description' | 'recreate') {
  if (only && (current?.source ?? 'reference') !== only) return;
  if (!current && !removed) return;
  current = null;
  if (removed) clears++;
  bump();
}
export const activeStyle = (): LoadedStyle | null => current?.style ?? null;
export const activeReference = (): ActiveReference | null => current;
export const setShowDetected = (on: boolean) => {
  if (on === showDetected) return;
  showDetected = on;
  bump();
};
export const wantsDetected = () => showDetected;
export const removedCount = () => clears;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
/** Re-renders when the active reference, its overlay choice or its removal changes. */
export const useActiveReference = () => {
  const v = useSyncExternalStore(subscribe, () => version);
  return { version: v, active: current as ActiveReference | null, showDetected, removed: clears };
};
