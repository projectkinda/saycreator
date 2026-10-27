// Coverage: which stored style covers each of the reference decks (and what is missing), and where each test photo was used.
import { useEffect, useMemo, useState } from 'react';
import { Pic } from './common';
import { PHOTO_STYLES, REF, parsePhotoSlides, photoDecks, useLab } from './labdata';

type Missing = { kind: 'cutouts' | '3d' | 'font' | 'other'; text: string };
interface Deck {
  file: string;
  /** The photo style that took on its photo side, if any. */
  photoStyle?: string;
  missing: Missing[];
}
const CUT: Missing = { kind: 'cutouts', text: 'Needs cutouts (a person or object with the background removed)' };
const D3: Missing = { kind: '3d', text: 'Needs 3D object PNGs (transparent pictures of glossy objects)' };
const font = (what: string): Missing => ({ kind: 'font', text: `Needs a font we do not have (${what})` });

/** Written by hand from the Phase 1 reading and the Step 11 results. Edit it when a style or a tool changes. */
const DECKS: Deck[] = [
  { file: '05bedfc030d7d583cb8618bbe7985d86.jpg', missing: [D3, CUT] },
  { file: '1503c1de8dded2a7cbe333f061c7131a.jpg', photoStyle: 'glass-gradient', missing: [] },
  { file: '1f13499493341400cfc3fe6e05fe3d58.jpg', photoStyle: 'mono-poster', missing: [font('a brush-script accent word')] },
  { file: '2f6d16ce07d65271ba43f1d75f54c5d0.jpg', missing: [D3] },
  { file: '40f8168b9a4fcc23045c5d03ff999d9a.jpg', photoStyle: 'mono-poster', missing: [CUT, font('a thin serif italic')] },
  { file: '44937935e682165c1f93e99a11a47123.jpg', photoStyle: 'mono-poster', missing: [CUT, { kind: 'other', text: 'Needs diagonal tape banners and portrait photos' }] },
  { file: '58d68b12ac74ce8cc0f8d2f9df45e6de.jpg', missing: [font('a serif italic')] },
  { file: '5f8f31661dfcbde65cb15e7314e9a9ff.jpg', photoStyle: 'mono-poster', missing: [] },
  { file: '852e2681fb61df8358bc7c729488be50.jpg', missing: [font('a monospace italic')] },
  { file: '9885e1020f38cd3f6c18df82813e7699.jpg', missing: [D3] },
  { file: '9897a861375e0f0abb77f9b7ac28febd.jpg', photoStyle: 'film-paper', missing: [CUT, font('a tall serif and a handwriting font'), { kind: 'other', text: 'Needs paper notes, tape and stickers on photos' }] },
  { file: 'af4224d23eb688a8eb56abb9515b593e.jpg', photoStyle: 'film-paper', missing: [CUT, font('a serif italic')] },
  { file: 'bf7d6a6e42c4742031644ad3118f8eb1.jpg', photoStyle: 'glass-gradient', missing: [D3] },
  { file: 'download.png', missing: [D3] },
  { file: 'e1071ec22dc051d04dd8e8e099c48a02.jpg', missing: [D3] },
  { file: 'ee0ae4cdbf5353c1b9dfa8df40f6e21c.jpg', missing: [CUT, font('a serif italic')] },
];

interface Use {
  where: string;
}

export default function Coverage() {
  const { recreation, manifests, testAssets } = useLab();
  const [uses, setUses] = useState<Record<string, Use[]> | null>(null);
  const clusters = recreation?.clusters;
  const titleOf = (name: string) => recreation?.styles.find((s) => s.name === name)?.title ?? name;
  const clusterOf = (file: string) => clusters?.clusters.find((c) => c.images.includes(file))?.id;

  // Which slides used each test photo: read the plan of every photo slide and the gallery, and look for the picture's name.
  const plans = useMemo(() => {
    const out: { url: string; where: string }[] = [];
    for (const st of PHOTO_STYLES)
      for (const d of photoDecks(manifests, st))
        for (const s of parsePhotoSlides(d.item)) out.push({ url: s.url.replace(/\.png$/, '.plan.json'), where: `${titleOf(st)}, ${d.deckId.replace(/^photo-/, '').replace(/-/g, ' ')}, slide ${s.n}` });
    const gal = manifests.find((x) => x.file === 'step11.json')?.groups.find((g) => g.title === 'Gallery: treatments')?.items[0];
    if (gal) out.push({ url: gal.images[0].url.replace(/\.png$/, '.plan.json'), where: 'Treatment gallery (every item uses this photo)' });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifests, recreation]);
  useEffect(() => {
    if (testAssets.length === 0 || plans.length === 0) return;
    let live = true;
    Promise.all(plans.map((p) => fetch(p.url).then((r) => (r.ok ? r.text() : '')).catch(() => ''))).then((texts) => {
      if (!live) return;
      const m: Record<string, Use[]> = {};
      for (const a of testAssets) {
        const needle = encodeURIComponent(a.name);
        m[a.name] = plans.filter((_, i) => texts[i].includes(needle)).map((p) => ({ where: p.where }));
      }
      setUses(m);
    });
    return () => {
      live = false;
    };
  }, [plans, testAssets]);

  return (
    <div>
      <h3 className="h3">Reference decks</h3>
      <div className="res-table-wrap">
        <table className="res-table">
          <thead>
            <tr><th scope="col">Reference deck</th><th scope="col">Stored style</th><th scope="col">Photo style</th><th scope="col">Status</th><th scope="col">What is missing</th></tr>
          </thead>
          <tbody>
            {DECKS.map((d) => {
              const cid = clusterOf(d.file);
              const stored = cid ? titleOf(cid) : null;
              const photo = d.photoStyle ? titleOf(d.photoStyle) : null;
              const status = !stored && !photo ? 'Not covered' : d.missing.length === 0 ? 'Covered' : 'Partly covered';
              const desc = clusters?.images[d.file]?.description ?? d.file;
              return (
                <tr key={d.file}>
                  <td className="res-cov-ref">
                    <Pic src={REF + encodeURIComponent(d.file)} alt={`Reference deck: ${desc}`} />
                    <span className="small muted">{desc}</span>
                  </td>
                  <td>{stored ?? <span className="muted">none</span>}</td>
                  <td>{photo ?? <span className="muted">none</span>}</td>
                  <td><span className={status === 'Covered' ? 'chip chip-ok' : status === 'Partly covered' ? 'chip chip-warn' : 'chip chip-error'}>{status}</span></td>
                  <td>
                    {d.missing.length === 0 ? <span className="muted">Nothing important</span> : <ul className="res-missing">{d.missing.map((m) => <li key={m.text}>{m.text}</li>)}</ul>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="h3">Test photos (TEST ASSETS: not shippable)</h3>
      <p className="small muted">The pictures in the private test-pictures folder and which slides used each. A photo may also be used as a picture element in the element test slides; those are not listed here.</p>
      {testAssets.length === 0 ? (
        <p className="small muted">The folder is empty, or the dev server is not running.</p>
      ) : (
        <div className="res-table-wrap">
          <table className="res-table">
            <thead>
              <tr><th scope="col">Photo</th><th scope="col">Used by</th></tr>
            </thead>
            <tbody>
              {testAssets.map((a) => {
                const u = uses?.[a.name];
                return (
                  <tr key={a.name}>
                    <td className="res-cov-ref">
                      <Pic src={a.url} alt={`Test photo ${a.name}`} />
                      <span className="small muted">{a.name}</span>
                    </td>
                    <td>
                      {u === undefined ? <span className="muted">Checking…</span> : u.length === 0 ? <span className="chip chip-tag">unused</span> : <ul className="res-missing">{u.map((x) => <li key={x.where}>{x.where}</li>)}</ul>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
