// Images > Styles > New style from references. The person adds reference images (a whole image, a collage split into its slides, or one cell),
// says what to learn from each, and the app reads the look: first by measuring the pixels in code, then with a reader (a model with vision)
// that answers in our style vocabulary. It draws samples in the style next to the references, refines up to three rounds, shows how close it
// got and what it could not do, and saves the result as a template. References stay on this device.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../useDocumentTitle';
import type { StyleSpec } from '../image-engine/styles/format';
import { SLIDE_TYPES, type SlideType } from '../image-engine/styles/format';
import { getStyles } from '../carousel/render';
import { ensureTemplatesLoaded, saveTemplate, styleNameFor, templateProblem, useTemplatesVersion } from './templates';
import { closenessOf, rankMissing, SINGLE_IMAGE_NOTE } from './closeness';
import { detectGrid, type GridResult } from './grid';
import { bitmapOf, cut, jpegUrl, pxOfCanvas, previewOf, readerImageOf, samplePhoto } from './images';
import { applyFeedback, runLoop, type Round, type SampleContent } from './loop';
import { describeMeasured, measure } from './measure';
import { detectReaders, ReaderError, readStyle, type ReferenceReader } from './reader';
import { sectionsFor } from './spec';
import { LEARN_LABEL, TARGET_LABEL, type LearnFrom, type Measured, type MissingTool, type Rect, type ReferenceItem, type Target } from './types';
import '../styles/carousel.css';
import '../styles/reference.css';

export const REFERENCES_PRIVACY = 'Your references stay on this device: they are read here in your browser, and only the pictures you add are sent to the reader you have connected, nowhere else.';
const MAX_IMAGES = 10;

interface Upload {
  id: string;
  name: string;
  bitmap: ImageBitmap;
  thumb: string;
  width: number;
  height: number;
  grid: GridResult | null;
  /** grid: the ticked cells; single: the whole image; crop: the rectangle the person drew. */
  mode: 'grid' | 'single' | 'crop';
  ticked: boolean[];
  crop: Rect | null;
  learn: LearnFrom;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'style';

export default function ReferenceStylePage() {
  useDocumentTitle('New style from references');
  const tplVersion = useTemplatesVersion();
  useEffect(() => {
    void ensureTemplatesLoaded();
  }, []);

  // ----- references -----
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [notice, setNotice] = useState('');
  const [over, setOver] = useState(false);
  const [drawing, setDrawing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ReferenceItem[]>([]);
  const [measured, setMeasured] = useState<Measured[]>([]);
  /** The pieces are being cut and measured again after a change: Read references waits for them. */
  const [preparing, setPreparing] = useState(false);

  const addFiles = async (files: File[]) => {
    const room = MAX_IMAGES - uploads.length;
    const take = files.filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room));
    const skipped = files.length - take.length;
    const next: Upload[] = [];
    const msgs: string[] = [];
    for (const f of take) {
      try {
        const bm = await bitmapOf(f);
        // Thin gutters can vanish at one size and show at another, so look at three sizes and take the first grid found.
        let grid: GridResult | null = null;
        for (const size of [1400, 900, 600]) {
          const small = cut(bm, null, size);
          const g = detectGrid(pxOfCanvas(small));
          if (g) {
            const k = bm.width / small.width;
            grid = { ...g, cells: g.cells.map((c) => ({ x: Math.round(c.x * k), y: Math.round(c.y * k), width: Math.round(c.width * k), height: Math.round(c.height * k) })) };
            break;
          }
        }
        const t = await jpegUrl(bm, null, 520);
        next.push({ id: `img${uploads.length + next.length + 1}`, name: f.name, bitmap: bm, thumb: t.url, width: bm.width, height: bm.height, grid, mode: grid ? 'grid' : 'single', ticked: grid ? grid.cells.map(() => true) : [], crop: null, learn: 'everything' });
      } catch {
        msgs.push(`“${f.name}” could not be read as a picture.`);
      }
    }
    if (skipped > 0 && room <= 0) msgs.push(`At most ${MAX_IMAGES} images: the rest were left out.`);
    else if (take.length < files.length) msgs.push(`${files.length - take.length} file${files.length - take.length === 1 ? ' was' : 's were'} not a picture or over the limit of ${MAX_IMAGES} images, and left out.`);
    setUploads((u) => [...u, ...next]);
    setNotice(msgs.join(' '));
  };
  const patchUpload = (id: string, p: Partial<Upload>) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const removeUpload = (id: string) => setUploads((u) => u.filter((x) => x.id !== id));

  // The pieces the style learns from, and their measurements.
  useEffect(() => {
    let live = true;
    setPreparing(true);
    (async () => {
      const list: ReferenceItem[] = [];
      const ms: Measured[] = [];
      for (const u of uploads) {
        const pieces: { rect: Rect | null; cell?: number }[] = u.mode === 'grid' && u.grid ? u.grid.cells.flatMap((c, i) => (u.ticked[i] ? [{ rect: c, cell: i }] : [])) : u.mode === 'crop' && u.crop ? [{ rect: u.crop }] : [{ rect: null }];
        for (const p of pieces) {
          const j = await jpegUrl(u.bitmap, p.rect, 1100);
          list.push({ id: p.cell !== undefined ? `${u.id}#${p.cell + 1}` : u.id, name: p.cell !== undefined ? `${u.name} (slide ${p.cell + 1})` : u.name, dataUrl: j.url, width: j.width, height: j.height, learn: u.learn, source: { image: u.id, ...(p.cell !== undefined ? { cell: p.cell } : {}), ...(p.rect ? { rect: p.rect } : {}) } });
          ms.push(measure(pxOfCanvas(cut(u.bitmap, p.rect, 420))));
        }
      }
      if (live) {
        setItems(list);
        setMeasured(ms);
        setPreparing(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [uploads]);

  // ----- target, name, base -----
  const [target, setTarget] = useState<Target>('carousel');
  const [title, setTitle] = useState('');
  const baseOptions = useMemo(() => getStyles().styles.filter((s) => !s.spec.name.startsWith('mine-')), [tplVersion]);
  const [baseName, setBaseName] = useState('editorial-collage');
  const [sampleTitle, setSampleTitle] = useState('Ride before sunrise');
  const [samplePic, setSamplePic] = useState<{ id: string; url: string; width: number; height: number; name: string } | null>(null);
  const pickSample = async (f: File | undefined) => {
    if (!f) return;
    try {
      const bm = await bitmapOf(f);
      const j = await jpegUrl(bm, null, 1600);
      setSamplePic({ id: 'sample-own', url: j.url, width: j.width, height: j.height, name: f.name });
    } catch {
      setNotice(`“${f.name}” could not be read as a picture.`);
    }
  };

  // ----- readers -----
  const [readers, setReaders] = useState<ReferenceReader[] | null>(null);
  useEffect(() => {
    let live = true;
    void detectReaders().then((r) => live && setReaders(r));
    return () => {
      live = false;
    };
  }, []);

  // ----- reading and the loop -----
  const [phase, setPhase] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; details: string[] } | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [picked, setPicked] = useState(0);
  const [seen, setSeen] = useState<SlideType[]>([]);
  const [missing, setMissing] = useState<MissingTool[]>([]);
  const [notes, setNotes] = useState('');
  const [timing, setTiming] = useState('');
  const [attempts, setAttempts] = useState<1 | 2 | null>(null);
  const [feedback, setFeedback] = useState('');
  const abort = useRef<AbortController | null>(null);
  const ctx = useRef<{ content: SampleContent; spec: StyleSpec; name: string } | null>(null);

  const canRead = items.length > 0 && !!readers?.length && !busy && !preparing;
  const read = async () => {
    const reader = readers![0];
    const base = getStyles().styles.find((s) => s.spec.name === baseName)?.spec ?? baseOptions[0].spec;
    const name = styleNameFor(title || 'style');
    abort.current = new AbortController();
    setBusy(true);
    setProblem(null);
    setRounds([]);
    setPicked(0);
    setSaved(null);
    const t0 = performance.now();
    try {
      setPhase('The reader is looking at your references…');
      const images = items.map((it, i) => readerImageOf(it.dataUrl, `ref${i + 1}.jpg`));
      const out = await readStyle({ reader, items, images, target, base, baseName, measured, name, title: title.trim() || 'My style', signal: abort.current.signal, onPhase: (p) => setPhase(p === 'reading' ? 'The reader is looking at your references…' : 'The reader’s first answer did not pass the checks, so it is asked once more…') });
      setSeen(out.result.seenSlideTypes);
      setMissing(out.result.missingTools);
      setNotes(out.result.notes);
      setAttempts(out.attempts);
      const photo = samplePic ?? { ...(await samplePhoto()), id: 'sample-builtin' };
      const content: SampleContent = { title: sampleTitle.trim() || 'Your title here', photo };
      ctx.current = { content, spec: out.spec, name };
      const all: Round[] = [];
      const result = await runLoop({
        reader,
        spec: out.spec,
        target,
        sections: sectionsFor(items.map((i) => i.learn)),
        items,
        measured,
        seen: out.result.seenSlideTypes,
        content,
        signal: abort.current.signal,
        onRound: (r) => {
          const at = all.findIndex((x) => x.n === r.n);
          if (at >= 0) all[at] = r;
          else all.push(r);
          setRounds([...all]);
        },
        onPhase: setPhase,
      });
      setPicked(result.best);
      setTiming(`Read and refined in ${((performance.now() - t0) / 1000).toFixed(0)} s (${result.rounds.length} round${result.rounds.length === 1 ? '' : 's'} drawn).`);
      setPhase('');
    } catch (e) {
      setPhase('');
      if (e instanceof ReaderError) setProblem({ message: e.kind === 'cancelled' ? 'Cancelled.' : e.message, details: e.problems });
      else setProblem({ message: e instanceof Error ? e.message : 'Something went wrong while reading the references.', details: [] });
    } finally {
      setBusy(false);
    }
  };

  const adjust = async () => {
    const text = feedback.trim();
    const c = ctx.current;
    if (!text || !c || !readers?.length || busy) return;
    abort.current = new AbortController();
    setBusy(true);
    setProblem(null);
    setPhase('The reader is turning your words into changes…');
    try {
      const from = rounds[picked];
      const r = await applyFeedback(
        { reader: readers[0], spec: from.spec, target, sections: sectionsFor(items.map((i) => i.learn)), items, measured, seen, content: c.content, signal: abort.current.signal, onRound: () => undefined },
        from,
        rounds.length,
        text,
      );
      setRounds((all) => [...all, r]);
      setPicked(rounds.length);
      setFeedback('');
    } catch (e) {
      setProblem({ message: e instanceof ReaderError ? e.message : 'The feedback could not be applied.', details: e instanceof ReaderError ? e.problems : [] });
    } finally {
      setPhase('');
      setBusy(false);
    }
  };

  // ----- saving -----
  const [saved, setSaved] = useState<{ id: string; name: string } | null>(null);
  const chosen = rounds[picked] ?? null;
  const close = chosen ? closenessOf(chosen, { itemCount: items.length, seen, target, missing }) : null;
  const save = async () => {
    if (!chosen) return;
    const name = title.trim() || 'My style';
    const preview = chosen.replicas[0] ? await previewOf(chosen.replicas[0].blob) : '';
    const t = await saveTemplate({ name, target, spec: { ...chosen.spec, name: ctx.current?.name ?? chosen.spec.name }, preview, singleImage: items.length === 1, extrapolated: close?.extrapolated, missing: missing.map((m) => m.tool) });
    setSaved({ id: t.id, name: t.name });
  };

  const showRounds = rounds.length > 0;
  return (
    <div className="page cr-page rf-page">
      <header className="page-header">
        <div className="page-header-text">
          <p className="small"><Link to="/images/styles">← Styles</Link></p>
          <h1 className="page-title">New style from references</h1>
          <p className="lead">Add pictures of looks you like. The app measures them, a reader describes them in our style vocabulary, and the app draws your own content in that style next to them. It gets as close as our toolbox allows and tells you what it could not do.</p>
        </div>
      </header>

      <section className="card rf-sec" aria-labelledby="rf-refs-h">
        <h2 id="rf-refs-h" className="h3">1. Your references</h2>
        <p className="small muted">{REFERENCES_PRIVACY}</p>
        <div
          className={`cr-drop rf-drop${over ? ' over' : ''}`}
          data-testid="reference-drop"
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void addFiles([...e.dataTransfer.files]);
          }}
        >
          <p className="small muted">Drop 1 to {MAX_IMAGES} images here: carousel decks, thumbnails, single slides or collages. One image is enough.</p>
          <div className="cr-photo-actions">
            <button type="button" className="btn btn-outline btn-sm" disabled={uploads.length >= MAX_IMAGES} onClick={() => fileRef.current?.click()}>Add images</button>
            <input ref={fileRef} type="file" multiple accept="image/*" className="visually-hidden" tabIndex={-1} aria-label="Choose reference images" onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
            <span className="small muted">{uploads.length} of {MAX_IMAGES} added</span>
          </div>
        </div>
        {notice && <p className="small cr-warn" role="status">{notice}</p>}
        {uploads.length === 1 && items.length <= 1 && <p className="small" role="status">{SINGLE_IMAGE_NOTE}</p>}
        <ul className="rf-uploads" aria-label="Reference images">
          {uploads.map((u) => (
            <li key={u.id} className="card rf-upload" aria-label={`Reference ${u.name}`} data-mode={u.mode}>
              <div className="rf-frame">
                <img src={u.thumb} alt={`Reference ${u.name}`} draggable={false} />
                {u.mode === 'grid' && u.grid && u.grid.cells.map((c, i) => (
                  <label key={i} className={`rf-cell${u.ticked[i] ? ' on' : ''}`} style={{ left: `${(c.x / u.width) * 100}%`, top: `${(c.y / u.height) * 100}%`, width: `${(c.width / u.width) * 100}%`, height: `${(c.height / u.height) * 100}%` }}>
                    <input type="checkbox" checked={!!u.ticked[i]} aria-label={`Use slide ${i + 1} of ${u.name}`} onChange={(e) => patchUpload(u.id, { ticked: u.ticked.map((t, k) => (k === i ? e.target.checked : t)) })} />
                    <span>{i + 1}</span>
                  </label>
                ))}
                {u.mode === 'crop' && u.crop && <span className="rf-crop" style={{ left: `${(u.crop.x / u.width) * 100}%`, top: `${(u.crop.y / u.height) * 100}%`, width: `${(u.crop.width / u.width) * 100}%`, height: `${(u.crop.height / u.height) * 100}%` }} />}
                {drawing === u.id && (
                  <DrawLayer
                    onDone={(f) => {
                      setDrawing(null);
                      if (f.width > 0.04 && f.height > 0.04) patchUpload(u.id, { mode: 'crop', crop: { x: Math.round(f.x * u.width), y: Math.round(f.y * u.height), width: Math.round(f.width * u.width), height: Math.round(f.height * u.height) } });
                    }}
                  />
                )}
              </div>
              <div className="rf-upload-body">
                <p className="small"><strong>{u.name}</strong> <span className="muted">{u.width} × {u.height}</span></p>
                {u.mode === 'grid' && u.grid && (
                  <>
                    <p className="small" role="status">This looks like a grid of {u.grid.cells.length} slides ({u.grid.cols} across, {u.grid.rows} down; found by {u.grid.method}). Use all, or pick the ones to learn from. {u.ticked.filter(Boolean).length} of {u.grid.cells.length} are ticked.</p>
                    <div className="cr-photo-actions">
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => patchUpload(u.id, { ticked: u.grid!.cells.map(() => true) })}>Use all</button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => patchUpload(u.id, { ticked: u.grid!.cells.map(() => false) })}>Untick all</button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => patchUpload(u.id, { mode: 'single', crop: null })}>It is a single image</button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setDrawing(u.id)}>Draw one rectangle</button>
                    </div>
                  </>
                )}
                {u.mode === 'single' && (
                  <>
                    <p className="small" role="status">{u.grid ? 'Using the whole image as one slide.' : 'This looks like a single image.'}</p>
                    <div className="cr-photo-actions">
                      {u.grid && <button type="button" className="btn btn-outline btn-sm" onClick={() => patchUpload(u.id, { mode: 'grid' })}>Use the {u.grid.cells.length} slides it found</button>}
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setDrawing(u.id)}>Draw one rectangle</button>
                    </div>
                  </>
                )}
                {u.mode === 'crop' && (
                  <>
                    <p className="small" role="status">Using only the rectangle you drew.</p>
                    <div className="cr-photo-actions">
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setDrawing(u.id)}>Draw it again</button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => patchUpload(u.id, { mode: 'single', crop: null })}>Use the whole image</button>
                    </div>
                  </>
                )}
                {drawing === u.id && <p className="small muted" role="status">Drag over the slide you want.</p>}
                <label className="cr-inline">
                  <span className="field-label">Learn from this image</span>
                  <select className="plain-select cr-select" value={u.learn} aria-label={`Learn from ${u.name}`} onChange={(e) => patchUpload(u.id, { learn: e.target.value as LearnFrom })}>
                    {(Object.keys(LEARN_LABEL) as LearnFrom[]).map((l) => (
                      <option key={l} value={l}>{LEARN_LABEL[l]}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => removeUpload(u.id)} aria-label={`Remove ${u.name}`}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card rf-sec" aria-labelledby="rf-set-h">
        <h2 id="rf-set-h" className="h3">2. What it is for</h2>
        <div className="tn-field">
          <span className="field-label" id="rf-target-l">Make it for</span>
          <div role="radiogroup" aria-labelledby="rf-target-l" className="chip-group">
            {(['carousel', 'thumbnail', 'both'] as Target[]).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={target === t} className="chip-btn" onClick={() => setTarget(t)}>{TARGET_LABEL[t]}</button>
            ))}
          </div>
        </div>
        <label className="tn-field">
          <span className="field-label">Name the style</span>
          <input className="input" value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} placeholder="My bold poster look" />
        </label>
        <label className="cr-inline">
          <span className="field-label">What it does not learn stays as in</span>
          <select className="plain-select cr-select" value={baseName} onChange={(e) => setBaseName(e.target.value)} aria-label="Base style">
            {baseOptions.map((s) => (
              <option key={s.spec.name} value={s.spec.name}>{s.spec.title}</option>
            ))}
          </select>
        </label>
        <label className="tn-field">
          <span className="field-label">Sample title for thumbnails</span>
          <input className="input" value={sampleTitle} maxLength={60} onChange={(e) => setSampleTitle(e.target.value)} />
        </label>
        <div className="cr-photo-actions">
          <label className="btn btn-outline btn-sm">
            {samplePic ? `Sample photo: ${samplePic.name}` : 'Use my own photo for the samples (optional)'}
            <input type="file" accept="image/*" className="visually-hidden" aria-label="Choose a photo for the samples" onChange={(e) => { void pickSample(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <span className="small muted">{samplePic ? 'It stays in memory only.' : 'Without one, a built-in drawn landscape is used.'}</span>
        </div>
        {readers && readers.length === 0 && <p className="small cr-warn" role="status">No reader is connected, so “Read references” is off. Start the app with the dev server (it uses Claude Code on this computer) or give the server an API key (see the server notes).</p>}
        {readers && readers.length > 0 && <p className="small muted" role="status">Reader: {readers[0].label}.</p>}
        <div className="cr-photo-actions">
          <button type="button" className="btn btn-primary btn-sm" disabled={!canRead} onClick={() => void read()}>Read references</button>
          {busy && <button type="button" className="btn btn-outline btn-sm" onClick={() => abort.current?.abort()}>Cancel</button>}
        </div>
        {phase && <p className="small" role="status" aria-live="polite">{phase}</p>}
        {problem && (
          <div className="cr-problem small" role="alert">
            <p>{problem.message}</p>
            {problem.details.length > 0 && <ul>{problem.details.slice(0, 6).map((d) => <li key={d}>{d}</li>)}</ul>}
          </div>
        )}
      </section>

      {items.length > 0 && (
        <section className="card rf-sec" aria-labelledby="rf-measured-h">
          <h2 id="rf-measured-h" className="h3">3. What the code measured <span className="chip chip-tag">MEASURED</span></h2>
          <p className="small muted">Numbers taken from the pixels, with no model. Colours, shares of the frame and a few yes-or-no looks. They are heuristics: a photo-heavy picture can fool the text and margin readings.</p>
          <div className="rf-measured">
            {items.map((it, i) => (
              <details key={it.id} open={i === 0}>
                <summary className="small">{it.name} <span className="muted">({LEARN_LABEL[it.learn]})</span></summary>
                <dl className="rf-dl">
                  {measured[i] && describeMeasured(measured[i]).map((r) => (
                    <div key={r.label}><dt>{r.label}</dt><dd>{r.value} <span className="chip chip-tag">MEASURED</span></dd></div>
                  ))}
                </dl>
              </details>
            ))}
          </div>
        </section>
      )}

      {showRounds && (
        <section className="card rf-sec" aria-labelledby="rf-rounds-h">
          <h2 id="rf-rounds-h" className="h3">4. The replica, round by round</h2>
          {timing && <p className="small muted" role="status">{timing}{attempts === 2 ? ' The reader’s first answer had to be corrected once.' : ''}</p>}
          {notes && <p className="small">The reader says: {notes}</p>}
          <ol className="rf-rounds" aria-label="Rounds">
            {rounds.map((r, i) => (
              <li key={r.n} className={`card rf-round${i === picked ? ' chosen' : ''}`} aria-label={`Round ${i}: ${r.label}`}>
                <div className="rf-round-head">
                  <h3 className="h4">{i === 0 ? 'First replica' : r.label}</h3>
                  <span className="small muted">Measured {Math.round(r.similarity.total * 100)}%: colours {Math.round(r.similarity.palette * 100)}%, text places {Math.round(r.similarity.zones * 100)}%, title size {Math.round(r.similarity.title * 100)}%{r.judgement ? `; the reader scores it ${Math.round(r.judgement.score)}/100` : ''}. Score {Math.round(r.score * 100)}.</span>
                  {rounds.length > 1 && i === rounds.reduce((b, x, k) => (x.score > rounds[b].score ? k : b), 0) && <span className="chip chip-ok">Best so far</span>}
                  <button type="button" className="btn btn-outline btn-sm" aria-pressed={i === picked} onClick={() => setPicked(i)}>{i === picked ? 'Using this round' : 'Use this round'}</button>
                </div>
                {r.madeBy.length > 0 && <p className="small muted">Changes from the round before: {r.madeBy.map((p) => `${p.path} → ${typeof p.value === 'object' ? 'a list of changes' : String(p.value)}`).slice(0, 6).join('; ')}.</p>}
                {r.note && <p className="small cr-warn">{r.note}</p>}
                <div className="rf-pairs">
                  {r.replicas.slice(0, 4).map((rep) => {
                    const it = items.find((x) => x.id === rep.itemId);
                    return (
                      <figure key={rep.itemId} className="rf-pair">
                        <div className="rf-pair-imgs">
                          {it && <img src={it.dataUrl} alt={`Reference: ${it.name}`} />}
                          <img src={rep.url} alt={`Our version (${rep.what})`} />
                        </div>
                        <figcaption className="small muted">Reference on the left, ours on the right ({rep.what}).</figcaption>
                      </figure>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
          {rounds.length > 0 && (
            <div className="rf-feedback">
              <label className="tn-field">
                <span className="field-label">Tell it what to change (for example “bigger title”, “less blur”, “more space”)</span>
                <input className="input" value={feedback} onChange={(e) => setFeedback(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void adjust()} aria-label="Your feedback" />
              </label>
              <button type="button" className="btn btn-outline btn-sm" disabled={!feedback.trim() || busy || !readers?.length} onClick={() => void adjust()}>Adjust</button>
            </div>
          )}
        </section>
      )}

      {close && chosen && (
        <section className="card rf-sec" aria-labelledby="rf-close-h">
          <h2 id="rf-close-h" className="h3">5. How close it got</h2>
          <p className="small" role="status">{close.summary}</p>
          {close.singleImage && <p className="small"><strong>{close.singleImage}</strong></p>}
          <div className="rf-close">
            <div>
              <h3 className="h4">Matched (measured)</h3>
              <ul>{close.matched.length ? close.matched.map((m) => <li key={m} className="small">{m}</li>) : <li className="small muted">Nothing met the bar.</li>}</ul>
            </div>
            <div>
              <h3 className="h4">Approximated</h3>
              <ul>{close.approximated.length ? close.approximated.map((m) => <li key={m} className="small">{m}</li>) : <li className="small muted">Nothing.</li>}{close.reader?.approximated.map((m) => <li key={m} className="small">The reader: {m}</li>)}</ul>
            </div>
            <div>
              <h3 className="h4">Extrapolated</h3>
              <ul>{close.extrapolated.length ? <li className="small">These slide types were not in your references, so the style made them up from what it saw: {close.extrapolated.join(', ')}.</li> : <li className="small muted">Every slide type was shown by a reference.</li>}</ul>
            </div>
            <div>
              <h3 className="h4">Missing: what our toolbox cannot draw</h3>
              <ul aria-label="Missing tools">{close.missing.length ? close.missing.map((m) => <li key={m.tool} className="small"><strong>{m.tool}</strong>{m.why ? `: ${m.why}` : ''}{m.images?.length ? ` (${m.images.join(', ')})` : ''}</li>) : <li className="small muted">The reader found nothing missing.</li>}{close.reader?.missing.map((m) => <li key={m} className="small">The reader: {m}</li>)}</ul>
            </div>
          </div>
        </section>
      )}

      {chosen && (
        <section className="card rf-sec" aria-labelledby="rf-save-h">
          <h2 id="rf-save-h" className="h3">6. Save as a template</h2>
          <p className="small muted">Saves the style (not your references) in this browser with a preview. It then shows up in the style pickers for {target === 'carousel' ? 'carousels' : target === 'thumbnail' ? 'Make a thumbnail' : 'carousels and Make a thumbnail'}, tagged “Mine”.</p>
          <div className="cr-photo-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={!!saved || busy} onClick={() => void save()}>Save as template</button>
            {saved && <span className="small" role="status">Saved “{saved.name}”. <Link to="/images/styles">See your templates</Link>.</span>}
          </div>
          {templateProblem() && <p className="small cr-problem" role="alert">{templateProblem()}</p>}
        </section>
      )}
    </div>
  );
}

/** A transparent layer over an image that lets the person drag out one rectangle. */
function DrawLayer({ onDone }: { onDone: (f: { x: number; y: number; width: number; height: number }) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [a, setA] = useState<{ x: number; y: number } | null>(null);
  const [b, setB] = useState<{ x: number; y: number } | null>(null);
  const at = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const box = a && b ? { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) } : null;
  return (
    <div
      ref={ref}
      className="rf-draw"
      data-testid="draw-layer"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = at(e);
        setA(p);
        setB(p);
      }}
      onPointerMove={(e) => a && setB(at(e))}
      onPointerUp={() => box && onDone(box)}
    >
      {box && <span className="rf-draw-box" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} />}
    </div>
  );
}

// Used by tests and the Results screen.
export { rankMissing, slug as referenceSlug, SLIDE_TYPES };
