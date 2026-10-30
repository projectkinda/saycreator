import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import { Tabs, tabPanelProps } from '../components/Tabs';
import { useDocumentTitle } from '../useDocumentTitle';
import { BrandKitTab } from './branding/BrandKitTab';
import { CompetitorsTab, ProductsTab, ProfileTab } from './branding/BrandDetailsTabs';
import { VoiceTab } from './branding/VoiceTab';
import { initialWorkspace, loadWorkspaces, saveWorkspaces, type BrandWorkspace } from './branding/workspace';

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'kit', label: 'Brand kit' },
  { id: 'voice', label: 'Writing voice' },
  { id: 'products', label: 'Products' },
  { id: 'competitors', label: 'Competitors' },
];

export default function Branding() {
  useDocumentTitle('Branding');
  const { brand: accountBrand } = useApp();
  const seedId = accountBrand?.id ?? 'brand-1';
  const seedName = accountBrand?.name ?? 'My brand';
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab') ?? 'profile';
  const tab = TABS.some((item) => item.id === requestedTab) ? requestedTab : 'profile';
  const [brands, setBrands] = useState<BrandWorkspace[]>(() => loadWorkspaces(seedId, seedName));
  const [activeId, setActiveId] = useState(() => brands[0]?.id ?? seedId);
  const active = useMemo(() => brands.find((brand) => brand.id === activeId) ?? brands[0], [activeId, brands]);

  useEffect(() => saveWorkspaces(brands), [brands]);
  useEffect(() => {
    if (!accountBrand || brands.length !== 1 || brands[0].id !== 'brand-1' || brands[0].name !== 'My brand') return;
    const seeded = initialWorkspace(accountBrand.id, accountBrand.name);
    setBrands([seeded]);
    setActiveId(seeded.id);
  }, [accountBrand, brands]);
  if (!active) return null;

  const update = (patch: Partial<BrandWorkspace>) => setBrands((current) => current.map((brand) => brand.id === active.id ? { ...brand, ...patch } : brand));
  const addBrand = () => {
    const next = initialWorkspace(`brand-${crypto.randomUUID()}`, `Brand ${brands.length + 1}`);
    setBrands((current) => [...current, next]);
    setActiveId(next.id);
  };

  return <div className="page page-tight branding-page">
    <header className="page-header"><div className="page-header-text"><h1 className="page-title">Branding</h1><p className="lead">Keep every brand distinct, accurate, and ready to use.</p></div><button type="button" className="btn btn-dark" onClick={addBrand}>+ New brand kit</button></header>
    <section className="brand-library" aria-label="Brand kits"><div className="brand-library-copy"><span className="brand-eyebrow">Brand library</span><strong>{brands.length} brand kit{brands.length === 1 ? '' : 's'}</strong></div><div className="brand-picker">{brands.map((brand) => <button type="button" key={brand.id} className={brand.id === active.id ? 'is-active' : ''} aria-pressed={brand.id === active.id} onClick={() => setActiveId(brand.id)}><span className="brand-picker-mark">{brand.name.slice(0, 2).toUpperCase()}</span><span><strong>{brand.name}</strong><small>{brand.websiteName || 'Website not named'}</small></span></button>)}</div></section>
    <div className="brand-active-banner"><span className="brand-picker-mark">{active.name.slice(0, 2).toUpperCase()}</span><div><span>Editing brand kit</span><strong>{active.name}</strong>{active.websiteName && <small>{active.websiteName}{active.websiteUrl ? ` · ${active.websiteUrl}` : ''}</small>}</div></div>
    <Tabs label="Branding sections" idPrefix="brand" tabs={TABS} value={tab} onChange={(next) => setParams(next === 'profile' ? {} : { tab: next }, { replace: true })}/>
    <div {...tabPanelProps('brand', tab)} className="panel brand-scope">
      <div className="brand-scope-label">Every section below belongs to <strong>{active.name}</strong></div>
      {tab === 'profile' && <ProfileTab brand={active} update={update}/>}
      {tab === 'kit' && <BrandKitTab key={active.id} brandId={active.id} brandName={active.name}/>}
      {tab === 'voice' && <VoiceTab key={active.id} brandId={active.id} brandName={active.name}/>}
      {tab === 'products' && <ProductsTab brand={active} update={update}/>}
      {tab === 'competitors' && <CompetitorsTab brand={active} update={update}/>}
    </div>
  </div>;
}
