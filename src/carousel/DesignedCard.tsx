// What Designed mode did (how many slides were designed, which fell back and why) and "Save this look as a pack" so the next carousel reuses it for free.
import { useState } from 'react';
import { blankStyle } from '../reference/blank';
import { packThumbs } from '../reference/PackMaker';
import { saveTemplate, styleNameFor } from '../reference/templates';
import type { Doc } from './doc';
import { packFromDesigned } from './designed';

const dataUrl = (b: Blob) => new Promise<string>((res) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => res('');
  r.readAsDataURL(b);
});

export function DesignedCard({ doc }: { doc: Doc }) {
  const d = doc.designed;
  const [name, setName] = useState('My designed look');
  const [msg, setMsg] = useState('');
  if (!d || !doc.script) return null;
  const n = doc.script.slides.length;
  const ok = Object.keys(d.slides).length;
  const fell = Object.entries(d.fallbacks);
  const save = async () => {
    const title = name.trim() || 'My designed look';
    const pk = packFromDesigned(d, doc.script!, title);
    if (!pk) return setMsg('No slide has a design to save.');
    const thumbs = await packThumbs(pk);
    const preview = thumbs[0] ? await dataUrl(thumbs[0].blob) : '';
    await saveTemplate({ name: title, target: 'carousel', spec: { ...blankStyle(), name: styleNameFor(title), title }, preview, pack: pk });
    setMsg(`Saved “${title}” as a template: ${Object.keys(pk.designs).length} designs. Choose it under Style and the next carousel is made from it with no design call.`);
  };
  return (
    <section className="card ws-card" aria-label="Designed deck" data-testid="designed-card">
      <h2 className="h3">Designed deck</h2>
      <p className="small" role="status">
        {ok} of {n} slides were designed by the model{fell.length ? `; ${fell.length} fell back to a standard layout in the deck's colours and fonts` : ''}. {d.calls} model call{d.calls === 1 ? '' : 's'}, {(d.ms / 1000).toFixed(0)} s.
      </p>
      {fell.length > 0 && (
        <ul className="small cr-issues">
          {fell.map(([i, why]) => <li key={i}>Slide {Number(i) + 1}: {why}</li>)}
        </ul>
      )}
      {d.notes.map((x, i) => <p key={i} className="small muted">{x}</p>)}
      <div className="row-actions">
        <input className="input" aria-label="Name for the saved look" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <button type="button" className="btn btn-outline" disabled={ok === 0} onClick={save}>Save this look as a pack</button>
      </div>
      {msg && <p className="small" role="status">{msg}</p>}
    </section>
  );
}
