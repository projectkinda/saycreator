// Recreate: the model draws the reference as an SVG slide; the code makes it layers. The layers are listed by role and name, can be edited by hand (undoable),
// saved as a template, and are used on every slide of the carousel with the person's own words. One look-and-fix by itself, one more on "Improve".
import { useEffect, useRef, useState } from 'react';
import { renderer } from '../carousel/render';
import { loadFonts } from '../image-engine/fonts';
import { blankStyle } from './blank';
import { activeReference, setActiveReference, useActiveReference } from './active';
import { bitmapOf, cut, jpegUrl, pxOfCanvas, previewOf, readerImageOf } from './images';
import { detectGrid } from './grid';
import { detectReaders, type ReferenceReader } from './reader';
import { answerToLayers, buildFixPrompt, buildRecreatePrompt, callRecreate, parsePath, RECREATE_CAP, resolveTokens, segsToD, transformSegs, type RecreateSpec, type RLayer } from './recreate';
import { saveTemplate, styleNameFor } from './templates';

const W = 1080;
const H = 1350;
interface Ref {
  url: string;
  name: string;
}
interface State {
  layers: RLayer[];
  palette: Record<string, string>;
}

/** The first slide of a picture (a carousel sheet is split the way the style-from-references page splits it), at 1400 px. */
async function referenceAt1400(file: File): Promise<Ref> {
  const bm = await bitmapOf(file);
  let rect = null;
  for (const size of [1400, 900, 600]) {
    const small = cut(bm, null, size);
    const g = detectGrid(pxOfCanvas(small));
    if (g) {
      const k = bm.width / small.width;
      const c = g.cells[0];
      rect = { x: Math.round(c.x * k), y: Math.round(c.y * k), width: Math.round(c.width * k), height: Math.round(c.height * k) };
      break;
    }
  }
  const j = await jpegUrl(bm, rect, 1400);
  bm.close();
  return { url: j.url, name: file.name };
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

  const publish = async (s: State, n: string[] = notes) => {
    const spec = { ...blankStyle(), name: 'recreated', title: 'Recreated look' };
    const rec: RecreateSpec = { layers: s.layers, palette: s.palette, canvas: { w: W, h: H }, notes: n };
    setActiveReference({ spec, thumb: ref ? await previewOf(await (await fetch(ref.url)).blob(), 160) : '', learn: 'everything', target: 'carousel', ratioNote: null, photoRegion: null, source: 'recreate', recreate: rec });
    try {
      setView(await blobUrl(await renderUrl(s, 0.5)));
    } catch {
      setView('');
    }
  };
  const ctx = { w: W, h: H, ownRoles };
  const noReader = !readers?.length;

  const add = async (files: File[]) => {
    const f = files.find((x) => x.type.startsWith('image/'));
    if (!f) return;
    try {
      setRef(await referenceAt1400(f));
      setState(null);
      setCalls(0);
      setMsg('');
    } catch {
      setMsg(`“${f.name}” could not be read as a picture.`);
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
      const b = await renderUrl(state, 1400 / H);
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
    await publish(next, n);
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
    const b = await renderUrl(s, 1400 / H);
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
    await publish(next, n);
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
  const move = (name: string, dx: number, dy: number) => state && commit({ ...state, layers: state.layers.map((l) => (l.name === name ? { ...l, x: l.x + dx, y: l.y + dy } : l)) });
  const save = async () => {
    if (!state) return;
    const name = `Recreated: ${(ref?.name ?? 'look').replace(/\.[^.]+$/, '').slice(0, 24)}`;
    // The preview is a render of the recreated layers, never the reference.
    const preview = await previewOf(await renderUrl(state, 0.3), 360);
    const rec: RecreateSpec = { layers: state.layers, palette: state.palette, canvas: { w: W, h: H }, notes };
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
        <p className="small">{ref ? `Reference: ${ref.name}` : 'Drop, pick or paste (Ctrl+V) one carousel slide. A sheet of slides uses its first slide.'}</p>
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
          <ol className="small rf-layers" aria-label="Layers">
            {groupsOf(state.layers).map((g) => (
              <li key={g.name} aria-label={`Layer ${g.name}`}>
                <strong>{g.name}</strong> · {g.layers[0].kind === 'text' ? 'text' : g.layers[0].kind === 'path' ? `drawing, ${g.layers.length} part${g.layers.length === 1 ? '' : 's'}` : 'shape'}
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
                  <button type="button" className="btn btn-outline btn-sm" aria-label={`Delete ${g.name}`} onClick={() => commit({ ...state, layers: state.layers.filter((l) => l.name !== g.name) })}>Delete</button>
                </span>
              </li>
            ))}
          </ol>
          <p className="small muted">Your slides {title ? `(“${title}”)` : ''} use these layers with their own words{ownRoles.length ? '' : ''}. Swapping a drawing for a library element is not available yet.</p>
        </>
      )}
    </div>
  );
}
