// Images > Make a carousel. Topic to an editable, exportable carousel (or quote cards), with the real image engine in the browser.
// No keys and no network calls: the script is written by Claude in any chat and pasted here (or loaded from the example).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { composeStyled, type StyledSlide } from '../image-engine/styles/compose';
import { useDocumentTitle } from '../useDocumentTitle';
import { validateScript, validateScriptText, exampleScript, formatOf, scriptPrompt, SLIDE_RANGE, type Format, type ScriptResult } from './script';
import { DEFAULT_OPTIONS, patches } from './doc';
import { MakeIt, runGenerate, useWriters, type GenState } from './MakeIt';
import { pickStyle } from './pickStyle';
import { type WriteRequest } from './writerPrompt';
import { downloadBlob, exportAllAsZip, slideFileName, zipFileName } from './export';
import { carouselStyles, composeDoc, getStyles, pickShuffleSalt, renderer, styleByName, type Rendered } from './render';
import { MatchPanel } from '../reference/MatchPanel';
import { ACTIVE_STYLE, useActiveReference } from '../reference/active';
import { sizeOf as sizeOfPic, urlOf as urlOfPic } from './photoLibrary';
import { ensureTemplatesLoaded, isUserStyle, targetWarning, useTemplatesVersion } from '../reference/templates';
import { platformOf, platformWarning } from './platform';
import { PhotosStrip } from './PhotosStrip';
import { CutoutEditor, type CutoutSaved } from './CutoutEditor';
import { cutoutPicture, useCutoutIds } from './cutoutAction';
import { listCutouts, putCutout, type CutoutRecord } from '../image-engine/cutout/cutoutStore';
import type { AddFiles } from './PhotoControls';
import { PictureError, addPicture, currentStorageProblem, hydrate, removePicture, storageRoomNote, useLibraryVersion, type PictureMeta } from './photoLibrary';
import { SlideCard, type SlideView } from './SlideCard';
import { Group, PreviewStage, useGroups } from './Studio';
import { PASTE_KEY, readStore, useProject, writeStore } from './useProject';
import { onCancel, startJob, type JobHandle } from '../live/jobs';
import '../styles/carousel.css';

const DEFAULT_STYLE = 'editorial-collage';

// ---------- style picker with a small preview of each style ----------

function StylePicker({ format, value, auto, onAuto, onPick }: { format: Format; value: string; auto: boolean; onAuto: () => void; onPick: (name: string, title: string) => void }) {
  useTemplatesVersion();
  const styles = carouselStyles();
  const { problems } = getStyles();
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    const f = formatOf(format);
    (async () => {
      for (const st of styles) {
        const key = `${format}:${st.spec.name}`;
        if (previews[key]) continue;
        const sample =
          format === 'quote'
            ? { id: 'preview', brand: { handle: '@yourname' }, slides: [{ type: 'quote' as const, quote: 'Clear beats clever, every single time.', by: 'An editor', highlight: 'Clear' }] }
            : { id: 'preview', brand: { handle: '@yourname' }, slides: [{ type: 'cover' as const, kicker: 'Example', headline: 'A headline that makes people stop', sub: 'And a line that makes them swipe.', highlight: 'stop' }] };
        const slide = composeStyled(sample, st, { width: f.width, height: f.height, chrome: format === 'quote' ? 'none' : undefined }, true)[0];
        const blob = await renderer.preview(slide.plan, 0.2);
        if (!live) return;
        setPreviews((p) => ({ ...p, [key]: URL.createObjectURL(blob) }));
      }
    })().catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, styles]);
  return (
    <>
      <ul className="grid cr-styles" aria-label="Styles">
        <li>
          <button type="button" className="card start-opt cr-style cr-auto" aria-pressed={auto} onClick={onAuto}>
            <strong>Pick for me</strong>
            <span className="small muted">The writer chooses the style that suits your text and tone.</span>
          </button>
        </li>
        {styles.map((st) => {
          const img = previews[`${format}:${st.spec.name}`];
          return (
            <li key={st.spec.name}>
              <button type="button" className="card start-opt cr-style" aria-pressed={!auto && value === st.spec.name} onClick={() => onPick(st.spec.name, st.spec.title)}>
                <span className={`cr-style-pic r${format === 'quote' ? '1-1' : '4-5'}`}>{img ? <img src={img} alt={`Preview of the ${st.spec.title} style`} /> : <span className="small muted" role="status">Drawing…</span>}</span>
                <strong>{st.spec.title}</strong>
                <span className="small muted">{isUserStyle(st.spec.name) ? 'Made from your references' : st.spec.name}</span>
                {isUserStyle(st.spec.name) && <span className="chip chip-tag">Mine</span>}
                {auto && value === st.spec.name && <span className="chip chip-tag">In use</span>}
                {st.warnings.some((w) => /phone-size checker needs at least 32 px/.test(w)) && <span className="chip chip-warn">Some text is below phone size</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {problems.length > 0 && (
        <div className="notice notice-warn" role="status">
          <strong>{problems.length} style folder{problems.length > 1 ? 's were' : ' was'} not loaded</strong>
          <span>{problems.map((p) => `${p.folder}: ${p.messages[0]}`).join(' ')}</span>
        </div>
      )}
    </>
  );
}

// ---------- full-size viewer ----------

function FullSize({ items, at, onClose, onMove }: { items: { url: string; alt: string }[]; at: number | null; onClose: () => void; onMove: (i: number) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (at !== null && !d.open) d.showModal();
    if (at === null && d.open) d.close();
  }, [at]);
  const item = at !== null ? items[at] : undefined;
  return (
    <dialog
      ref={ref}
      className="cr-dialog"
      aria-label="Slide at full size"
      onClose={onClose}
      onKeyDown={(e) => {
        if (at === null) return;
        if (e.key === 'ArrowRight' && at < items.length - 1) onMove(at + 1);
        if (e.key === 'ArrowLeft' && at > 0) onMove(at - 1);
      }}
    >
      <div className="cr-dialog-bar">
        <span className="small" role="status">{at !== null ? `Slide ${at + 1} of ${items.length}` : ''}</span>
        <button type="button" className="btn btn-outline btn-sm" disabled={at === null || at === 0} onClick={() => at !== null && onMove(at - 1)}>Previous</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={at === null || at >= items.length - 1} onClick={() => at !== null && onMove(at + 1)}>Next</button>
        <button type="button" className="btn btn-dark btn-sm" onClick={onClose}><Icon name="close" size={16} /> Close</button>
      </div>
      {item && <img src={item.url} alt={item.alt} className="cr-dialog-img" />}
    </dialog>
  );
}

// ---------- the page ----------

export default function CarouselPage() {
  useDocumentTitle('Make a carousel');
  const proj = useProject(styleByName(DEFAULT_STYLE) ? DEFAULT_STYLE : getStyles().styles[0]?.spec.name ?? DEFAULT_STYLE);
  const { project, apply, undo, redo, setTopic, setOptions, setPhotos, startOver } = proj;
  const { doc, past, future } = project;
  const options = { ...DEFAULT_OPTIONS, ...doc.options };
  const style = styleByName(doc.style);
  const pictures = doc.photos ?? [];
  const libVersion = useLibraryVersion();
  const tplVersion = useTemplatesVersion();
  const refVersion = useActiveReference().version;
  useEffect(() => {
    void ensureTemplatesLoaded();
  }, []);
  const hasPhotoStyle = !!style?.spec.photo;
  const [lowRoom, setLowRoom] = useState('');
  // After a refresh the pictures come back out of the browser's storage.
  useEffect(() => {
    void hydrate(pictures);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pasted text (kept across refreshes) and its live check
  const [pasted, setPasted] = useState(() => readStore(PASTE_KEY) ?? '');
  const [check, setCheck] = useState<ScriptResult | null>(null);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [gen, setGen] = useState<GenState>({ phase: 'idle' });
  /** The Live view's record of a generation: writing, checking, then drawing the slides. */
  const genJob = useRef<JobHandle | null>(null);
  const providers = useWriters();
  const provider = providers?.[0] ?? null;
  const abort = useRef<AbortController | null>(null);
  const busy = gen.phase === 'writing' || gen.phase === 'retrying' || gen.phase === 'drawing';
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    writeStore(PASTE_KEY, pasted || null);
    if (!pasted.trim()) return setCheck(null);
    const t = window.setTimeout(() => setCheck(validateScriptText(pasted, doc.format)), 350);
    return () => window.clearTimeout(t);
  }, [pasted, doc.format]);

  const prompt = useMemo(() => scriptPrompt(doc.topic, doc.format), [doc.topic, doc.format]);

  const useScript = (text: string) => {
    const r = validateScriptText(text, doc.format);
    setCheck(r);
    if (!r.script) return false;
    const done = apply(patches.useScript(r.script));
    if (!done.ok) return false;
    setPasted('');
    setCheck(null);
    setOptions({ autoStyle: false });
    setAdvanced(false);
    setNotice(`Script loaded: ${r.script.slides.length} ${doc.format === 'quote' ? 'quote card' : 'slide'}${r.script.slides.length === 1 ? '' : 's'}${r.warnings.length ? `, with ${r.warnings.length} suggestion${r.warnings.length > 1 ? 's' : ''} to review` : ''}. Edit any slide below.`);
    return true;
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied('Prompt copied. Paste it into a Claude chat, then paste Claude’s answer below.');
    } catch {
      setShowPrompt(true);
      setCopied('Your browser blocked copying. The prompt is shown below: select it and copy it.');
    }
  };

  // ---------- compose and draw ----------
  const [views, setViews] = useState<Record<number, SlideView>>({});
  const g = useGroups();
  const [sel, setSel] = useState(0);
  const [slides, setSlides] = useState<StyledSlide[]>([]);
  const [margin, setMargin] = useState(80);
  const urls = useRef(new Map<Blob, string>());
  const token = useRef(0);
  const urlFor = (b: Blob) => {
    let u = urls.current.get(b);
    if (!u) urls.current.set(b, (u = URL.createObjectURL(b)));
    return u;
  };
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  useEffect(() => {
    const mine = ++token.current;
    let composed: ReturnType<typeof composeDoc>;
    try {
      composed = composeDoc(doc);
      setError('');
    } catch (e) {
      setError((e as Error).message);
      setSlides([]);
      return;
    }
    setSlides(composed.slides);
    setMargin(composed.margin);
    composed.slides.forEach((s, i) => {
      renderer
        .render(s, composed.margin)
        .then((r: Rendered) => token.current === mine && setViews((v) => ({ ...v, [i]: { status: 'ready', rendered: r, url: urlFor(r.png) } })))
        .catch((e: Error) => token.current === mine && setViews((v) => ({ ...v, [i]: { ...v[i], status: 'error', error: `This slide could not be drawn: ${e.message}` } })));
    });
    // Slides that are being redrawn keep their old picture until the new one is ready.
    setViews((v) => Object.fromEntries(Object.entries(v).filter(([k]) => Number(k) < composed.slides.length).map(([k, x]) => [k, { ...x, status: 'drawing' as const }])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.script, doc.style, doc.format, doc.choices, doc.photos, libVersion, tplVersion, refVersion]);

  /** Adds files to the project's pictures. Unusable files are reported in plain words and skipped; the rest are added. */
  /** Remove background: the cutout is made by the cutout provider, the original and the cutout are kept in IndexedDB, and the cutout is added as an object. */
  const makeCutout = async (id: string): Promise<string> => {
    const msg = await cutoutPicture(id, async (file) => {
      const res = await addFiles([file], 'object');
      const first = res.added[0] as unknown;
      return { id: typeof first === 'string' ? first : (first as { id?: string } | undefined)?.id, messages: res.messages };
    });
    cutouts.refresh();
    return msg;
  };
  const cutouts = useCutoutIds();
  const [editing, setEditing] = useState<CutoutRecord | null>(null);
  const editCutout = async (pictureId: string) => {
    const rec = (await listCutouts()).find((r) => r.pictureId === pictureId);
    if (rec) setEditing(rec);
  };
  const saveEdited = async (r: CutoutSaved) => {
    const res = await addFiles([new File([r.cutout], `${r.record.name}-edited.png`, { type: 'image/png' })], 'object');
    const first = res.added[0] as unknown;
    const id = typeof first === 'string' ? first : (first as { id?: string } | undefined)?.id;
    if (id) await putCutout({ ...r.record, pictureId: id });
    cutouts.refresh();
    setEditing(null);
  };
  const addFiles: AddFiles = async (files, kind) => {
    const added: PictureMeta[] = [];
    const messages: string[] = [];
    for (const f of files) {
      try {
        const r = await addPicture(f, kind);
        added.push(r.meta);
        messages.push(...r.notes);
      } catch (e) {
        messages.push(e instanceof PictureError ? e.message : `"${f.name}" could not be added: ${(e as Error).message}`);
      }
    }
    if (added.length) setPhotos((before) => [...before, ...added]);
    const prob = currentStorageProblem();
    if (prob) messages.push(prob);
    setLowRoom(await storageRoomNote());
    return { added, messages };
  };
  const usedOn = (id: string) => slides.filter((s) => s.plan.meta?.photoSlots?.some((p) => p.photo === id)).length + Object.values(doc.choices).filter((c) => c.object?.id === id).length;
  const removePictureEverywhere = async (id: string) => {
    const n = usedOn(id);
    if (n > 0 && !window.confirm(`This picture is on ${n} slide${n === 1 ? '' : 's'}. Remove it anyway? Those slides go back to filling their photo from your list.`)) return;
    const ops = Object.entries(doc.choices).flatMap(([k, c]) => [...(c.photo?.id === id ? [{ path: ['choices', k, 'photo', 'id'] as (string | number)[], value: undefined }] : []), ...(c.object?.id === id ? [{ path: ['choices', k, 'object'] as (string | number)[], value: undefined }] : [])]);
    if (ops.length) apply({ label: 'Remove a picture from its slides', ops });
    await removePicture(id);
    setPhotos((before) => before.filter((p) => p.id !== id));
  };

  const deck = doc.script?.title ?? 'carousel';
  const ready = slides.length > 0 && slides.every((_, i) => views[i]?.rendered && views[i].status === 'ready');
  const failing = slides.filter((_, i) => views[i]?.rendered?.lint.some((l) => !l.pass)).length;

  const downloadOne = async (i: number) => {
    const r = await renderer.render(slides[i], margin);
    downloadBlob(r.png, slideFileName(deck, i));
    setNotice(`Downloaded ${slideFileName(deck, i)}.`);
  };
  const downloadAll = useCallback(async () => {
    setExporting(`Preparing ${slides.length} slides…`);
    try {
      const blobs: Blob[] = [];
      for (const s of slides) blobs.push((await renderer.render(s, margin)).png);
      const zip = await exportAllAsZip(deck, blobs);
      downloadBlob(zip, zipFileName(deck));
      setNotice(`Downloaded ${zipFileName(deck)} with ${blobs.length} PNG files.`);
    } catch (e) {
      setError(`Could not make the zip: ${(e as Error).message}`);
    } finally {
      setExporting('');
    }
  }, [slides, margin, deck]);

  // Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z, but never while typing in a field (the field has its own undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const pickFormat = (f: Format) => {
    if (f === doc.format) return;
    const clear = !!doc.script && validateScript(doc.script, f).errors.length > 0;
    apply(patches.format(f, clear));
    setNotice(clear ? 'Changed the format. The script was for the other format, so it was cleared: Undo brings it back.' : '');
  };

  const GEN_LABEL = 'Generate from your text';
  const generate = async () => {
    if (!provider || busy) return;
    const ctl = new AbortController();
    abort.current = ctl;
    const [lo, hi] = SLIDE_RANGE[doc.format];
    const req: WriteRequest = {
      text: doc.topic,
      // A chosen platform sets a ceiling; the count asked for is capped to it (the chip says so).
      slides: Math.min(hi, Math.max(lo, options.slides), doc.format === 'carousel' ? platformOf(options.platform)?.max ?? hi : hi),
      tone: options.tone,
      format: doc.format,
      styleChoice: options.autoStyle ? 'auto' : doc.style,
      styles: carouselStyles().map((x) => ({ name: x.spec.name, title: x.spec.title, description: x.spec.description })),
    };
    setGen({ phase: 'writing' });
    setNotice('');
    const job = startJob('one-shot-carousel', `Carousel from ${doc.topic.trim().split(/s+/).length} words of text, ${options.slides} slides`, [{ id: 'write', label: 'Ask the writer for the script' }, { id: 'apply', label: 'Check the script and pick a style' }, { id: 'draw', label: 'Draw the slides' }]);
    genJob.current = job;
    onCancel(job.id, () => ctl.abort());
    job.begin('write');
    job.waiting('the writer');
    const r = await runGenerate(req, provider, ctl.signal, (phase) => setGen({ phase }));
    job.waiting(null);
    abort.current = null;
    if (!r.ok) {
      job.fail('write', r.state.message ?? 'the writer did not answer');
      job.finish(r.state.message?.startsWith('Cancelled') ? 'cancelled' : 'failed', r.state.message);
      genJob.current = null;
      return setGen(r.state);
    }
    job.end('write', r.result.attempts === 2 ? 'needed a second try' : undefined);
    job.begin('apply');
    const { result } = r;
    const known = carouselStyles().map((x) => x.spec.name);
    // "Pick for me": scored from the tone, the words of the text and the slide types; the writer's own suggestion counts one point.
    const pick = options.autoStyle ? pickStyle({ text: doc.topic, tone: options.tone, slideTypes: result.script.slides.map((x) => x.type), styles: carouselStyles(), writerSuggestion: result.style && known.includes(result.style) ? result.style : null }) : null;
    const style = pick ? pick.name : null;
    const withHandle = { ...result.script, brand: { ...result.script.brand, handle: options.handle.trim() || result.script.brand.handle } };
    const done = apply(patches.generate(withHandle, style, GEN_LABEL));
    if (!done.ok) {
      job.fail('apply', done.reasons[0]);
      job.finish('failed', done.reasons[0]);
      genJob.current = null;
      return setGen({ phase: 'error', message: 'The script could not be used: ' + done.reasons[0] + ' Your text is kept.' });
    }
    job.end('apply', pick ? `style: ${pick.name}` : undefined);
    job.begin('draw');
    setGen({ phase: 'drawing', note: result.note, ms: result.ms, attempts: result.attempts, provider: result.provider, warnings: result.warnings, message: `Drawing slide 1 of ${result.script.slides.length}…`, styleWhy: pick?.why });
  };
  const cancel = () => {
    if (gen.phase === 'drawing') {
      if (past[past.length - 1]?.label === GEN_LABEL) undo();
      genJob.current?.finish('cancelled', 'Cancelled while drawing.');
      genJob.current = null;
      setGen({ phase: 'idle', message: 'Cancelled. Your text is kept and the previous slides are back.' });
      return;
    }
    abort.current?.abort();
  };

  // Progress while the slides are drawn, then the summary line.
  const drawnCount = slides.filter((_, i) => views[i]?.rendered && views[i].status === 'ready').length;
  useEffect(() => {
    if (gen.phase !== 'drawing' || slides.length === 0) return;
    if (drawnCount >= slides.length) {
      if (genJob.current) {
        genJob.current.end('draw', `${slides.length} slides`);
        genJob.current.plan();
        genJob.current.finish('done');
        genJob.current = null;
      }
      const note = gen.note ? ` Note from the writer: ${gen.note}` : '';
      const retry = gen.attempts === 2 ? ' It needed a second try.' : '';
      const why = gen.styleWhy ? ` Style: ${gen.styleWhy}` : '';
      const handle = options.handle.trim() ? '' : ' The last slide shows the placeholder @yourname: type your handle above to replace it.';
      setGen((g) => ({ ...g, phase: 'done', message: `Done: ${slides.length} ${doc.format === 'quote' ? 'cards' : 'slides'} in ${((gen.ms ?? 0) / 1000).toFixed(0)} s of writing.${retry}${why}${note}${handle} Edit anything below.` }));
    } else setGen((g) => (g.phase === 'drawing' ? { ...g, message: `Drawing slide ${drawnCount + 1} of ${slides.length}…` } : g));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawnCount, slides.length, gen.phase]);

  const lastLabel = past[past.length - 1]?.label;
  const nextLabel = future[0]?.label;
  const openItems = slides.map((s, i) => ({ url: views[i]?.url ?? '', alt: `${deck}, slide ${i + 1}: ${s.type}` }));
  const hasWork = !!doc.script;

  return (
    <div className="page page-tight cr-studio">
      <header className="page-header">
        <div className="page-header-text">
          <p className="small"><Link to="/images">← Back to Images</Link></p>
          <h1 className="page-title">Make a carousel</h1>
          <p className="lead">Paste your text, press Generate, then edit anything. The slides are drawn in your browser; your text goes to the writer only when you press Generate.</p>
        </div>
      </header>
      <p className="visually-hidden" role="status" aria-live="polite">{notice}</p>

      <div className="cr-grid">
        <aside className="cr-preview" aria-label="Preview">
          <section aria-labelledby="cr-slides-h" className="cr-slides-sec">
        <div className="cr-toolbar">
          <h2 id="cr-slides-h" className="h3">{hasWork ? `Your ${doc.format === 'quote' ? 'cards' : 'slides'}` : '4. Your slides'}</h2>
          <div className="row-actions" role="toolbar" aria-label="Project actions">
            <button type="button" className="btn btn-outline btn-sm cr-quiet" onClick={undo} disabled={past.length === 0} title="Ctrl+Z (when no text field is focused)">
              Undo{lastLabel ? `: ${lastLabel}` : ''}
            </button>
            <button type="button" className="btn btn-outline btn-sm cr-quiet" onClick={redo} disabled={future.length === 0} title="Shift+Ctrl+Z">
              Redo{nextLabel ? `: ${nextLabel}` : ''}
            </button>
            <button type="button" className="btn btn-dark btn-sm" onClick={downloadAll} disabled={!ready || !!exporting}>
              <Icon name="upload" size={14} /> Download all (zip)
            </button>
            <details className="cr-more" open={g.all}>
              <summary className="btn btn-outline btn-sm cr-quiet">More</summary>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={!hasWork && !doc.topic}
              onClick={() => {
                if (window.confirm('Start over? This removes the script, every edit and your pictures from this browser.')) {
                  pictures.forEach((p) => void removePicture(p.id));
                  startOver(doc.style);
                  setNotice('Started over.');
                }
              }}
            >
              Start over
            </button>
            </details>
          </div>
        </div>
        <p className="small muted" role="status" aria-live="polite">
          {exporting || (proj.saveFailed ? 'This browser would not save the project. Download your slides before you leave.' : proj.saved)}
          {hasWork && ready && !exporting && ` ${failing === 0 ? 'Every slide passes the phone-size check.' : `${failing} of ${slides.length} slides have something to fix at phone size.`}`}
        </p>

            <PreviewStage count={hasWork ? slides.length : 0} items={slides.map((_, i) => views[i] ?? { status: 'drawing' })} selected={sel} onSelect={setSel} onOpen={setOpen} />
          </section>
        </aside>
        <div className="cr-controls">
      {error && (
        <div className="notice notice-error" role="alert">
          <strong>Something went wrong</strong>
          <span>{error}</span>
        </div>
      )}

          <div className="cr-groups-tools">
            <button type="button" className="btn btn-outline btn-sm cr-quiet" aria-pressed={g.all} onClick={() => g.setAll(!g.all)}>{g.all ? 'One group at a time' : 'Open all groups'}</button>
          </div>
          <Group id="content" title="Content" hint="Text, format, photos" g={g}>
      <MakeIt
        doc={doc}
        options={options}
        setTopic={setTopic}
        setOptions={(o) => setOptions(o)}
        onFormat={(f) => {
          pickFormat(f);
          const [lo, hi] = SLIDE_RANGE[f];
          setOptions({ slides: f === 'quote' ? 3 : 7 > hi ? hi : 7 < lo ? lo : 7 });
        }}
        onHandle={(h) => {
          setOptions({ handle: h });
          if (doc.script) apply(patches.handle(h.trim() || '@yourname'));
        }}
        busy={busy}
        gen={gen}
        onGenerate={generate}
        onCancel={cancel}
        provider={provider}
        providers={providers}
        styles={null}
      />

      <details className="card ws-card cr-advanced" open={advanced} onToggle={(e) => setAdvanced((e.target as HTMLDetailsElement).open)}>
        <summary className="h4">Advanced: write the script yourself</summary>
        <div className="create-form">
          <p className="small muted">Copy a prompt for Claude, paste it in any Claude chat, then paste the JSON it returns here. Or try the example script.</p>
          <div className="row-actions">
            <button type="button" className="btn btn-dark btn-lg" onClick={copyPrompt}>Copy prompt for Claude</button>
            <button type="button" className="btn btn-outline btn-lg" onClick={() => useScript(exampleScript(doc.format))}>Try an example script</button>
          </div>
          <p className="small" role="status" aria-live="polite">{copied}</p>
          <details open={showPrompt} onToggle={(e) => setShowPrompt((e.target as HTMLDetailsElement).open)}>
            <summary className="small">Show the prompt</summary>
            <textarea className="cr-prompt" readOnly rows={10} value={prompt} aria-label="The prompt to paste into Claude" onFocus={(e) => e.currentTarget.select()} />
          </details>
          <label className="field">
            <span className="field-label">Paste the script Claude wrote (JSON)</span>
            <textarea className="cr-paste" rows={8} value={pasted} onChange={(e) => setPasted(e.target.value)} spellCheck={false} placeholder='{ "title": "…", "slides": [ … ] }' aria-describedby="cr-check" />
          </label>
          <div id="cr-check" aria-live="polite">
            {check && check.errors.length > 0 && (
              <div className="notice notice-error" role="alert">
                <strong>{check.errors.length} problem{check.errors.length > 1 ? 's' : ''} to fix before this script can be used</strong>
                <ul className="cr-issues">
                  {check.errors.map((e, i) => (
                    <li key={i}>
                      {e.message} {e.path && <span className="muted">(in the JSON: <code>{e.path}</code>)</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {check && check.errors.length === 0 && (
              <div className="notice notice-ok" role="status">
                <strong>This script looks good: {check.script?.slides.length} {doc.format === 'quote' ? 'cards' : 'slides'}</strong>
                {doc.format === 'carousel' && check.script && platformWarning(check.script.slides.length, options.platform) && <p className="small cr-problem">{platformWarning(check.script.slides.length, options.platform)}</p>}
                {check.warnings.length > 0 && (
                  <ul className="cr-issues">
                    {check.warnings.map((w, i) => (
                      <li key={i}>
                        {w.message} <span className="muted">(<code>{w.path}</code>)</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="row-actions">
            <button type="button" className="btn btn-dark btn-lg" disabled={!check || check.errors.length > 0} onClick={() => useScript(pasted)}>Use this script</button>
          </div>
        </div>
      </details>

      <PhotosStrip pictures={pictures} supported={hasPhotoStyle} styleTitle={style?.spec.title ?? 'This style'} addFiles={addFiles} onRemove={(id) => void removePictureEverywhere(id)} onCutout={makeCutout} editableCutouts={cutouts.ids} onEditCutout={(id) => void editCutout(id)} usedOn={usedOn} storageProblem={currentStorageProblem()} lowRoom={lowRoom} />
      {editing && <CutoutEditor record={editing} onSave={(r) => void saveEdited(r)} onClose={() => setEditing(null)} />}

          </Group>
          <Group id="style" title="Style" hint="Styles and templates" g={g}>
            <><StylePicker format={doc.format} value={doc.style} auto={options.autoStyle} onAuto={() => setOptions({ autoStyle: true })} onPick={(name, title) => { setOptions({ autoStyle: false }); apply(patches.style(name, title)); }} />{targetWarning(doc.style, 'carousel') && <p className="small cr-warn" role="status">{targetWarning(doc.style, 'carousel')}</p>}</>
          </Group>
          <Group id="reference" title="Reference" hint="Match a reference, describe the look" g={g}>
            <MatchPanel target="carousel" title={doc.script?.title} photo={doc.photos?.[0] && urlOfPic(doc.photos[0].id) && sizeOfPic(doc.photos[0].id) ? { url: urlOfPic(doc.photos[0].id)!, name: doc.photos[0].name, ...sizeOfPic(doc.photos[0].id)! } : null} current={doc.style} onUse={() => { setOptions({ autoStyle: false }); apply(patches.style(ACTIVE_STYLE, 'Reference')); }} onRemove={() => setOptions({ autoStyle: true })} describe={{ canvas: { w: 1080, h: 1350 }, hasCutout: false }} />
          </Group>
          <Group id="edit" title="Edit" hint="Each slide, its layers and photos" g={g}>
        {!hasWork && (
          <div className="card empty">
            <strong>No script yet</strong>
            <span className="muted">Copy the prompt, paste Claude’s answer above, or try the example script to see how it works.</span>
          </div>
        )}

        {hasWork && style && (
          <ol className="cr-list" aria-label={`${slides.length} slides`}>
            {slides.map((s, i) => (
              <SlideCard
                key={i}
                index={i}
                count={slides.length}
                slide={s}
                script={doc.script!.slides[i]}
                swaps={doc.choices[String(i)]?.swaps}
                view={views[i]}
                apply={apply}
                onShuffle={() => {
                  const salt = pickShuffleSalt(doc, i);
                  if (salt === null) return false;
                  apply(patches.shuffle(i, salt));
                  return true;
                }}
                onOpen={() => setOpen(i)}
                onDownload={() => downloadOne(i)}
                deckLabel={deck}
                photo={doc.choices[String(i)]?.photo}
                object={doc.choices[String(i)]?.object}
                pictures={pictures}
                palette={style.spec.palettes[s.palette]}
                hasPhotoStyle={hasPhotoStyle}
                addFiles={addFiles}
              />
            ))}
          </ol>
        )}
          </Group>
        </div>
      </div>

      <FullSize items={openItems} at={open} onClose={() => setOpen(null)} onMove={setOpen} />
    </div>
  );
}
