// Step 7: Smart element placement. Each slide shows the old random pick beside the pick that follows the slide's tags (and the TEST
// version when private pictures exist), with the tags, the elements used and whether each links to the tags. Plus the hot-flat
// starburst colour fix, before and after. Every picture is one slide.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckLine, Pic, Section, VerdictBox, useResults, type RecordBase } from './common';

interface Link { id: string; related: boolean | null; score: number }
interface Slide {
  style: string;
  script: string;
  scriptTitle: string;
  index: number;
  type: string;
  mode: string;
  label: string;
  elementTags: string[] | null;
  elementsUsed: string[];
  elementLinks: Link[];
  notes: string[];
  pass: boolean;
  lint: { id: string; label?: string; pass: boolean; reason: string }[];
  pngUrl: string;
}
interface Row { style: string; smartUnrelated: number; randomUnrelated: number; smartPictures: number }
interface Data { slides: Slide[]; summary: Row[] | null; testSkipped: { reason: string } | null; lastRun: number }

const VERDICT = ['better', 'same', 'worse'].map((v) => ({ value: v, label: v }));
const MODES: { mode: string; title: string }[] = [
  { mode: 'random', title: 'Before: random pick' },
  { mode: 'smart', title: 'After: follows the slide' },
  { mode: 'test', title: 'TEST ASSETS: not shippable' },
];

function Elements({ s }: { s: Slide }) {
  if (s.elementsUsed.length === 0) return <p className="small muted">No elements placed.</p>;
  return (
    <ul className="res-smart-els small">
      {s.elementsUsed.map((id) => {
        const l = s.elementLinks.find((x) => x.id === id);
        const mark = l?.related === true ? 'links to the tags' : l?.related === false ? 'UNRELATED' : 'decoration';
        return <li key={id} className={l?.related === false ? 'lab-err' : ''}>{id} <span className="muted">({mark})</span></li>;
      })}
    </ul>
  );
}

export default function SmartPlacement({ refreshKey, onRefreshed }: { refreshKey: number; onRefreshed: () => void }) {
  const { records, setRecord } = useResults();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    setBusy(true);
    fetch('/__lab/smart').then((r) => r.json()).then(setData).catch(() => setData(null)).finally(() => { setBusy(false); onRefreshed(); });
  }, [onRefreshed]);
  useEffect(refresh, [refresh, refreshKey]);

  const groups = useMemo(() => {
    const m = new Map<string, Map<string, Slide>>();
    for (const s of data?.slides ?? []) {
      const k = `${s.style}|${s.script}|${s.index}`;
      const g = m.get(k) ?? new Map<string, Slide>();
      g.set(s.mode, s);
      m.set(k, g);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  const totals = useMemo(() => {
    const t = new Map<string, { slides: number; smart: number; related: number; random: number }>();
    for (const r of data?.summary ?? []) {
      const x = t.get(r.style) ?? { slides: 0, smart: 0, related: 0, random: 0 };
      x.slides++;
      x.smart += r.smartUnrelated;
      x.related += r.smartPictures;
      x.random += r.randomUnrelated;
      t.set(r.style, x);
    }
    return [...t.entries()];
  }, [data]);

  const bursts = groups.filter(([k, g]) => k.startsWith('hot-flat|') && (g.get('smart')?.elementsUsed.some((e) => e.includes('starburst')) || g.get('before-starbursts')?.elementsUsed.some((e) => e.includes('starburst'))));
  const cards = groups.filter(([k]) => !k.startsWith('hot-flat|'));

  return (
    <Section id="smart-placement" title="Step 7: Smart element placement" lastRun={data?.lastRun ?? null} onRefresh={refresh} busy={busy} intro="Elements now follow what each slide says. Each slide has 2 to 4 element tags (written by hand into the sample scripts for now; a model would fill them later). A picture of a thing is only placed if it links to those tags, otherwise nothing is. The sample is 4 hand-tagged decks: it shows the mechanism works on them, not that it generalises.">
      {data === null && <p role="status">Loading…</p>}
      {data && data.slides.length === 0 && <p className="lab-err">Nothing found. Run <code>npm run test:image</code> first.</p>}
      {totals.length > 0 && (
        <table className="res-smart-table small" aria-label="Unrelated pictures, before and after">
          <thead><tr><th>Style</th><th>Slides</th><th>Pictures linked to the slide (after)</th><th>Unrelated pictures, before (random)</th><th>Unrelated pictures, after</th></tr></thead>
          <tbody>{totals.map(([style, t]) => <tr key={style}><td>{style}</td><td>{t.slides}</td><td>{t.related}</td><td>{t.random}</td><td>{t.smart}</td></tr>)}</tbody>
        </table>
      )}
      {data?.testSkipped && <p className="small" role="note"><b>TEST version skipped:</b> {data.testSkipped.reason}</p>}

      {bursts.length > 0 && (
        <article className="res-source" aria-label="hot-flat starbursts, before and after">
          <h3 className="h3">hot-flat starbursts: before and after</h3>
          <p className="small">Before: the burst took the heavy dark accent. After: it takes the style's lime with a hard outline (on the lime slide, the slide's own colour with a black outline).</p>
          <div className="res-smart-pairs">
            {bursts.map(([k, g]) => {
              const before = g.get('before-starbursts');
              const after = g.get('smart');
              if (!before || !after) return null;
              return (
                <div key={k} className="res-smart-row">
                  <figure><Pic src={before.pngUrl} alt={`hot-flat ${before.scriptTitle} slide ${before.index}, before the starburst fix`} /><figcaption className="small">Before · {before.scriptTitle} · slide {before.index}</figcaption></figure>
                  <figure><Pic src={after.pngUrl} alt={`hot-flat ${after.scriptTitle} slide ${after.index}, after the starburst fix`} /><figcaption className="small">After</figcaption></figure>
                </div>
              );
            })}
          </div>
        </article>
      )}

      {cards.map(([k, g]) => {
        const any = [...g.values()][0];
        const smart = g.get('smart');
        const key = `smart-placement|${k}`;
        const base: RecordBase = { key, step: 'smart-placement', kind: 'smart-slide', image: `${any.style} / ${any.scriptTitle}`, option: `slide ${any.index} (${any.type}), tags ${(any.elementTags ?? []).join('+')}`, checker: smart ? { pass: smart.lint.every((l) => l.pass), failed: smart.lint.filter((l) => !l.pass).map((l) => ({ id: l.id, reason: l.reason })) } : undefined };
        return (
          <article key={k} className="res-source res-smart-card" aria-label={`${any.style}, ${any.scriptTitle}, slide ${any.index}`}>
            <h3 className="h3">{any.style} · {any.scriptTitle} · slide {any.index} ({any.type})</h3>
            <p className="small">Tags: {(any.elementTags ?? []).map((t) => <span key={t} className="chip chip-tag">{t}</span>)}</p>
            <div className="res-smart-row">
              {MODES.filter((m) => g.has(m.mode)).map((m) => {
                const s = g.get(m.mode)!;
                const failed = s.lint.filter((l) => !l.pass);
                return (
                  <figure key={m.mode} className={`res-smart-col res-smart-${m.mode}`}>
                    <figcaption className="small"><b>{m.title}</b></figcaption>
                    <Pic src={s.pngUrl} alt={`${s.style}, ${s.scriptTitle}, slide ${s.index}, ${m.title}`} />
                    <Elements s={s} />
                    {[...new Set(s.notes.filter((n) => /slide's tags|already used|test picture/.test(n)))].map((n) => <p key={n} className="small muted">{n}</p>)}
                    <CheckLine failed={failed.map((f) => ({ id: f.id, reason: f.reason }))} />
                  </figure>
                );
              })}
            </div>
            <VerdictBox label={`${any.style} ${any.scriptTitle} ${any.index}: is the new pick better than the old?`} options={VERDICT} rec={records[key]} onChange={(v, r) => setRecord(base, v, r)} />
          </article>
        );
      })}
    </Section>
  );
}
