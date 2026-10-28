// "Show what I detected": the reference with the free layout's boxes drawn over it and labelled (text blocks with their treatments, photo regions, shapes,
// graphics). The person drags and resizes a box, deletes it, adds one, relabels a text box, and switches a text treatment on or off; every change is a
// patch to the style's free layout and the replica redraws at once, with no model. This is how the detection is corrected.
import { useRef, useState } from 'react';
import { FREE_ROLES, FREE_TREATMENTS, type FreeBox, type FreeLayout, type FreeRole, type FreeSlot } from '../image-engine/styles/free-spec';
import { MARK_KINDS } from '../image-engine/styles/marks-spec';
import { GRAPHIC_LABELS } from './labels';
import type { TextBlock } from './regions';

type Kind = 'slot' | 'photo' | 'shape' | 'graphic';
interface Entry {
  key: string;
  kind: Kind;
  id: string;
  box: FreeBox;
  label: string;
}
const COLOUR: Record<Kind, string> = { slot: '#d62828', photo: '#2a9d34', shape: '#1d4ed8', graphic: '#c026d3' };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (n: number) => Math.round(n * 10) / 10;

function entriesOf(f: FreeLayout): Entry[] {
  return [
    ...f.photos.map((p) => ({ key: `photo:${p.id}`, kind: 'photo' as Kind, id: p.id, box: p.box, label: `photo (${p.shape})` })),
    ...f.shapes.map((p) => ({ key: `shape:${p.id}`, kind: 'shape' as Kind, id: p.id, box: p.box, label: `${p.kind} ${p.colour}` })),
    ...f.graphics.map((p) => ({ key: `graphic:${p.id}`, kind: 'graphic' as Kind, id: p.id, box: p.box, label: p.kind })),
    ...f.slots.map((p) => ({ key: `slot:${p.id}`, kind: 'slot' as Kind, id: p.id, box: p.box, label: `${p.role}${p.treatments.filter((t) => !t.off).length ? ` · ${p.treatments.filter((t) => !t.off).map((t) => t.kind).join(', ')}` : ''}` })),
  ];
}

function withBox(f: FreeLayout, kind: Kind, id: string, box: FreeBox): FreeLayout {
  return {
    ...f,
    photos: kind === 'photo' ? f.photos.map((p) => (p.id === id ? { ...p, box } : p)) : f.photos,
    shapes: kind === 'shape' ? f.shapes.map((p) => (p.id === id ? { ...p, box } : p)) : f.shapes,
    graphics: kind === 'graphic' ? f.graphics.map((p) => (p.id === id ? { ...p, box } : p)) : f.graphics,
    slots: kind === 'slot' ? f.slots.map((p) => (p.id === id ? { ...p, box } : p)) : f.slots,
  };
}

export function DetectOverlay({ url, name, free, texts, onChange }: {
  url: string;
  name: string;
  free: FreeLayout;
  /** What the code detected per text block (for the treatments that were found and cannot be drawn). */
  texts: TextBlock[];
  onChange: (next: FreeLayout, label: string) => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [tmp, setTmp] = useState<{ key: string; box: FreeBox } | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<{ key: string; mode: 'move' | 'resize'; x0: number; y0: number; box: FreeBox } | null>(null);
  const all = entriesOf(free);
  const selected = all.find((e) => e.key === sel) ?? null;
  const pct = (e: React.PointerEvent) => {
    const r = area.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };
  const nextBox = (e: React.PointerEvent): FreeBox | null => {
    const d = drag.current;
    if (!d) return null;
    const p = pct(e);
    const dx = p.x - d.x0;
    const dy = p.y - d.y0;
    if (d.mode === 'move') return { ...d.box, x: r1(clamp(d.box.x + dx, -2, 100 - d.box.w + 2)), y: r1(clamp(d.box.y + dy, -2, 100 - d.box.h + 2)) };
    return { ...d.box, w: r1(clamp(d.box.w + dx, 2, 100 - d.box.x + 2)), h: r1(clamp(d.box.h + dy, 2, 100 - d.box.y + 2)) };
  };
  const finish = (e: React.PointerEvent) => {
    const b = nextBox(e);
    const d = drag.current;
    drag.current = null;
    setTmp(null);
    if (!b || !d) return;
    const [kind, id] = d.key.split(':') as [Kind, string];
    if (b.x !== d.box.x || b.y !== d.box.y || b.w !== d.box.w || b.h !== d.box.h) onChange(withBox(free, kind, id, b), d.mode === 'move' ? 'Move a box' : 'Resize a box');
  };

  const patchSlot = (id: string, f: (s: FreeSlot) => FreeSlot, label: string) => onChange({ ...free, slots: free.slots.map((s) => (s.id === id ? f(s) : s)) }, label);
  const remove = (e: Entry) => {
    setSel(null);
    onChange({ ...free, photos: e.kind === 'photo' ? free.photos.filter((p) => p.id !== e.id) : free.photos, shapes: e.kind === 'shape' ? free.shapes.filter((p) => p.id !== e.id) : free.shapes, graphics: e.kind === 'graphic' ? free.graphics.filter((p) => p.id !== e.id) : free.graphics, slots: e.kind === 'slot' ? free.slots.filter((p) => p.id !== e.id) : free.slots }, 'Delete a box');
  };
  const add = (kind: Kind) => {
    const n = all.length + 1;
    const box: FreeBox = { x: 30, y: 40, w: kind === 'slot' ? 40 : 25, h: kind === 'slot' ? 12 : 15 };
    const id = `added${n}`;
    if (kind === 'slot') onChange({ ...free, slots: [...free.slots, { id, role: 'body', box, align: 'left', maxLines: 3, anchor: 'middle', sizePx: 56, treatments: [] }] }, 'Add a text box');
    else if (kind === 'photo') onChange({ ...free, photos: [...free.photos, { id, box: { x: 15, y: 15, w: 70, h: 40 }, shape: 'rect' }] }, 'Add a photo region');
    else if (kind === 'shape') onChange({ ...free, shapes: [...free.shapes, { id, kind: 'rect', box, colour: '#888888' }] }, 'Add a shape');
    else onChange({ ...free, graphics: [...free.graphics, { id, kind: 'sparkle', box: { x: 40, y: 40, w: 15, h: 12 }, colour: '#888888' }] }, 'Add a graphic');
    setSel(`${kind}:${id}`);
  };
  const detectedFor = selected?.kind === 'slot' ? texts.find((t) => t.id === selected.id) : undefined;
  const missingHere = detectedFor?.treatments.filter((t) => !t.supported) ?? [];

  return (
    <div className="rf-detect" aria-label="What I detected">
      <div className="rf-detect-main">
        <div ref={area} className="rf-detect-img" onPointerDown={(e) => e.target === e.currentTarget && setSel(null)}>
          <img src={url} alt={`Reference ${name} with the detected boxes`} draggable={false} />
          {all.map((e) => {
            const b = tmp && tmp.key === e.key ? tmp.box : e.box;
            return (
              <div
                key={e.key}
                role="button"
                tabIndex={0}
                aria-label={`${e.kind === 'slot' ? 'Text box' : e.kind === 'photo' ? 'Photo region' : e.kind === 'shape' ? 'Shape' : 'Graphic'} ${e.id}: ${e.label}`}
                aria-pressed={sel === e.key}
                className={`rf-box rf-box-${e.kind}${sel === e.key ? ' on' : ''}`}
                style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`, borderColor: COLOUR[e.kind] }}
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
                  setSel(e.key);
                  const p = pct(ev);
                  drag.current = { key: e.key, mode: 'move', x0: p.x, y0: p.y, box: e.box };
                }}
                onPointerMove={(ev) => {
                  const nb = nextBox(ev);
                  if (nb) setTmp({ key: e.key, box: nb });
                }}
                onPointerUp={finish}
                onKeyDown={(ev) => {
                  if (ev.key === 'Delete' || ev.key === 'Backspace') remove(e);
                  const step = ev.shiftKey ? 3 : 1;
                  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
                  if (d) {
                    ev.preventDefault();
                    onChange(withBox(free, e.kind, e.id, { ...e.box, x: r1(e.box.x + d[0]), y: r1(e.box.y + d[1]) }), 'Move a box');
                  }
                }}
              >
                <span className="rf-box-label" style={{ background: COLOUR[e.kind] }}>{e.label}</span>
                {sel === e.key && (
                  <span
                    className="rf-box-grip"
                    aria-label="Resize"
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      (ev.currentTarget as HTMLElement).parentElement!.setPointerCapture(ev.pointerId);
                      const p = pct(ev);
                      drag.current = { key: e.key, mode: 'resize', x0: p.x, y0: p.y, box: e.box };
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="rf-detect-side">
        <div className="cr-photo-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => add('slot')}>Add a text box</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => add('shape')}>Add a shape</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => add('photo')}>Add a photo region</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => add('graphic')}>Add a graphic</button>
        </div>
        {!selected && <p className="small muted">Click a box to select it, drag it to move it, drag its corner to resize it. Arrow keys nudge it; Delete removes it.</p>}
        {selected && (
          <div className="rf-detect-sel" role="group" aria-label="The selected box">
            <p className="small"><b>{selected.label}</b> at x {selected.box.x}%, y {selected.box.y}%, {selected.box.w}% by {selected.box.h}%</p>
            {selected.kind === 'slot' && (() => {
              const sl = free.slots.find((s) => s.id === selected.id)!;
              return (
                <>
                  <label className="cr-inline small">
                    <span className="field-label">What it is</span>
                    <select className="plain-select cr-select" aria-label="Role of this text box" value={sl.role} onChange={(e) => patchSlot(sl.id, (s) => ({ ...s, role: e.target.value as FreeRole }), 'Relabel a text box')}>
                      {FREE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  <label className="cr-inline small">
                    <span className="field-label">Aligned</span>
                    <select className="plain-select cr-select" aria-label="Alignment of this text box" value={sl.align} onChange={(e) => patchSlot(sl.id, (s) => ({ ...s, align: e.target.value as FreeSlot['align'] }), 'Change the alignment')}>
                      {['left', 'centre', 'right'].map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  <fieldset className="rf-fs"><legend className="small">Text treatments</legend>
                    {FREE_TREATMENTS.map((k) => {
                      const t = sl.treatments.find((x) => x.kind === k);
                      return (
                        <label key={k} className="small rf-toggle">
                          <input type="checkbox" checked={!!t && !t.off} aria-label={`Treatment: ${k}`} disabled={!t} onChange={(e) => patchSlot(sl.id, (s) => ({ ...s, treatments: s.treatments.map((x) => (x.kind === k ? { ...x, off: !e.target.checked } : x)) }), `${e.target.checked ? 'Switch on' : 'Switch off'} ${k}`)} /> {k}{t ? '' : ' (not detected)'}
                        </label>
                      );
                    })}
                    {missingHere.map((m) => <p key={m.kind} className="small cr-warn">Found but not drawable: {m.detail}</p>)}
                  </fieldset>
                </>
              );
            })()}
            {selected.kind === 'graphic' && (
              <label className="cr-inline small">
                <span className="field-label">What it is</span>
                <select className="plain-select cr-select" aria-label="What this graphic is" value={free.graphics.find((g) => g.id === selected.id)!.kind} onChange={(e) => onChange({ ...free, graphics: free.graphics.map((g) => (g.id === selected.id ? { ...g, kind: e.target.value } : g)) }, 'Relabel a graphic')}>
                  {GRAPHIC_LABELS.filter((g) => g !== 'unknown' && (MARK_KINDS as readonly string[]).includes(g)).map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
            )}
            <button type="button" className="btn btn-outline btn-sm" onClick={() => remove(selected)}>Delete this box</button>
          </div>
        )}
        {(free.missing?.length ?? 0) > 0 && (
          <div>
            <p className="small"><b>Found in the reference, not drawn:</b></p>
            <ul className="small" aria-label="Missing for this reference">{free.missing!.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}
