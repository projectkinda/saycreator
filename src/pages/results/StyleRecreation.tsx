// Step 5, Phase 2: Style recreation. Every slide and quote card is its own card. The references are shown beside them for
// comparison; nothing here is one picture holding several slides.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { CheckLine, Pic, Section, VerdictBox, useResults, type RecordBase } from './common';

interface StyleJson {
  name: string;
  title: string;
  version: string;
  basedOn: { cluster: string; note: string };
  knownLintConflicts?: string[];
  notReproduced?: string[];
  layouts: Record<string, { use: string }[]>;
  assets: Record<string, string>;
}
interface Slide {
  style: string;
  script: string;
  scriptTitle: string;
  index: number;
  type: string;
  layout: string;
  rule: number;
  because: string;
  palette: string;
  notes: string[];
  pass: boolean;
  lint: { id: string; label: string; pass: boolean; reason: string }[];
  pngUrl: string;
  phoneUrl: string;
  planUrl: string;
}
interface Data {
  slides: Slide[];
  styles: StyleJson[];
  clusters: { images: Record<string, { format: string; description: string }>; clusters: { id: string; name: string; summary: string; images: string[] }[] } | null;
  lastRun: number;
  folder: string;
}

const REF = '/Reference%20carousels%20likes/';
const VERDICT = [
  { value: 'matches', label: 'matches' },
  { value: 'close', label: 'close' },
  { value: 'off', label: 'off' },
  { value: 'wrong', label: 'wrong' },
];

export default function StyleRecreation({ lastRun: _unused, refreshKey, onRefreshed }: { lastRun?: number; refreshKey: number; onRefreshed: () => void }) {
  const { records, setRecord } = useResults();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [cmp, setCmp] = useState<{ slide: Slide; refs: string[] } | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  void _unused;

  const refresh = useCallback(() => {
    setBusy(true);
    fetch('/__lab/recreation').then((r) => r.json()).then(setData).catch(() => setData(null)).finally(() => { setBusy(false); onRefreshed(); });
  }, [onRefreshed]);
  useEffect(refresh, [refresh, refreshKey]);
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (cmp && !d.open) d.showModal();
    if (!cmp && d.open) d.close();
  }, [cmp]);

  const byStyle = useMemo(() => {
    const m = new Map<string, Map<string, Slide[]>>();
    for (const s of data?.slides ?? []) {
      const sc = m.get(s.style) ?? new Map<string, Slide[]>();
      sc.set(s.script, [...(sc.get(s.script) ?? []), s].sort((a, b) => a.index - b.index));
      m.set(s.style, sc);
    }
    return m;
  }, [data]);

  const refsOf = (style: StyleJson) => {
    const cl = data?.clusters?.clusters.find((c) => c.id === style.basedOn.cluster);
    return { cluster: cl, files: cl?.images ?? [] };
  };

  return (
    <Section id="style-recreation" title="Step 5: Style recreation" lastRun={data?.lastRun ?? null} onRefresh={refresh} busy={busy} intro="Each learned style drawn with our own sample scripts. Every slide and every quote card is its own file, its own plan and its own phone-size check. Click a slide for full size. Compare puts the style's reference sheets beside the slide. The reference sheets are for comparison only.">
      {data === null && <p role="status">Loading…</p>}
      {data && data.slides.length === 0 && <p className="lab-err">No recreations found. Run <code>npm run test:image</code> first.</p>}
      {data?.styles.map((st) => {
        const decks = byStyle.get(st.name);
        if (!decks) return null;
        const { cluster, files } = refsOf(st);
        const all = [...decks.values()].flat();
        const passN = all.filter((s) => s.pass).length;
        return (
          <article key={st.name} className="res-source res-recreation" aria-label={`Style ${st.title}`}>
            <h3 className="h3">{st.title} <span className="small muted">style “{st.name}” v{st.version}</span></h3>
            <p className="small">{passN} of {all.length} slides pass the phone-size checks.</p>
            <div className="res-rec-grid">
              <aside className="res-rec-ref" aria-label="Spec summary and references">
                <h4>Spec summary</h4>
                <p className="small">{cluster?.summary}</p>
                <p className="small muted">{st.basedOn.note}</p>
                <h4>Reference sheets (comparison only)</h4>
                <div className="res-rec-refs">
                  {files.map((f, i) => (
                    <figure key={f} className="res-rec-refpic">
                      <Pic src={REF + encodeURIComponent(f)} alt={`Reference sheet ${i + 1}: ${data.clusters?.images[f]?.description ?? f}`} />
                    </figure>
                  ))}
                </div>
                {st.knownLintConflicts && st.knownLintConflicts.length > 0 && (
                  <>
                    <h4>Where this style breaks our rules</h4>
                    <ul className="res-missing">{st.knownLintConflicts.map((m) => <li key={m}>{m}</li>)}</ul>
                  </>
                )}
                {st.notReproduced && st.notReproduced.length > 0 && (
                  <>
                    <h4>Not reproduced</h4>
                    <ul className="res-missing">{st.notReproduced.map((m) => <li key={m}>{m}</li>)}</ul>
                  </>
                )}
              </aside>
              <div className="res-rec-slides">
                {[...decks.entries()].map(([script, list]) => (
                  <section key={script} className="res-rec-deck" aria-label={`${list[0].scriptTitle} in ${st.title}`}>
                    <h4>{list[0].scriptTitle}</h4>
                    <div className="res-rec-cards">
                      {list.map((s) => {
                        const failed = s.lint.filter((l) => !l.pass);
                        const key = `style-recreation|${st.name}|${script}|${s.index}`;
                        const base: RecordBase = { key, step: 'style-recreation', kind: 'style-slide', image: `${st.name} / ${s.scriptTitle}`, option: `${script === 'quote-cards' ? 'card' : 'slide'} ${s.index} (${s.type}, ${s.layout})`, checker: { pass: failed.length === 0, failed: failed.map((f) => ({ id: f.id, reason: f.reason })) } };
                        const rec = records[key];
                        const disagree = rec?.verdict && ((failed.length === 0 && rec.verdict === 'wrong') || (failed.length > 0 && rec.verdict === 'matches'));
                        return (
                          <div key={key} className={`res-rec-card${disagree ? ' disagree' : ''}`}>
                            <Pic src={s.pngUrl} alt={`${st.title}, ${script === 'quote-cards' ? 'quote card' : 'slide'} ${s.index}, ${s.type}`} />
                            <p className="small"><b>{script === 'quote-cards' ? 'Card' : 'Slide'} {s.index}</b> · {s.type}</p>
                            <p className="small muted res-rec-layout" title={s.because}>Layout: <b>{s.layout}</b> (rule {s.rule + 1}: {s.because}) · palette {s.palette}</p>
                            <CheckLine failed={failed} />
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setCmp({ slide: s, refs: files })}>
                              <Icon name="search" size={14} /> Compare
                            </button>
                            <VerdictBox label={`${st.title} ${script} ${s.index}`} options={VERDICT} rec={rec} onChange={(v, r) => setRecord(base, v, r)} />
                            {disagree && <p className="lab-disagree">You and the checker disagree here.</p>}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </article>
        );
      })}
      <dialog ref={dlg} className="res-viewer res-compare" onClose={() => setCmp(null)} aria-label="Compare with the reference">
        <button type="button" className="btn btn-dark btn-sm res-viewer-close" onClick={() => setCmp(null)}>
          <Icon name="close" size={16} /> Close
        </button>
        {cmp && (
          <div className="res-compare-body">
            <div className="res-compare-refs" aria-label="Reference sheets">
              <p className="small muted">Reference sheets of this style (comparison only)</p>
              {cmp.refs.map((f, i) => <img key={f} src={REF + encodeURIComponent(f)} alt={`Reference sheet ${i + 1}`} />)}
            </div>
            <div className="res-compare-ours">
              <p className="small muted">Our recreation: {cmp.slide.layout}</p>
              <img src={cmp.slide.pngUrl} alt={`Our ${cmp.slide.type} slide`} />
            </div>
          </div>
        )}
      </dialog>
    </Section>
  );
}
