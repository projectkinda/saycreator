// The person's brands for the carousel maker. Round H kept them in their own list ("creator.brands.v1"); Round I moved them into the ONE list the Branding page keeps
// ("creator.brand-workspaces.v1", src/pages/branding/workspace.ts), so the Style step and the Branding page show the same brands and the same active brand.
// The old key is read once and brought in (migrateOldBrands) and never deleted. Read defensively: missing, corrupt or blocked storage gives an empty list, never a crash.
// The carousel keeps its own copy of the colours it was drawn with (the "scheme" in doc.ts), so deleting a brand never changes a carousel.
import { WORKSPACES_KEY, cleanColours, initialWorkspace, normaliseHex, readActiveId, readWorkspaces, writeActiveId, writeWorkspaces, type BrandWorkspace } from '../pages/branding/workspace';

export { normaliseHex };
/** The key of Round H's own list. Only read now (to bring it in once). */
export { OLD_BRANDS_KEY as BRANDS_KEY } from '../pages/branding/workspace';
export { WORKSPACES_KEY };
export const BRAND_NAME_MAX = 40;

export interface SavedBrand {
  id: string;
  name: string;
  /** 0 to 3 colours as lowercase #rrggbb: main, second, extra. A brand made on the Branding page has none until it is given some. */
  colours: string[];
  /** Kept for later; the screens do not use it yet. */
  styleId?: string;
  createdAt: number;
}
export interface BrandStore { brands: SavedBrand[]; activeId: string | null }

const toBrand = (w: BrandWorkspace): SavedBrand => ({ id: w.id, name: w.name.slice(0, BRAND_NAME_MAX), colours: w.colours ? [...w.colours] : [], ...(w.styleId ? { styleId: w.styleId } : {}), createdAt: w.createdAt ?? 0 });

/** The saved brands (the one list), with the active one. */
export function loadBrands(): BrandStore {
  const brands = readWorkspaces().map(toBrand);
  const a = readActiveId();
  return { brands, activeId: a && brands.some((b) => b.id === a) ? a : null };
}

/** Saves a whole list of brands: a workspace keeps everything else it holds (profile, products...). false when the browser refuses. */
export function saveBrands(s: BrandStore): boolean {
  const cur = readWorkspaces();
  const next: BrandWorkspace[] = s.brands.map((b) => {
    const w = cur.find((x) => x.id === b.id) ?? initialWorkspace(b.id, b.name);
    const colours = cleanColours(b.colours);
    const { colours: _drop, ...rest } = w;
    void _drop;
    return { ...rest, name: b.name, ...(colours ? { colours } : {}), ...(b.styleId ? { styleId: b.styleId } : {}), createdAt: b.createdAt };
  });
  const ok = writeWorkspaces(next);
  return writeActiveId(s.activeId && next.some((w) => w.id === s.activeId) ? s.activeId : null) && ok;
}

export const newBrandId = (): string => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Adds or replaces (same id) a brand, makes it the active one and saves. */
export function upsertBrand(b: { id?: string; name: string; colours: string[]; styleId?: string }): { store: BrandStore; brand: SavedBrand; saved: boolean } {
  const s = loadBrands();
  const colours = (cleanColours(b.colours) ?? []);
  const old = b.id ? s.brands.find((x) => x.id === b.id) : undefined;
  const brand: SavedBrand = { id: old?.id ?? newBrandId(), name: b.name.trim().slice(0, BRAND_NAME_MAX), colours, ...(b.styleId ?? old?.styleId ? { styleId: b.styleId ?? old?.styleId } : {}), createdAt: old?.createdAt ?? Date.now() };
  const brands = old ? s.brands.map((x) => (x.id === brand.id ? brand : x)) : [...s.brands, brand];
  const store = { brands, activeId: brand.id };
  return { store, brand, saved: saveBrands(store) };
}

export function deleteBrand(id: string): { store: BrandStore; saved: boolean } {
  const s = loadBrands();
  const store = { brands: s.brands.filter((x) => x.id !== id), activeId: s.activeId === id ? null : s.activeId };
  return { store, saved: saveBrands(store) };
}

/** null: the style's own colours. */
export function setActiveBrand(id: string | null): BrandStore {
  const s = loadBrands();
  const activeId = id && s.brands.some((x) => x.id === id) ? id : null;
  writeActiveId(activeId);
  return { ...s, activeId };
}
