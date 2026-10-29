// "Describe the look": a line or two of words become a layout drawn on the person's own content (one model call), then follow-ups in plain words change it
// (one small text call each, undoable). Needs no picture; the active reference is sent along only when there is one.
import { useEffect, useRef, useState } from 'react';
import { checkSpec } from './spec';
import { ACTIVE_STYLE, activeReference, setActiveReference, useActiveReference } from './active';
import { applyEdit, buildDescribePrompt, buildEditPrompt, callDescribe, CapReached, DESCRIBE_CAP, EXAMPLES, freeToScene, parseDescribe, parseEdit, sceneToFree, specFromFree, useDescribeCalls, type DScene } from './describe';
import { readerImageOf } from './images';
import { detectReaders, type ReferenceReader } from './reader';
import { saveTemplate, styleNameFor } from './templates';
import { loadLayouts } from '../layouts/store';

const TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
export const SKELETON_KEY = 'creator.skeleton';

export function DescribePanel({ target, title, canvas, hasPhoto, hasCutout, getPreview }: { target: 'thumbnail' | 'carousel'; title: string; canvas: { w: number; h: number }; hasPhoto: boolean; hasCutout: boolean; getPreview?: () => Promise<string | null> }) {
  const calls = useDescribeCalls();
  const { removed } = useActiveReference();
  const [readers, setReaders] = useState<ReferenceReader[] | null>(null);
  const [text, setText] = useState('');
  const [edit, setEdit] = useState('');
  const [scene, setScene] = useState<DScene | null>(null);
  const [past, setPast] = useState<DScene[]>([]);
  const [future, setFuture] = useState<DScene[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [skeleton, setSkeleton] = useState<{ id: string; scene: DScene } | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    let live = true;
    void detectReaders().then((r) => live && setReaders(r));
    return () => {
      live = false;
    };
  }, []);
  // A layout chosen in the Layouts gallery is the starting skeleton.
  useEffect(() => {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(SKELETON_KEY);
    } catch {
      /* no skeleton */
    }
    if (!id) return;
    void loadLayouts().then((r) => {
      const l = r.data?.layouts.find((x) => x.id === id);
      if (l) setSkeleton({ id: l.id, scene: freeToScene(l.free) });
    });
  }, []);
  // Removing the active look (the chip's X) forgets the scene too.
  const seen = useRef(removed);
  useEffect(() => {
    if (removed !== seen.current) {
      seen.current = removed;
      setScene(null);
      setPast([]);
      setFuture([]);
      setMsg('');
    }
  }, [removed]);

  const publish = (s: DScene): boolean => {
    const free = sceneToFree(s);
    const spec = specFromFree(free, target);
    const c = checkSpec({ ...spec, name: ACTIVE_STYLE });
    if (c.errors.length) {
      setMsg(`That layout cannot be drawn: ${c.errors[0]}`);
      return false;
    }
    setActiveReference({ spec, thumb: '', learn: 'everything', target, ratioNote: null, photoRegion: null, source: 'description', free });
    return true;
  };
  const ctx = () => ({ canvas, title, hasPhoto, hasCutout, hasReference: activeReference()?.source === 'reference' });
  const noReader = !readers?.length;

  const generate = async () => {
    if (!text.trim() || busy || noReader) return;
    setBusy(true);
    setMsg('');
    abort.current = new AbortController();
    try {
      const ref = activeReference();
      const images = ref?.source === 'reference' && ref.thumb ? [readerImageOf(ref.thumb, 'reference.jpg')] : [];
      const answer = await callDescribe(readers![0], buildDescribePrompt(text, ctx(), skeleton?.scene ?? null), images, abort.current.signal);
      const p = parseDescribe(answer);
      if (!p.ok) setMsg(`The answer could not be used as a layout: ${p.errors.join(' ')}`);
      else if (publish(p.scene)) {
        setPast([]);
        setFuture([]);
        setScene(p.scene);
        setMsg(p.problems.length ? `Drawn. Fixed on the way: ${p.problems.slice(0, 3).join(' ')}` : 'Drawn on your content.');
      }
    } catch (e) {
      setMsg(e instanceof CapReached ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const change = async () => {
    if (!scene || !edit.trim() || busy || noReader) return;
    setBusy(true);
    setMsg('');
    abort.current = new AbortController();
    try {
      const answer = await callDescribe(readers![0], buildEditPrompt(edit, scene, ctx()), [], abort.current.signal);
      const p = parseEdit(answer);
      if (!p.ok) setMsg(`The answer could not be used as changes: ${p.errors.join(' ')}`);
      else {
        const a = applyEdit(scene, p.patches, p.couldNot);
        if (publish(a.scene)) {
          setPast((x) => [...x, scene]);
          setFuture([]);
          setScene(a.scene);
          setEdit('');
          setMsg(p.patches.length ? `Changed ${p.patches.length} thing${p.patches.length === 1 ? '' : 's'}.${a.problems.length ? ` ${a.problems.slice(0, 2).join(' ')}` : ''}` : 'The reader found nothing to change.');
        }
      }
    } catch (e) {
      setMsg(e instanceof CapReached ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const step = (dir: 'undo' | 'redo') => {
    if (!scene) return;
    const to = dir === 'undo' ? past[past.length - 1] : future[0];
    if (!to) return;
    if (dir === 'undo') {
      setPast(past.slice(0, -1));
      setFuture([scene, ...future]);
    } else {
      setFuture(future.slice(1));
      setPast([...past, scene]);
    }
    setScene(to);
    publish(to);
  };
  const save = async () => {
    if (!scene) return;
    const name = `Described: ${text.trim().slice(0, 28) || 'layout'}`;
    const spec = specFromFree(sceneToFree(scene), target);
    const preview = (await getPreview?.().catch(() => null)) ?? TINY;
    await saveTemplate({ name, target, spec: { ...spec, name: styleNameFor(name), title: name }, preview, missing: scene.couldNot });
    setMsg(`Saved “${name}” as a template: the layout and colours only, no photos. It refits any title with no model call.`);
  };

  return (
    <details className="tn-more rf-describe" open>
      <summary className="small">Describe the look</summary>
      <label className="tn-field">
        <span className="field-label">In a line or two</span>
        <textarea className="input" rows={2} value={text} maxLength={400} onChange={(e) => setText(e.target.value)} aria-label="Describe the look" placeholder="Big title on the left, my photo on the right, a yellow label above" />
      </label>
      <div className="row-actions" aria-label="Examples">
        {EXAMPLES.map((x, i) => (
          <button key={x} type="button" className="btn btn-outline btn-sm" onClick={() => setText(x)} aria-label={`Example ${i + 1}: ${x}`}>{x.length > 46 ? `${x.slice(0, 44)}…` : x}</button>
        ))}
      </div>
      {skeleton && (
        <p className="small">Starting from layout {skeleton.id} of the Layouts gallery. <button type="button" className="btn btn-outline btn-sm" onClick={() => { setSkeleton(null); try { sessionStorage.removeItem(SKELETON_KEY); } catch { /* ignore */ } }}>Don’t start from it</button></p>
      )}
      <div className="row-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={!text.trim() || busy || noReader || calls >= DESCRIBE_CAP} onClick={() => void generate()}>{busy && !scene ? 'Working…' : 'Generate layout'}</button>
        <span className="small" role="status" aria-label="Describe model calls">Model calls: {calls} of {DESCRIBE_CAP}</span>
        {busy && <button type="button" className="btn btn-outline btn-sm" onClick={() => abort.current?.abort()}>Cancel</button>}
      </div>
      {readers && readers.length === 0 && <p className="small cr-warn" role="status">No reader is connected, so Generate is off. Start the app with the dev server or give the server an API key.</p>}
      {msg && <p className="small" role="status" aria-live="polite" data-testid="describe-status">{msg}</p>}
      {scene && (
        <>
          <label className="tn-field">
            <span className="field-label">Change it in words (one small call)</span>
            <input className="input" value={edit} maxLength={300} onChange={(e) => setEdit(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void change()} aria-label="Change the layout in words" placeholder="Title bigger and to the right" />
          </label>
          <div className="row-actions">
            <button type="button" className="btn btn-outline btn-sm" disabled={!edit.trim() || busy || noReader || calls >= DESCRIBE_CAP} onClick={() => void change()}>Change it</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={past.length === 0} onClick={() => step('undo')}>Undo the change</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={future.length === 0} onClick={() => step('redo')}>Redo the change</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void save()}>Save as template</button>
          </div>
          {scene.couldNot.length > 0 && (
            <div className="small" role="status" aria-label="Could not draw">
              <strong>Could not draw:</strong>
              <ul>{scene.couldNot.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </details>
  );
}
