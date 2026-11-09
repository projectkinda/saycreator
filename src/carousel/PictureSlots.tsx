// Editing the pictures of a library slide, in the preview: tap a picture slot (or press it with the keyboard) to open its controls: replace it with another of the project's pictures or a new
// file, remove it, move the crop (the buttons, or drag the picture on the preview) and zoom. Every change draws THIS slide's layout again from its plan: no model call, one undo step.
import { useRef, useState } from 'react';
import { cropRect, parseRef } from './layouts/images';
import { urlOf, type PictureMeta } from './photoLibrary';

export interface SlotView {
  field: string;
  /** 1-based number shown to the person. */
  n: number;
  /** The picture reference in the slide's plan ("picture:<id>#..."). */
  ref: string;
  /** The slot's box on the 1080 x 1350 slide. */
  box: { x: number; y: number; w: number; h: number };
}
export interface SlotChange {
  remove?: true;
  /** Use this project picture in the slot. */
  picture?: string;
  /** A new file for the slot (added to the project first). */
  file?: File;
  fx?: number;
  fy?: number;
  z?: number;
}
export type OnSlotChange = (field: string, change: SlotChange) => Promise<string>;

const CANVAS = { w: 1080, h: 1350 };

/** Transparent hit areas over the picture slots of the preview (drag to move the crop, press to open the controls). */
export function SlotOverlay({ index, slots, open, onOpen, onChange }: { index: number; slots: SlotView[]; open: string | null; onOpen: (field: string | null) => void; onChange: OnSlotChange }) {
  const drag = useRef<{ x: number; y: number } | null>(null);
  return (
    <div aria-hidden={false} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} data-testid={`slot-overlay-${index}`}>
      {slots.map((s) => (
        <button
          key={s.field}
          type="button"
          data-testid={`slot-${index}-${s.n}`}
          aria-label={`Edit picture ${s.n} on slide ${index + 1}`}
          aria-expanded={open === s.field}
          title="Press to edit this picture; drag to move the crop"
          onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }}
          onPointerUp={(e) => {
            const d0 = drag.current;
            drag.current = null;
            if (!d0) return;
            const dx = e.clientX - d0.x, dy = e.clientY - d0.y;
            if (Math.hypot(dx, dy) < 5) return onOpen(open === s.field ? null : s.field);
            // dragged: the picture follows the pointer, so the focus point moves the other way (in slide pixels: the preview is scaled)
            const shown = (e.currentTarget.parentElement as HTMLElement).clientWidth || 216;
            const k = CANVAS.w / shown;
            const ref = parseRef(s.ref);
            const cr = cropRect(s.box, ref);
            if (!ref || !cr) return;
            void onChange(s.field, { fx: Math.max(0, Math.min(1, ref.fx - (dx * k) / cr.w)), fy: Math.max(0, Math.min(1, ref.fy - (dy * k) / cr.h)) });
          }}
          style={{ position: 'absolute', left: `${(s.box.x / CANVAS.w) * 100}%`, top: `${(s.box.y / CANVAS.h) * 100}%`, width: `${(s.box.w / CANVAS.w) * 100}%`, height: `${(s.box.h / CANVAS.h) * 100}%`, pointerEvents: 'auto', background: 'transparent', border: open === s.field ? '2px solid currentColor' : '1px dashed transparent', borderRadius: 6, cursor: 'grab', padding: 0 }}
        />
      ))}
    </div>
  );
}

/** The controls of the open slot. */
export function SlotPanel({ index, slot, pictures, usedElsewhere, onChange, onClose }: { index: number; slot: SlotView; pictures: PictureMeta[]; usedElsewhere: Set<string>; onChange: OnSlotChange; onClose: () => void }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const ref = parseRef(slot.ref);
  const cur = ref?.id ?? '';
  const run = async (c: SlotChange) => {
    setBusy(true);
    setMsg(await onChange(slot.field, c));
    setBusy(false);
  };
  const step = 0.08;
  const fx = ref?.fx ?? 0.5, fy = ref?.fy ?? 0.5, z = ref?.z ?? 1;
  const choices = pictures.filter((p) => p.kind === 'photo' && (p.id === cur || !usedElsewhere.has(p.id)));
  return (
    <div className="tn-field" role="group" aria-label={`Picture ${slot.n} of slide ${index + 1}`} data-testid={`slot-panel-${index}`} style={{ border: '1px solid currentColor', borderRadius: 8, padding: 8, display: 'grid', gap: 6 }}>
      <div className="row-actions" style={{ alignItems: 'center', gap: 8 }}>
        {urlOf(cur) && <img src={urlOf(cur)!} alt="" width={56} height={56} style={{ objectFit: 'cover', borderRadius: 4 }} />}
        <strong className="small">Picture {slot.n}</strong>
        <button type="button" className="btn btn-outline btn-sm" onClick={onClose} aria-label={`Close the controls of picture ${slot.n}`}>Close</button>
      </div>
      <label className="small">
        Replace with{' '}
        <select className="plain-select" value="" disabled={busy} aria-label={`Replace picture ${slot.n} with another picture`} data-testid={`slot-replace-${index}`} onChange={(e) => e.target.value && void run({ picture: e.target.value })}>
          <option value="">Choose a picture…</option>
          {choices.filter((p) => p.id !== cur).map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.width}×{p.height})</option>
          ))}
        </select>
      </label>
      <div className="row-actions" style={{ alignItems: 'center', gap: 8 }}>
        <input ref={fileInput} type="file" accept="image/*" className="visually-hidden" tabIndex={-1} disabled={busy} aria-label={`Choose a new file for picture ${slot.n}`} data-testid={`slot-file-${index}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setFileName(f.name); void run({ file: f }); } }} />
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => fileInput.current?.click()}>Upload a new picture</button>
        {fileName && <span className="small muted" data-testid={`slot-file-name-${index}`}>{fileName}</span>}
      </div>
      <div className="row-actions" style={{ flexWrap: 'wrap', gap: 4 }} role="group" aria-label="Move and zoom the crop">
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void run({ fx: Math.max(0, fx - step) })}>Show more of the left</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void run({ fx: Math.min(1, fx + step) })}>Show more of the right</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void run({ fy: Math.max(0, fy - step) })}>Show more of the top</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void run({ fy: Math.min(1, fy + step) })}>Show more of the bottom</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy || z >= 4} onClick={() => void run({ z: Math.min(4, Math.round((z + 0.25) * 100) / 100) })}>Zoom in</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy || z <= 1} onClick={() => void run({ z: Math.max(1, Math.round((z - 0.25) * 100) / 100) })}>Zoom out</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void run({ fx: 0.5, fy: 0.5, z: 1 })}>Centre</button>
        <span className="small muted" data-testid={`slot-crop-${index}`}>Zoom {z.toFixed(2)}, focus {fx.toFixed(2)} / {fy.toFixed(2)}</span>
      </div>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void run({ remove: true })} data-testid={`slot-remove-${index}`}>Remove this picture</button>
      {msg && <span className="small" role="status">{msg}</span>}
    </div>
  );
}
