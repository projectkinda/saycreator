// Images > Make a carousel. Topic to an editable, exportable carousel (or quote cards), with the real image engine in the browser.
// No keys and no network calls: the script is written by Claude in any chat and pasted here (or loaded from the example).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { composeStyled, type StyledSlide } from '../image-engine/styles/compose';
import { useDocumentTitle } from '../useDocumentTitle';
import { validateScript, validateScriptText, comingSoonWriter, exampleScript, FORMATS, formatOf, scriptPrompt, type Format, type ScriptResult } from './script';
import { patches } from './doc';
import { downloadBlob, exportAllAsZip, slideFileName, zipFileName } from './export';
import { composeDoc, getStyles, renderer, styleByName, type Rendered } from './render';
import { SlideCard, type SlideView } from './SlideCard';
import { PASTE_KEY, readStore, useProject, writeStore } from './useProject';
import '../styles/carousel.css';

const DEFAULT_STYLE = 'editorial-collage';

// ---------- style picker with a small preview of each style ----------

function StylePicker({ format, value, onPick }: { format: Format; value: string; onPick: (name: string, title: string) => void }) {
  const { styles, problems } = getStyles();
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
        {styles.map((st) => {
          const img = previews[`${format}:${st.spec.name}`];
          return (
            <li key={st.spec.name}>
              <button type="button" className="card start-opt cr-style" aria-pressed={value === st.spec.name} onClick={() => onPick(st.spec.name, st.spec.title)}>
                <span className={`cr-style-pic r${format === 'quote' ? '1-1' : '4-5'}`}>{img ? <img src={img} alt={`Preview of the ${st.spec.title} style`} /> : <span className="small muted" role="status">Drawing…</span>}</span>
                <strong>{st.spec.title}</strong>
                <span className="small muted">{st.spec.name}</span>
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
  const { project, apply, undo, redo, setTopic, startOver } = proj;
  const { doc, past, future } = project;
  const style = styleByName(doc.style);

  // pasted text (kept across refreshes) and its live check
  const [pasted, setPasted] = useState(() => readStore(PASTE_KEY) ?? '');
  const [check, setCheck] = useState<ScriptResult | null>(null);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [replacing, setReplacing] = useState(false);

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
    setReplacing(false);
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
  }, [doc.script, doc.style, doc.format, doc.choices]);

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

  const lastLabel = past[past.length - 1]?.label;
  const nextLabel = future[0]?.label;
  const openItems = slides.map((s, i) => ({ url: views[i]?.url ?? '', alt: `${deck}, slide ${i + 1}: ${s.type}` }));
  const hasWork = !!doc.script;

  return (
    <div className="page page-tight">
      <header className="page-header">
        <div className="page-header-text">
          <p className="small"><Link to="/images">← Back to Images</Link></p>
          <h1 className="page-title">Make a carousel</h1>
          <p className="lead">Pick a format and a style, get a script from Claude, then edit it. Everything is drawn in your browser. Nothing is sent anywhere.</p>
        </div>
      </header>
      <p className="visually-hidden" role="status" aria-live="polite">{notice}</p>

      <section className="card ws-card" aria-labelledby="cr-format-h">
        <h2 id="cr-format-h" className="h3">1. Format</h2>
        <div className="chip-group" role="group" aria-label="Format">
          {FORMATS.map((f) => (
            <button key={f.id} type="button" className="chip-btn" aria-pressed={doc.format === f.id} onClick={() => pickFormat(f.id)}>
              {f.label} <span className="small">({f.note})</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card ws-card" aria-labelledby="cr-style-h">
        <h2 id="cr-style-h" className="h3">2. Style</h2>
        <p className="small muted">The same script, drawn in each style. Change it any time.</p>
        <StylePicker format={doc.format} value={doc.style} onPick={(name, title) => apply(patches.style(name, title))} />
      </section>

      <section className="card ws-card" aria-labelledby="cr-script-h">
        <h2 id="cr-script-h" className="h3">3. Script</h2>
        {doc.script && !replacing && (
          <div className="row-actions">
            <p className="small">
              <strong>{doc.script.title}</strong>: {doc.script.slides.length} {doc.format === 'quote' ? 'cards' : 'slides'}, edit them below.
            </p>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setReplacing(true)}>Use a different script</button>
          </div>
        )}
        {(!doc.script || replacing) && (
        <div className="create-form">
          <label className="field">
            <span className="field-label">What is it about?</span>
            <textarea rows={3} value={doc.topic} onChange={(e) => setTopic(e.target.value)} placeholder="For example: three edits that fix a LinkedIn profile in 15 minutes" />
          </label>
          <div className="row-actions">
            <button type="button" className="btn btn-dark btn-lg" onClick={copyPrompt}>Copy prompt for Claude</button>
            <button type="button" className="btn btn-outline btn-lg" disabled aria-describedby="cr-soon" title="Coming soon">{comingSoonWriter.label}</button>
            <span id="cr-soon" className="small muted">Coming soon. For now Claude writes it in a chat you already have.</span>
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
            <button type="button" className="btn btn-outline btn-lg" onClick={() => useScript(exampleScript(doc.format))}>Try an example script</button>
            {replacing && <button type="button" className="btn btn-outline btn-lg" onClick={() => setReplacing(false)}>Cancel</button>}
          </div>
        </div>
        )}
      </section>

      {error && (
        <div className="notice notice-error" role="alert">
          <strong>Something went wrong</strong>
          <span>{error}</span>
        </div>
      )}

      <section aria-labelledby="cr-slides-h" className="cr-slides-sec">
        <div className="cr-toolbar">
          <h2 id="cr-slides-h" className="h3">{hasWork ? `Your ${doc.format === 'quote' ? 'cards' : 'slides'}` : '4. Your slides'}</h2>
          <div className="row-actions" role="toolbar" aria-label="Project actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={undo} disabled={past.length === 0} title="Ctrl+Z (when no text field is focused)">
              Undo{lastLabel ? `: ${lastLabel}` : ''}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={redo} disabled={future.length === 0} title="Shift+Ctrl+Z">
              Redo{nextLabel ? `: ${nextLabel}` : ''}
            </button>
            <button type="button" className="btn btn-dark btn-sm" onClick={downloadAll} disabled={!ready || !!exporting}>
              <Icon name="upload" size={14} /> Download all (zip)
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={!hasWork && !doc.topic}
              onClick={() => {
                if (window.confirm('Start over? This removes the script and every edit from this browser.')) {
                  startOver(doc.style);
                  setNotice('Started over.');
                }
              }}
            >
              Start over
            </button>
          </div>
        </div>
        <p className="small muted" role="status" aria-live="polite">
          {exporting || (proj.saveFailed ? 'This browser would not save the project. Download your slides before you leave.' : proj.saved)}
          {hasWork && ready && !exporting && ` ${failing === 0 ? 'Every slide passes the phone-size check.' : `${failing} of ${slides.length} slides have something to fix at phone size.`}`}
        </p>

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
                onOpen={() => setOpen(i)}
                onDownload={() => downloadOne(i)}
                deckLabel={deck}
              />
            ))}
          </ol>
        )}
      </section>

      <FullSize items={openItems} at={open} onClose={() => setOpen(null)} onMove={setOpen} />
    </div>
  );
}
