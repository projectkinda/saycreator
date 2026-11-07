// Images > Make a carousel. Topic to an editable, exportable carousel (or quote cards), with the real image engine in the browser.
// No keys and no network calls: the script is written by Claude in any chat and pasted here (or loaded from the example).
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { composeStyled, type StyledSlide } from '../image-engine/styles/compose';
import { useDocumentTitle } from '../useDocumentTitle';
import { validateScript, validateScriptText, exampleScript, formatOf, scriptPrompt, SLIDE_RANGE, type Format, type ScriptResult } from './script';
import { DEFAULT_OPTIONS, patches } from './doc';
import { MakeIt, runDesign, runGenerate, useWriters, type GenState } from './MakeIt';
import { DeckFlags, DesignedCard } from './DesignedCard';
import { NewStyleFlow } from './NewStyleFlow';
import { scriptFromBlocks, slideBlocks } from './pasted';
import { clearPageState } from './resetState';
import { DetectedStyleBox } from './DetectedStyle';
import { legacySvgRoute, redrawLibraryDeck, templateRoute } from './designLibrary';
import { presetKey, presetPackFor } from './presets';
import { drawGalleryTile, galleryModel, redrawLibrarySlide, rewriteSlideText, scriptWithSlide, type PickChoice } from './designLibraryPick';
import { LayoutGallery } from './LayoutGallery';
import { setActiveReference as setActiveRef } from '../reference/active';
import { saveOverrides } from '../reference/overrides';
import { templates as savedTemplates, updateTemplatePack } from '../reference/templates';
import type { StyleOverrides, StylePack } from '../reference/pack';
import { chooseRoute, designFailureMessage, inspirationImages, lastRequestBytes, redesignSlide, type Designed } from './designed';
import { pickStyle } from './pickStyle';
import { type WriteRequest } from './writerPrompt';
import { downloadBlob, exportAllAsZip, slideFileName, zipFileName } from './export';
import { carouselStyles, composeDoc, getStyles, pickShuffleSalt, renderer, styleByName, type Rendered } from './render';
import { MatchPanel } from '../reference/MatchPanel';
import { ACTIVE_STYLE, activeReference, clearActiveReference, useActiveReference } from '../reference/active';
import { cancelJob } from '../live/jobs';
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
import { packFor, packFromStyle, distinctCheck } from '../reference/pack';
import { packPicture } from '../reference/packRender';
import { ImageRequestsPanel } from '../images/ImageRequestsPanel';
import { requestFromText, useImagesVersion } from '../images/store';
import { saveTemplate, styleNameFor as packStyleName } from '../reference/templates';
import { blankStyle as packBlank } from '../reference/blank';
import { PASTE_KEY, readStore, useProject, writeStore } from './useProject';
import { onCancel, startJob, type JobHandle } from '../live/jobs';
import { ReportPanel } from '../reference/ReportPanel';
import { NewStyleBox } from './QuickStart';
import type { ReaderControl, ReaderState } from '../reference/ReferenceStylePage';

const ReferenceStylePage = lazy(() => import('../reference/ReferenceStylePage'));
import '../styles/carousel.css';

const DEFAULT_STYLE = 'editorial-collage';
/** Designed slides come only from "New style" and "Redesign this slide", never from Make carousel. */
const noDesign = (): Designed | undefined => undefined;

// ---------- style picker with a small preview of each style ----------

function StylePicker({ format, value, auto, onAuto, onPick, onNewStyle, newStyleOpen, rebuildOnly }: { format: Format; value: string; auto: boolean; onAuto: () => void; onPick: (name: string, title: string) => void; onNewStyle?: () => void; newStyleOpen?: boolean; rebuildOnly?: boolean }) {
  useTemplatesVersion();
  // Mine first, then the built-in ones.
  const styles = [...carouselStyles()].sort((a, b) => Number(isUserStyle(b.spec.name)) - Number(isUserStyle(a.spec.name)));
  const { problems } = getStyles();
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [packNote, setPackNote] = useState('');
  /** A pack with a different composition for each slide type, from a stored style's colours and fonts (no model call). The style stays. */
  const rebuild = async (st: (typeof styles)[number]) => {
    // A style made from a reference never gets the standard compositions: it has to be drawn by the model ("Make the rest of the set").
    if (isUserStyle(st.spec.name)) return setPackNote(`${st.spec.title} was made from your references: use “Make the rest of the set” to draw its pack. The standard compositions are only for built-in styles.`);
    const pack = packFromStyle(st.spec);
    const check = distinctCheck(pack);
    const blob = await packPicture(pack, 'cover', { type: 'cover', kicker: 'Example', headline: 'A headline that makes people stop', sub: 'A line under it' }, 270);
    const preview = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
    const name = `${st.spec.title} pack`;
    await saveTemplate({ name, target: 'carousel', spec: { ...packBlank(), name: packStyleName(name), title: name }, preview, pack });
    setPackNote(`Saved “${name}” (Mine): ${Object.keys(pack.designs).length} designs${check.ok ? ', each with its own composition' : `, but ${check.alike.length} pair(s) look alike`}. The ${st.spec.title} style is unchanged.`);
  };
  useEffect(() => {
    if (rebuildOnly) return;
    let live = true;
    const f = formatOf(format);
    (async () => {
      for (const st of styles) {
        const key = `${format}:${st.spec.name}`;
        if (previews[key]) continue;
        // A pack is previewed with its own cover design, not the plain style under it.
        const pk = packFor(st.spec.name);
        if (pk) {
          const blob = await packPicture(pk, 'cover', { type: 'cover', kicker: 'Example', headline: 'A headline that makes people stop', sub: 'And a line that makes them read on' }, 216);
          if (!live) return;
          setPreviews((p) => ({ ...p, [key]: URL.createObjectURL(blob) }));
          continue;
        }
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
  if (rebuildOnly)
    return (
      <>
        <ul className="cr-rebuild" aria-label="Rebuild as pack">
          {styles.filter((st) => !isUserStyle(st.spec.name)).map((st) => (
            <li key={st.spec.name}>
              <button type="button" className="btn btn-outline btn-sm" aria-label={'Rebuild the ' + st.spec.title + ' style as a pack'} onClick={() => void rebuild(st)}>Rebuild {st.spec.title} as pack</button>
            </li>
          ))}
        </ul>
        {packNote && <p className="small" role="status" data-testid="pack-note">{packNote}</p>}
      </>
    );
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
                {packFor(st.spec.name)?.basic && <span className="chip chip-tag">Basic</span>}
                {auto && value === st.spec.name && <span className="chip chip-tag">In use</span>}
                {st.warnings.some((w) => /phone-size checker needs at least 32 px/.test(w)) && <span className="chip chip-warn">Some text is below phone size</span>}
              </button>
            </li>
          );
        })}
        {onNewStyle && (
          <li className="cr-new-li">
            <button type="button" className="card start-opt cr-style cr-new" aria-expanded={!!newStyleOpen} onClick={onNewStyle}>
              <span className="cr-new-plus" aria-hidden="true">+</span>
              <span className="cr-new-text">
                <strong>New style</strong>
                <span className="small muted">Make your own look from a reference picture or a description. The cost is shown before anything runs.</span>
              </span>
            </button>
          </li>
        )}
      </ul>
      {packNote && <p className="small" role="status" data-testid="pack-note">{packNote}</p>}
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
  const [tplLoaded, setTplLoaded] = useState(false);
  useEffect(() => {
    void ensureTemplatesLoaded().then(() => setTplLoaded(true));
  }, []);
  // The quick panel drives the reference reader (which sits in the Advanced fold): its numbers, and the style it saved.
  const readerControl = useRef<ReaderControl | null>(null);
  /** A style the quick read just saved is the selected one: the Advanced reader panel does not switch the page back to the in-memory "Reference" entry. */
  const justSaved = useRef(false);
  const [readerState, setReaderState] = useState<ReaderState | null>(null);
  const [quickSaved, setQuickSaved] = useState('');
  const onQuickSaved = (s: { name: string; title: string }) => {
    setOptions({ autoStyle: false });
    apply(patches.style(s.name, s.title));
    setQuickSaved(s.title);
    justSaved.current = true;
    setNewStyleOpen(false);
    setNotice('Saved the style ' + s.title + ' and selected it.');
  };
  // An old project can name a style that no longer exists (a deleted template, a reference that was only in memory): it opens with the default style and a note.
  useEffect(() => {
    if (!tplLoaded || !doc.style || styleByName(doc.style)) return;
    const def = styleByName(DEFAULT_STYLE) ? DEFAULT_STYLE : getStyles().styles[0]?.spec.name;
    if (!def || def === doc.style) return;
    apply(patches.style(def, styleByName(def)?.spec.title ?? def));
    setNotice('The style this project used is no longer available, so it opens with the default style (' + (styleByName(def)?.spec.title ?? def) + '). Pick another style under Advanced if you like.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tplLoaded, tplVersion, doc.style]);
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
  const [newStyleOpen, setNewStyleOpen] = useState(false);
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
  const imagesVersion = useImagesVersion();
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
  }, [doc.script, doc.style, doc.format, doc.choices, doc.photos, doc.imageRequests, imagesVersion, libVersion, tplVersion, refVersion]);

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
  const generate = async (override?: unknown) => {
    if (busy) return;
    // "Use quick templates instead" after a failed Designed run: this one time the templates fill the slides.
    const quickAfter = typeof (override as { quickAfterFail?: unknown } | undefined)?.quickAfterFail === 'string' ? (override as { quickAfterFail: string }).quickAfterFail : null;
    // A chosen style that is missing or broken is an error, never a reason to generate: the picker stays and no model is called.
    if (!options.autoStyle && !styleByName(doc.style)) return setGen({ phase: 'error', message: 'The chosen style "' + doc.style + '" is missing or broken. Pick another style below. Nothing was generated and no model was called.' });
    // Ready-made slide text (one block per slide) becomes the slides as it is: no writer call at all.
    const blocks = slideBlocks(doc.topic);
    if (blocks) {
      const built = scriptFromBlocks(blocks, doc.format, options.handle.trim());
      if (!built.script) return setGen({ phase: 'error', message: 'Your slide text could not be used as slides.', problems: built.errors });
      const known0 = carouselStyles().map((x) => x.spec.name);
      const pick0 = options.autoStyle ? pickStyle({ text: doc.topic, tone: options.tone, slideTypes: built.script.slides.map((x) => x.type), styles: carouselStyles(), writerSuggestion: known0[0] ?? null }) : null;
      const gp0 = patches.generate(built.script, pick0 ? pick0.name : null, GEN_LABEL);
      const done0 = apply({ ...gp0, ops: [...gp0.ops, { path: ['designed'], value: undefined }, { path: ['route'], value: chooseRoute({ style: doc.style, activeStyle: ACTIVE_STYLE, pack: null, slideText: true }) }] });
      if (!done0.ok) return setGen({ phase: 'error', message: 'The slides could not be used: ' + done0.reasons[0] });
      setNotice('');
      return setGen({ phase: 'drawing', ms: 0, attempts: 1, message: 'Drawing slide 1 of ' + built.script.slides.length + '…', extra: ' Your slide text was used as it is: no model was called.' });
    }
    if (!provider) return;
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
    // With a reference style active, Designed mode is the default: ONE design call writes the story and designs every slide from the style brief and the inspiration
    // pictures (the same call the test harness makes). The template fill (pack route) is the fallback when Designed fails, and what Quick chooses.
    const refPack = doc.style === ACTIVE_STYLE ? (activeReference()?.pack ?? null) : null;
    // A built-in preset is drawn by the layout library. "Pick for me" chooses the preset BEFORE the call (from the tone and the words of the text: the slide types are not known yet).
    const presetsOnly = carouselStyles().filter((x) => !isUserStyle(x.spec.name));
    const pickPre = options.autoStyle && doc.style !== ACTIVE_STYLE && !templateRoute() && !quickAfter && presetsOnly.length ? pickStyle({ text: doc.topic, tone: options.tone, slideTypes: [], styles: presetsOnly, writerSuggestion: null }) : null;
    const presetName = doc.style === ACTIVE_STYLE ? null : pickPre?.name ?? doc.style;
    const presetPack = presetName ? presetPackFor(presetName) : null;
    const plan = chooseRoute({ style: pickPre ? presetName! : doc.style, activeStyle: ACTIVE_STYLE, pack: refPack, mode: quickAfter ? 'quick' : doc.style === ACTIVE_STYLE ? options.mode : undefined, presetPack, format: doc.format });
    const presetUsed = plan.route === 'designed' && !refPack && presetPack ? presetName : null;
    const look = { pack: refPack ?? (presetUsed ? presetPack : null), brief: '', hasPhoto: pictures.length > 0 };
    let routeNote: { route: 'designed' | 'pack'; reason: string; error?: string; requestBytes?: ReturnType<typeof lastRequestBytes> & object } = quickAfter ? { route: 'pack', reason: 'Quick templates were chosen after Designed mode failed: ' + quickAfter.slice(0, 200) } : plan;
    let designedOut: Designed | undefined = noDesign();
    let r: Awaited<ReturnType<typeof runGenerate>>;
    if (plan.route === 'designed') {
      const d = await runDesign(req, look, options.handle.trim(), provider, ctl.signal, (phase) => setGen({ phase }));
      if (d.ok) {
        r = { ok: true, result: d.result };
        designedOut = d.designed.library ? { ...d.designed, library: { ...d.designed.library, source: presetUsed ?? 'reference' } } : d.designed;
        routeNote = { route: 'designed', reason: plan.reason + ' ' + d.designed.calls + ' model call' + (d.designed.calls === 1 ? '' : 's') + ', ' + inspirationImages(look).length + ' inspiration picture' + (inspirationImages(look).length === 1 ? '' : 's') + ', style brief ' + (refPack?.brief ? 'from the reference read' : 'derived from the pack') + '.' };
      } else if (d.state.message?.startsWith('Cancelled')) {
        r = d;
      } else {
        // Designed failed: no silent template fill. The person sees the real reason and picks Retry or the quick templates; nothing is replaced.
        const reason = d.state.message ?? 'no message';
        const sent = lastRequestBytes();
        job.waiting(null);
        job.fail('write', reason);
        job.finish('failed', reason);
        genJob.current = null;
        abort.current = null;
        apply({ label: 'Record why Designed mode failed', ops: [{ path: ['route'], value: { route: 'designed', reason: 'Designed mode failed: ' + reason.slice(0, 300), error: reason, ...(sent ? { requestBytes: sent } : {}) } }] });
        return setGen({ phase: 'error', message: designFailureMessage(reason, sent), designFailed: reason, problems: d.state.problems });
      }
    } else r = await runGenerate(req, provider, ctl.signal, (phase) => setGen({ phase }));
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
    // A designed deck keeps the reference style it was designed from; "Pick for me" only applies to the template route.
    const style = routeNote.route === 'designed' ? presetUsed : pick ? pick.name : null;
    const withHandle = { ...result.script, brand: { ...result.script.brand, handle: options.handle.trim() || result.script.brand.handle } };
    const gp = patches.generate(withHandle, style, GEN_LABEL);
    const done = apply({ ...gp, ops: [...gp.ops, { path: ['designed'], value: designedOut }, { path: ['route'], value: routeNote }] });
    if (!done.ok) {
      job.fail('apply', done.reasons[0]);
      job.finish('failed', done.reasons[0]);
      genJob.current = null;
      return setGen({ phase: 'error', message: 'The script could not be used: ' + done.reasons[0] + ' Your text is kept.' });
    }
    job.end('apply', pick ? `style: ${pick.name}` : undefined);
    {
      const sw = designedOut?.library?.flavour?.swaps ?? [];
      if (sw.length) setNotice(`Flavour: ${sw.length} layout${sw.length === 1 ? '' : 's'} changed to suit ${styleByName(presetUsed ?? '')?.spec.title ?? 'the style'}: ${sw.map((w) => `slide ${w.slide} ${w.from} to ${w.to}`).join('; ')}. Undo takes back the whole carousel; the layout picker changes any slide.`);
    }
    job.begin('draw');
    setGen({ phase: 'drawing', note: result.note, ms: result.ms, attempts: result.attempts, provider: result.provider, warnings: result.warnings, message: `Drawing slide 1 of ${result.script.slides.length}…`, styleWhy: (presetUsed ? pickPre : pick)?.why, extra: designedOut ? ` Designed mode: ${Object.keys(designedOut.slides).length} slides designed, ${Object.keys(designedOut.fallbacks).length} fell back, ${designedOut.calls} model call${designedOut.calls === 1 ? '' : 's'}.` : '' });
  };
  const [resetKey, setResetKey] = useState(0);
  /** The detected-style toggles: the choice is kept with the style (apart from the read cache) and the deck is drawn again from its stored plan, no model call. */
  const handleOverrides = async (ov: StyleOverrides | null) => {
    // The style in use: a built-in preset (kept under "preset:<name>", never in the reference cache) or the active reference.
    const presetBase = presetPackFor(doc.style, false);
    let pack: StylePack;
    if (presetBase) {
      saveOverrides(presetKey(doc.style), ov);
      pack = { ...presetBase, overrides: ov ?? undefined };
    } else {
      const a = activeReference();
      if (!a?.pack) return;
      pack = { ...a.pack, overrides: ov ?? undefined };
      setActiveRef({ ...a, pack });
      if (pack.readKey) saveOverrides(pack.readKey, ov);
      const t = pack.readKey ? savedTemplates().find((x) => x.pack && (x.pack as { readKey?: string }).readKey === pack.readKey) : null;
      if (t) await updateTemplatePack(t.id, pack as never).catch(() => undefined);
    }
    const lib = doc.designed?.library;
    if (lib?.plan && doc.designed && (lib.source ?? 'reference') !== (presetBase ? doc.style : 'reference')) {
      setNotice('Saved with this style. The slides on the page were drawn from another style, so it applies the next time you make a carousel.');
    } else if (lib?.plan && doc.designed) {
      const out = await redrawLibraryDeck(lib, { pack, hasPhoto: pictures.length > 0 }, options.handle.trim());
      apply(patches.setDesigned({ ...doc.designed, slides: out.slides, layouts: out.layouts, library: out.library }, 'Change the style devices'));
      setNotice('Style devices changed: the slides were drawn again from the same plan, no model call.');
    }
  };
  // ----- the layout picker and Rewrite text (library decks): the code draws; only Rewrite text calls the model -----
  const pickLook = { hasPhoto: pictures.length > 0 };
  const pickHandle = () => options.handle.trim() || doc.script?.brand.handle || '';
  const pickModel = (i: number) => {
    const lib = doc.designed?.library;
    return lib?.plan ? galleryModel(lib, pickLook, pickHandle(), i) : null;
  };
  const pickDraw = (i: number) => (layout: Parameters<typeof drawGalleryTile>[4], variant: 0 | 1) => {
    const lib = doc.designed?.library;
    return lib?.plan ? drawGalleryTile(lib, pickLook, pickHandle(), i, layout, variant) : Promise.resolve(null);
  };
  /** Puts a redrawn slide into the deck as ONE undo step (the script form of the slide too when its layout or text changed). */
  const putSlide = (i: number, r: Extract<Awaited<ReturnType<typeof redrawLibrarySlide>>, { ok: true }>, label: string, extraCalls = 0, usage?: { input: number; output: number }): string | null => {
    const d0 = doc.designed;
    if (!d0 || !doc.script) return 'There is no deck to change.';
    const sc = scriptWithSlide(doc.script, i, r.scriptSlide, doc.format);
    const same = JSON.stringify(doc.script.slides[i]) === JSON.stringify(sc.ok ? sc.script.slides[i] : null);
    if (!sc.ok) return 'The new slide could not be used as a script slide: ' + sc.reasons[0];
    const d = { ...d0, slides: { ...d0.slides, [String(i)]: r.slide }, layouts: { ...(d0.layouts ?? {}), [String(i)]: r.layout }, library: r.library, calls: d0.calls + extraCalls, ...(usage ? { tokens: { input: (d0.tokens?.input ?? 0) + usage.input, output: (d0.tokens?.output ?? 0) + usage.output } } : {}) };
    apply(patches.setSlideDesign(i, same ? doc.script.slides[i] : sc.script.slides[i], d, label));
    return null;
  };
  const pickChoose = async (i: number, c: PickChoice): Promise<string> => {
    const lib = doc.designed?.library;
    if (!lib?.plan) return 'This deck has no stored plan to draw from.';
    const r = await redrawLibrarySlide(lib, pickLook, pickHandle(), i, c);
    if (!r.ok) return `Could not redraw slide ${i + 1}: ${r.reasons[0]} The slide is unchanged.`;
    const bad = putSlide(i, r, c.layout ? `Change slide ${i + 1} to ${r.layout}` : `Redraw slide ${i + 1}`);
    return bad ?? `Redrew slide ${i + 1}${c.layout ? ' as ' + r.layout : ''} in code: no model call. Undo brings the old one back.`;
  };
  const pickRewrite = async (i: number, words: string): Promise<string> => {
    const lib = doc.designed?.library;
    if (!lib?.plan) return 'This deck has no stored plan to draw from.';
    if (!provider) return 'No writer is connected, so the text cannot be rewritten.';
    try {
      const r = await rewriteSlideText(lib, pickLook, pickHandle(), i, doc.topic, words, provider, new AbortController().signal);
      if (!r.ok) return `Could not rewrite slide ${i + 1}: ${r.reasons[0]} The text is kept (${r.calls} call${r.calls === 1 ? '' : 's'}).`;
      const bad = putSlide(i, r.slide, `Rewrite the text of slide ${i + 1}`, r.calls, r.tokens);
      return bad ?? `Rewrote the text of slide ${i + 1} (${r.calls} model call${r.calls === 1 ? '' : 's'}), same layout. Undo brings the old text back.`;
    } catch (e) {
      return `Could not rewrite slide ${i + 1}: ${(e as Error).message}`;
    }
  };
  /** Reset page: cancels what is running, then the page is as after a fresh load. Saved templates and Mine styles are not touched. */
  const resetPage = async () => {
    if (!window.confirm('Start over? This clears the reference, the text and the slides on this page. Your saved styles stay.')) return;
    abort.current?.abort();
    genJob.current?.finish('cancelled', 'Cancelled by Reset page.');
    genJob.current = null;
    readerControl.current?.cancel();
    cancelJob();
    clearActiveReference(true);
    pictures.forEach((p) => void removePicture(p.id));
    startOver(styleByName(DEFAULT_STYLE) ? DEFAULT_STYLE : getStyles().styles[0]?.spec.name ?? DEFAULT_STYLE);
    setPasted('');
    setCheck(null);
    setGen({ phase: 'idle' });
    setError('');
    setNotice('');
    setQuickSaved('');
    setReaderState(null);
    setNewStyleOpen(false);
    setAdvanced(false);
    setOpen(null);
    setSel(0);
    setResetKey((k) => k + 1);
    // Cancelled jobs write their last line a moment later: wait for that, then clear the Live view and the job record.
    await new Promise((r) => setTimeout(r, 400));
    await clearPageState();
    setNotice('');
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
      setGen((g) => ({ ...g, phase: 'done', message: `Done: ${slides.length} ${doc.format === 'quote' ? 'cards' : 'slides'} in ${((gen.ms ?? 0) / 1000).toFixed(0)} s of writing.${retry}${why}${note}${gen.extra ?? ''}${handle} Edit anything below.` }));
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
          <div className="row-actions"><button type="button" className="btn btn-outline btn-sm" onClick={() => void resetPage()}>Reset page</button></div>
          <p className="lead">Paste your text, pick a style, press Make carousel, then edit anything. The slides are drawn in your browser from the style, with no design call; your text goes to the writer only when you press the button.</p>
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
                  // The same clean-up as Reset page: the reference with its pack and report, the pictures, the caches and the pasted text all go. Saved styles stay.
                  abort.current?.abort();
                  readerControl.current?.cancel();
                  clearActiveReference(true);
                  pictures.forEach((p) => void removePicture(p.id));
                  startOver(doc.style === ACTIVE_STYLE ? (styleByName(DEFAULT_STYLE) ? DEFAULT_STYLE : getStyles().styles[0]?.spec.name ?? DEFAULT_STYLE) : doc.style);
                  setPasted('');
                  setGen({ phase: 'idle' });
                  setResetKey((k) => k + 1);
                  void clearPageState().then(() => setNotice('Started over: the reference, pictures and caches are cleared. Your saved styles stay.'));
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

      {/* Three steps: your text, a style (the reference box is under it), Generate. Everything else is under Advanced. */}
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
        onGenerate={() => void generate()}
        onUseQuick={() => void generate({ quickAfterFail: gen.designFailed ?? 'Designed mode failed' })}
        onCancel={cancel}
        provider={provider}
        providers={providers}
        styles={<>
          <StylePicker key={resetKey} format={doc.format} value={doc.style} auto={options.autoStyle} onAuto={() => setOptions({ autoStyle: true })} onPick={(name, title) => { setOptions({ autoStyle: false }); apply(patches.style(name, title)); }} onNewStyle={() => setNewStyleOpen((v) => !v)} newStyleOpen={newStyleOpen} />
          {targetWarning(doc.style, 'carousel') && <p className="small cr-warn" role="status">{targetWarning(doc.style, 'carousel')}</p>}
        </>}
        styleExtra={<DetectedStyleBox pack={presetPackFor(doc.style)} onChange={(ov) => void handleOverrides(ov)} hasDeck={!!doc.designed?.library?.plan} />}
        referenceBox={<NewStyleBox key={resetKey} open={newStyleOpen} onClose={() => setNewStyleOpen(false)} control={readerControl} state={readerState} saved={quickSaved} description={
        <NewStyleFlow
          key={resetKey}
          text={doc.topic}
          tone={options.tone}
          slides={options.slides}
          handle={options.handle.trim()}
          provider={provider}
          only="description"
          onClose={() => setNewStyleOpen(false)}
          onCreated={(r) => {
            setOptions({ autoStyle: false });
            if (r.script) {
              const gp = patches.generate({ ...r.script, brand: { ...r.script.brand, handle: options.handle.trim() || r.script.brand.handle } }, r.name, 'New style: ' + r.title);
              apply({ ...gp, ops: [...gp.ops, { path: ['designed'], value: undefined }] });
            } else apply(patches.style(r.name, r.title));
            setNewStyleOpen(false);
            setNotice('Made the style ' + r.title + ' and selected it.');
          }}
        />
        } />}
        styleReady={options.autoStyle || !!styleByName(doc.style)}
      />
      {notice && <p className="small" role="status">{notice}</p>}
      <DeckFlags doc={doc} />

      <details className="card ws-card cr-advanced" open={advanced} onToggle={(e) => setAdvanced((e.target as HTMLDetailsElement).open)}>
        <summary className="h4">Advanced: write the script yourself, options and tools</summary>
          <h3 className="h4">Styles, New style and the reference tools</h3>
          <p className="small muted">New style (from a description or a reference), Recreate and Match mode, the pack maker and the saved styles all live here.</p>
          <h3 className="h4">Recreate and Match mode (from a reference)</h3>
          <MatchPanel skipReader target="carousel" title={doc.script?.title} photo={doc.photos?.[0] && urlOfPic(doc.photos[0].id) && sizeOfPic(doc.photos[0].id) ? { url: urlOfPic(doc.photos[0].id)!, name: doc.photos[0].name, ...sizeOfPic(doc.photos[0].id)! } : null} current={doc.style} onUse={() => { if (justSaved.current && (activeReference()?.source ?? 'reference') === 'reference') return; setOptions({ autoStyle: false }); apply(patches.style(ACTIVE_STYLE, 'Reference')); }} onRemove={() => setOptions({ autoStyle: true })} />

          <details className="tn-more" aria-label="Reference reader">
            <summary className="small">Reference reader (match mode: the full reader that steps 1 and 2 use)</summary>
            <Suspense fallback={<p className="small muted" role="status">Loading…</p>}>
              <ReferenceStylePage key={resetKey} embedded target="carousel" title={doc.script?.title} controlRef={readerControl} onState={(st) => { if (st.busy) justSaved.current = false; setReaderState(st); }} onStyleSaved={onQuickSaved} />
            </Suspense>
          </details>
          <p className="small"><Link to="/images/styles">Open the Styles page</Link> (your saved styles and templates).</p>
          <ReportPanel doc={doc} />
        <div className="create-form">
          <h3 className="h4">Options</h3>
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
        onGenerate={() => void generate()}
        onUseQuick={() => void generate({ quickAfterFail: gen.designFailed ?? 'Designed mode failed' })}
        onCancel={cancel}
        provider={provider}
        providers={providers}
        styles={null}
        part="options"
      />
          <h3 className="h4">Rebuild a built-in style as a pack (no model call)</h3>
          <StylePicker key={resetKey} rebuildOnly format={doc.format} value={doc.style} auto={options.autoStyle} onAuto={() => undefined} onPick={() => undefined} />
          <h3 className="h4">Write the script yourself</h3>
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
              <h3 className="h4">Designed slides, pictures and photos</h3>
      <DesignedCard doc={doc} />
      <ImageRequestsPanel doc={doc} apply={apply} />
      <PhotosStrip pictures={pictures} supported={hasPhotoStyle} styleTitle={style?.spec.title ?? 'This style'} addFiles={addFiles} onRemove={(id) => void removePictureEverywhere(id)} onCutout={makeCutout} editableCutouts={cutouts.ids} onEditCutout={(id) => void editCutout(id)} usedOn={usedOn} storageProblem={currentStorageProblem()} lowRoom={lowRoom} />
      {editing && <CutoutEditor record={editing} onSave={(r) => void saveEdited(r)} onClose={() => setEditing(null)} />}
          <div className="cr-groups-tools">
            <button type="button" className="btn btn-outline btn-sm cr-quiet" aria-pressed={g.all} onClick={() => g.setAll(!g.all)}>{g.all ? 'One group at a time' : 'Open all groups'}</button>
          </div>
        </div>
      </details>

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
                onRedesign={legacySvgRoute() && !doc.designed?.library?.plan && doc.script && provider ? async (words) => {
                  const look = { pack: packFor(doc.style), brief: options.brief || 'the look of the "' + (style?.spec.title ?? doc.style) + '" style' };
                  try {
                    const r = await redesignSlide(doc.script!, i, doc.designed, look, words, provider, new AbortController().signal);
                    if (!r.ok) return `Could not redesign slide ${i + 1}: ${r.reasons[0] ?? 'the design could not be used'} The current look is kept (${r.calls} calls).`;
                    const d = doc.designed ?? { slides: {}, fallbacks: {}, notes: [], calls: 0, ms: 0 };
                    const { [String(i)]: _gone, ...fallbacks } = d.fallbacks;
                    apply(patches.setDesigned({ ...d, slides: { ...d.slides, [String(i)]: { pack: r.pack, ...(r.recurring?.length ? { recurring: r.recurring } : {}) } }, fallbacks, calls: d.calls + r.calls }, `Redesign slide ${i + 1}`));
                    return `Redesigned slide ${i + 1} (${r.calls} model call${r.calls === 1 ? '' : 's'}). Undo brings the old design back.`;
                  } catch (e) {
                    return `Could not redesign slide ${i + 1}: ${(e as Error).message}`;
                  }
                } : undefined}
                gallery={doc.designed?.library?.plan ? <LayoutGallery index={i} model={pickModel(i)} draw={pickDraw(i)} onChoose={(c) => pickChoose(i, c)} onRewrite={(w) => pickRewrite(i, w)} /> : undefined}
                onImageText={(text) => {
                  const r = requestFromText(text, i, packFor(doc.style)?.palette ?? {});
                  if (!r) return 'Say what the picture should show.';
                  apply(patches.setImageRequests([...(doc.imageRequests ?? []), r], `Add a picture request on slide ${i + 1}`));
                  return `Added a picture request for slide ${i + 1}. Generate it under "Pictures for the image slots".`;
                }}
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
