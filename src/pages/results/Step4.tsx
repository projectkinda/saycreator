// Step 4: cutouts. Per picture: the original and each cutout on checker, dark, light and coloured backgrounds.
// Toy results are labelled "TOY: plumbing test only", real model results "REAL". Failures are shown, never hidden.
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
} from '../../image-engine';
import { Pic, Section, VerdictBox, mb, msText, slug, useResults, type RecordBase } from './common';
import type { Upload } from './Step2';

interface Img {
  name: string;
  url: string;
  bytes: number;
  uploaded?: boolean;
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
interface Report {
  machine?: Record<string, string | boolean | number>;
  selftest?: { loads: Record<string, { backend: string; downloadBytes: number; fromCache: boolean; timings: { totalMs: number } }>; images: { image: string; width: number; height: number; scale: number; areaFraction: number; webgpuMs: number; wasmMs: number }[] };
  birefnet?: { ok: boolean; ms: number; error?: { code: string; message: string }; info?: { backend: string } };
  isnet?: { code: string; message: string };
}

const BACKGROUNDS: [string, string][] = [['checker', 'bg-checker'], ['dark', 'bg-dark'], ['light', 'bg-light'], ['colour', 'bg-colour']];
export const TOY = 'TOY: plumbing test only';
export const REAL = 'REAL';

function Tiles({ cutout, mask, alt }: { cutout: string; mask: string; alt: string }) {
  return (
    <div className="lab-tiles">
      {BACKGROUNDS.map(([name, cls]) => (
        <div key={name} className={`lab-tile ${cls}`}>
          <Pic src={cutout} alt={`${alt} on ${name}`} />
          <span>{name}</span>
        </div>
      ))}
      <div className="lab-tile bg-dark">
        <Pic src={mask} alt={`${alt}, mask`} />
        <span>mask</span>
      </div>
    </div>
  );
}

export default function Step4({ lastRun, refreshKey, onRefreshed, uploads }: { lastRun: number; refreshKey: number; onRefreshed: () => void; uploads: Upload[] }) {
  const { records, setRecord, addExport } = useResults();
  const [stored, setStored] = useState<{ report: Report | null; cutouts: { backend: string; slug: string }[] } | null>(null);
  const [testPics, setTestPics] = useState<Img[]>([]);
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<ModelEntry[] | null>(null);
  const [modelError, setModelError] = useState('');
  const [machine, setMachine] = useState<Record<string, string | boolean | number>>({});
  const [runs, setRuns] = useState<Record<string, ModelRun>>({});
  const [backend, setBackend] = useState<'auto' | 'webgpu' | 'wasm'>('auto');
  const [maxSide, setMaxSide] = useState(2048);
  const [opts, setOpts] = useState<MaskOptions>({});
  const removers = useRef<Partial<Record<ModelId, BgRemover>>>({});

  const refresh = useCallback(() => {
    setBusy(true);
    Promise.all([
      fetch('/__lab/step4').then((r) => r.json()).then(setStored).catch(() => setStored({ report: null, cutouts: [] })),
      fetch('/__lab/images').then((r) => r.json()).then(setTestPics).catch(() => setTestPics([])),
    ]).finally(() => { setBusy(false); onRefreshed(); });
  }, [onRefreshed]);
  useEffect(refresh, [refresh, refreshKey]);

  useEffect(() => {
    loadManifest().then(setModels).catch((e: BgRemoverError) => setModelError(e.message));
    (async () => {
      const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<{ info?: Record<string, string> } | null> } }).gpu;
      const a = gpu ? await gpu.requestAdapter().catch(() => null) : null;
      setMachine({ webgpu: !!a, gpu: a?.info?.vendor ? `${a.info.vendor} ${a.info.architecture ?? ''}` : 'none', isolated: crossOriginIsolated, cores: navigator.hardwareConcurrency });
    })();
  }, []);

  const pics: Img[] = useMemo(() => [...testPics, ...uploads.map((u) => ({ ...u, uploaded: true }))], [testPics, uploads]);

  useEffect(() => {
    addExport('cutouts', { machine, settings: { backend, maxSide, maskOptions: opts }, models: (models ?? []).map((m) => ({ id: m.id, status: m.status, licence: m.licence, load: runs[m.id]?.load, error: runs[m.id]?.error })), storedReport: stored?.report ?? null });
  }, [addExport, machine, backend, maxSide, opts, models, runs, stored]);

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

  const rep = stored?.report;
  const stat = (img: string) => rep?.selftest?.images.find((i) => i.image === img);
  const storedFor = (img: string) => (stored?.cutouts ?? []).filter((c) => c.slug === slug(img));
  const out = (b: string, s: string, kind: 'cutout' | 'mask') => `/out/image-engine/step4/selftest-${b}/${s}-${kind}.png`;
  const realRan = (models ?? []).filter((m) => !m.testOnly && runs[m.id]?.status === 'done');

  const verdict = (key: string, option: string, img: string, label: string, extra?: RecordBase['timings']) => {
    const base: RecordBase = { key, step: 'step4', kind: 'cutout', image: img, option, ...(extra ? { timings: extra } : {}) };
    return <VerdictBox label={label} rec={records[key]} onChange={(v, r) => setRecord(base, v, r)} />;
  };

  return (
    <Section id="step4" title="Step 4: Cutouts" lastRun={lastRun} onRefresh={refresh} busy={busy} intro="Each picture with its cutout on four backgrounds. Cutouts are parked: no real model has produced one on this machine, so everything below marked TOY is only a plumbing test and says nothing about cutout quality.">
      <div className="res-banner" role="note">
        <b>{REAL}: none yet.</b> ISNet is blocked (licence unclear). BiRefNet_lite fails on this machine (see below).
      </div>

      <div className="lab-models">
        <div className="lab-model">
          <h3>This machine</h3>
          <p className="small">WebGPU <b>{machine.webgpu ? 'yes' : 'no'}</b> ({String(machine.gpu ?? '')}) · threaded WASM <b>{machine.isolated ? 'yes' : 'no'}</b> · {String(machine.cores ?? '')} cores</p>
        </div>
        <div className="lab-model">
          <h3><span className="chip chip-tag">{REAL}</span> BiRefNet_lite (MIT)</h3>
          {rep?.birefnet ? (
            rep.birefnet.ok ? <p className="small">Worked on {rep.birefnet.info?.backend}.</p> : <p className="lab-err"><b>Failed in the last test run ({rep.birefnet.error?.code}).</b> {rep.birefnet.error?.message}</p>
          ) : <p className="small muted">Not run in the stored test run.</p>}
        </div>
        <div className="lab-model">
          <h3><span className="chip chip-tag">{REAL}</span> ISNet general-use</h3>
          <p className="lab-err"><b>Blocked.</b> {rep?.isnet?.message ?? 'The weights licence is unclear, so it is not downloaded or used until you decide.'}</p>
        </div>
      </div>

      {(stored === null) && <p role="status">Loading…</p>}
      {pics.length === 0 && stored && <p className="lab-err">No pictures in test-images/. Add some, or add pictures at the top of this page.</p>}

      {pics.map((p) => {
        const saved = storedFor(p.name);
        const st = stat(p.name);
        return (
          <section key={p.name} className="lab-box res-source" aria-label={`Cutouts for ${p.name}`}>
            <h3>{p.name} <span className="lab-dim">{mb(p.bytes)}{p.uploaded ? ' · added by you' : ''}</span></h3>
            <div className="lab-cut">
              <Pic className="lab-orig" src={p.url} alt={`Original ${p.name}`} />
              <div className="lab-cut-rows">
                {saved.map((c) => {
                  const key = `step4|${p.name}|selftest-${c.backend}`;
                  const t = c.backend === 'webgpu' ? st?.webgpuMs : st?.wasmMs;
                  return (
                    <div key={c.backend} className="lab-cut-row">
                      <p className="small"><span className="chip chip-warn">{TOY}</span> from the last test run · {c.backend}{t ? ` · total ${msText(t)}` : ''}{st ? ` · ${st.width}x${st.height} · subject ${(st.areaFraction * 100).toFixed(1)}%` : ''}. It turns brightness into a mask and is not a background remover.</p>
                      <Tiles cutout={out(c.backend, c.slug, 'cutout')} mask={out(c.backend, c.slug, 'mask')} alt={`Toy cutout of ${p.name} (${c.backend})`} />
                      {verdict(key, `selftest-${c.backend}`, p.name, `toy cutout (${c.backend}) of ${p.name}`, t ? { backend: c.backend, totalMs: t, model: 'selftest (toy)' } : undefined)}
                    </div>
                  );
                })}
                {(models ?? []).map((m) => {
                  const res = runs[m.id]?.results[p.name];
                  if (!res) return null;
                  const label = m.testOnly ? TOY : REAL;
                  if ('error' in res) return <p key={m.id} className="lab-err"><span className="chip chip-tag">{label}</span> {m.label}: {res.error}</p>;
                  const key = `step4|${p.name}|live-${m.id}`;
                  return (
                    <div key={m.id} className="lab-cut-row">
                      <p className="small">
                        <span className={m.testOnly ? 'chip chip-warn' : 'chip chip-ok'}>{label}</span> {m.label} · live in this browser · {res.backend}{res.warm ? '' : ' (first run, includes shader compile)'} · inference {msText(res.ms.infer)}, total {msText(res.ms.total)} · {res.size} · subject {(res.stats.areaFraction * 100).toFixed(1)}%
                      </p>
                      <Tiles cutout={res.cutout} mask={res.mask} alt={`${m.label} cutout of ${p.name}`} />
                      {verdict(key, m.id, p.name, `${m.label} on ${p.name}`, { backend: res.backend, warm: res.warm, size: res.size, preprocessMs: res.ms.pre, inferenceMs: res.ms.infer, postprocessMs: res.ms.post, totalMs: res.ms.total, subjectShare: res.stats.areaFraction, model: m.id })}
                    </div>
                  );
                })}
                {saved.length === 0 && !(models ?? []).some((m) => runs[m.id]?.results[p.name]) && <p className="lab-dim">No cutout for this picture yet. Run a model below.</p>}
              </div>
            </div>
          </section>
        );
      })}

      <div className="lab-box">
        <h3 className="h3">Run a model now, in this browser</h3>
        <div className="lab-row">
          <label>Backend <select value={backend} onChange={(e) => setBackend(e.target.value as typeof backend)}><option value="auto">auto (WebGPU, else WASM)</option><option value="webgpu">WebGPU only</option><option value="wasm">WASM only</option></select></label>
          <label>Work at up to <select value={maxSide} onChange={(e) => setMaxSide(Number(e.target.value))}><option value={1024}>1024 px</option><option value={2048}>2048 px</option><option value={3072}>3072 px</option></select></label>
          <label><input type="checkbox" checked={!!opts.featherPx} onChange={(e) => setOpts({ ...opts, featherPx: e.target.checked ? 4 : 0 })} /> feather edges 4 px</label>
          <label><input type="checkbox" checked={!!opts.fillHolesMaxShare} onChange={(e) => setOpts({ ...opts, fillHolesMaxShare: e.target.checked ? 0.005 : 0 })} /> fill small holes</label>
          <label><input type="checkbox" checked={!!opts.decontaminatePx} onChange={(e) => setOpts({ ...opts, decontaminatePx: e.target.checked ? 4 : 0 })} /> decontaminate edges</label>
        </div>
        {modelError && <p className="lab-err" role="alert">{modelError}</p>}
        <div className="lab-models">
          {(models ?? []).map((m) => {
            const run = runs[m.id];
            const blocked = m.status !== 'approved';
            return (
              <div key={m.id} className={`lab-model${m.testOnly ? ' is-test' : ''}`}>
                <h3><span className={m.testOnly ? 'chip chip-warn' : 'chip chip-tag'}>{m.testOnly ? TOY : REAL}</span> {m.label}</h3>
                <p className="lab-dim">Licence: {m.licence}{m.bytes ? ` · ${mb(m.bytes)}` : ''}</p>
                {blocked ? (
                  <p className="lab-err">Blocked. {m.blockedBecause}</p>
                ) : (
                  <button type="button" className="btn btn-dark btn-sm" disabled={run?.status === 'loading' || run?.status === 'running' || pics.length === 0} onClick={() => runModel(m)}>
                    {run?.status === 'done' || run?.status === 'failed' ? 'Run again' : 'Load and run on all pictures'}
                  </button>
                )}
                {run?.progress && <p role="status">{run.progress}</p>}
                {run?.load && (
                  <p className="lab-dim">
                    Backend <b>{run.load.backend}</b>{run.load.fallbackReason ? ` (fallback: ${run.load.fallbackReason})` : ''} · downloaded {mb(run.load.downloadBytes)}{run.load.fromCache ? ' (from cache)' : ''} · fetch {msText(run.load.timings.fetchMs)}, start {msText(run.load.timings.initMs)}
                  </p>
                )}
                {run?.error && <p className="lab-err" role="alert"><b>Cannot run: {run.error.code}.</b> {run.error.message}</p>}
              </div>
            );
          })}
        </div>
        {realRan.length === 0 && <p className="lab-dim">No real model has produced cutouts yet in this session.</p>}
      </div>
    </Section>
  );
}

