// DEV-ONLY lab for judging the image engine by eye. Not part of the product. Route: /lab
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BgRemover,
  BgRemoverError,
  composeCutout,
  loadManifest,
  maskToPng,
  subjectStats,
  type LoadInfo,
  type MaskOptions,
  type ModelEntry,
  type ModelId,
  type SubjectStats,
} from '../image-engine';
import '../styles/lab.css';

type Verdict = 'good' | 'meh' | 'bad';
interface Record_ {
  key: string;
  kind: 'cutout' | 'thumbnail' | 'carousel';
  image: string;
  option: string;
  verdict: Verdict | null;
  reason: string;
  checker?: { pass: boolean; failed: { id: string; reason: string }[] };
  timings?: Record<string, number | string | boolean>;
  updatedAt: string;
}
interface State {
  records: Record<string, Record_>;
  picks: Record<string, string>;
}
const STORE = 'ie-lab-v1';
const load = (): State => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '') as State;
  } catch {
    return { records: {}, picks: {} };
  }
};

interface Pic { name: string; url: string; bytes: number }
interface Thumb {
  image: string;
  aspect: string;
  layout: string;
  title: string;
  pngUrl: string;
  phoneUrl: string;
  notes: string[];
  lint: { id: string; label: string; pass: boolean; reason: string }[];
}
interface CarouselSlide {
  script: string;
  scriptTitle?: string;
  theme: string;
  index: number;
  type: string;
  notes?: string[];
  lint: { id: string; label: string; pass: boolean; reason: string }[];
  variant?: string;
  pngUrl: string;
}
interface CutResult {
  cutout: string;
  mask: string;
  ms: { pre: number; infer: number; post: number; total: number };
  backend: string;
  warm: boolean;
  size: string;
  stats: SubjectStats;
}
interface ModelRun {
  status: 'idle' | 'loading' | 'running' | 'done' | 'failed';
  progress?: string;
  load?: LoadInfo;
  error?: { code: string; message: string };
  results: Record<string, CutResult | { error: string }>;
}

const BACKGROUNDS: [string, string][] = [['checker', 'bg-checker'], ['dark', 'bg-dark'], ['light', 'bg-light'], ['colour', 'bg-colour']];
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);

function VerdictBox({ rec, onChange, label }: { rec: Record_ | undefined; onChange: (v: Verdict | null, reason: string) => void; label: string }) {
  const v = rec?.verdict ?? null;
  return (
    <div className="lab-verdict" role="group" aria-label={`Verdict for ${label}`}>
      {(['good', 'meh', 'bad'] as const).map((x) => (
        <button key={x} type="button" className={`v-${x}`} aria-pressed={v === x} onClick={() => onChange(v === x ? null : x, rec?.reason ?? '')}>
          {x}
        </button>
      ))}
      <input
        type="text"
        aria-label={`One-line reason for ${label}`}
        placeholder="why? (one line)"
        value={rec?.reason ?? ''}
        onChange={(e) => onChange(v, e.target.value)}
      />
    </div>
  );
}

export default function Lab() {
  const [pics, setPics] = useState<Pic[]>([]);
  const [thumbs, setThumbs] = useState<Thumb[] | null>(null);
  const [slides, setSlides] = useState<CarouselSlide[] | null>(null);
  const [models, setModels] = useState<ModelEntry[] | null>(null);
  const [modelError, setModelError] = useState('');
  const [state, setState] = useState<State>(load);
  const [saved, setSaved] = useState('');
  const [machine, setMachine] = useState<Record<string, string | boolean | number>>({});
  const [runs, setRuns] = useState<Record<string, ModelRun>>({});
  const [backend, setBackend] = useState<'auto' | 'webgpu' | 'wasm'>('auto');
  const [maxSide, setMaxSide] = useState(2048);
  const [opts, setOpts] = useState<MaskOptions>({});
  const [showSelftest, setShowSelftest] = useState(false);
  const removers = useRef<Partial<Record<ModelId, BgRemover>>>({});

  useEffect(() => {
    document.title = 'Lab (dev only)';
    fetch('/__lab/images').then((r) => r.json()).then(setPics).catch(() => setPics([]));
    fetch('/__lab/carousels').then((r) => r.json()).then(setSlides).catch(() => setSlides([]));
    fetch('/__lab/thumbnails').then((r) => r.json()).then(setThumbs).catch(() => setThumbs([]));
    loadManifest().then(setModels).catch((e: BgRemoverError) => setModelError(e.message));
    (async () => {
      const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<{ info?: Record<string, string> } | null> } }).gpu;
      const a = gpu ? await gpu.requestAdapter().catch(() => null) : null;
      setMachine({ webgpu: !!a, gpu: a?.info?.vendor ? `${a.info.vendor} ${a.info.architecture ?? ''}` : 'none', isolated: crossOriginIsolated, cores: navigator.hardwareConcurrency });
    })();
  }, []);

  // Autosave every change.
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
      setSaved(`Saved in this browser at ${new Date().toLocaleTimeString()}`);
    } catch {
      setSaved('Could not save in this browser. Export your verdicts now.');
    }
  }, [state]);

  const setRecord = useCallback((base: Omit<Record_, 'verdict' | 'reason' | 'updatedAt'>, verdict: Verdict | null, reason: string) => {
    setState((s) => ({ ...s, records: { ...s.records, [base.key]: { ...base, verdict, reason, updatedAt: new Date().toISOString() } } }));
  }, []);

  const runModel = async (m: ModelEntry) => {
    const id = m.id;
    const patch = (p: Partial<ModelRun>) => setRuns((r) => ({ ...r, [id]: { ...(r[id] ?? { results: {}, status: 'idle' }), ...p } }));
    removers.current[id]?.dispose();
    patch({ status: 'loading', progress: 'Starting…', error: undefined, results: {}, load: undefined });
    const rm = new BgRemover({ model: id, backend, maxSide, wasmFallback: 'allow' });
    removers.current[id] = rm;
    try {
      const info = await rm.load((p) => patch({ progress: p.phase === 'download' ? `Downloading ${mb(p.loaded)} of ${mb(p.total)}` : p.phase === 'cache' ? 'Reading from this browser’s cache' : p.phase === 'init' ? 'Starting the model (the first run compiles for the GPU)…' : 'Reading the model list…' }));
      patch({ status: 'running', load: info, progress: undefined });
    } catch (e) {
      const err = e instanceof BgRemoverError ? e : new BgRemoverError('inference-failed', String(e));
      patch({ status: 'failed', error: { code: err.code, message: err.message }, progress: undefined });
      return;
    }
    const results: ModelRun['results'] = {};
    for (const p of pics) {
      patch({ progress: `Cutting out ${p.name} (${Object.keys(results).length + 1} of ${pics.length})`, results: { ...results } });
      try {
        const blob = await (await fetch(p.url)).blob();
        const r = await rm.remove(blob);
        const hasOpts = !!(opts.featherPx || opts.fillHolesMaxShare || opts.decontaminatePx);
        const composed = hasOpts ? await composeCutout(blob, r.mask, opts) : null;
        const alpha = composed?.alpha ?? r.mask;
        results[p.name] = {
          cutout: URL.createObjectURL(composed?.png ?? r.cutout),
          mask: URL.createObjectURL(await maskToPng(alpha)),
          ms: { pre: r.timings.preprocessMs, infer: r.timings.inferenceMs, post: r.timings.postprocessMs, total: r.timings.totalMs },
          backend: r.backend,
          warm: r.warm,
          size: `${r.width}x${r.height}`,
          stats: subjectStats(alpha),
        };
      } catch (e) {
        results[p.name] = { error: e instanceof BgRemoverError ? e.message : String(e) };
      }
    }
    patch({ status: 'done', progress: undefined, results });
  };

  const visibleModels = useMemo(() => (models ?? []).filter((m) => showSelftest || !m.testOnly), [models, showSelftest]);
  const realRan = visibleModels.filter((m) => !m.testOnly && runs[m.id]?.status === 'done');

  const exportJson = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      machine,
      settings: { backend, maxSide, maskOptions: opts },
      models: (models ?? []).map((m) => ({ id: m.id, status: m.status, licence: m.licence, load: runs[m.id]?.load, error: runs[m.id]?.error })),
      picks: state.picks,
      verdicts: Object.values(state.records).filter((r) => r.verdict || r.reason),
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `lab-verdicts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const count = Object.values(state.records).filter((r) => r.verdict).length;
  const badSlides = useMemo(() => (slides ?? []).filter((s) => s.theme === 'bad'), [slides]);
  const carouselGroups = useMemo(() => {
    const m = new Map<string, Map<string, CarouselSlide[]>>();
    for (const s of (slides ?? []).filter((x) => x.theme !== 'bad')) {
      const t = m.get(s.script) ?? new Map<string, CarouselSlide[]>();
      t.set(s.theme, [...(t.get(s.theme) ?? []), s].sort((a, b) => a.index - b.index));
      m.set(s.script, t);
    }
    return [...m.entries()].map(([k, t]) => [k, [...t.entries()]] as const);
  }, [slides]);
  const groups = useMemo(() => {
    const m = new Map<string, Thumb[]>();
    for (const t of thumbs ?? []) m.set(`${t.image}|${t.aspect}`, [...(m.get(`${t.image}|${t.aspect}`) ?? []), t]);
    return [...m.entries()];
  }, [thumbs]);

  return (
    <div className="lab">
      <header className="lab-head">
        <h1>Lab <span className="lab-tag">dev only, for judging by eye</span></h1>
        <div className="lab-actions">
          <span className="lab-saved" role="status">{count} verdicts. {saved}</span>
          <button type="button" className="lab-btn lab-primary" onClick={exportJson}>Export verdicts JSON</button>
          <button
            type="button"
            className="lab-btn"
            onClick={() => window.confirm('Delete every verdict and pick saved in this browser?') && setState({ records: {}, picks: {} })}
          >
            Clear all
          </button>
        </div>
      </header>

      <section className="lab-box" aria-label="This machine">
        <h2>This machine</h2>
        <p>
          WebGPU: <b>{machine.webgpu ? 'yes' : 'no'}</b> ({String(machine.gpu ?? '')}) · cross-origin isolated (threaded WASM): <b>{machine.isolated ? 'yes' : 'no'}</b> · {String(machine.cores ?? '')} cores
        </p>
      </section>

      <section className="lab-box" aria-label="Models">
        <h2>1. Cutouts: run a model on every picture in test-images/</h2>
        <div className="lab-row">
          <label>Backend <select value={backend} onChange={(e) => setBackend(e.target.value as typeof backend)}><option value="auto">auto (WebGPU, else WASM)</option><option value="webgpu">WebGPU only</option><option value="wasm">WASM only</option></select></label>
          <label>Work at up to <select value={maxSide} onChange={(e) => setMaxSide(Number(e.target.value))}><option value={1024}>1024 px</option><option value={2048}>2048 px</option><option value={3072}>3072 px</option></select></label>
          <label><input type="checkbox" checked={!!opts.featherPx} onChange={(e) => setOpts({ ...opts, featherPx: e.target.checked ? 4 : 0 })} /> feather edges 4 px</label>
          <label><input type="checkbox" checked={!!opts.fillHolesMaxShare} onChange={(e) => setOpts({ ...opts, fillHolesMaxShare: e.target.checked ? 0.005 : 0 })} /> fill small holes</label>
          <label><input type="checkbox" checked={!!opts.decontaminatePx} onChange={(e) => setOpts({ ...opts, decontaminatePx: e.target.checked ? 4 : 0 })} /> decontaminate edges</label>
          <label><input type="checkbox" checked={showSelftest} onChange={(e) => setShowSelftest(e.target.checked)} /> show the pipeline self-test (not a real remover)</label>
        </div>
        {modelError && <p className="lab-err" role="alert">{modelError}</p>}
        <div className="lab-models">
          {visibleModels.map((m) => {
            const run = runs[m.id];
            const blocked = m.status !== 'approved';
            return (
              <div key={m.id} className={`lab-model${m.testOnly ? ' is-test' : ''}`}>
                <h3>{m.label}</h3>
                <p className="lab-dim">Licence: {m.licence}{m.bytes ? ` · ${mb(m.bytes)}` : ''}</p>
                {blocked ? (
                  <p className="lab-err">Blocked. {m.blockedBecause}</p>
                ) : (
                  <button type="button" className="lab-btn lab-primary" disabled={run?.status === 'loading' || run?.status === 'running' || pics.length === 0} onClick={() => runModel(m)}>
                    {run?.status === 'done' || run?.status === 'failed' ? 'Run again' : 'Load and run on all pictures'}
                  </button>
                )}
                {run?.progress && <p role="status">{run.progress}</p>}
                {run?.load && (
                  <p className="lab-dim">
                    Backend <b>{run.load.backend}</b>{run.load.fallbackReason ? ` (fallback: ${run.load.fallbackReason})` : ''} · downloaded {mb(run.load.downloadBytes)}{run.load.fromCache ? ' (from cache)' : ''} · fetch {ms(run.load.timings.fetchMs)}, start {ms(run.load.timings.initMs)}
                  </p>
                )}
                {run?.error && <p className="lab-err" role="alert"><b>Cannot run: {run.error.code}.</b> {run.error.message}</p>}
              </div>
            );
          })}
        </div>
        {realRan.length === 0 && <p className="lab-dim">No real model has produced cutouts yet in this session.</p>}
      </section>

      {pics.map((p) => (
        <section key={p.name} className="lab-box" aria-label={`Cutouts for ${p.name}`}>
          <h3>{p.name} <span className="lab-dim">{mb(p.bytes)}</span></h3>
          <div className="lab-cut">
            <img className="lab-orig" src={p.url} alt={`Original ${p.name}`} loading="lazy" />
            <div className="lab-cut-rows">
              {visibleModels.map((m) => {
                const res = runs[m.id]?.results[p.name];
                if (!res) return <p key={m.id} className="lab-dim">{m.label}: {m.status !== 'approved' ? 'blocked' : 'not run yet'}</p>;
                if ('error' in res) return <p key={m.id} className="lab-err">{m.label}: {res.error}</p>;
                const key = `cutout|${p.name}|${m.id}`;
                const base = {
                  key,
                  kind: 'cutout' as const,
                  image: p.name,
                  option: m.id,
                  timings: { backend: res.backend, warm: res.warm, size: res.size, preprocessMs: res.ms.pre, inferenceMs: res.ms.infer, postprocessMs: res.ms.post, totalMs: res.ms.total, subjectShare: res.stats.areaFraction, download: runs[m.id]?.load ? mb(runs[m.id]!.load!.downloadBytes) : '' },
                };
                return (
                  <div key={m.id} className="lab-cut-row">
                    <div className="lab-tiles">
                      {BACKGROUNDS.map(([name, cls]) => (
                        <div key={name} className={`lab-tile ${cls}`}><img src={res.cutout} alt={`${m.label} cutout of ${p.name} on ${name}`} /><span>{name}</span></div>
                      ))}
                      <div className="lab-tile bg-dark"><img src={res.mask} alt="mask" /><span>mask</span></div>
                    </div>
                    <p className="lab-dim">
                      {m.label}{m.testOnly ? ' (TEST ONLY)' : ''} · {res.backend}{res.warm ? '' : ' (first run, includes shader compile)'} · inference {ms(res.ms.infer)}, total {ms(res.ms.total)} · {res.size} · subject {(res.stats.areaFraction * 100).toFixed(1)}%
                      {res.stats.bboxNorm ? ` · box ${Math.round(res.stats.bboxNorm.x * 100)},${Math.round(res.stats.bboxNorm.y * 100)} ${Math.round(res.stats.bboxNorm.width * 100)}x${Math.round(res.stats.bboxNorm.height * 100)}%` : ''}
                    </p>
                    <VerdictBox label={`${m.label} on ${p.name}`} rec={state.records[key]} onChange={(v, r) => setRecord(base, v, r)} />
                  </div>
                );
              })}
              <fieldset className="lab-pick">
                <legend>Pick best</legend>
                {[...realRan.map((m) => [m.id, m.label] as const), ['none', 'none of them'] as const].map(([id, label]) => (
                  <label key={id}>
                    <input type="radio" name={`best-${p.name}`} checked={state.picks[p.name] === id} onChange={() => setState((s) => ({ ...s, picks: { ...s.picks, [p.name]: id } }))} /> {label}
                  </label>
                ))}
                {realRan.length === 0 && <span className="lab-dim"> (appears once a real model has run)</span>}
              </fieldset>
            </div>
          </div>
        </section>
      ))}

      <section className="lab-box" aria-label="Thumbnails from Step 2">
        <h2>2. Thumbnails from Step 2 (out/image-engine/step2)</h2>
        <p className="lab-dim">The checker's PASS or FAIL is shown beside each option so you can see where your verdict and the checker disagree.</p>
        {thumbs === null && <p role="status">Loading…</p>}
        {thumbs?.length === 0 && <p className="lab-err">No Step 2 outputs found. Run <code>npm run test:image</code> first.</p>}
        {groups.map(([k, list]) => (
          <div key={k} className="lab-thumb-group">
            <h3>{list[0].image} <span className="lab-dim">{list[0].aspect}, title “{list[0].title}”</span></h3>
            <div className="lab-thumbs">
              {list.map((t) => {
                const failed = t.lint.filter((l) => !l.pass);
                const key = `thumbnail|${t.image}|${t.aspect}|${t.layout}`;
                const base = { key, kind: 'thumbnail' as const, image: t.image, option: `${t.aspect} ${t.layout}`, checker: { pass: failed.length === 0, failed: failed.map((f) => ({ id: f.id, reason: f.reason })) } };
                const rec = state.records[key];
                const disagree = rec?.verdict && ((failed.length === 0 && rec.verdict === 'bad') || (failed.length > 0 && rec.verdict === 'good'));
                return (
                  <div key={key} className={`lab-thumb${disagree ? ' disagree' : ''}`}>
                    <img src={t.pngUrl} alt={`${t.layout} option for ${t.image}`} loading="lazy" />
                    <p><b>{t.layout}</b> <span className={failed.length ? 'chk-fail' : 'chk-pass'}>{failed.length ? `checker: FAIL (${failed.length})` : 'checker: PASS'}</span></p>
                    {failed.length > 0 && <ul className="lab-fails">{failed.map((f) => <li key={f.id}>{f.reason}</li>)}</ul>}
                    <VerdictBox label={`${t.layout} for ${t.image}`} rec={rec} onChange={(v, r) => setRecord(base, v, r)} />
                    {disagree && <p className="lab-disagree">You and the checker disagree here.</p>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="lab-box" aria-label="Step 3: Carousels">
        <h2>3. Step 3: Carousels (out/image-engine/step3)</h2>
        <p className="lab-dim">Each script is drawn in three themes from the same words. The checker's PASS or FAIL is on every slide; give your own verdict under it. The last group is broken on purpose, one check each.</p>
        {slides === null && <p role="status">Loading…</p>}
        {slides?.length === 0 && <p className="lab-err">No Step 3 outputs found. Run <code>npm run test:image</code> first.</p>}
        {carouselGroups.map(([script, themes]) => (
          <div key={script} className="lab-thumb-group">
            <h3>{themes[0][1][0].scriptTitle ?? script}</h3>
            {themes.map(([theme, list]) => (
              <div key={theme} className="lab-car-row">
                <h4>{theme}{list.every((s) => s.lint.every((x) => x.pass)) ? ' · all 7 pass' : ' · ' + list.filter((s) => s.lint.some((x) => !x.pass)).length + ' slide(s) fail'}</h4>
                <div className="lab-slides">
                  {list.map((s) => {
                    const failed = s.lint.filter((x) => !x.pass);
                    const key = 'carousel|' + script + '|' + theme + '|' + s.index;
                    const base = { key, kind: 'carousel' as const, image: s.scriptTitle ?? script, option: theme + ' slide ' + s.index + ' (' + s.type + ')', checker: { pass: failed.length === 0, failed: failed.map((f) => ({ id: f.id, reason: f.reason })) } };
                    const rec = state.records[key];
                    const disagree = rec?.verdict && ((failed.length === 0 && rec.verdict === 'bad') || (failed.length > 0 && rec.verdict === 'good'));
                    return (
                      <div key={key} className={'lab-slide' + (disagree ? ' disagree' : '')}>
                        <img src={s.pngUrl} alt={theme + ' slide ' + s.index + ', ' + s.type + ', of ' + (s.scriptTitle ?? script)} loading="lazy" />
                        <p><b>{s.index}. {s.type}</b> <span className={failed.length ? 'chk-fail' : 'chk-pass'}>{failed.length ? 'FAIL (' + failed.length + ')' : 'PASS'}</span></p>
                        {failed.length > 0 && <ul className="lab-fails">{failed.map((f) => <li key={f.id}>{f.reason}</li>)}</ul>}
                        <VerdictBox label={theme + ' slide ' + s.index + ' of ' + (s.scriptTitle ?? script)} rec={rec} onChange={(vv, r) => setRecord(base, vv, r)} />
                        {disagree && <p className="lab-disagree">You and the checker disagree here.</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
        {badSlides.length > 0 && (
          <div className="lab-thumb-group">
            <h3>Broken on purpose (one check each)</h3>
            <div className="lab-slides">
              {badSlides.map((s) => {
                const failed = s.lint.filter((x) => !x.pass);
                return (
                  <div key={s.variant} className="lab-slide">
                    <img src={s.pngUrl} alt={'Broken on purpose: ' + s.variant} loading="lazy" />
                    <p><b>{s.variant}</b> <span className="chk-fail">FAIL ({failed.length})</span></p>
                    <ul className="lab-fails">{failed.map((f) => <li key={f.id}>{f.reason}</li>)}</ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
