// After a deck is made: the pictures the code did not place ("N pictures weren't used") and a way to drop each one into any picture slot of the deck. Putting one in a slot draws that slide
// again from its plan (no model call, one undo step); a slot that already holds a picture gives it up (it then shows here as unused).
import { useState } from 'react';
import { urlOf, type PictureMeta } from './photoLibrary';

export interface SlotChoice {
  slide: number;
  field: string;
  label: string;
}

export function UnusedPictures({ unused, slots, onPut }: { unused: PictureMeta[]; slots: SlotChoice[]; onPut: (pictureId: string, slide: number, field: string) => Promise<string> }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (!unused.length) return null;
  const n = unused.length;
  return (
    <section className="card" data-testid="unused-pictures" aria-label="Pictures not used in this deck" style={{ display: 'grid', gap: 8 }}>
      <p className="small" role="status" data-testid="unused-count" style={{ margin: 0 }}>
        <strong>{n} {n === 1 ? 'picture wasn’t' : 'pictures weren’t'} used.</strong> {slots.length ? 'Drop one into any picture slot.' : 'No slide has a picture slot: pick a picture layout in a slide’s layout gallery.'}
      </p>
      <ul className="cr-strip-list" aria-label="Pictures not used">
        {unused.map((p) => (
          <li key={p.id} className="cr-strip-item" data-testid={`unused-${p.id}`}>
            {urlOf(p.id) && <img src={urlOf(p.id)!} alt="" draggable={false} />}
            <span className="small">{p.name} · {p.width}×{p.height}</span>
            {slots.length > 0 && (
              <select
                className="plain-select"
                value=""
                disabled={busy}
                aria-label={`Put ${p.name} in a picture slot`}
                data-testid={`unused-put-${p.id}`}
                onChange={async (e) => {
                  const [slide, field] = e.target.value.split('|');
                  if (!field) return;
                  setBusy(true);
                  setMsg(await onPut(p.id, Number(slide), field));
                  setBusy(false);
                }}
              >
                <option value="">Put in a slot…</option>
                {slots.map((s) => (
                  <option key={`${s.slide}|${s.field}`} value={`${s.slide}|${s.field}`}>{s.label}</option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ul>
      {msg && <span className="small" role="status">{msg}</span>}
    </section>
  );
}
