// The cutout editor: no model, every change redraws at once, with undo and redo. Two pictures: on the left the subject with its edge (grow, shrink, soften,
// an erase and restore brush that works on the stored mask); on the right the subject placed and dressed on a backdrop (position, size, flip, tilt, outline,
// glow, shadow, and the title drawn behind it). Save bakes the mask, the flip and the outline into a new picture and keeps the new mask in the store.
import { useEffect, useMemo, useRef, useState } from 'react';
import { alphaOfMask, bake, growShrink, maskBlob, paint, resizeAlpha, soften, type Alpha } from '../image-engine/cutout/ops';
import type { CutoutLook } from '../image-engine/cutout/look';
import { putCutout, type CutoutRecord } from '../image-engine/cutout/cutoutStore';

interface S {
  alpha: Uint8ClampedArray;
  grow: number;
  soft: number;
  flip: boolean;
  outlineOn: boolean;
  outlineColor: string;
  outlineW: number;
  fx: 'none' | 'contact' | 'drop' | 'glow';
  glowColor: string;
  x: number;
  y: number;
  scale: number;
  tilt: number;
  textBehind: boolean;
  title: string;
}
const W_EDIT = 1000;
const PREVIEW_W = 420;

export interface CutoutSaved {
  cutout: Blob;
  look: CutoutLook;
  record: CutoutRecord;
}

export function CutoutEditor({ record, onSave, onClose }: { record: CutoutRecord; onSave: (r: CutoutSaved) => void; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState('');
  const [hist, setHist] = useState<{ past: { s: S; label: string }[]; cur: S | null; future: { s: S; label: string }[] }>({ past: [], cur: null, future: [] });
  const [tool, setTool] = useState<'off' | 'erase' | 'restore'>('off');
  const [brush, setBrush] = useState(24);
  const orig = useRef<ImageBitmap | null>(null);
  const dims = useRef({ w: 1, h: 1 });
  const edge = useRef<HTMLCanvasElement>(null);
  const look = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<Uint8ClampedArray | null>(null);
  const lastKey = useRef({ key: '', at: 0 });
  const token = useRef(0);
  const cur = hist.cur;

  // Load the original and the stored mask, scaled to a size that edits fast.
  useEffect(() => {
    let live = true;
    void (async () => {
      const bm = await createImageBitmap(record.original, { imageOrientation: 'from-image' });
      const al = await alphaOfMask(record.mask, W_EDIT);
      const k = al.w / bm.width;
      dims.current = { w: al.w, h: al.h };
      void k;
      if (!live) return;
      orig.current = bm;
      setHist({ past: [], future: [], cur: { alpha: al.a, grow: 0, soft: 0, flip: false, outlineOn: false, outlineColor: '#ffffff', outlineW: 8, fx: 'contact', glowColor: '#ffd23f', x: 0.5, y: 0.55, scale: 0.9, tilt: 0, textBehind: false, title: 'BIG TITLE' } });
      setReady(true);
    })().catch((e) => setProblem(`The cutout could not be opened: ${(e as Error).message}`));
    return () => {
      live = false;
    };
  }, [record]);

  /** A change, one undo step. Moving the same slider again within a second is one step, not twenty. */
  const change = (patch: Partial<S>, label: string, key = label) => {
    // Decided here, not inside the updater (React runs an updater twice in development, and this must happen once).
    const now = Date.now();
    const same = lastKey.current.key === key && now - lastKey.current.at < 1000;
    lastKey.current = { key, at: now };
    setHist((h) => (h.cur ? { cur: { ...h.cur, ...patch }, past: same ? h.past : [...h.past, { s: h.cur, label }].slice(-40), future: [] } : h));
  };
  const undo = () => setHist((h) => (h.past.length && h.cur ? { cur: h.past[h.past.length - 1].s, past: h.past.slice(0, -1), future: [{ s: h.cur, label: h.past[h.past.length - 1].label }, ...h.future] } : h));
  const redo = () => setHist((h) => (h.future.length && h.cur ? { cur: h.future[0].s, past: [...h.past, { s: h.cur, label: h.future[0].label }], future: h.future.slice(1) } : h));

  const shaped = (s: S, a = s.alpha): Alpha => soften(growShrink({ ...dims.current, a }, s.grow), s.soft);

  // The edge picture: the subject on magenta.
  const drawEdge = (s: S, a: Uint8ClampedArray) => {
    const c = edge.current;
    const bm = orig.current;
    if (!c || !bm) return;
    const al = shaped(s, a);
    c.width = al.w;
    c.height = al.h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bm, 0, 0, al.w, al.h);
    const im = g.getImageData(0, 0, al.w, al.h);
    for (let i = 0; i < al.a.length; i++) {
      const t = al.a[i] / 255;
      im.data[i * 4] = im.data[i * 4] * t + 255 * (1 - t);
      im.data[i * 4 + 1] = im.data[i * 4 + 1] * t;
      im.data[i * 4 + 2] = im.data[i * 4 + 2] * t + 255 * (1 - t);
    }
    g.putImageData(im, 0, 0);
  };
  useEffect(() => {
    if (cur && ready) drawEdge(cur, cur.alpha);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.alpha, cur?.grow, cur?.soft, ready]);

  // The look picture: the subject placed and dressed, on a backdrop, with the title behind it if asked.
  useEffect(() => {
    if (!cur || !ready || !orig.current) return;
    const mine = ++token.current;
    void (async () => {
      const baked = await bake(orig.current!, shaped(cur), { flip: cur.flip, outline: cur.outlineOn ? { color: cur.outlineColor, width: cur.outlineW } : undefined });
      const bm = await createImageBitmap(baked);
      if (mine !== token.current || !look.current) return bm.close();
      const c = look.current;
      c.width = PREVIEW_W;
      c.height = Math.round(PREVIEW_W * 0.5625);
      const g = c.getContext('2d')!;
      g.fillStyle = '#2b2f4a';
      g.fillRect(0, 0, c.width, c.height);
      if (cur.textBehind) {
        g.fillStyle = '#ffffff';
        g.font = `800 ${Math.round(c.height * 0.34)}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(cur.title.slice(0, 14), c.width / 2, c.height * 0.45, c.width * 0.94);
      }
      const box = c.width * 0.5 * cur.scale;
      const ratio = bm.width / bm.height;
      const w = ratio >= 1 ? box : box * ratio;
      const h = ratio >= 1 ? box / ratio : box;
      g.save();
      g.translate(cur.x * c.width, cur.y * c.height);
      g.rotate((cur.tilt * Math.PI) / 180);
      if (cur.fx === 'glow') {
        g.shadowColor = cur.glowColor;
        g.shadowBlur = c.width * 0.05;
      } else if (cur.fx === 'drop') {
        g.shadowColor = 'rgba(0,0,0,.6)';
        g.shadowBlur = c.width * 0.02;
        g.shadowOffsetX = c.width * 0.012;
        g.shadowOffsetY = c.width * 0.016;
      } else if (cur.fx === 'contact') {
        g.shadowColor = 'rgba(0,0,0,.5)';
        g.shadowBlur = c.width * 0.012;
        g.shadowOffsetY = c.width * 0.008;
      }
      g.drawImage(bm, -w / 2, -h / 2, w, h);
      g.restore();
      bm.close();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, ready]);

  // The brush works on the stored mask: each stroke is one undo step.
  const at = (e: React.PointerEvent) => {
    const r = edge.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * dims.current.w, y: ((e.clientY - r.top) / r.height) * dims.current.h, r: (brush / r.width) * dims.current.w };
  };
  const down = (e: React.PointerEvent) => {
    if (tool === 'off' || !cur) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    stroke.current = new Uint8ClampedArray(cur.alpha);
    const p = at(e);
    paint({ ...dims.current, a: stroke.current }, p.x, p.y, p.r, tool);
    drawEdge(cur, stroke.current);
  };
  const move = (e: React.PointerEvent) => {
    if (!stroke.current || tool === 'off' || !cur) return;
    const p = at(e);
    paint({ ...dims.current, a: stroke.current }, p.x, p.y, p.r, tool);
    drawEdge(cur, stroke.current);
  };
  const up = () => {
    if (!stroke.current) return;
    const a = stroke.current;
    stroke.current = null;
    lastKey.current = { key: '', at: 0 };
    change({ alpha: a }, tool === 'erase' ? 'Erase with the brush' : 'Restore with the brush', `stroke${Date.now()}`);
  };

  const save = async () => {
    if (!cur || !orig.current) return;
    setProblem('');
    try {
      const small = shaped(cur);
      const full = await createImageBitmap(record.mask).then(async (m) => {
        const d = { w: m.width, h: m.height };
        m.close();
        return resizeAlpha(small, d.w, d.h);
      });
      const cutout = await bake(orig.current, full, { flip: cur.flip, outline: cur.outlineOn ? { color: cur.outlineColor, width: Math.max(1, Math.round(cur.outlineW * (full.w / small.w))) } : undefined });
      const maskPng = await maskBlob(full);
      const next: CutoutRecord = { ...record, cutout, mask: maskPng, at: Date.now() };
      const lk: CutoutLook = { x: cur.x, y: cur.y, scale: cur.scale, tilt: cur.tilt, fx: cur.fx, textBehind: cur.textBehind };
      next.look = lk;
      await putCutout(next);
      onSave({ cutout, look: lk, record: next });
    } catch (e) {
      setProblem(`The cutout could not be saved: ${(e as Error).message}`);
    }
  };

  const num = (label: string, key: keyof S, lo: number, hi: number, step = 1, group?: string) => (
    <label className="cr-inline small" key={String(key)}>
      <span className="field-label">{label}: {cur ? Number(cur[key]).toFixed(step < 1 ? 2 : 0) : ''}</span>
      <input type="range" min={lo} max={hi} step={step} value={cur ? (cur[key] as number) : 0} aria-label={label} onChange={(e) => change({ [key]: Number(e.target.value) } as Partial<S>, `Change ${label.toLowerCase()}`, group ?? `${key}`)} />
    </label>
  );
  const lastLabel = hist.past[hist.past.length - 1]?.label;
  const nextLabel = hist.future[0]?.label;
  const title = useMemo(() => `Cutout editor: ${record.name}`, [record.name]);

  return (
    <div className="replay" role="dialog" aria-label={title}>
      <div className="replay-box card cutout-box">
        <header className="replay-head">
          <h2 className="h4">{title}</h2>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Close</button>
        </header>
        {!ready && !problem && <p className="small muted" role="status">Opening…</p>}
        {problem && <p className="small cr-problem" role="alert">{problem}</p>}
        <div className="cr-photo-actions">
          <button type="button" className="btn btn-outline btn-sm" disabled={!hist.past.length} onClick={undo}>Undo{lastLabel ? `: ${lastLabel}` : ''}</button>
          <button type="button" className="btn btn-outline btn-sm" disabled={!hist.future.length} onClick={redo}>Redo{nextLabel ? `: ${nextLabel}` : ''}</button>
          <span className="small muted">No model is used here.</span>
        </div>
        <div className="cutout-pics">
          <figure>
            <canvas ref={edge} className="cutout-canvas" aria-label="The subject and its edge" onPointerDown={down} onPointerMove={move} onPointerUp={up} style={{ cursor: tool === 'off' ? 'default' : 'crosshair', touchAction: 'none' }} />
            <figcaption className="small muted">The subject (the pink is what is removed)</figcaption>
          </figure>
          <figure>
            <canvas ref={look} className="cutout-canvas" aria-label="The subject placed and dressed" />
            <figcaption className="small muted">How it will look</figcaption>
          </figure>
        </div>
        {cur && (
          <>
            <fieldset className="rf-fs"><legend className="small"><b>Edge</b></legend>
              {num('Grow or shrink the edge', 'grow', -20, 20)}
              {num('Soften the edge', 'soft', 0, 12)}
              <div className="chip-group" role="radiogroup" aria-label="Brush">
                {([['off', 'No brush'], ['erase', 'Erase'], ['restore', 'Restore']] as const).map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={tool === k} className="chip-btn" onClick={() => setTool(k)}>{l}</button>
                ))}
              </div>
              <label className="cr-inline small"><span className="field-label">Brush size: {brush}</span><input type="range" min={6} max={80} value={brush} aria-label="Brush size" onChange={(e) => setBrush(Number(e.target.value))} /></label>
            </fieldset>
            <fieldset className="rf-fs"><legend className="small"><b>Place</b></legend>
              {num('Position across', 'x', 0, 1, 0.01)}
              {num('Position down', 'y', 0, 1, 0.01)}
              {num('Size', 'scale', 0.15, 2.5, 0.05)}
              {num('Tilt', 'tilt', -45, 45)}
              <label className="small rf-toggle"><input type="checkbox" checked={cur.flip} onChange={(e) => change({ flip: e.target.checked }, e.target.checked ? 'Flip it' : 'Unflip it')} /> Flip left to right</label>
            </fieldset>
            <fieldset className="rf-fs"><legend className="small"><b>Look</b></legend>
              <label className="small rf-toggle"><input type="checkbox" checked={cur.outlineOn} onChange={(e) => change({ outlineOn: e.target.checked }, e.target.checked ? 'Add an outline' : 'Remove the outline')} /> Outline</label>
              {cur.outlineOn && (
                <>
                  <label className="cr-inline small"><span className="field-label">Outline colour</span><input type="color" value={cur.outlineColor} aria-label="Outline colour" onChange={(e) => change({ outlineColor: e.target.value }, 'Change the outline colour')} /></label>
                  {num('Outline thickness', 'outlineW', 1, 30)}
                </>
              )}
              <label className="cr-inline small">
                <span className="field-label">Glow or shadow</span>
                <select className="plain-select cr-select" aria-label="Glow or shadow" value={cur.fx} onChange={(e) => change({ fx: e.target.value as S['fx'] }, 'Change the glow or shadow')}>
                  <option value="none">None</option>
                  <option value="contact">Soft shadow on the floor</option>
                  <option value="drop">Drop shadow</option>
                  <option value="glow">Glow</option>
                </select>
              </label>
              {cur.fx === 'glow' && <label className="cr-inline small"><span className="field-label">Glow colour</span><input type="color" value={cur.glowColor} aria-label="Glow colour" onChange={(e) => change({ glowColor: e.target.value }, 'Change the glow colour')} /></label>}
              <label className="small rf-toggle"><input type="checkbox" checked={cur.textBehind} onChange={(e) => change({ textBehind: e.target.checked }, e.target.checked ? 'Put the title behind it' : 'Put the title in front')} /> Title behind the subject</label>
              {cur.textBehind && <label className="cr-inline small"><span className="field-label">Preview title</span><input className="input" value={cur.title} maxLength={14} aria-label="Preview title" onChange={(e) => change({ title: e.target.value }, 'Change the preview title', 'title')} /></label>}
            </fieldset>
          </>
        )}
        <div className="cr-photo-actions">
          <button type="button" className="btn btn-primary btn-sm" disabled={!ready} onClick={() => void save()}>Save the cutout</button>
          <span className="small muted">Saves the edited mask, the flip and the outline into a new picture; the original is kept.</span>
        </div>
      </div>
    </div>
  );
}
