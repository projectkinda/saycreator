// DEV-ONLY Results screen: every step's results in one place, with verdicts. Not part of the product. Route: /lab (menu: Results)
// Each step is one section under src/pages/results/. Later steps write out/image-engine/results/<step>.json and appear
// here by themselves (see Generic.tsx and tests/image-engine/results.ts).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { ResultsContext, Viewer, type Record_, type RecordBase, type State, type Verdict } from './results/common';
import Generic, { type StepManifest } from './results/Generic';
import Step1 from './results/Step1';
import Step2, { type Upload } from './results/Step2';
import Step3 from './results/Step3';
import Step4 from './results/Step4';
import StyleReading from './results/StyleReading';
import '../styles/lab.css';

const STORE = 'ie-lab-v1';
interface LastRun {
  step1: number;
  step2: number;
  step3: number;
  step4: number;
  generic: Record<string, number>;
}

function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? '');
    if (s && typeof s === 'object' && s.records) return { records: s.records, picks: s.picks ?? {} };
  } catch {
    /* nothing saved yet, or the browser blocks storage */
  }
  return { records: {}, picks: {} };
}

export default function Lab() {
  const [state, setState] = useState<State>(load);
  const [saved, setSaved] = useState('');
  const [last, setLast] = useState<LastRun>({ step1: 0, step2: 0, step3: 0, step4: 0, generic: {} });
  const [manifests, setManifests] = useState<StepManifest[]>([]);
  const [manifestBusy, setManifestBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [shown, setShown] = useState<{ url: string; alt: string } | null>(null);
  const extras = useRef<Record<string, unknown>>({});

  const reloadLast = useCallback(() => {
    fetch('/__lab/lastrun').then((r) => r.json()).then(setLast).catch(() => undefined);
  }, []);
  const reloadManifests = useCallback(() => {
    setManifestBusy(true);
    fetch('/__lab/steps').then((r) => r.json()).then(setManifests).catch(() => setManifests([])).finally(() => { setManifestBusy(false); reloadLast(); });
  }, [reloadLast]);
  useEffect(() => {
    document.title = 'Results (dev only)';
    reloadManifests();
  }, [reloadManifests, refreshKey]);

  // Autosave every change.
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
      setSaved(`Saved in this browser at ${new Date().toLocaleTimeString()}`);
    } catch {
      setSaved('Could not save in this browser. Export your verdicts now.');
    }
  }, [state]);

  const setRecord = useCallback((base: RecordBase, verdict: Verdict | null, reason: string) => {
    setState((s) => ({ ...s, records: { ...s.records, [base.key]: { ...base, verdict, reason, updatedAt: new Date().toISOString() } as Record_ } }));
  }, []);
  const addExport = useCallback((key: string, value: unknown) => {
    extras.current[key] = value;
  }, []);
  const view = useCallback((url: string, alt: string) => setShown({ url, alt }), []);

  const exportJson = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      ...extras.current,
      verdicts: Object.values(state.records).filter((r) => r.verdict || r.reason),
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `lab-verdicts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next: Upload[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      let name = f.name;
      while (uploads.some((u) => u.name === name) || next.some((u) => u.name === name)) name = 'copy of ' + name;
      next.push({ name, url: URL.createObjectURL(f), bytes: f.size });
    }
    setUploads((u) => [...u, ...next]);
  };

  const count = Object.values(state.records).filter((r) => r.verdict).length;
  const newestFirst = [...manifests].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  const done = useCallback(() => reloadLast(), [reloadLast]);

  return (
    <ResultsContext.Provider value={{ records: state.records, setRecord, view, addExport }}>
      <div className="page page-tight results">
        <header className="page-header">
          <div className="page-header-text">
            <h1 className="page-title">Results</h1>
            <p className="lead">Everything the image engine has made, step by step, newest first. Judge it here: good, meh or bad with a one-line reason. Dev only.</p>
          </div>
        </header>

        <div className="card res-bar" role="region" aria-label="Verdicts and pictures">
          <span className="small muted" role="status">{count} verdicts. {saved}</span>
          <div className="res-bar-actions">
            <label className="btn btn-outline btn-sm res-upload">
              <Icon name="upload" size={16} /> Add pictures
              <input type="file" accept="image/*" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} aria-label="Add pictures to try" />
            </label>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setRefreshKey((k) => k + 1)}>Refresh all</button>
            <button type="button" className="btn btn-dark btn-sm" onClick={exportJson}>Export verdicts JSON</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => window.confirm('Delete every verdict saved in this browser?') && setState({ records: {}, picks: {} })}>Clear all</button>
          </div>
          {uploads.length > 0 && <p className="small muted res-uploads">Your pictures (kept only while this tab is open): {uploads.map((u) => u.name).join(', ')}</p>}
        </div>

        <nav aria-label="Steps on this page" className="res-jump">
          {[...newestFirst.map((m) => [m.file.replace(/\.json$/, ''), m.title] as const), ['style-reading', 'Step 5: Style reading'], ['step3', 'Step 3: Carousels'], ['step4', 'Step 4: Cutouts'], ['step2', 'Step 2: Thumbnails and checks'], ['step1', 'Step 1: Plan and patch proof']].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="chip chip-tag">{label}</a>
          ))}
        </nav>

        {newestFirst.map((m) => (
          <Generic key={m.file} manifest={m} lastRun={last.generic[m.file] ?? 0} onRefresh={reloadManifests} busy={manifestBusy} />
        ))}
        <StyleReading refreshKey={refreshKey} onRefreshed={done} />
        <Step3 lastRun={last.step3} refreshKey={refreshKey} onRefreshed={done} />
        <Step4 lastRun={last.step4} refreshKey={refreshKey} onRefreshed={done} uploads={uploads} />
        <Step2 lastRun={last.step2} refreshKey={refreshKey} onRefreshed={done} uploads={uploads} />
        <Step1 lastRun={last.step1} refreshKey={refreshKey} onRefreshed={done} />
      </div>
      <Viewer shown={shown} onClose={() => setShown(null)} />
    </ResultsContext.Provider>
  );
}
