// Recreate: the model draws the reference as an SVG slide; the code makes it layers. The layers are listed by role and name, can be edited by hand (undoable),
// saved as a template, and are used on every slide of the carousel with the person's own words. One look-and-fix by itself, one more on "Improve".
import { useEffect, useRef, useState } from 'react';
import { renderer } from '../carousel/render';
import { loadFonts } from '../image-engine/fonts';
import { blankStyle } from './blank';
import { activeReference, setActiveReference, useActiveReference } from './active';
import { bitmapOf, cut, jpegUrl, pxOfCanvas, previewOf, readerImageOf } from './images';
import { detectReaders, type ReferenceReader } from './reader';
import { answerToLayers, buildFixPrompt, buildRecreatePrompt, callRecreate, parsePath, RECREATE_CAP, resolveTokens, segsToD, transformSegs, type RecreateSpec, type RLayer } from './recreate';
import { saveTemplate, styleNameFor } from './templates';
import { listElements } from '../image-engine/assets/library';
import { PackMaker } from './PackMaker';
import { svgToPng } from './faithful';
import { chooseSlide } from './slides';
import type { ImageSlot } from '../images/slots';

const W = 1080;
const H = 1350;
interface Ref {
  url: string;
  name: string;
  /** The size in px of the picture that is sent. */
  width: number;
  height: number;
  srcW: number;
  srcH: number;
  split: boolean;
  canSplit: boolean;
  why: string;
}
interface State {
  layers: RLayer[];
  palette: Record<string, string>;
}

/** The one slide that is sent to the reader (a sheet of slides is split only when it clearly is one, or when the person asks; a flat piece is never sent), at 1400 px. */
export async function referenceAt1400(file: File, mode: 'auto' | 'whole' | 'split' = 'auto'): Promise<Ref> {
  const bm = await bitmapOf(file);
  const pxAt = (size: number) => {
    const small = cut(bm, null, size);
    return { p: pxOfCanvas(small), k: bm.width / small.width };
  };
  const choice = chooseSlide(pxAt, mode);
  const meta = { srcW: bm.width, srcH: bm.height, split: choice.split, canSplit: choice.canSplit, why: choice.why };
  if (!choice.rect && bm.width <= 1400 && bm.height <= 1400 && /^image\/(jpeg|png)$/.test(file.type)) {
    bm.close();
    return { url: await blobUrl(file), name: file.name, width: meta.srcW, height: meta.srcH, ...meta };
  }
  // A slide cut out of a sheet can be a few hundred px wide: it is scaled UP to 1400 px so the reader gets a full-size picture (no new detail, but a size it reads well).
  const j = await jpegUrl(bm, choice.rect, 1400, !!choice.rect);
  bm.close();
  return { url: j.url, name: file.name, width: j.width, height: j.height, ...meta };
}

const plan = (layers: RLayer[]) => ({ schema: 1 as const, revision: 1, canvas: { width: W, height: H, background: '#FFFFFF' }, layers });
async function renderUrl(s: State, scale: number): Promise<Blob> {
  await loadFonts();
  return renderer.preview(plan(resolveTokens(s.layers, s.palette)), scale);
}
const blobUrl = (b: Blob) =>
  new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsDataURL(b);
  });

function groupsOf(layers: RLayer[]) {
  const out: { name: string; layers: RLayer[] }[] = [];
  for (const l of layers) {
    const g = out.find((x) => x.name === l.name);
    if (g) g.layers.push(l);
    else out.push({ name: l.name, layers: [l] });
  }
  return out;
}
function scaleGroup(layers: RLayer[], name: string, k: number): RLayer[] {
  const g = layers.filter((l) => l.name === name);
  const cx = g.reduce((s, l) => s + l.x + l.width / 2, 0) / g.length;
  const cy = g.reduce((s, l) => s + l.y + l.height / 2, 0) / g.length;
  return layers.map((l) => {
    if (l.name !== name) return l;
    const x = cx + (l.x - cx) * k;
    const y = cy + (l.y - cy) * k;
    const base = { ...l, x, y, width: l.width * k, height: l.height * k };
    if (base.kind === 'path') return { ...base, d: segsToD(transformSegs(parsePath(l.kind === 'path' ? l.d : ''), [k, 0, 0, k, 0, 0])), ...(l.kind === 'path' && l.stroke ? { stroke: { ...l.stroke, width: Math.max(1, l.stroke.width * k) } } : {}) } as RLayer;
    if (base.kind === 'text' && l.kind === 'text') return { ...base, style: { ...l.style, size: Math.max(12, Math.round(l.style.size * k)) } } as RLayer;
    if (base.kind === 'shape' && l.kind === 'shape') return { ...base, ...(l.radius ? { radius: l.radius * k } : {}) } as RLayer;
    return base;
  });
}

export function RecreatePanel({ ownRoles, title }: { ownRoles: string[]; title?: string }) {
  const { removed } = useActiveReference();
  const [readers, setReaders] = useState<ReferenceReader[] | null>(null);
  const [ref, setRef] = useState<Ref | null>(null);
  const [refFile, setRefFile] = useState<File | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [past, setPast] = useState<State[]>([]);
  const [future, setFuture] = useState<State[]>([]);
  const [calls, setCalls] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [words, setWords] = useState('');
  const [view, setView] = useState('');
  const [over, setOver] = useState(false);
  const [swapFor, setSwapFor] = useState<string | null>(null);
  const [svg, setSvg] = useState('');
  // The picture as the reader drew it is the main view until the person edits (or presses Make editable); the layers are drawn after that.
  const [edited, setEdited] = useState(false);
  const editedRef = useRef(false);
  const svgRef = useRef('');
  const slotsRef = useRef<ImageSlot[]>([]);
  const [q, setQ] = useState('');
  const abort = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    void detectReaders().then((r) => live && setReaders(r));
    return () => {
      live = false;
    };
  }, []);
  const seen = useRef(removed);
  useEffect(() => {
    if (removed !== seen.current) {
      seen.current = removed;
      setState(null);
      setPast([]);
      setFuture([]);
      setCalls(0);
      setRef(null);
      setMsg('');
    }
  }, [removed]);

  /** Publishes the layers as the active look and draws the view. Returns the reason in plain words when the editable layers could not be drawn (the picture as the reader drew it is then kept). */
  const publish = async (s: State, n: string[] = notes, svgText?: string): Promise<string | null> => {
    const spec = { ...blankStyle(), name: 'recreated', title: 'Recreated look' };
    const rec: RecreateSpec = { layers: s.layers, palette: s.palette, canvas: { w: W, h: H }, notes: n, ...(slotsRef.current.length ? { slots: slotsRef.current } : {}) };
    setActiveReference({ spec, thumb: ref ? await previewOf(await (await fetch(ref.url)).blob(), 160) : '', learn: 'everything', target: 'carousel', ratioNote: null, photoRegion: null, source: 'recreate', recreate: rec });
    try {
      const asWritten = svgText ?? svg;
      setView(await blobUrl(!editedRef.current && asWritten ? await svgToPng(asWritten, 540) : await renderUrl(s, 0.5)));
      return null;
    } catch (e) {
      const why = String((e as Error)?.message ?? e).replace(/^This plan cannot be drawn:s*/, '');
      try {
        const asWritten = svgText ?? svg;
        setView(asWritten ? await blobUrl(await svgToPng(asWritten, 540)) : '');
      } catch {
        setView('');
      }
      return why;
    }
  };
  const ctx = { w: W, h: H, ownRoles };
  const noReader = !readers?.length;

  const add = async (files: File[]) => {
    const f = files.find((x) => x.type.startsWith('image/'));
    if (!f) return;
    try {
      setRef(await referenceAt1400(f));
      setRefFile(f);
      setState(null);
      setCalls(0);
      setMsg('');
    } catch {
      setMsg(`“${f.name}” could not be read as a picture.`);
    }
  };
  /** The toggle: the whole image, or its first slide when it is a sheet of slides. */
  const pickSplit = async (split: boolean) => {
    if (!refFile || busy) return;
    try {
      setRef(await referenceAt1400(refFile, split ? 'split' : 'whole'));
      setState(null);
      setCalls(0);
      setMsg('');
    } catch {
      setMsg('The picture could not be read again.');
    }
  };
  useEffect(() => {
    const on = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
      const fs = [...(e.clipboardData?.files ?? [])];
      if (fs.some((f) => f.type.startsWith('image/'))) {
        e.preventDefault();
        void add(fs);
      }
    };
    document.addEventListener('paste', on);
    return () => document.removeEventListener('paste', on);
  });

  /** One model call: the first read (the reference alone) or a look-and-fix (the reference and a render of the current layers, back at 1400 px). */
  const call = async (kind: 'new' | 'fix', feedback = ''): Promise<boolean> => {
    if (!ref || noReader) return false;
    abort.current = new AbortController();
    const refImg = readerImageOf(ref.url, 'reference.jpg');
    let images = [refImg];
    if (kind === 'fix' && state) {
      const b = !editedRef.current && svgRef.current ? await svgToPng(svgRef.current, 1400) : await renderUrl(state, 1400 / H);
      images = [refImg, readerImageOf(await blobUrl(b), 'render.jpg')];
    }
    setCalls((c) => c + 1);
    const answer = await callRecreate(readers![0], kind === 'new' ? buildRecreatePrompt(ctx) : buildFixPrompt(ctx, feedback), images, abort.current.signal);
    const r = await answerToLayers(answer, ctx);
    if (!r.ok) {
      setMsg(`The picture could not be used: ${r.reasons.join(' ')}`);
      return false;
    }
    const next = { layers: r.result.layers, palette: r.result.palette };
    const n = [...r.result.notes, ...r.result.wished.map((w) => `Font: wanted ${w.wish}, used ${w.used}.`)];
    if (state) setPast((p) => [...p, state]);
    setFuture([]);
    setState(next);
    setNotes(n);
    editedRef.current = false;
    setEdited(false);
    svgRef.current = r.result.svg;
    slotsRef.current = r.result.slots;
    setSvg(r.result.svg);
    await publish(next, n, r.result.svg);
    return true;
  };
  const recreate = async () => {
    if (busy || !ref) return;
    setBusy(true);
    setMsg('Drawing the reference…');
    try {
      const ok = await call('new');
      if (ok) {
        setMsg('Drawn. Looking at it next to the reference…');
        // The one look-and-fix that comes by itself.
        const cur = activeReference()?.recreate;
        if (cur) {
          setState({ layers: cur.layers, palette: cur.palette });
          const fixed = await callFix(cur);
          setMsg(fixed ? 'Drawn, compared and corrected once. Used on every slide with your own words.' : 'Drawn. The correction could not be used, so the first drawing stays.');
        }
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const callFix = async (cur: RecreateSpec, feedback = ''): Promise<boolean> => {
    // The state may not have been committed yet when this runs straight after the first call, so the fix works from the published layers.
    const s = { layers: cur.layers, palette: cur.palette };
    abort.current = new AbortController();
    const b = !editedRef.current && svgRef.current ? await svgToPng(svgRef.current, 1400) : await renderUrl(s, 1400 / H);
    const images = [readerImageOf(ref!.url, 'reference.jpg'), readerImageOf(await blobUrl(b), 'render.jpg')];
    setCalls((c) => c + 1);
    const answer = await callRecreate(readers![0], buildFixPrompt(ctx, feedback), images, abort.current.signal);
    const r = await answerToLayers(answer, ctx);
    if (!r.ok) {
      setMsg(`The correction could not be used: ${r.reasons.join(' ')}`);
      return false;
    }
    const next = { layers: r.result.layers, palette: r.result.palette };
    const n = [...r.result.notes, ...r.result.wished.map((w) => `Font: wanted ${w.wish}, used ${w.used}.`)];
    setPast((p) => [...p, s]);
    setFuture([]);
    setState(next);
    setNotes(n);
    editedRef.current = false;
    setEdited(false);
    svgRef.current = r.result.svg;
    slotsRef.current = r.result.slots;
    setSvg(r.result.svg);
    await publish(next, n, r.result.svg);
    return true;
  };
  const improve = async () => {
    if (busy || !state || calls >= RECREATE_CAP) return;
    setBusy(true);
    setMsg('Looking at it again…');
    try {
      const ok = await callFix({ layers: state.layers, palette: state.palette, canvas: { w: W, h: H }, notes }, words);
      if (ok) {
        setMsg('Corrected.');
        setWords('');
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ----- editing by hand (undo and redo) -----
  const commit = (s: State) => {
    if (!state) return;
    setPast((p) => [...p, state]);
    setFuture([]);
    setState(s);
    editedRef.current = true;
    setEdited(true);
    void publish(s);
  };
  const step = (dir: 'undo' | 'redo') => {
    if (!state) return;
    const to = dir === 'undo' ? past[past.length - 1] : future[0];
    if (!to) return;
    if (dir === 'undo') {
      setPast(past.slice(0, -1));
      setFuture([state, ...future]);
    } else {
      setFuture(future.slice(1));
      setPast([...past, state]);
    }
    setState(to);
    void publish(to);
  };
  /** A drawing group becomes one element of the library, in the same box (resize and recolour work on it like on the drawing). */
  const swap = (name: string, element: string) => {
    if (!state) return;
    const g = state.layers.filter((l) => l.name === name);
    if (!g.length) return;
    const x0 = Math.min(...g.map((l) => l.x));
    const y0 = Math.min(...g.map((l) => l.y));
    const x1 = Math.max(...g.map((l) => l.x + l.width));
    const y1 = Math.max(...g.map((l) => l.y + l.height));
    const first = state.layers.findIndex((l) => l.name === name);
    const tint = g.flatMap((l) => (l.kind === 'path' ? [l.stroke?.color, l.fill].filter((c): c is string => !!c) : [])).find((c) => c !== 'none');
    const el = { kind: 'element', id: `${name}:element`, name, role: 'decor', x: x0, y: y0, width: x1 - x0, height: y1 - y0, rotation: 0, opacity: 1, element, ...(tint ? { tint } : {}) } as RLayer;
    const rest = state.layers.filter((l) => l.name !== name);
    rest.splice(Math.min(first, rest.length), 0, el);
    setSwapFor(null);
    setQ('');
    commit({ ...state, layers: rest });
  };
  /** One colour for the whole group (its strokes, fills and tint). */
  const recolour = (name: string, hex: string) => {
    if (!state) return;
    commit({
      ...state,
      layers: state.layers.map((l) => {
        if (l.name !== name) return l;
        if (l.kind === 'path') return { ...l, ...(l.fill && l.fill !== 'none' ? { fill: hex } : {}), ...(l.stroke ? { stroke: { ...l.stroke, color: hex } } : {}) } as RLayer;
        if (l.kind === 'element') return { ...l, tint: hex } as RLayer;
        return l;
      }),
    });
  };
  const found = q.trim().length < 2 ? [] : listElements().filter((e) => [e.id, e.name, ...e.tags].join(' ').toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12);
  const move = (name: string, dx: number, dy: number) => state && commit({ ...state, layers: state.layers.map((l) => (l.name === name ? { ...l, x: l.x + dx, y: l.y + dy } : l)) });
  const save = async () => {
    if (!state) return;
    const name = `Recreated: ${(ref?.name ?? 'look').replace(/\.[^.]+$/, '').slice(0, 24)}`;
    // The preview is a render of the recreated layers, never the reference.
    // Until the person edits, the template's picture is the faithful render.
    const preview = await previewOf(!editedRef.current && svg ? await svgToPng(svg, 360) : await renderUrl(state, 0.3), 360);
    const rec: RecreateSpec = { layers: state.layers, palette: state.palette, canvas: { w: W, h: H }, notes, ...(slotsRef.current.length ? { slots: slotsRef.current } : {}) };
    await saveTemplate({ name, target: 'carousel', spec: { ...blankStyle(), name: styleNameFor(name), title: name }, preview, recreate: rec });
    setMsg(`Saved “${name}” as a template: the layers and palette only, no reference pixels. New text refits its places with no model call.`);
  };

  return (
    <div className="rf-recreate">
      <div
        className={`cr-drop rf-drop${over ? ' over' : ''}`}
        data-testid="recreate-drop"
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void add([...e.dataTransfer.files]); }}
      >
        <p className="small">{ref ? `Reference: ${ref.name}` : 'Drop, pick or paste (Ctrl+V) one carousel slide. A picture of one slide is sent whole.'}</p>
        {ref && (
          <div className="rf-chip-bar" role="group" aria-label="What will be sent">
            <img src={ref.url} alt="The picture that will be sent" width={64} />
            <span className="small" data-testid="recreate-sent">Sent: {ref.width} × {ref.height} px{ref.split ? ` (the first slide of a sheet, from ${ref.srcW} × ${ref.srcH} px)` : ''}. {ref.why}</span>
            {Math.max(ref.width, ref.height) < 1000 && <span className="small cr-warn">Small reference: fine details may be lost.</span>}
            <div role="radiogroup" aria-label="Whole image or slides">
              <button type="button" role="radio" aria-checked={!ref.split} className="chip-btn" onClick={() => void pickSplit(false)}>Use whole image</button>
              <button type="button" role="radio" aria-checked={ref.split} className="chip-btn" disabled={!ref.canSplit} onClick={() => void pickSplit(true)}>Split into slides</button>
            </div>
          </div>
        )}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>{ref ? 'Use another picture' : 'Choose a picture'}</button>
        <input ref={fileRef} type="file" accept="image/*" className="visually-hidden" tabIndex={-1} aria-label="Choose a picture to recreate" onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </div>
      <div className="row-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={!ref || busy || noReader || calls >= RECREATE_CAP} onClick={() => void recreate()}>{busy ? 'Working…' : 'Recreate'}</button>
        <span className="small" role="status" aria-label="Recreate model calls">Model calls: {calls} of {RECREATE_CAP}</span>
        {busy && <button type="button" className="btn btn-outline btn-sm" onClick={() => abort.current?.abort()}>Cancel</button>}
      </div>
      <p className="small muted">The picture is sent at 1400 px to the reader, which draws it as vector shapes and text; nothing of the reference is kept in the result.</p>
      {readers && readers.length === 0 && <p className="small cr-warn" role="status">No reader is connected, so Recreate is off. Start the app with the dev server or give the server an API key.</p>}
      {msg && <p className="small" role="status" aria-live="polite" data-testid="recreate-status">{msg}</p>}
      {state && (
        <>
          <div className="rf-pair">
            {ref && <img src={ref.url} alt="The reference" width={200} />}
            {view && <img src={view} alt="The recreated slide" width={200} />}
          </div>
          <div className="row-actions">
            <label className="tn-field">
              <span className="field-label">Tell it what to fix (optional)</span>
              <input className="input" value={words} onChange={(e) => setWords(e.target.value)} aria-label="Your words for the correction" />
            </label>
            <button type="button" className="btn btn-outline btn-sm" disabled={busy || calls >= RECREATE_CAP} onClick={() => void improve()}>Improve (one model call)</button>
            {!edited && <button type="button" className="btn btn-outline btn-sm" onClick={() => { editedRef.current = true; setEdited(true); void publish(state).then((why) => { if (why) { editedRef.current = false; setEdited(false); setMsg(`Make editable stopped: ${why} The picture as the reader drew it stays shown.`); } else setMsg(`Now drawn from editable layers. ${notes.length ? `What changes: ${notes.slice(0, 4).join(' ')}` : 'Nothing was lost in the conversion.'}`); }); }}>Make editable</button>}
            <button type="button" className="btn btn-outline btn-sm" disabled={past.length === 0} onClick={() => step('undo')}>Undo</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={future.length === 0} onClick={() => step('redo')}>Redo</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void save()}>Save as template</button>
          </div>
          {calls >= RECREATE_CAP && <p className="small muted" role="status">The limit of {RECREATE_CAP} model calls for this reference is reached.</p>}
          {notes.length > 0 && (
            <ul className="small" aria-label="Recreate notes">
              {notes.slice(0, 8).map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
          <div role="group" aria-label="Palette" className="row-actions">
            {Object.entries(state.palette).map(([role, c]) => (
              <label key={role} className="cr-inline small"><span className="field-label">{role}</span><input type="color" value={c} aria-label={`Palette ${role}`} onChange={(e) => commit({ ...state, palette: { ...state.palette, [role]: e.target.value.toUpperCase() } })} /></label>
            ))}
          </div>
          <PackMaker kind="reference" reference={ref} first={{ svg, layers: state.layers }} />
          <ol className="small rf-layers" aria-label="Layers">
            {groupsOf(state.layers).map((g) => (
              <li key={g.name} aria-label={`Layer ${g.name}`}>
                <strong>{g.name}</strong> · {g.layers[0].kind === 'text' ? 'text' : g.layers[0].kind === 'path' ? `drawing, ${g.layers.length} part${g.layers.length === 1 ? '' : 's'}` : g.layers[0].kind === 'element' ? `library graphic (${(g.layers[0] as { element: string }).element})` : 'shape'}
                {g.layers[0].kind === 'text' && (
                  <input className="input" aria-label={`Text of ${g.name}`} value={(g.layers[0] as { text: string }).text} onChange={(e) => commit({ ...state, layers: state.layers.map((l) => (l === g.layers[0] && l.kind === 'text' ? { ...l, text: e.target.value } : l)) })} />
                )}
                <span className="row-actions">
                  <button type="button" className="btn btn-outline btn-sm" aria-label={`Make ${g.name} smaller`} onClick={() => commit({ ...state, layers: scaleGroup(state.layers, g.name, 0.9) })}>Smaller</button>
                  <button type="button" className="btn btn-outline btn-sm" aria-label={`Make ${g.name} bigger`} onClick={() => commit({ ...state, layers: scaleGroup(state.layers, g.name, 1.1) })}>Bigger</button>
                  <button type="button" className="btn btn-outline btn-sm" aria-label={`Move ${g.name} left`} onClick={() => move(g.name, -W * 0.01, 0)}>←</button>
                  <button type="button" className="btn btn-outline btn-sm" aria-label={`Move ${g.name} right`} onClick={() => move(g.name, W * 0.01, 0)}>→</button>
                  <button type="button" className="btn btn-outline btn-sm" aria-label={`Move ${g.name} up`} onClick={() => move(g.name, 0, -H * 0.01)}>↑</button>
                  <button type="button" className="btn btn-outline btn-sm" aria-label={`Move ${g.name} down`} onClick={() => move(g.name, 0, H * 0.01)}>↓</button>
                  {(g.layers[0].kind === 'path' || g.layers[0].kind === 'element') && (
                    <>
                      <button type="button" className="btn btn-outline btn-sm" aria-label={`Swap graphic ${g.name}`} aria-expanded={swapFor === g.name} onClick={() => { setSwapFor(swapFor === g.name ? null : g.name); setQ(''); }}>Swap graphic</button>
                      <label className="cr-inline small"><span className="field-label">Colour</span><input type="color" aria-label={`Colour of ${g.name}`} defaultValue="#000000" onChange={(e) => recolour(g.name, e.target.value.toUpperCase())} /></label>
                    </>
                  )}
                  <button type="button" className="btn btn-outline btn-sm" aria-label={`Delete ${g.name}`} onClick={() => commit({ ...state, layers: state.layers.filter((l) => l.name !== g.name) })}>Delete</button>
                </span>
                {swapFor === g.name && (
                  <div role="group" aria-label={`Library for ${g.name}`}>
                    <input className="input" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the element library" placeholder="arrow, clock, star…" />
                    {q.trim().length >= 2 && found.length === 0 && <p className="small muted" role="status">Nothing in the library matches “{q.trim()}”.</p>}
                    <ul className="row-actions">
                      {found.map((e) => <li key={e.id}><button type="button" className="btn btn-outline btn-sm" aria-label={`Use ${e.name} (${e.id})`} onClick={() => swap(g.name, e.id)}>{e.name}</button></li>)}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <p className="small muted">Your slides {title ? `(“${title}”)` : ''} use these layers with their own words{ownRoles.length ? '' : ''}. Swap graphic replaces a drawing with an element from the library (no model call).</p>
        </>
      )}
    </div>
  );
}
