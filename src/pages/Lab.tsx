// DEV-ONLY Results screen. Not part of the product. Route: /lab (menu: Results)
// Organised around what a person needs to judge (Overview, Styles, Slides, Photo tools, Thumbnails, Cutouts, Elements,
// Coverage, Checks and tests), not around the build step that made it. Verdicts are stored exactly as before (same keys).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { AreaContext, ResultsContext, Viewer, type Record_, type RecordBase, type State, type Verdict } from './results/common';
import AssetLibrary from './results/AssetLibrary';
import Coverage from './results/Coverage';
import Generic, { type StepManifest } from './results/Generic';
import Overview, { type Counts } from './results/Overview';
import PhotoTools from './results/PhotoTools';
import SlidesView from './results/SlidesView';
import SmartPlacement from './results/SmartPlacement';
import Step1 from './results/Step1';
import Step2, { type Upload } from './results/Step2';
import Step3 from './results/Step3';
import Step4 from './results/Step4';
import StyleReading from './results/StyleReading';
import StylesView from './results/StylesView';
import { LabDataContext, VIEWS, type LastRun, type RecData, type TestAsset, type View } from './results/labdata';
import { ViewFrame } from './results/labui';
import '../styles/lab.css';

/** The same key as before the screen was reorganised: verdicts already saved are still there. */
const STORE = 'ie-lab-v1';

const VIEW_TITLE: Record<View, string> = {
  overview: 'Overview',
  styles: 'Styles',
  slides: 'Slides',
  photo: 'Photo tools',
  thumbnails: 'Thumbnails',
  cutouts: 'Cutouts',
  elements: 'Elements',
  coverage: 'Coverage',
  checks: 'Checks and tests',
};
/** Which area a part of the screen counts towards (Slides count towards Styles and Photo tools). */
const VIEW_AREA: Partial<Record<View, string>> = { styles: 'styles', slides: 'styles', photo: 'photo', thumbnails: 'thumbnails', cutouts: 'cutouts', elements: 'elements', checks: 'checks' };

function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? '');
    if (s && typeof s === 'object' && s.records) return { records: s.records, picks: s.picks ?? {} };
  } catch {
    /* nothing saved yet, or the browser blocks storage */
  }
  return { records: {}, picks: {} };
}

const fromHash = (): View => {
  const h = window.location.hash.replace('#', '');
  return (VIEWS as readonly string[]).includes(h) ? (h as View) : 'overview';
};

export default function Lab() {
  const [state, setState] = useState<State>(load);
  const [saved, setSaved] = useState('');
  const [last, setLast] = useState<LastRun>({ step1: 0, step2: 0, step3: 0, step4: 0, generic: {} });
  const [manifests, setManifests] = useState<StepManifest[]>([]);
  const [recreation, setRecreation] = useState<RecData | null>(null);
  const [testAssets, setTestAssets] = useState<TestAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [shown, setShown] = useState<{ url: string; alt: string } | null>(null);
  const [view, setView] = useState<View>(fromHash);
  const [onlyUnrated, setOnlyUnrated] = useState(false);
  const [sel, setSel] = useState({ style: '', script: '' });
  const extras = useRef<Record<string, unknown>>({});
  const items = useRef(new Map<string, string>());
  const [tick, setTick] = useState(0);
  const pending = useRef(false);

  const go = useCallback((v: View) => {
    setView(v);
    if (window.location.hash !== `#${v}`) window.history.replaceState(null, '', `#${v}`);
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const on = () => setView(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const reloadLast = useCallback(() => {
    fetch('/__lab/lastrun').then((r) => r.json()).then(setLast).catch(() => undefined);
  }, []);
  const reloadAll = useCallback(() => {
    setBusy(true);
    Promise.all([
      fetch('/__lab/steps').then((r) => r.json()).then(setManifests).catch(() => setManifests([])),
      fetch('/__lab/recreation').then((r) => r.json()).then(setRecreation).catch(() => setRecreation(null)),
      fetch('/__lab/testassets').then((r) => r.json()).then((d) => setTestAssets(d.files ?? [])).catch(() => setTestAssets([])),
    ]).finally(() => {
      setBusy(false);
      reloadLast();
    });
  }, [reloadLast]);
  useEffect(() => {
    document.title = 'Results (dev only)';
    reloadAll();
  }, [reloadAll, refreshKey]);

  // Autosave every change.
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
      setSaved(`Saved in this browser at ${new Date().toLocaleTimeString()}`);
    } catch {
      setSaved('Could not save in this browser. Export your verdicts now.');
    }
    // Also copy to disk (out/image-engine/verdicts.json) so they never depend on this one browser. Skipped in automated tests.
    if (!navigator.webdriver) {
      const records = Object.fromEntries(Object.entries(state.records).filter(([, r]) => r.verdict || r.reason));
      if (Object.keys(records).length) fetch('/__lab/verdicts', { method: 'POST', body: JSON.stringify({ records }) }).catch(() => undefined);
    }
  }, [state]);

  const setRecord = useCallback((base: RecordBase, verdict: Verdict | null, reason: string) => {
    setState((s) => ({ ...s, records: { ...s.records, [base.key]: { ...base, verdict, reason, updatedAt: new Date().toISOString() } as Record_ } }));
  }, []);
  const addExport = useCallback((key: string, value: unknown) => {
    extras.current[key] = value;
  }, []);
  const viewPic = useCallback((url: string, alt: string) => setShown({ url, alt }), []);
  /** Every item on the screen says which area it is in, so the counts need no second list. */
  const register = useCallback((area: string, key: string) => {
    if (items.current.get(key) === area) return;
    items.current.set(key, area);
    if (!pending.current) {
      pending.current = true;
      requestAnimationFrame(() => {
        pending.current = false;
        setTick((t) => t + 1);
      });
    }
  }, []);

  const counts: Counts = useMemo(() => {
    const c: Counts = {};
    for (const [key, area] of items.current) {
      const x = (c[area] ??= { waiting: 0, total: 0 });
      x.total++;
      if (!state.records[key]?.verdict) x.waiting++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.records, tick]);

  const exportJson = () => {
    const data = { exportedAt: new Date().toISOString(), ...extras.current, verdicts: Object.values(state.records).filter((r) => r.verdict || r.reason) };
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

  const rated = Object.values(state.records).filter((r) => r.verdict).length;
  // "Needs my verdict": hide every card whose verdict boxes are all filled in.
  useEffect(() => {
    const root = document.querySelector('.results');
    if (!root) return;
    const apply = () => {
      root.querySelectorAll('.res-hide').forEach((e) => e.classList.remove('res-hide'));
      if (!onlyUnrated) return;
      root.querySelectorAll<HTMLElement>('.lab-verdict[data-rated="true"]').forEach((box) => {
        let el: HTMLElement = box;
        while (el.parentElement && !el.parentElement.matches('.res-pane, details, .res-main') && el.parentElement.querySelectorAll('.lab-verdict').length === 1) el = el.parentElement;
        el.classList.add('res-hide');
      });
    };
    apply();
    const id = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(id);
  }, [onlyUnrated, state.records, tick, view, recreation, manifests, sel]);
  const done = useCallback(() => reloadLast(), [reloadLast]);
  const other = manifests.filter((m) => m.file !== 'step11.json' && m.file !== 'photos-app.json').sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  /** What each part of the screen shows: the Styles view has only the style cards, Slides the slides, Photo tools the gallery. */
  const viewCounts = useMemo(() => {
    const c: Partial<Record<View, { waiting: number; total: number }>> = {};
    for (const [key, area] of items.current) {
      const v: View | undefined = key.startsWith('style|') ? 'styles' : key.startsWith('style-recreation|') || key.startsWith('slides|') || key.startsWith('step11|Style:') ? 'slides' : (Object.keys(VIEW_AREA) as View[]).find((x) => x !== 'styles' && x !== 'slides' && VIEW_AREA[x] === area);
      if (!v) continue;
      const x = (c[v] ??= { waiting: 0, total: 0 });
      x.total++;
      if (!state.records[key]?.verdict) x.waiting++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.records, tick]);
  const countOf = (v: View) => viewCounts[v] ?? (VIEW_AREA[v] ? { waiting: 0, total: 0 } : undefined);
  function latestOf(v: View): number | null {
    const n = (x: number | undefined) => (x && x > 0 ? x : null);
    if (v === 'overview') return n(Math.max(0, ...(VIEWS.filter((x) => x !== 'overview') as View[]).map((x) => latestOf(x) ?? 0)));
    if (v === 'styles' || v === 'slides') return n(recreation?.lastRun);
    if (v === 'photo') return n(last.generic['step11.json']);
    if (v === 'thumbnails') return n(last.step2);
    if (v === 'elements') return n(last.elements);
    if (v === 'coverage') return n(last.coverage);
    if (v === 'cutouts') return n(last.step4);
    if (v === 'checks') return n(Math.max(last.step1, last.step3, ...Object.values(last.generic)));
    return null;
  }
  const waiting = (v: View) => countOf(v)?.waiting ?? 0;
  const mounted = (v: View, node: React.ReactNode) => <div key={v} hidden={view !== v} className="res-pane">{node}</div>;

  return (
    <LabDataContext.Provider value={{ recreation, manifests, last, testAssets, sel, setSel, go }}>
      <ResultsContext.Provider value={{ records: state.records, setRecord, view: viewPic, addExport, register }}>
        <div className={`page page-tight results${onlyUnrated ? ' only-unrated' : ''}`}>
          <header className="page-header">
            <div className="page-header-text">
              <h1 className="page-title">Results</h1>
              <p className="lead">Everything the image engine has made, organised by what you need to judge. Dev only.</p>
            </div>
          </header>

          <div className="card res-bar" role="region" aria-label="Verdicts and pictures">
            <span className="small muted" role="status">{rated} verdicts. {saved}</span>
            <div className="res-bar-actions">
              <label className="res-filter small">
                <input type="checkbox" checked={onlyUnrated} onChange={(e) => setOnlyUnrated(e.target.checked)} /> Needs my verdict
              </label>
              <label className="btn btn-outline btn-sm res-upload">
                <Icon name="upload" size={16} /> Add pictures
                <input type="file" accept="image/*" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} aria-label="Add pictures to try" />
              </label>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setRefreshKey((k) => k + 1)} disabled={busy}>Refresh all</button>
              <button type="button" className="btn btn-dark btn-sm" onClick={exportJson}>Export verdicts JSON</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => window.confirm('Delete every verdict, in this browser and the copy on disk?') && (fetch('/__lab/verdicts', { method: 'POST', body: JSON.stringify({ clear: true }) }).catch(() => undefined), setState({ records: {}, picks: {} }))}>Clear all</button>
            </div>
            {uploads.length > 0 && <p className="small muted res-uploads">Your pictures (kept only while this tab is open): {uploads.map((u) => u.name).join(', ')}</p>}
          </div>

          <div className="res-layout">
            <nav aria-label="Sections of this page" className="res-nav">
              <ul>
                {VIEWS.map((v) => {
                  const w = waiting(v);
                  return (
                    <li key={v}>
                      <a href={`#${v}`} className={view === v ? 'active' : undefined} aria-current={view === v ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(v); }}>
                        <span>{VIEW_TITLE[v]}</span>
                        {countOf(v) && <span className={w ? 'res-nav-count' : 'res-nav-count done'} aria-label={`${w} waiting for your verdict`}>{w}</span>}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="res-main">
              {mounted('overview', (
                <ViewFrame id="overview" title="Overview" latest={latestOf('overview')} looking="One card for each area of the image engine: whether it works, in one sentence, and how many items wait for you." todo="Open an area that has items waiting and rate them. The bar shows how much of everything you have rated.">
                  <Overview counts={counts} />
                </ViewFrame>
              ))}
              {mounted('styles', (
                <ViewFrame id="styles" title="Styles" latest={latestOf('styles')} count={countOf('styles')} looking="One card for each of the seven styles: the reference deck it was made from beside three of our slides." todo="Rate each style as a whole: matches, close, off or wrong. Open its slides to look closer.">
                  <AreaContext.Provider value="styles"><StylesView /></AreaContext.Provider>
                </ViewFrame>
              ))}
              {mounted('slides', (
                <ViewFrame id="slides" title="Slides" latest={latestOf('slides')} count={countOf('slides')} looking="The slides of one style and one script, each its own card with its phone-size check in plain words. Slides made with your test photos are labelled TEST ASSETS." todo="Pick a style and a script, then rate each slide: matches, close, off or wrong. Click a slide to see it full size.">
                  <SlidesView />
                </ViewFrame>
              ))}
              {mounted('photo', (
                <ViewFrame id="photo" title="Photo tools" latest={latestOf('photo')} count={countOf('photo')} looking="One of your test photos under every treatment, shape, frame and background the engine has, plus the effects for objects (on a stand-in). Photo decks are in Slides." todo="Look at each caption and rate it: good, meh or bad. Say in a line what you would change.">
                  <PhotoTools />
                </ViewFrame>
              ))}
              {mounted('thumbnails', (
                <ViewFrame id="thumbnails" title="Thumbnails" latest={latestOf('thumbnails')} count={countOf('thumbnails')} looking="Each picture with every thumbnail option, drawn at phone size, with the checker's result." todo="Rate each option: good, meh or bad. Add your own picture with Add pictures at the top.">
                  <AreaContext.Provider value="thumbnails"><Step2 lastRun={last.step2} refreshKey={refreshKey} onRefreshed={done} uploads={uploads} /></AreaContext.Provider>
                </ViewFrame>
              ))}
              {mounted('cutouts', (
                <ViewFrame id="cutouts" title="Cutouts" latest={latestOf('cutouts')} count={countOf('cutouts')} looking="Cutouts (a person or object with the background removed) are blocked: no real model has produced one on this computer." todo="Nothing to rate until a model works. To unblock it, decide on a background-removal model (or supply transparent PNGs yourself); the steps are below.">
                  <div className="card res-blocked">
                    <h3 className="h3">What is blocked, and why</h3>
                    <ul>
                      <li>The cutout code works and is tested, but the one model that downloads and runs (BiRefNet_lite) fails on this computer, and the other (ISNet) is not allowed: its licence is unclear.</li>
                      <li>So no real cutout exists. The pictures further down marked TOY only prove the plumbing; they say nothing about quality.</li>
                      <li>Everything that needs a person or object cut out is waiting: the 3D-object styles, people with type behind them, and the cutout looks in the photo decks.</li>
                    </ul>
                    <h3 className="h3">What you can do</h3>
                    <ul>
                      <li>Approve a different background-removal model with a permissive licence, or tell me to keep working on BiRefNet_lite.</li>
                      <li>Or skip the model: put transparent PNGs of single objects (6 to 10) and of people on plain backgrounds in your private test-pictures folder. The effects for objects already work on them.</li>
                    </ul>
                  </div>
                  <details className="res-older">
                    <summary>Cutout test results (technical)</summary>
                    <AreaContext.Provider value="cutouts"><Step4 lastRun={last.step4} refreshKey={refreshKey} onRefreshed={done} uploads={uploads} /></AreaContext.Provider>
                  </details>
                </ViewFrame>
              ))}
              {mounted('elements', (
                <ViewFrame id="elements" title="Elements" latest={latestOf('elements')} count={countOf('elements')} looking="The library of icons, objects and doodles the engine can place on a slide, and slides drawn with them (ours, and your test pictures labelled TEST ASSETS)." todo="Browse the library, then rate the slides: matches, close, off or wrong.">
                  <AreaContext.Provider value="elements">
                    <AssetLibrary refreshKey={refreshKey} onRefreshed={done} />
                    <SmartPlacement refreshKey={refreshKey} onRefreshed={done} />
                  </AreaContext.Provider>
                </ViewFrame>
              ))}
              {mounted('coverage', (
                <ViewFrame id="coverage" title="Coverage" latest={latestOf('coverage')} looking="Your 16 reference decks: which stored style covers each, and what is still missing. Then every test photo and the slides that used it." todo="Nothing to rate. Read what is missing: it is the list of things to supply or decide.">
                  <Coverage />
                </ViewFrame>
              ))}
              {mounted('checks', (
                <ViewFrame id="checks" title="Checks and tests" latest={latestOf('checks')} count={countOf('checks')} looking="The technical results, the checks on bad variants, and what earlier work found. Closed by default." todo="You can skip this. Open it to rate older items or to see how something was checked.">
                  <AreaContext.Provider value="checks">
                    <details className="res-older">
                      <summary>Older work and technical details</summary>
                      {other.map((m) => (
                        <Generic key={m.file} manifest={m} lastRun={last.generic[m.file] ?? 0} onRefresh={reloadAll} busy={busy} />
                      ))}
                      <StyleReading refreshKey={refreshKey} onRefreshed={done} />
                      <Step3 lastRun={last.step3} refreshKey={refreshKey} onRefreshed={done} />
                      <Step1 lastRun={last.step1} refreshKey={refreshKey} onRefreshed={done} />
                    </details>
                  </AreaContext.Provider>
                </ViewFrame>
              ))}
            </div>
          </div>
        </div>
        <Viewer shown={shown} onClose={() => setShown(null)} />
      </ResultsContext.Provider>
    </LabDataContext.Provider>
  );
}
