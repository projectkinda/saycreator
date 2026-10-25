// Step 6: Asset library. The elements the engine can place (tags, licence, recolour preview), then the element-rich styles
// recreated with them: SHIPPABLE (our library only) and TEST ASSETS (private, not shippable). Every slide is its own card.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { getElementSvg, listElements, listPacks, type ElementInfo } from '../../image-engine/assets/library';
import { recolourSvg, shade } from '../../image-engine/assets/svg-prepare';
import { CheckLine, Pic, Section, VerdictBox, useResults, type RecordBase } from './common';

interface Slide {
  style: string;
  script: string;
  scriptTitle: string;
  index: number;
  type: string;
  layout: string;
  palette: string;
  assetMode: 'shippable' | 'test';
  label: string;
  elementsUsed: string[];
  notes: string[];
  pass: boolean;
  lint: { id: string; label?: string; pass: boolean; reason: string }[];
  pngUrl: string;
  phoneUrl: string;
}
interface StyleJson {
  name: string;
  title: string;
  basedOn: { cluster: string; note: string };
  elements?: { density: { min: number; max: number } };
}
interface Data {
  slides: Slide[];
  styles: StyleJson[];
  testSkipped: { skipped: boolean; reason: string } | null;
  clusters: { clusters: { id: string; summary: string; images: string[] }[] } | null;
  lastRun: number;
}

const REF = '/Reference%20carousels%20likes/';
const VERDICT = ['matches', 'close', 'off', 'wrong'].map((v) => ({ value: v, label: v }));
const PALETTES: { name: string; dark: boolean; colours: Record<string, string> }[] = [
  { name: 'warm', dark: false, colours: { accent: '#ff5a36', text: '#1c1b17', muted: '#6b6a60', surface: '#f1ead2', line: '#1c1b17', marker: '#ffd84a' } },
  { name: 'cool', dark: false, colours: { accent: '#2f6bff', text: '#0e1a33', muted: '#5a6b8f', surface: '#dfe8ff', line: '#0e1a33', marker: '#8fe3ff' } },
  { name: 'neon', dark: true, colours: { accent: '#3fe0a0', text: '#e8fff6', muted: '#8fb3a5', surface: '#13261f', line: '#e8fff6', marker: '#c5ff3f' } },
];
const resolve = (pal: Record<string, string>, token: string) => {
  const [role, variant] = token.split('-');
  const base = pal[role] ?? '#888888';
  return variant === 'dark' ? shade(base, -0.28) : variant === 'light' ? shade(base, 0.38) : base;
};
const dataUri = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

function recoloured(el: ElementInfo, svg: string, pal: Record<string, string>): string {
  const colors = Object.fromEntries(Object.entries(el.recolour).map(([src, token]) => [src, resolve(pal, token)]));
  const mono = el.kind === 'icon' && Object.keys(colors).length === 0;
  return recolourSvg(svg, colors, mono ? pal.accent : undefined);
}

function Swatches({ el }: { el: ElementInfo }) {
  const [svg, setSvg] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let on = true;
    getElementSvg(el.id).then((s) => on && setSvg(s));
    return () => {
      on = false;
    };
  }, [el.id]);
  if (svg === undefined) return <div className="res-el-previews small muted">…</div>;
  if (svg === null) return <div className="res-el-previews small lab-err">Missing</div>;
  return (
    <div className="res-el-previews">
      {PALETTES.map((p) => (
        <span key={p.name} className="res-el-swatch" style={{ background: p.dark ? '#0d1713' : '#fffdf6' }}>
          <img src={dataUri(recoloured(el, svg, p.colours))} alt={`${el.name} recoloured ${p.name}`} width={52} height={52} />
        </span>
      ))}
    </div>
  );
}

function Library() {
  const packs = useMemo(() => listPacks(), []);
  const all = useMemo(() => listElements(), []);
  const [pack, setPack] = useState('code');
  const [tag, setTag] = useState('');
  const [limit, setLimit] = useState(36);
  const inPack = useMemo(() => all.filter((e) => e.pack === pack), [all, pack]);
  const tags = useMemo(() => {
    const n = new Map<string, number>();
    for (const e of inPack) for (const t of e.tags) n.set(t, (n.get(t) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  }, [inPack]);
  const shown = inPack.filter((e) => !tag || e.tags.includes(tag));
  const info = packs.find((p) => p.id === pack);
  return (
    <div className="res-source" aria-label="Element library">
      <h3 className="h3">
        Element library <span className="small muted">{all.length} elements, {packs.length} packs</span>
      </h3>
      <div className="res-el-packs" role="group" aria-label="Packs">
        {packs.map((p) => (
          <button key={p.id} type="button" className={`chip chip-tag${p.id === pack ? ' active' : ''}`} aria-pressed={p.id === pack} onClick={() => { setPack(p.id); setTag(''); setLimit(36); }}>
            {p.label} ({p.count})
          </button>
        ))}
      </div>
      {info && (
        <p className="small">
          Licence: <b>{info.licence}</b> · version {info.version} · attribution: {info.attribution} · <span className="muted">{info.source}</span>
        </p>
      )}
      <div className="res-el-packs" role="group" aria-label="Tags">
        <button type="button" className={`chip chip-tag${tag === '' ? ' active' : ''}`} aria-pressed={tag === ''} onClick={() => setTag('')}>all tags</button>
        {tags.map(([t, n]) => (
          <button key={t} type="button" className={`chip chip-tag${t === tag ? ' active' : ''}`} aria-pressed={t === tag} onClick={() => { setTag(t); setLimit(36); }}>
            {t} ({n})
          </button>
        ))}
      </div>
      {inPack.length === 0 && <p className="lab-err">This pack is not fetched. Run <code>npm run fetch:assets</code>.</p>}
      <div className="res-el-grid">
        {shown.slice(0, limit).map((e) => (
          <figure key={e.id} className="res-el-card">
            <Swatches el={e} />
            <figcaption className="small">
              <b>{e.name}</b><br />
              <span className="muted">{e.id}</span><br />
              {e.tags.slice(0, 6).join(', ')}<br />
              <span className="muted">{info?.licence.split(' (')[0]}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      {shown.length > limit && (
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setLimit((l) => l + 72)}>Show more ({shown.length - limit} left)</button>
      )}
    </div>
  );
}

export default function AssetLibrary({ refreshKey, onRefreshed }: { refreshKey: number; onRefreshed: () => void }) {
  const { records, setRecord } = useResults();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [cmp, setCmp] = useState<{ slide: Slide; refs: string[] } | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const refresh = useCallback(() => {
    setBusy(true);
    fetch('/__lab/assets').then((r) => r.json()).then(setData).catch(() => setData(null)).finally(() => { setBusy(false); onRefreshed(); });
  }, [onRefreshed]);
  useEffect(refresh, [refresh, refreshKey]);
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (cmp && !d.open) d.showModal();
    if (!cmp && d.open) d.close();
  }, [cmp]);

  const groups = useMemo(() => {
    const m = new Map<string, Map<string, Slide[]>>();
    for (const s of data?.slides ?? []) {
      const k = `${s.style}|${s.assetMode}`;
      const sc = m.get(k) ?? new Map<string, Slide[]>();
      sc.set(s.script, [...(sc.get(s.script) ?? []), s].sort((a, b) => a.index - b.index));
      m.set(k, sc);
    }
    return m;
  }, [data]);

  return (
    <Section id="asset-library" title="Step 6: Asset library" lastRun={data?.lastRun ?? null} onRefresh={refresh} busy={busy} intro="The elements the engine can place and recolour, then the element-rich styles recreated with them. SHIPPABLE slides use only our library (permissive packs and shapes drawn in code). TEST ASSETS slides use your private test pictures and are not shippable. Every slide is its own file.">
      <Library />
      {data === null && <p role="status">Loading…</p>}
      {data?.testSkipped && (
        <p className="small" role="note"><b>TEST version skipped:</b> {data.testSkipped.reason}</p>
      )}
      {data && data.slides.length === 0 && <p className="lab-err">No recreations found. Run <code>npm run test:image</code> first.</p>}
      {data?.styles.flatMap((st) =>
        (['shippable', 'test'] as const).map((mode) => {
          const decks = groups.get(`${st.name}|${mode}`);
          if (!decks) return null;
          const files = data.clusters?.clusters.find((c) => c.id === st.basedOn.cluster)?.images ?? [];
          const all = [...decks.values()].flat();
          const label = mode === 'shippable' ? 'SHIPPABLE' : 'TEST ASSETS: not shippable';
          return (
            <article key={`${st.name}-${mode}`} className={`res-source res-recreation res-mode-${mode}`} aria-label={`${st.title}, ${label}`}>
              <h3 className="h3">
                {st.title} <span className={`chip ${mode === 'test' ? 'chip-warn' : 'chip-tag'} res-mode-label`}>{label}</span>
              </h3>
              <p className="small">
                {all.filter((s) => s.pass).length} of {all.length} slides pass the phone-size checks. Elements per slide: {(all.reduce((n, s) => n + s.elementsUsed.length, 0) / all.length).toFixed(1)} on average.
              </p>
              <div className="res-rec-grid">
                <aside className="res-rec-ref" aria-label="References">
                  <h4>Reference sheets (comparison only)</h4>
                  <div className="res-rec-refs">
                    {files.map((f, i) => (
                      <figure key={f} className="res-rec-refpic"><Pic src={REF + encodeURIComponent(f)} alt={`Reference sheet ${i + 1}`} /></figure>
                    ))}
                  </div>
                </aside>
                <div className="res-rec-slides">
                  {[...decks.entries()].map(([script, list]) => (
                    <section key={script} className="res-rec-deck" aria-label={`${list[0].scriptTitle}, ${st.title}, ${label}`}>
                      <h4>{list[0].scriptTitle}</h4>
                      <div className="res-rec-cards">
                        {list.map((s) => {
                          const failed = s.lint.filter((l) => !l.pass);
                          const key = `asset-library|${st.name}|${mode}|${script}|${s.index}`;
                          const base: RecordBase = { key, step: 'asset-library', kind: `asset-slide-${mode}`, image: `${st.name} / ${s.scriptTitle} / ${label}`, option: `slide ${s.index} (${s.type}, ${s.layout})`, checker: { pass: failed.length === 0, failed: failed.map((f) => ({ id: f.id, reason: f.reason })) } };
                          return (
                            <div key={key} className="res-rec-card">
                              <span className={`chip ${mode === 'test' ? 'chip-warn' : 'chip-tag'} res-mode-label`}>{label}</span>
                              <Pic src={s.pngUrl} alt={`${st.title}, ${label}, slide ${s.index}, ${s.type}`} />
                              <p className="small"><b>Slide {s.index}</b> · {s.type} · palette {s.palette}</p>
                              <p className="small muted">Elements: {s.elementsUsed.length ? s.elementsUsed.join(', ') : 'none placed'}</p>
                              {s.notes.length > 0 && <p className="small muted">{s.notes.join(' ')}</p>}
                              <CheckLine failed={failed} />
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => setCmp({ slide: s, refs: files })}>
                                <Icon name="search" size={14} /> Compare
                              </button>
                              <VerdictBox label={`${st.title} ${mode} ${script} ${s.index}`} options={VERDICT} rec={records[key]} onChange={(v, r) => setRecord(base, v, r)} />
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
        }),
      )}
      <dialog ref={dlg} className="res-viewer res-compare" onClose={() => setCmp(null)} aria-label="Compare with the reference">
        <button type="button" className="btn btn-dark btn-sm res-viewer-close" onClick={() => setCmp(null)}>
          <Icon name="close" size={16} /> Close
        </button>
        {cmp && (
          <div className="res-compare-body">
            <div className="res-compare-refs" aria-label="Reference sheets">
              <p className="small muted">Reference sheets (comparison only)</p>
              {cmp.refs.map((f, i) => <img key={f} src={REF + encodeURIComponent(f)} alt={`Reference sheet ${i + 1}`} />)}
            </div>
            <div className="res-compare-ours">
              <p className="small muted">{cmp.slide.label}</p>
              <img src={cmp.slide.pngUrl} alt={`Our ${cmp.slide.type} slide, ${cmp.slide.label}`} />
            </div>
          </div>
        )}
      </dialog>
    </Section>
  );
}
