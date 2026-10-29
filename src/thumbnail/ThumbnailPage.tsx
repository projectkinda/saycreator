// Images > Make a thumbnail: upload a photo, point at the subject, give a title (or have titles written), choose a style, see several
// options each checked at phone size, pick one, edit it and export it. Pictures stay in this browser. Stills only: not video frames.
import { ReplayButton } from '../live/Replay';
import { CutoutEditor, type CutoutSaved } from '../carousel/CutoutEditor';
import { cutoutPicture, useCutoutIds } from '../carousel/cutoutAction';
import { listCutouts, type CutoutRecord } from '../image-engine/cutout/cutoutStore';
import type { CutoutLook } from '../image-engine/cutout/look';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { useDocumentTitle } from '../useDocumentTitle';
import type { PictureMeta } from '../carousel/photoLibrary';
import { THUMB_LAYOUT_LABEL, type ThumbLayoutId } from '../image-engine/thumbnail/v2/spec';
import { THUMB_SIZES } from '../image-engine/thumbnail/v2/compose';
import { downloadBlob, exportAllAsZip } from '../carousel/export';
import { FocalPicker } from '../carousel/PhotoControls';
import { LintBadges } from '../carousel/parts';
import { TREATMENT_CHOICES } from '../carousel/photoChoices';
import { PRIVACY_LINE, PictureError, addPicture, currentStorageProblem, hydrate, isMissing, removePicture, storageRoomNote, urlOf, useLibraryVersion } from '../carousel/photoLibrary';
import { WriterError, detectProviders, type WriteProvider } from '../carousel/writer';
import { AUTO_STYLE, thumbPatches } from './doc';
import { forgetGuess, composeProject, guessFor, thumbRenderer, thumbStyles, type Composed, type Drawn } from './render';
import { TITLE_MAX_WORDS, generateTitles, type TitleOption } from './titles';
import { useThumbProject } from './useThumbProject';
import { ensureTemplatesLoaded, isUserStyle, targetWarning, useTemplatesVersion } from '../reference/templates';
import '../styles/carousel.css';
import '../styles/thumbnail.css';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'thumbnail';
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

interface Card {
  layout: ThumbLayoutId;
  status: 'drawing' | 'ready' | 'error';
  drawn?: Drawn;
  error?: string;
}

export default function ThumbnailPage() {
  useDocumentTitle('Make a thumbnail');
  const proj = useThumbProject();
  const { project, apply, undo, redo, setTopic, setPhotos, startOver } = proj;
  const { doc, past, future } = project;
  const libVersion = useLibraryVersion();
  const tplVersion = useTemplatesVersion();
  useEffect(() => {
    void ensureTemplatesLoaded();
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const styles = useMemo(() => thumbStyles(), [tplVersion]);
  const pictures = doc.photos;
  const photos = pictures.filter((p) => p.kind === 'photo');
  const objects = pictures.filter((p) => p.kind === 'object');

  // ----- pictures -----
  const [messages, setMessages] = useState('');
  const [lowRoom, setLowRoom] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const secondRef = useRef<HTMLInputElement>(null);
  const objectRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void hydrate(pictures);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remove background on the photo, and the cutout controls for the object.
  const cutouts = useCutoutIds();
  const [editing, setEditing] = useState<CutoutRecord | null>(null);
  const [cutStatus, setCutStatus] = useState('');
  const [cutting, setCutting] = useState(false);
  const addCutoutObject = async (file: File) => {
    const r = await addPicture(file, 'object');
    setPhotos((before) => [...before, r.meta]);
    apply(thumbPatches.object(r.meta.id));
    return { id: r.meta.id, messages: r.notes };
  };
  const removeBackground = async () => {
    if (!doc.photoId) return;
    setCutting(true);
    setCutStatus('Removing the background…');
    setCutStatus(await cutoutPicture(doc.photoId, addCutoutObject));
    cutouts.refresh();
    setCutting(false);
  };
  const look = (patch: Partial<CutoutLook>, label: string) => apply(thumbPatches.objectLook({ ...(doc.objectLook ?? {}), ...patch }, label));
  const editCutout = async () => {
    const rec = (await listCutouts()).find((r) => r.pictureId === doc.objectId);
    if (rec) setEditing(rec);
    else setCutStatus('This object was not made by Remove background, so it has no mask to edit.');
  };
  const saveEdited = async (r: CutoutSaved) => {
    const res = await addPicture(new File([r.cutout], `${r.record.name}-edited.png`, { type: 'image/png' }), 'object');
    setPhotos((before) => [...before, res.meta]);
    await import('../image-engine/cutout/cutoutStore').then((m) => m.putCutout({ ...r.record, pictureId: res.meta.id }));
    apply(thumbPatches.object(res.meta.id));
    apply(thumbPatches.objectLook(r.look, 'Use the edited cutout'));
    cutouts.refresh();
    setEditing(null);
    setCutStatus('Saved the edited cutout and used it.');
  };

  /** Adds files, reports unusable ones in plain words, and puts the first good one in the slot asked for. */
  const addFiles = async (files: File[], kind: 'photo' | 'object', slot: 'photo' | 'second' | 'object') => {
    if (files.length === 0) return;
    setBusy(true);
    setMessages(files.length > 1 ? `Adding ${files.length} files…` : 'Adding…');
    const added: PictureMeta[] = [];
    const msgs: string[] = [];
    for (const f of files) {
      try {
        const r = await addPicture(f, kind);
        added.push(r.meta);
        msgs.push(...r.notes);
      } catch (e) {
        msgs.push(e instanceof PictureError ? e.message : `"${f.name}" could not be added: ${(e as Error).message}`);
      }
    }
    if (added.length) {
      setPhotos((before) => [...before, ...added]);
      const first = added[0];
      apply(slot === 'photo' ? thumbPatches.photo(first.id) : slot === 'second' ? thumbPatches.second(first.id) : thumbPatches.object(first.id));
    }
    const prob = currentStorageProblem();
    if (prob) msgs.push(prob);
    setMessages(msgs.join(' '));
    setLowRoom(await storageRoomNote());
    setBusy(false);
  };
  const removeFromProject = async (id: string) => {
    if (doc.photoId === id) apply(thumbPatches.photo(undefined));
    if (doc.secondId === id) apply(thumbPatches.second(undefined));
    if (doc.objectId === id) apply(thumbPatches.object(undefined));
    forgetGuess(id);
    await removePicture(id);
    setPhotos((before) => before.filter((p) => p.id !== id));
  };
  const imageFiles = (list: FileList | File[]) => [...list].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));

  // ----- the pointer on the subject -----
  const photoUrl = doc.photoId ? urlOf(doc.photoId) : null;
  const [guess, setGuess] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    let live = true;
    setGuess(null);
    if (doc.photoId && photoUrl) void guessFor(doc.photoId).then((g) => live && setGuess({ x: g.x, y: g.y }));
    return () => {
      live = false;
    };
  }, [doc.photoId, photoUrl, libVersion]);
  const pointer = doc.subject ?? guess ?? { x: 0.5, y: 0.5 };
  const secondUrl = doc.secondId ? urlOf(doc.secondId) : null;
  const [guess2, setGuess2] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    let live = true;
    setGuess2(null);
    if (doc.secondId && secondUrl) void guessFor(doc.secondId).then((g) => live && setGuess2({ x: g.x, y: g.y }));
    return () => {
      live = false;
    };
  }, [doc.secondId, secondUrl, libVersion]);

  // ----- titles -----
  const [providers, setProviders] = useState<WriteProvider[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [written, setWritten] = useState<TitleOption[]>([]);
  const [writeNote, setWriteNote] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    let live = true;
    void detectProviders().then((p) => live && setProviders(p));
    return () => {
      live = false;
    };
  }, []);
  const writeTitles = async () => {
    const source = doc.topic.trim() || doc.title.trim();
    if (!providers?.length || !source) return;
    abort.current = new AbortController();
    setWriting(true);
    setWriteNote('Writing titles…');
    try {
      const r = await generateTitles(source, providers[0], abort.current.signal);
      setWritten(r.options);
      setWriteNote(`${r.options.length} titles, written by ${providers[0].label} in ${(r.ms / 1000).toFixed(1)} s.${r.dropped.length ? ` ${r.dropped.length} more were left out: ${r.dropped.slice(0, 2).join(' ')}` : ''} Pick one, or type your own.`);
    } catch (e) {
      setWritten([]);
      setWriteNote(e instanceof WriterError && e.kind === 'cancelled' ? 'Cancelled.' : e instanceof Error ? e.message : 'The writer could not be reached. Type your own title.');
    } finally {
      setWriting(false);
    }
  };

  const words = doc.title.trim().split(/\s+/).filter(Boolean);
  const emphasis = doc.emphasis && words.some((w) => w.toLowerCase() === (doc.emphasis ?? '').toLowerCase()) ? doc.emphasis : words[words.length - 1] ?? '';

  // ----- the options -----
  const [composed, setComposed] = useState<Composed | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [problem, setProblem] = useState('');
  const [timing, setTiming] = useState('');
  const run = useRef(0);
  useEffect(() => {
    const mine = ++run.current;
    const timer = window.setTimeout(async () => {
      try {
        const c = await composeProject(doc);
        if (mine !== run.current) return;
        setProblem('');
        setComposed(c);
        if (!c) {
          setCards([]);
          return;
        }
        const t0 = performance.now();
        setCards(c.options.map((o) => ({ layout: o.layout, status: 'drawing' })));
        let n = 0;
        for (const o of c.options) {
          const i = n++;
          try {
            const drawn = await thumbRenderer.render(o, c.pictures);
            if (mine !== run.current) return;
            setCards((cur) => cur.map((x, k) => (k === i ? { layout: o.layout, status: 'ready', drawn } : x)));
          } catch (e) {
            if (mine !== run.current) return;
            setCards((cur) => cur.map((x, k) => (k === i ? { layout: o.layout, status: 'error', error: (e as Error).message } : x)));
          }
        }
        if (mine === run.current) setTiming(`Composed in ${Math.round(c.ms)} ms and drawn and checked in ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
      } catch (e) {
        if (mine === run.current) {
          setProblem((e as Error).message);
          setCards([]);
        }
      }
    }, 200);
    return () => window.clearTimeout(timer);
    // The options depend on everything in the doc except the topic and the history; libVersion covers pictures coming back after a refresh.
  }, [tplVersion, doc.aspect, doc.style, doc.title, doc.emphasis, doc.photoId, doc.objectId, doc.objectLook, doc.secondId, doc.subject, doc.secondSubject, doc.treatment, libVersion, doc.topic]);

  const ready = cards.length > 0 && cards.every((c) => c.status === 'ready');
  const size = THUMB_SIZES[doc.aspect];
  const fileName = (layout: string) => `${slug(doc.title)}-${doc.aspect.replace(':', 'x')}-${layout}.png`;
  const [notice, setNotice] = useState('');
  const download = (c: Card) => {
    if (!c.drawn) return;
    downloadBlob(c.drawn.png, fileName(c.layout));
    setNotice(`Downloaded ${fileName(c.layout)} (${size.width} by ${size.height}).`);
  };
  const downloadAll = async () => {
    const blobs = cards.filter((c) => c.drawn).map((c) => c.drawn!.png);
    const zip = await exportAllAsZip(slug(doc.title), blobs);
    downloadBlob(zip, `${slug(doc.title)}-${doc.aspect.replace(':', 'x')}.zip`);
    setNotice(`Downloaded ${blobs.length} thumbnails in one zip.`);
  };

  const lastLabel = past[past.length - 1]?.label;
  const nextLabel = future[0]?.label;
  const photoMissing = !!doc.photoId && isMissing(doc.photoId);
  const hasPhoto = !!doc.photoId && !!photoUrl;
  const chosen = doc.selected ?? null;

  return (
    <div className="page cr-page tn-page">
      <header className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Make a thumbnail</h1>
          <p className="lead">Add a photo, give it a title, and get several thumbnails to choose from, each checked at phone size. These are made from a still photo, not from a frame of your video.</p>
        </div>
      </header>

      <section className="card tn-sec" aria-labelledby="tn-photo-h">
        <h2 id="tn-photo-h" className="h3">1. Your photo</h2>
        <p className="small muted">{PRIVACY_LINE}</p>
        <div
          className={`cr-drop tn-drop${over ? ' over' : ''}`}
          data-testid="thumb-drop"
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void addFiles(imageFiles(e.dataTransfer.files).slice(0, 1), 'photo', 'photo');
          }}
        >
          {hasPhoto ? (
            <div className="tn-pointer">
              <FocalPicker url={photoUrl!} focal={pointer} label="Subject pointer. Drag it onto your subject, or use the arrow keys." onMove={(f) => apply(thumbPatches.subject(f))} />
              <div>
                <p className="small"><strong>Drag the dot onto your subject.</strong> It is your pointer, not detection: the app does not find faces or understand the picture. The title, the stickers and the object stay off it.</p>
                <p className="small muted" role="status">{doc.subject ? `Your pointer is at ${Math.round(doc.subject.x * 100)}% across and ${Math.round(doc.subject.y * 100)}% down.` : 'No pointer placed yet: the dot is a guess (where the picture has the most detail and colour). Move it onto your subject.'}</p>
                {doc.subject && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => apply(thumbPatches.subject(undefined))}>Use the guess again</button>
                )}
              </div>
            </div>
          ) : (
            <p className="small muted">{photoMissing ? 'Your photo is no longer in this browser’s storage. Add it again.' : 'Drop a photo here, or press “Add a photo”.'}</p>
          )}
        </div>
        <div className="cr-photo-actions">
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => photoRef.current?.click()}>{hasPhoto ? 'Replace photo' : 'Add a photo'}</button>
          {hasPhoto && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void removeFromProject(doc.photoId!)}>Remove photo</button>
          )}
          {hasPhoto && (
            <button type="button" className="btn btn-outline btn-sm" disabled={cutting || busy} onClick={() => void removeBackground()}>{cutting ? 'Working…' : 'Remove background'}</button>
          )}
          {photos.length > 1 && (
            <select className="plain-select cr-select" aria-label="Use another photo you added" value={doc.photoId ?? ''} onChange={(e) => e.target.value && apply(thumbPatches.photo(e.target.value))}>
              {photos.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <input ref={photoRef} type="file" accept="image/*,.heic,.heif" className="visually-hidden" tabIndex={-1} aria-label="Choose a photo" onChange={(e) => { void addFiles(imageFiles(e.target.files ?? []).slice(0, 1), 'photo', 'photo'); e.target.value = ''; }} />
        </div>
        {messages && <p className="small" role="status" aria-live="polite" data-testid="thumb-status">{messages}</p>}
        {lowRoom && <p className="small cr-warn" role="status">{lowRoom}</p>}
        {cutStatus && <p className="small" role="status" data-testid="cutout-status">{cutStatus}</p>}
        {editing && <CutoutEditor record={editing} onSave={(r) => void saveEdited(r)} onClose={() => setEditing(null)} />}
        {proj.saveFailed && <p className="small cr-problem" role="alert">This browser would not save the project. Download your thumbnails before you leave.</p>}

        <details className="tn-more">
          <summary className="small">Also add an object, or a second photo for before and after</summary>
          <div className="tn-extras">
            <div>
              <h3 className="h4">Object</h3>
              <p className="small muted">A transparent PNG (a product, a sticker). It gives the “Object and title” option.</p>
              <div className="cr-photo-actions">
                <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => objectRef.current?.click()}>{doc.objectId ? 'Replace object' : 'Add an object (transparent PNG)'}</button>
                {doc.objectId && <button type="button" className="btn btn-outline btn-sm" onClick={() => apply(thumbPatches.object(undefined))}>Remove object</button>}
                {objects.length > 1 && (
                  <select className="plain-select cr-select" aria-label="Use another object" value={doc.objectId ?? ''} onChange={(e) => e.target.value && apply(thumbPatches.object(e.target.value))}>
                    {objects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
                <input ref={objectRef} type="file" accept="image/png,image/webp" className="visually-hidden" tabIndex={-1} aria-label="Choose an object" onChange={(e) => { void addFiles(imageFiles(e.target.files ?? []).slice(0, 1), 'object', 'object'); e.target.value = ''; }} />
              </div>
            </div>
            {doc.objectId && (
              <div className="tn-cutout" role="group" aria-label="Cutout controls">
                <h3 className="h4">Cutout controls</h3>
                <p className="small muted">No model: every change redraws the options at once, and Undo covers it.</p>
                {([['Position across', 'x', 0, 1, 0.01, 0.7], ['Position down', 'y', 0, 1, 0.01, 0.5], ['Size', 'scale', 0.15, 2.5, 0.05, 1], ['Tilt', 'tilt', -45, 45, 1, 0]] as const).map(([l, k, lo, hi, st, dflt]) => (
                  <label key={k} className="cr-inline small"><span className="field-label">{l}: {(doc.objectLook?.[k] ?? dflt).toFixed(st < 1 ? 2 : 0)}</span><input type="range" min={lo} max={hi} step={st} value={doc.objectLook?.[k] ?? dflt} aria-label={`Cutout ${l.toLowerCase()}`} onChange={(e) => look({ [k]: Number(e.target.value) }, `Change the cutout ${l.toLowerCase()}`)} /></label>
                ))}
                <label className="small rf-toggle"><input type="checkbox" checked={!!doc.objectLook?.flip} onChange={(e) => look({ flip: e.target.checked }, e.target.checked ? 'Flip the cutout' : 'Unflip the cutout')} /> Flip left to right</label>
                <label className="small rf-toggle"><input type="checkbox" checked={!!doc.objectLook?.outline} onChange={(e) => look({ outline: e.target.checked ? { color: '#ffffff', width: 12 } : undefined }, e.target.checked ? 'Add an outline' : 'Remove the outline')} /> Outline</label>
                {doc.objectLook?.outline && (
                  <>
                    <label className="cr-inline small"><span className="field-label">Outline colour</span><input type="color" value={doc.objectLook.outline.color} aria-label="Cutout outline colour" onChange={(e) => look({ outline: { ...doc.objectLook!.outline!, color: e.target.value } }, 'Change the outline colour')} /></label>
                    <label className="cr-inline small"><span className="field-label">Outline thickness: {doc.objectLook.outline.width}</span><input type="range" min={2} max={40} value={doc.objectLook.outline.width} aria-label="Cutout outline thickness" onChange={(e) => look({ outline: { ...doc.objectLook!.outline!, width: Number(e.target.value) } }, 'Change the outline thickness')} /></label>
                  </>
                )}
                <label className="cr-inline small">
                  <span className="field-label">Glow or shadow</span>
                  <select className="plain-select cr-select" aria-label="Cutout glow or shadow" value={doc.objectLook?.fx ?? ''} onChange={(e) => look({ fx: (e.target.value || undefined) as CutoutLook['fx'] }, 'Change the glow or shadow')}>
                    <option value="">The layout's own</option>
                    <option value="none">None</option>
                    <option value="contact">Soft shadow on the floor</option>
                    <option value="drop">Drop shadow</option>
                    <option value="glow">Glow</option>
                  </select>
                </label>
                <label className="small rf-toggle"><input type="checkbox" checked={!!doc.objectLook?.textBehind} onChange={(e) => look({ textBehind: e.target.checked }, e.target.checked ? 'Put the title behind the cutout' : 'Put the title in front')} /> Title behind the subject</label>
                <div className="cr-photo-actions">
                  {cutouts.ids.has(doc.objectId) && <button type="button" className="btn btn-outline btn-sm" onClick={() => void editCutout()}>Edit cutout (edge and brush)</button>}
                  {doc.objectLook && <button type="button" className="btn btn-outline btn-sm" onClick={() => apply(thumbPatches.objectLook(undefined, 'Reset the cutout'))}>Reset the cutout</button>}
                </div>
              </div>
            )}
            <div>
              <h3 className="h4">Second photo</h3>
              <p className="small muted">The “after” picture. It gives the “Before and after” option (your first photo is the “before”).</p>
              <div className="cr-photo-actions">
                <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => secondRef.current?.click()}>{doc.secondId ? 'Replace second photo' : 'Add a second photo'}</button>
                {doc.secondId && <button type="button" className="btn btn-outline btn-sm" onClick={() => apply(thumbPatches.second(undefined))}>Remove second photo</button>}
                <input ref={secondRef} type="file" accept="image/*,.heic,.heif" className="visually-hidden" tabIndex={-1} aria-label="Choose a second photo" onChange={(e) => { void addFiles(imageFiles(e.target.files ?? []).slice(0, 1), 'photo', 'second'); e.target.value = ''; }} />
              </div>
              {secondUrl && (
                <FocalPicker url={secondUrl} focal={doc.secondSubject ?? guess2 ?? { x: 0.5, y: 0.5 }} label="Subject pointer on the second photo. Drag it onto your subject." onMove={(f) => apply(thumbPatches.secondSubject(f))} />
              )}
            </div>
          </div>
        </details>
      </section>

      <section className="card tn-sec" aria-labelledby="tn-title-h">
        <h2 id="tn-title-h" className="h3">2. Your title</h2>
        <label className="tn-field">
          <span className="field-label">Title (up to {TITLE_MAX_WORDS} words)</span>
          <input className="input" value={doc.title} maxLength={80} onChange={(e) => apply(thumbPatches.title(e.target.value))} aria-describedby="tn-title-count" placeholder="Ride before sunrise" />
        </label>
        <p id="tn-title-count" className={`small ${wordCount(doc.title) > TITLE_MAX_WORDS ? 'cr-warn' : 'muted'}`} role="status">
          {wordCount(doc.title) > TITLE_MAX_WORDS ? `${wordCount(doc.title)} words. More than ${TITLE_MAX_WORDS} fails the phone-size title check.` : `${wordCount(doc.title)} of ${TITLE_MAX_WORDS} words.`}
        </p>
        {words.length > 0 && (
          <div className="tn-field">
            <span className="field-label" id="tn-emph-l">Word to stress</span>
            <div role="radiogroup" aria-labelledby="tn-emph-l" className="chip-group">
              {words.map((w, i) => (
                <button key={`${w}-${i}`} type="button" role="radio" aria-checked={w.toLowerCase() === emphasis.toLowerCase()} className="chip-btn" onClick={() => apply(thumbPatches.emphasis(w))}>{w}</button>
              ))}
            </div>
          </div>
        )}
        <label className="tn-field">
          <span className="field-label">Topic or script (for “Write titles” and “Pick for me”)</span>
          <textarea className="cr-prompt tn-topic" rows={3} value={doc.topic} onChange={(e) => setTopic(e.target.value)} placeholder="What the video is about, in a sentence or two" />
        </label>
        <div className="cr-photo-actions">
          <button type="button" className="btn btn-primary btn-sm" disabled={writing || !providers?.length || !(doc.topic.trim() || doc.title.trim())} onClick={() => void writeTitles()}>Write titles</button>
          {writing && <button type="button" className="btn btn-outline btn-sm" onClick={() => abort.current?.abort()}>Cancel</button>}
        </div>
        {providers && providers.length === 0 && <p className="small muted" role="status">No writer is connected, so “Write titles” is off. Type your own title above.</p>}
        {writeNote && <p className="small" role="status" aria-live="polite">{writeNote}</p>}
        {written.length > 0 && (
          <ul className="tn-written" aria-label="Written titles">
            {written.map((t) => (
              <li key={t.title}>
                <button type="button" className="chip-btn" onClick={() => apply(thumbPatches.titleAndEmphasis(t.title, t.emphasis))}>{t.title} <span className="muted">(stress: {t.emphasis})</span></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card tn-sec" aria-labelledby="tn-look-h">
        <h2 id="tn-look-h" className="h3">3. Format and style</h2>
        <div className="tn-field">
          <span className="field-label" id="tn-aspect-l">Format</span>
          <div role="radiogroup" aria-labelledby="tn-aspect-l" className="chip-group">
            {(['16:9', '9:16'] as const).map((a) => (
              <button key={a} type="button" role="radio" aria-checked={doc.aspect === a} className="chip-btn" onClick={() => apply(thumbPatches.aspect(a))}>
                {a === '16:9' ? 'Wide 16:9 (1280 × 720)' : 'Tall 9:16 (1080 × 1920)'}
              </button>
            ))}
          </div>
        </div>
        <div className="tn-field">
          <span className="field-label" id="tn-style-l">Style</span>
          <div role="radiogroup" aria-labelledby="tn-style-l" className="chip-group">
            <button type="button" role="radio" aria-checked={doc.style === AUTO_STYLE} className="chip-btn" onClick={() => apply(thumbPatches.style(AUTO_STYLE))}>Pick for me</button>
            {styles.map((s) => (
              <button key={s.spec.name} type="button" role="radio" aria-checked={doc.style === s.spec.name} className="chip-btn" title={s.spec.description} onClick={() => apply(thumbPatches.style(s.spec.name))}>{s.spec.title}{isUserStyle(s.spec.name) && <span className="chip chip-tag"> Mine</span>}</button>
            ))}
          </div>
          {targetWarning(doc.style, 'thumbnail') && <p className="small cr-warn" role="status">{targetWarning(doc.style, 'thumbnail')}</p>}
          {composed?.why && <p className="small muted" role="status">Picked for you: {composed.style.spec.title}. {composed.why}</p>}
        </div>
        <div className="tn-field">
          <span className="field-label" id="tn-treat-l">Photo treatment</span>
          <div role="radiogroup" aria-labelledby="tn-treat-l" className="chip-group">
            {TREATMENT_CHOICES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={doc.treatment === t.id} className="chip-btn" onClick={() => apply(thumbPatches.treatment(t.id))}>{t.label}</button>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="tn-opts-h" className="tn-sec">
        <div className="cr-toolbar">
          <h2 id="tn-opts-h" className="h3">4. Your thumbnails</h2>
          <div className="row-actions" role="toolbar" aria-label="Project actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={undo} disabled={past.length === 0}>Undo{lastLabel ? `: ${lastLabel}` : ''}</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={redo} disabled={future.length === 0}>Redo{nextLabel ? `: ${nextLabel}` : ''}</button>
            <button type="button" className="btn btn-dark btn-sm" onClick={() => void downloadAll()} disabled={!ready}>
              <Icon name="upload" size={14} /> Download all (zip)
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={!doc.photoId && !doc.title && !doc.topic}
              onClick={() => {
                if (window.confirm('Start over? This removes your title, every edit and your pictures from this browser.')) {
                  pictures.forEach((p) => void removePicture(p.id));
                  startOver();
                  setNotice('Started over.');
                }
              }}
            >
              Start over
            </button>
          </div>
        </div>
        <p className="small muted" role="status" aria-live="polite">{notice || proj.saved}{timing && ` ${timing}`}</p>
        {problem && <p className="small cr-problem" role="alert">{problem}</p>}
        {!composed && (
          <div className="card empty">
            <strong>{hasPhoto ? 'Add a title' : 'Add a photo and a title'}</strong>
            <span className="muted">{hasPhoto ? 'Type a title of up to four words, or use “Write titles”.' : 'Your thumbnails appear here, one card for each way of laying it out.'}</span>
          </div>
        )}
        {composed && (
          <>
            {composed.left.length > 0 && <p className="small muted">Left out for now: {composed.left.map((l) => `${THUMB_LAYOUT_LABEL[l.layout as ThumbLayoutId] ?? l.layout} (${l.because})`).join('; ')}.</p>}
            <ol className="tn-grid" aria-label={`${cards.length} thumbnail options`}>
              {composed.options.map((o, i) => {
                const c = cards[i];
                const failed = c?.drawn?.lint.filter((l) => !l.pass).length ?? 0;
                const isChosen = chosen === o.layout;
                return (
                  <li key={o.id} className={`card tn-card${isChosen ? ' chosen' : ''}`} aria-label={`Option ${i + 1}: ${THUMB_LAYOUT_LABEL[o.layout]}`} data-status={c?.status ?? 'drawing'} data-layout={o.layout}>
                    <div className="tn-pic" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
                      {c?.drawn ? <img src={c.drawn.url} alt={`${doc.title}, ${THUMB_LAYOUT_LABEL[o.layout]}, ${composed.style.spec.title}`} /> : <span className="small muted" role="status">{c?.status === 'error' ? 'Could not draw this one' : 'Drawing…'}</span>}
                    </div>
                    <h3 className="h4">{THUMB_LAYOUT_LABEL[o.layout]}</h3>
                    <p className="small muted">{composed.style.spec.title}</p>
                    <LintBadges lint={c?.drawn?.lint as never} />
                    {o.notes.filter((n) => /bigger|left out/.test(n)).map((n) => (
                      <p key={n} className="small muted">{n}</p>
                    ))}
                    <div className="row-actions">
                      <button type="button" className="btn btn-outline btn-sm" aria-pressed={isChosen} onClick={() => apply(thumbPatches.select(isChosen ? undefined : o.layout))}>{isChosen ? 'Picked' : 'Pick this one'}</button>
                      <ReplayButton plan={o.plan} label={`Option ${i + 1}`} />
                      <button type="button" className="btn btn-outline btn-sm" disabled={!c?.drawn} onClick={() => c && download(c)} aria-label={`Download option ${i + 1} as PNG`}>Download PNG</button>
                    </div>
                    {failed > 0 && isChosen && <p className="small cr-warn" role="status">{failed} check{failed === 1 ? '' : 's'} to fix. Change the title, the pointer, the photo or the style above.</p>}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>
    </div>
  );
}
