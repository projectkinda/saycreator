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
  products: BrandProduct[];
  competitors: BrandCompetitor[];
};

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

export function loadWorkspaces(seedId: string, seedName: string): BrandWorkspace[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]') as BrandWorkspace[];
    if (Array.isArray(saved) && saved.length) return saved;
  } catch { /* Start with the current brand if saved data is damaged. */ }
  return [initialWorkspace(seedId, seedName)];
}

export function saveWorkspaces(workspaces: BrandWorkspace[]) {
  localStorage.setItem(KEY, JSON.stringify(workspaces));
}
