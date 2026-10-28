// The right-hand side of the screen: the person's own content drawn in the style, and the editor that changes the style live with no model.
// Every change is a list of style patches (see edit.ts), applied at once, with undo and redo; each value says where it came from.
import { useRef, useState } from 'react';
import { FRAME_CHOICES } from '../carousel/photoChoices';
import { renderer } from '../carousel/render';
import { applyPatch } from '../image-engine/patcher';
import { FONT_FAMILIES, type Plan } from '../image-engine/types';
import { coverPlace, coverPlaced, originOf, type EditState, type Origin } from './edit';
import type { OwnShot } from './own';
import type { Target } from './types';

const HEX = /^#[0-9a-fA-F]{6}$/;
const ROLES = ['bg', 'text', 'accent', 'marker'] as const;

export function OriginChip({ origin }: { origin: Origin | null }) {
  if (!origin) return null;
  return <span className={`chip chip-tag rf-origin rf-origin-${origin.toLowerCase()}`} title={origin === 'MEASURED' ? 'measured by the code from your reference' : origin === 'READER' ? 'said by the model that looked at your reference' : 'set by you'}>{origin}</span>;
}

/** The layers of a drawn picture, each with a switch. The picture is redrawn through the plan patch system; it is a preview, not part of the style. */
function LayerList({ plan, label }: { plan: Plan; label: string }) {
  const [current, setCurrent] = useState<Plan>(plan);
  const [url, setUrl] = useState('');
  const [problem, setProblem] = useState('');
  const at = useRef(plan);
  if (at.current !== plan) {
    at.current = plan;
    setCurrent(plan);
    setUrl('');
  }
  const toggle = async (id: string, visible: boolean) => {
    const res = applyPatch(current, { baseRevision: current.revision, label: `${visible ? 'Show' : 'Hide'} ${id}`, ops: [{ op: 'set', id, path: 'visible', value: visible }] });
    if (!res.ok) return setProblem(res.reasons[0]);
    setProblem('');
    setCurrent(res.plan);
    try {
      const blob = await renderer.preview(res.plan, Math.min(0.4, 360 / res.plan.canvas.width));
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  return (
    <details className="rf-layers">
      <summary className="small">Layers of the {label.toLowerCase()} ({current.layers.length})</summary>
      <p className="small muted">Switching a layer off changes this preview only (it is not part of the style).</p>
      <ul className="rf-layer-list" aria-label="Layers">
        {current.layers.map((l) => (
          <li key={l.id} className="small">
            <label><input type="checkbox" checked={l.visible !== false} onChange={(e) => void toggle(l.id, e.target.checked)} aria-label={`Layer ${l.name ?? l.id}`} /> {l.name ?? l.id} <span className="muted">({l.kind})</span></label>
          </li>
        ))}
      </ul>
      {problem && <p className="small cr-problem" role="alert">{problem}</p>}
      {url && <img className="rf-layer-preview" src={url} alt="Preview with your layer changes" />}
    </details>
  );
}

export function ResultPanel({ state, shots, drawing, onPlace, secondsToFirst }: { state: EditState; shots: OwnShot[]; drawing: boolean; onPlace: (p: 'top' | 'middle' | 'bottom') => void; secondsToFirst: number | null }) {
  const [layerShot, setLayerShot] = useState(0);
  const shot = shots[Math.min(layerShot, Math.max(0, shots.length - 1))];
  const drag = useRef<HTMLDivElement>(null);
  const place = coverPlace(state.spec);
  return (
    <div className="rf-result" aria-label="Your content in this style">
      {secondsToFirst !== null && <p className="small" role="status">Instant draft: {secondsToFirst} s, no model.</p>}
      {drawing && shots.length === 0 && <p className="small muted" role="status">Drawing…</p>}
      <div className="rf-shots">
        {shots.map((s, i) => (
          <figure key={s.label + i} className={i === 0 ? 'rf-shot-main' : ''}>
            {i === 0 ? (
              <div className="rf-drag" ref={drag}
                onPointerUp={(e) => {
                  const r = drag.current!.getBoundingClientRect();
                  const f = (e.clientY - r.top) / r.height;
                  onPlace(f < 0.34 ? 'top' : f < 0.67 ? 'middle' : 'bottom');
                }}
                title="Click or drag to the place where the title should be">
                <img src={s.url} alt={`${s.label}, your content in this style`} draggable={false} />
                <span className={`rf-drag-mark rf-drag-${place}`} aria-hidden="true">title</span>
              </div>
            ) : (
              <img src={s.url} alt={`${s.label}, your content in this style`} />
            )}
            <figcaption className="small muted">{s.label} ({s.seconds} s){i === 0 ? ' · click where the title goes' : ''}</figcaption>
          </figure>
        ))}
      </div>
      {shots.length > 1 && (
        <label className="cr-inline small">
          <span className="field-label">Layers of</span>
          <select className="plain-select cr-select" value={layerShot} onChange={(e) => setLayerShot(Number(e.target.value))} aria-label="Which picture's layers">
            {shots.map((s, i) => <option key={s.label + i} value={i}>{s.label}</option>)}
          </select>
        </label>
      )}
      {shot && <LayerList plan={shot.plan} label={shot.label} />}
    </div>
  );
}

export function Editor({ state, target, onEdit, onUndo, onRedo, parked, onPark }: {
  state: EditState;
  target: Target;
  /** Applies the patches as one undoable change; returns a problem sentence or null. */
  onEdit: (label: string, patches: { path: string; value: unknown }[]) => string | null;
  onUndo: () => void;
  onRedo: () => void;
  parked: React.MutableRefObject<Record<string, unknown[]>>;
  onPark: () => void;
}) {
  const spec = state.spec as unknown as Record<string, Record<string, unknown>> & { marks?: { kind: string; zone: string; off?: boolean }[]; layouts: StyleLayouts };
  const [problem, setProblem] = useState('');
  const go = (label: string, patches: { path: string; value: unknown }[]) => setProblem(onEdit(label, patches) ?? '');
  const pals = Object.entries(state.spec.palettes);
  const treatments = state.spec.photo?.treatments ?? {};
  const contentRule = state.spec.layouts.content.find((r) => r.use === 'content-photo-frame');
  const last = state.past[state.past.length - 1];
  const nextUp = state.future[0];
  return (
    <section className="rf-editor" aria-label="Edit the style">
      <div className="cr-photo-actions">
        <button type="button" className="btn btn-outline btn-sm" disabled={!last} onClick={onUndo}>Undo{last ? `: ${last.label}` : ''}</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={!nextUp} onClick={onRedo}>Redo{nextUp ? `: ${nextUp.label}` : ''}</button>
        <span className="small muted">No model is used for any of this.</span>
      </div>
      {problem && <p className="small cr-problem" role="alert">{problem}</p>}

      <fieldset className="rf-fs"><legend className="small"><b>Colours</b></legend>
        {pals.map(([name, p]) => (
          <div key={name} className="rf-row">
            {ROLES.map((r) => {
              const v = (p as unknown as Record<string, unknown>)[r];
              if (typeof v !== 'string' || !HEX.test(v)) return null;
              return (
                <label key={r} className="rf-swatch small">
                  <input type="color" value={v} aria-label={`Colour: ${name} ${r}`} onChange={(e) => go(`Change ${name} ${r}`, [{ path: `palettes.${name}.${r}`, value: e.target.value.toUpperCase() }])} />
                  <span>{pals.length > 1 ? `${name} ` : ''}{r}</span> <OriginChip origin={originOf(state.prov, `palettes.${name}.${r}`)} />
                </label>
              );
            })}
          </div>
        ))}
      </fieldset>

      <fieldset className="rf-fs"><legend className="small"><b>Fonts</b></legend>
        {(['headline', 'body'] as const).map((k) => (
          <label key={k} className="cr-inline small">
            <span className="field-label">{k === 'headline' ? 'Headline font' : 'Body font'}</span>
            <select className="plain-select cr-select" value={state.spec.fonts[k]} aria-label={`${k === 'headline' ? 'Headline' : 'Body'} font`} onChange={(e) => go(`Change the ${k} font`, [{ path: `fonts.${k}`, value: e.target.value }])}>
              {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <OriginChip origin={originOf(state.prov, `fonts.${k}`)} />
          </label>
        ))}
      </fieldset>

      <fieldset className="rf-fs"><legend className="small"><b>Text size and place</b></legend>
        {([['type.headline', 'Title size', 32, 220], ['type.cover', 'Cover title size', 32, 260], ['spacing.margin', 'Margin', 48, 200]] as const).map(([path, label, lo, hi]) => {
          const v = Number((spec[path.split('.')[0]] as Record<string, unknown>)[path.split('.')[1]]);
          return (
            <label key={path} className="cr-inline small">
              <span className="field-label">{label}: {v} px</span>
              <input type="range" min={lo} max={hi} value={v} aria-label={label} onChange={(e) => go(`Change ${label.toLowerCase()}`, [{ path, value: Number(e.target.value) }])} />
              <OriginChip origin={originOf(state.prov, path)} />
            </label>
          );
        })}
        <div role="radiogroup" aria-label="Where the cover title goes" className="chip-group">
          {(['top', 'middle', 'bottom'] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={coverPlace(state.spec) === p} className="chip-btn" onClick={() => go(`Put the title at the ${p}`, [coverPlaced(state.spec, p)])}>Title {p}</button>
          ))}
          <OriginChip origin={originOf(state.prov, 'layouts.cover')} />
        </div>
      </fieldset>

      <fieldset className="rf-fs"><legend className="small"><b>Marks, textures, treatments, frame</b></legend>
        {(spec.marks ?? []).length === 0 && Object.values(treatments).every((t) => t.length === 0) && !contentRule && <p className="small muted">This style has none yet. The reader may add some.</p>}
        {(spec.marks ?? []).map((m, i) => (
          <label key={i} className="small rf-toggle">
            <input type="checkbox" checked={!m.off} aria-label={`Mark: ${m.kind} (${m.zone})`} onChange={(e) => go(`${e.target.checked ? 'Show' : 'Hide'} the ${m.kind}`, [{ path: 'marks', value: (spec.marks ?? []).map((x, k) => (k === i ? { ...x, off: !e.target.checked } : x)) }])} /> {m.kind} <span className="muted">({m.zone})</span> <OriginChip origin={originOf(state.prov, 'marks')} />
          </label>
        ))}
        {Object.entries(treatments).map(([name, steps]) => {
          const hidden = (parked.current[name] ?? []) as unknown[];
          const on = steps.length > 0;
          if (!on && hidden.length === 0) return null;
          const words = (on ? steps : (hidden as { op: string }[])).map((t) => (t as { op: string }).op).join(' + ');
          return (
            <label key={name} className="small rf-toggle">
              <input type="checkbox" checked={on} aria-label={`Photo treatment: ${name}`} onChange={(e) => {
                if (!e.target.checked) { parked.current[name] = steps as unknown[]; onPark(); go(`Hide the photo treatment`, [{ path: `photo.treatments.${name}`, value: [] }]); }
                else go('Show the photo treatment', [{ path: `photo.treatments.${name}`, value: hidden }]);
              }} /> Photo treatment “{name}”: {words} <OriginChip origin={originOf(state.prov, 'photo')} />
            </label>
          );
        })}
        {contentRule && (
          <label className="cr-inline small">
            <span className="field-label">Photo frame</span>
            <select className="plain-select cr-select" aria-label="Photo frame" value={String((contentRule.params as Record<string, unknown> | undefined)?.frame ?? 'plain')}
              onChange={(e) => go('Change the photo frame', [{ path: 'layouts.content', value: state.spec.layouts.content.map((r) => (r.use === 'content-photo-frame' ? { ...r, params: { ...(r.params ?? {}), frame: e.target.value } } : r)) }])}>
              {FRAME_CHOICES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <OriginChip origin={originOf(state.prov, 'layouts')} />
          </label>
        )}
      </fieldset>
      <p className="small muted">Where a value came from: <OriginChip origin="MEASURED" /> the code measured it, <OriginChip origin="READER" /> the model said it, <OriginChip origin="PERSON" /> you set it. {target === 'carousel' ? '' : 'Thumbnails take the same colours and fonts.'}</p>
    </section>
  );
}

type StyleLayouts = Record<string, { use: string; when?: Record<string, unknown>; params?: Record<string, unknown> }[]>;
