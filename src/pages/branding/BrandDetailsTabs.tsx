import { useState } from 'react';
import type { BrandCompetitor, BrandProduct, BrandWorkspace } from './workspace';

type Props = { brand: BrandWorkspace; update: (patch: Partial<BrandWorkspace>) => void };

function Field({ label, value, onChange, placeholder = '', area = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; area?: boolean }) {
  return <label className="brand-field"><span>{label}</span>{area ? <textarea rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /> : <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}</label>;
}

export function ProfileTab({ brand, update }: Props) {
  return <div className="brand-stack">
    <section className="card brand-form-card"><div className="brand-section-head"><div><span className="brand-eyebrow">Identity</span><h2>Who this brand is</h2></div><span className="brand-owner">{brand.name}</span></div>
      <div className="brand-form-grid"><Field label="Brand name" value={brand.name} onChange={(name) => update({ name })}/><Field label="Country" value={brand.country} placeholder="Where the brand operates" onChange={(country) => update({ country })}/><Field label="What you do" value={brand.description} area placeholder="A clear description of the business" onChange={(description) => update({ description })}/><Field label="Who buys" value={brand.audience} area placeholder="The people this brand serves" onChange={(audience) => update({ audience })}/><Field label="Niche" value={brand.niche} placeholder="Industry or category" onChange={(niche) => update({ niche })}/></div>
    </section>
    <section className="card brand-form-card"><div className="brand-section-head"><div><span className="brand-eyebrow">Offer</span><h2>What customers choose</h2></div><span className="brand-owner">{brand.name}</span></div>
      <div className="brand-form-grid"><Field label="What you sell" value={brand.offer} area placeholder="Products or services" onChange={(offer) => update({ offer })}/><Field label="Price point" value={brand.pricePoint} placeholder="Optional" onChange={(pricePoint) => update({ pricePoint })}/><Field label="Why they choose you" value={brand.whyChoose} area placeholder="The practical difference" onChange={(whyChoose) => update({ whyChoose })}/></div>
    </section>
    <section className="card brand-form-card"><div className="brand-section-head"><div><span className="brand-eyebrow">Website</span><h2>Website identity</h2></div><span className="brand-owner">{brand.name}</span></div>
      <div className="brand-form-grid"><Field label="Website name" value={brand.websiteName} placeholder="Name shown on the website" onChange={(websiteName) => update({ websiteName })}/><Field label="Website URL" value={brand.websiteUrl} placeholder="https://example.com" onChange={(websiteUrl) => update({ websiteUrl })}/><Field label="Other links" value={brand.otherLinks} area placeholder="Store, booking page, social profile…" onChange={(otherLinks) => update({ otherLinks })}/></div>
    </section>
    <section className="card brand-form-card"><div className="brand-section-head"><div><span className="brand-eyebrow">Rules</span><h2>Claims and guardrails</h2></div><span className="brand-owner">{brand.name}</span></div>
      <div className="brand-form-grid"><Field label="Legal lines" value={brand.legalLines} area placeholder="Lines content must always carry" onChange={(legalLines) => update({ legalLines })}/><Field label="Product claims" value={brand.productClaims} area placeholder="Claims that are safe to make" onChange={(productClaims) => update({ productClaims })}/><Field label="Avoid" value={brand.avoid} area placeholder="What content must never show or say" onChange={(avoid) => update({ avoid })}/></div>
    </section>
    <section className="card brand-form-card"><div className="brand-section-head"><div><span className="brand-eyebrow">Current promotion</span><h2>Offer to mention now</h2></div><span className="brand-owner">{brand.name}</span></div>
      <div className="brand-form-grid"><Field label="Current offer" value={brand.promotion} placeholder="Optional" onChange={(promotion) => update({ promotion })}/><Field label="Last day" value={brand.promotionEnds} placeholder="Optional date" onChange={(promotionEnds) => update({ promotionEnds })}/><Field label="How to say the brand name" value={brand.namePronunciation} placeholder="Write it as it should be spoken" onChange={(namePronunciation) => update({ namePronunciation })}/></div>
    </section>
  </div>;
}

function Collection<T extends { id: string }>({ title, empty, items, render, add }: { title: string; empty: string; items: T[]; render: (item: T) => React.ReactNode; add: () => void }) {
  return <section className="card brand-form-card"><div className="brand-section-head"><div><span className="brand-eyebrow">{title}</span><h2>{title}</h2></div><button type="button" className="btn btn-dark btn-sm" onClick={add}>Add {title.slice(0, -1).toLowerCase()}</button></div>{items.length ? <div className="brand-collection">{items.map(render)}</div> : <p className="muted">{empty}</p>}</section>;
}

export function ProductsTab({ brand, update }: Props) {
  const change = (id: string, patch: Partial<BrandProduct>) => update({ products: brand.products.map((item) => item.id === id ? { ...item, ...patch } : item) });
  return <Collection title="Products" empty="No products yet. Add the products or services this brand can talk about." items={brand.products} add={() => update({ products: [...brand.products, { id: crypto.randomUUID(), name: '', description: '', link: '' }] })} render={(item) => <div className="brand-collection-item" key={item.id}><Field label="Name" value={item.name} placeholder="Product or service" onChange={(name) => change(item.id, { name })}/><Field label="Description" value={item.description} placeholder="What it is and who it helps" onChange={(description) => change(item.id, { description })}/><Field label="Link" value={item.link} placeholder="https://…" onChange={(link) => change(item.id, { link })}/><button type="button" className="btn btn-outline btn-sm" onClick={() => update({ products: brand.products.filter((p) => p.id !== item.id) })}>Remove</button></div>}/>;
}

export function CompetitorsTab({ brand, update }: Props) {
  const [draft, setDraft] = useState({ name: '', website: '', note: '' });
  const add = () => { if (!draft.website.trim()) return; const item: BrandCompetitor = { id: crypto.randomUUID(), ...draft }; update({ competitors: [...brand.competitors, item] }); setDraft({ name: '', website: '', note: '' }); };
  return <div className="brand-stack"><section className="card brand-form-card"><div className="brand-section-head"><div><span className="brand-eyebrow">Competitors</span><h2>Websites to keep in view</h2></div><span className="brand-owner">{brand.name}</span></div><p className="muted">Add the public websites of brands you consider competitors. These are references only; nothing is fetched in this step.</p><div className="brand-form-grid"><Field label="Competitor name" value={draft.name} placeholder="Optional" onChange={(name) => setDraft({ ...draft, name })}/><Field label="Website URL" value={draft.website} placeholder="https://competitor.com" onChange={(website) => setDraft({ ...draft, website })}/><Field label="Why they matter" value={draft.note} placeholder="Positioning, offer, audience…" onChange={(note) => setDraft({ ...draft, note })}/></div><div><button type="button" className="btn btn-dark btn-sm" disabled={!draft.website.trim()} onClick={add}>Add competitor</button></div></section>{brand.competitors.length > 0 && <section className="card brand-form-card"><div className="brand-section-head"><h2>Saved competitors</h2><span className="brand-owner">{brand.name}</span></div><div className="competitor-list">{brand.competitors.map((item) => <div key={item.id}><div><strong>{item.name || new URL(item.website.startsWith('http') ? item.website : `https://${item.website}`).hostname}</strong><a href={item.website.startsWith('http') ? item.website : `https://${item.website}`} target="_blank" rel="noreferrer">{item.website}</a>{item.note && <span className="muted">{item.note}</span>}</div><button type="button" className="btn btn-outline btn-sm" onClick={() => update({ competitors: brand.competitors.filter((c) => c.id !== item.id) })}>Remove</button></div>)}</div></section>}</div>;
}
