// The person's changes to the detected style devices (marker, underline, profile header, shapes). They are kept apart from the whole-slide read cache, keyed by the same read key
// (the hash of the pictures + the reader prompt), so a cache hit or a fresh read of the same pictures gets them back and the cache never overwrites them.
import type { StyleOverrides, StylePack } from './pack';

const KEY = 'creator.styleOverrides.v1';
const all = (): Record<string, StyleOverrides> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, StyleOverrides>;
  } catch {
    return {};
  }
};
export const loadOverrides = (key: string): StyleOverrides | null => (key ? all()[key] ?? null : null);
export function saveOverrides(key: string, ov: StyleOverrides | null): void {
  if (!key) return;
  try {
    const m = all();
    if (ov && Object.keys(ov).length) m[key] = ov;
    else delete m[key];
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* not remembered */
  }
}
/** A pack just read (or taken from the read cache): it is marked with its read key, and the person's saved overrides for those pictures are laid back on it. */
export const withOverrides = (pack: StylePack, key: string): StylePack => {
  const ov = loadOverrides(key);
  return { ...pack, ...(key ? { readKey: key } : {}), ...(ov ? { overrides: ov } : {}) };
};
