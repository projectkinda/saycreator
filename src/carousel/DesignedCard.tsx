// What Designed code did for a deck (slides redesigned one by one, which fell back and why) and "Save this look as a pack"; also the card that lists
// script words that are notes, not slide text ("edit this").
import { useState } from 'react';
import type { CarouselScript } from '../image-engine/carousel/types';
import { blankStyle } from '../reference/blank';
import { packThumbs } from '../reference/PackMaker';
import { saveTemplate, styleNameFor } from '../reference/templates';
import type { Doc } from './doc';
import { cleanScript } from './clean';
import { packFromDesigned, type Designed } from './designed';

const dataUrl = (b: Blob) => new Promise<string>((res) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => res('');
  r.readAsDataURL(b);
});

/** Saves designed slides as a style (one design per slide type, no pictures). Returns the style's name, or null when no slide has a design. */
export async function saveLook(designed: Designed, script: CarouselScript, title: string): Promise<{ name: string; designs: number } | null> {
  const pk = packFromDesigned(designed, script, title);
  if (!pk) return null;
  const thumbs = await packThumbs(pk);
  const preview = thumbs[0] ? await dataUrl(thumbs[0].blob) : '';
  const tpl = await saveTemplate({ name: title, target: 'carousel', spec: { ...blankStyle(), name: styleNameFor(title), title }, preview, pack: pk });
  return { name: tpl.spec.name, designs: Object.keys(pk.designs).length };
}

/** Words of the script that are notes to the person, not slide text. They are left out of the slides. */
export function DeckFlags({ doc }: { doc: Doc }) {
  if (!doc.script) return null;
  const { flags } = cleanScript(doc.script);
  if (!flags.length) return null;
  return (
    <div className="notice notice-warn" role="status" data-testid="deck-flags">
      <strong>{flags.length} note{flags.length === 1 ? '' : 's'} in your script {flags.length === 1 ? 'is' : 'are'} not drawn on the slides: edit this</strong>
      <ul className="cr-issues">
        {flags.map((f, i) => <li key={i}>Slide {f.slide + 1}, {f.label}: “{f.text}”. Replace it with your own words, or clear it.</li>)}
      </ul>
    </div>
  );
}

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
    const r = await saveLook(d, doc.script!, title);
    setMsg(r ? `Saved “${title}” as a style: ${r.designs} designs. Choose it under Style and the next carousel is made from it with no design call.` : 'No slide has a design to save.');
  };
  return (
    <section className="card ws-card" aria-label="Designed deck" data-testid="designed-card">
      <h2 className="h3">Designed slides</h2>
      <p className="small" role="status">
        {ok} of {n} slides have their own design{fell.length ? `; ${fell.length} fell back to a standard layout in the deck's colours and fonts` : ''}. {d.calls} drawing-model call{d.calls === 1 ? '' : 's'}.
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
