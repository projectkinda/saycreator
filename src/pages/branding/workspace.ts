export type BrandProduct = { id: string; name: string; description: string; link: string };
export type BrandCompetitor = { id: string; name: string; website: string; note: string };

export type BrandWorkspace = {
  id: string;
  name: string;
  websiteName: string;
  websiteUrl: string;
  description: string;
  country: string;
  offer: string;
  pricePoint: string;
  whyChoose: string;
  audience: string;
  niche: string;
  otherLinks: string;
  legalLines: string;
  productClaims: string;
  avoid: string;
  promotion: string;
  promotionEnds: string;
  namePronunciation: string;
  rulesDocument?: { name: string; size: number; type: string };
  products: BrandProduct[];
  competitors: BrandCompetitor[];
  /** Round I: the brand's colours for the carousel maker: 1 to 3 as lowercase #rrggbb (main, second, extra). Absent on a workspace made before this round. */
  colours?: string[];
  styleId?: string;
  createdAt?: number;
};

export const COUNTRIES = [
  'Australia', 'Brazil', 'Canada', 'France', 'Germany', 'India', 'Indonesia', 'Ireland', 'Italy', 'Japan', 'Mexico', 'Netherlands', 'New Zealand', 'Nigeria', 'Philippines', 'Singapore', 'South Africa', 'South Korea', 'Spain', 'Sweden', 'United Arab Emirates', 'United Kingdom', 'United States',
];

export const NICHES = [
  'AI content / social / UGC / video-image gen tools',
  'AI dev tools / agents / automation / infra',
  'AI productivity / assistant / utility apps',
  'Apparel, footwear & fashion DTC',
  'Consumer goods / home goods / general DTC',
  'Creator economy / UGC marketplaces / monetization',
  'Crypto / web3 / DeFi / blockchain',
  'Dating & social apps',
  'Edtech / courses / tutoring / coaching',
  'Faith / spirituality / astrology / manifestation',
  'Fintech / payments / lending / wealth / insurance',
  'Food / beverage / grocery / restaurants',
  'Health, fitness & nutrition apps',
  'Healthcare / telehealth / medical & dental',
  'Home / cleaning / trades / local services',
  'Legaltech / compliance / corporate / cybersecurity',
  'Marketing / creative / PR agencies',
  'Mental health / mindfulness / habit / screen-time apps',
  'Music / media / publishing / content brands',
  'Parenting / kids / baby',
  'Pet care & products',
  'Real estate / proptech / property',
  'Recruiting / careers / jobs / HR',
  'SEO / website-builder / marketing-automation SaaS',
  'Skincare / beauty / cosmetics DTC',
  'Sports betting / gaming / esports / fantasy',
  'Supplements & functional wellness DTC',
  'Trading / investing / market intelligence',
  'Travel / hospitality / eSIM / mobility',
  'Vertical / SMB business software, ops & CRM',
];

const KEY = 'creator.brand-workspaces.v1';

export const initialWorkspace = (id: string, name: string): BrandWorkspace => ({
  id,
  name,
  websiteName: name,
  websiteUrl: '',
  description: '',
  country: '',
  offer: '',
  pricePoint: '',
  whyChoose: '',
  audience: '',
  niche: '',
  otherLinks: '',
  legalLines: '',
  productClaims: '',
  avoid: '',
  promotion: '',
  promotionEnds: '',
  namePronunciation: name,
  products: [],
  competitors: [],
});

/** #abc, #aabbcc and aabbcc become #aabbcc; anything else is null. */
export function normaliseHex(input: unknown): string | null {
  const t = String(input ?? '').trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
  return '#' + h.toLowerCase();
}
/** 1 to 3 valid colours, or undefined. */
export const cleanColours = (raw: unknown): string[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const c = raw.map(normaliseHex).filter((x): x is string => !!x).slice(0, 3);
  return c.length ? c : undefined;
};

// ---- Round I: the one list of brands (the carousel maker reads and writes it too: src/carousel/brandStore.ts) ----
/** The list of brand workspaces. */
export const WORKSPACES_KEY = KEY;
/** Which brand is active (a workspace id). Missing: none (the carousel maker then uses the style's own colours). */
export const ACTIVE_KEY = 'creator.brand-workspaces.active.v1';
/** Round H's carousel-only brand list. Only ever READ now (never changed or deleted), to bring its brands in once. */
export const OLD_BRANDS_KEY = 'creator.brands.v1';
/** Set when the old list has been brought in, so a brand deleted afterwards does not come back from it. */
export const MIGRATED_KEY = 'creator.brands.migrated.v1';

const read = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key: string, value: string | null): boolean => {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); return true; } catch { return false; }
};

/** One stored workspace, repaired: an id and a name are needed, every other field falls back to the empty value. */
function sanitise(raw: unknown): BrandWorkspace | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id || typeof r.name !== 'string') return null;
  const base = initialWorkspace(r.id, r.name);
  const w: Record<string, unknown> = { ...base };
  for (const k of Object.keys(base) as (keyof BrandWorkspace)[]) {
    if (typeof base[k] === 'string' && typeof r[k] === 'string') w[k] = r[k];
  }
  w.products = Array.isArray(r.products) ? r.products : [];
  w.competitors = Array.isArray(r.competitors) ? r.competitors : [];
  if (r.rulesDocument && typeof r.rulesDocument === 'object') w.rulesDocument = r.rulesDocument;
  const colours = cleanColours(r.colours);
  if (colours) w.colours = colours;
  if (typeof r.styleId === 'string') w.styleId = r.styleId;
  if (typeof r.createdAt === 'number') w.createdAt = r.createdAt;
  return w as unknown as BrandWorkspace;
}
function parseList(text: string | null): BrandWorkspace[] {
  if (!text) return [];
  try {
    const raw = JSON.parse(text);
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: BrandWorkspace[] = [];
    for (const x of raw) { const w = sanitise(x); if (w && !seen.has(w.id)) { seen.add(w.id); out.push(w); } }
    return out;
  } catch { return []; }
}
/** The list as stored, with no migration. */
const readStored = (): BrandWorkspace[] => parseList(read(KEY));
/** Writes the list. false when the browser refuses. */
export const writeWorkspaces = (list: BrandWorkspace[]): boolean => write(KEY, JSON.stringify(list));
export const readActiveId = (): string | null => read(ACTIVE_KEY) || null;
export const writeActiveId = (id: string | null): boolean => write(ACTIVE_KEY, id);

const sameColours = (a?: string[], b?: string[]) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/**
 * Brings Round H's carousel brands (creator.brands.v1) into the one list, once. Each old brand keeps its id (a carousel's colour scheme refers to it), name, colours, style and date. A brand that is
 * already there (same id with colours, or the same name and colours) is skipped, so running it again changes nothing. The old key is only read. If the new list cannot be written, nothing is marked
 * as done and the old key stays the fallback. Returns true when something was added.
 */
export function migrateOldBrands(): boolean {
  if (read(MIGRATED_KEY)) return false;
  const text = read(OLD_BRANDS_KEY);
  if (!text) return false;
  let old: { brands?: unknown; activeId?: unknown };
  try { old = JSON.parse(text); } catch { return false; }
  if (!old || typeof old !== 'object' || !Array.isArray(old.brands)) return false;
  const list = readStored();
  const used = new Map<string, string>();
  const seenOld = new Set<string>();
  let changed = false;
  for (const raw of old.brands as Record<string, unknown>[]) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) continue;
    if (seenOld.has(raw.id)) continue; // a repeated id in the old list: the first one wins, as before
    seenOld.add(raw.id);
    const colours = cleanColours(raw.colours);
    if (!colours) continue;
    const name = (typeof raw.name === 'string' && raw.name ? raw.name : 'Brand').slice(0, 40);
    const dup = list.find((w) => w.name === name && sameColours(w.colours, colours)) ?? list.find((w) => w.id === raw.id && w.colours?.length && sameColours(w.colours, colours));
    if (dup) { used.set(raw.id, dup.id); continue; }
    const byId = list.find((w) => w.id === raw.id);
    const extra = { ...(typeof raw.styleId === 'string' ? { styleId: raw.styleId } : {}), createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0 };
    if (byId && byId.name === name && !byId.colours?.length) {
      Object.assign(byId, { colours, ...extra });
      used.set(raw.id, byId.id);
    } else {
      const id = byId ? 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) : raw.id;
      list.push({ ...initialWorkspace(id, name), colours, ...extra });
      used.set(raw.id, id);
    }
    changed = true;
  }
  if (changed && !writeWorkspaces(list)) return false;
  if (!readActiveId() && typeof old.activeId === 'string' && used.has(old.activeId)) writeActiveId(used.get(old.activeId)!);
  write(MIGRATED_KEY, '1');
  return changed;
}

/** The list of brands (migrated first). Empty when nothing is stored. */
export function readWorkspaces(): BrandWorkspace[] {
  migrateOldBrands();
  return readStored();
}

export function loadWorkspaces(seedId: string, seedName: string): BrandWorkspace[] {
  const saved = readWorkspaces();
  return saved.length ? saved : [initialWorkspace(seedId, seedName)];
}

export function saveWorkspaces(workspaces: BrandWorkspace[]) {
  writeWorkspaces(workspaces);
}
