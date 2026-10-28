// "Replay edits": the plan is rebuilt layer by layer with the same patch system the editor uses (an "add" patch per layer), so the person can watch
// the layers appear in order. Play and pause, step forward and back (back applies the inverse patch), and a speed. No new format.
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyPatch } from '../image-engine/patcher';
import type { Layer, Patch, Plan } from '../image-engine/types';
import { renderer } from '../carousel/render';

/** One patch per layer, in drawing order, on top of the empty canvas. */
export function patchesOf(plan: Plan): { start: Plan; patches: Patch[] } {
  const start: Plan = { ...structuredClone(plan), layers: [], revision: 1 };
  const patches: Patch[] = plan.layers.map((l: Layer, i) => ({ baseRevision: i + 1, label: `Add ${l.name ?? l.id}`, ops: [{ op: 'add', layer: structuredClone(l) }] }));
  return { start, patches };
}

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

export function ReplayButton({ plan, label }: { plan: Plan; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>Replay edits</button>
      {open && <Replay plan={plan} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

export function Replay({ plan, label, onClose }: { plan: Plan; label: string; onClose: () => void }) {
  const built = useRef(patchesOf(plan));
  const { start, patches } = built.current;
  // The plans after each patch, and the inverse patch of each, kept so stepping back uses the inverse (not a copy).
  const states = useRef<Plan[]>([start]);
  const inverses = useRef<Patch[]>([]);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [url, setUrl] = useState('');
  const [problem, setProblem] = useState('');
  const token = useRef(0);

  const draw = useCallback(async (p: Plan) => {
    const t = ++token.current;
    try {
      const blob = await renderer.preview(p, Math.min(0.5, 540 / p.canvas.width));
      if (t !== token.current) return;
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      setProblem((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void draw(start);
    return () => {
      token.current++;
    };
  }, [draw, start]);

  const forward = useCallback(() => {
    const i = states.current.length - 1;
    if (i >= patches.length) return false;
    const res = applyPatch(states.current[i], patches[i]);
    if (!res.ok) {
      setProblem(res.reasons[0]);
      return false;
    }
    states.current.push(res.plan);
    inverses.current[i] = res.inverse;
    setAt(i + 1);
    void draw(res.plan);
    return true;
  }, [draw, patches]);
  const back = useCallback(() => {
    const i = states.current.length - 1;
    if (i <= 0) return false;
    const cur = states.current[i];
    const res = applyPatch(cur, { ...inverses.current[i - 1], baseRevision: cur.revision });
    if (!res.ok) {
      setProblem(res.reasons[0]);
      return false;
    }
    states.current.pop();
    // The plan after the inverse is the one before the patch: keep the stored copy (same layers, one revision behind).
    setAt(i - 1);
    void draw(states.current[i - 1]);
    return true;
  }, [draw]);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (!forward()) setPlaying(false);
    }, 500 / speed);
    return () => clearTimeout(t);
  }, [playing, speed, at, forward]);

  const last = at > 0 ? patches[at - 1].label : 'The empty canvas';
  return (
    <div className="replay" role="dialog" aria-label={`Replay edits: ${label}`}>
      <div className="replay-box card">
        <header className="replay-head">
          <h2 className="h4">Replay edits: {label}</h2>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Close</button>
        </header>
        {url ? <img className="replay-img" src={url} alt={`${label} after ${at} of ${patches.length} edits`} /> : <p className="small muted" role="status">Drawing…</p>}
        <p className="small" role="status">Edit {at} of {patches.length}: {last}</p>
        {problem && <p className="small cr-problem" role="alert">{problem}</p>}
        <div className="replay-controls" role="group" aria-label="Replay controls">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setPlaying(false); back(); }} disabled={at === 0}>Step back</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { if (at >= patches.length) { while (states.current.length > 1) states.current.pop(); setAt(0); void draw(start); } setPlaying((p) => !p); }}>{playing ? 'Pause' : at >= patches.length ? 'Play again' : 'Play'}</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setPlaying(false); forward(); }} disabled={at >= patches.length}>Step forward</button>
          <label className="small">Speed <select className="plain-select cr-select" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}</select></label>
        </div>
      </div>
    </div>
  );
}
