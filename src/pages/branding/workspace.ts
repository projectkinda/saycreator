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
