// Round H part A: the person's brands, kept on this device (localStorage "creator.brands.v1"). Read defensively: missing, corrupt or blocked storage gives an empty list, never a crash.
// A brand is a name and 1 to 3 colours; the carousel keeps its own copy of the colours it was drawn with (the "scheme" in doc.ts), so deleting a brand never changes a carousel.

export const BRANDS_KEY = 'creator.brands.v1';
export const BRAND_NAME_MAX = 40;

export interface SavedBrand {
  id: string;
  name: string;
  /** 1 to 3 colours as lowercase #rrggbb: main, second, extra. */
  colours: string[];
  /** Kept for later; the screens do not use it yet. */
  styleId?: string;
  createdAt: number;
}
export interface BrandStore { brands: SavedBrand[]; activeId: string | null }

/** #abc, #aabbcc and aabbcc become #aabbcc; anything else is null. */
export function normaliseHex(input: unknown): string | null {
  const t = String(input ?? '').trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
  return '#' + h.toLowerCase();
}

const read = (): string | null => {
  try {
    return localStorage.getItem(BRANDS_KEY);
  } catch {
    return null;
  }
};

/** The saved brands; garbage is dropped item by item. */
export function loadBrands(): BrandStore {
  const empty: BrandStore = { brands: [], activeId: null };
  const text = read();
  if (!text) return empty;
  try {
    const raw = JSON.parse(text) as { brands?: unknown; activeId?: unknown };
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.brands)) return empty;
    const seen = new Set<string>();
    const brands: SavedBrand[] = [];
    for (const b of raw.brands as Record<string, unknown>[]) {
      if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !b.id || seen.has(b.id) || !Array.isArray(b.colours)) continue;
      const colours = (b.colours as unknown[]).map(normaliseHex).filter((c): c is string => !!c).slice(0, 3);
      if (!colours.length) continue;
      seen.add(b.id);
      brands.push({ id: b.id, name: typeof b.name === 'string' ? b.name.slice(0, BRAND_NAME_MAX) : 'Brand', colours, ...(typeof b.styleId === 'string' ? { styleId: b.styleId } : {}), createdAt: typeof b.createdAt === 'number' ? b.createdAt : 0 });
    }
    const activeId = typeof raw.activeId === 'string' && seen.has(raw.activeId) ? raw.activeId : null;
    return { brands, activeId };
  } catch {
    return empty;
  }
}

/** Saves the list. false when the browser refuses (the screens then say so). */
export function saveBrands(s: BrandStore): boolean {
  try {
    localStorage.setItem(BRANDS_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export const newBrandId = (): string => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Adds or replaces (same id) a brand, makes it the active one and saves. */
export function upsertBrand(b: { id?: string; name: string; colours: string[]; styleId?: string }): { store: BrandStore; brand: SavedBrand; saved: boolean } {
  const s = loadBrands();
  const colours = b.colours.map(normaliseHex).filter((c): c is string => !!c).slice(0, 3);
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
  const store = { ...s, activeId: id && s.brands.some((x) => x.id === id) ? id : null };
  saveBrands(store);
  return store;
}
