// The "Picture" control of one slide (Round 14): Auto / None / thumbnails of the uploaded pictures. A pick redraws the slide in the browser with no writer call and is pinned on the slide.
import { useState } from 'react';
import { urlOf, type PictureMeta } from './photoLibrary';
import { contentOr } from './pictureKind';

export function SlidePicker({ index, pictures, current, onPick }: {
  index: number;
  /** The project's photos (the uploaded pictures). */
  pictures: PictureMeta[];
  /** "auto", "none" or the id of the pinned picture. */
  current: string;
  /** Says what happened in plain words. */
  onPick: (choice: string) => Promise<string | { msg: string; offer: string }>;
}) {
  const [msg, setMsg] = useState('');
  const [offer, setOffer] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = async (choice: string) => {
    if (busy) return;
    setBusy(true);
    const r = await onPick(choice);
    setMsg(typeof r === 'string' ? r : r.msg);
    setOffer(typeof r === 'string' ? '' : r.offer);
    setBusy(false);
  };
  const photos = pictures.filter((p) => p.kind === 'photo');
  if (!photos.length) return null;
  return (
    <div className="tn-field cr-pick" data-testid={`picker-${index}`}>
      <span className="field-label" id={`cr-pick-l-${index}`}>Picture</span>
      <div className="cr-pick-row" role="group" aria-labelledby={`cr-pick-l-${index}`}>
        <button type="button" className="chip-btn" disabled={busy} aria-pressed={current === 'auto'} data-testid={`pick-${index}-auto`} title="The picture the deck gave this slide" onClick={() => void pick('auto')}>Auto</button>
        <button type="button" className="chip-btn" disabled={busy} aria-pressed={current === 'none'} data-testid={`pick-${index}-none`} title="No picture on this slide" onClick={() => void pick('none')}>None</button>
        {photos.map((p, k) => (
          <button key={p.id} type="button" className="cr-pick-thumb" disabled={busy} aria-pressed={current === p.id} data-testid={`pick-${index}-${k}`} aria-label={`Use picture ${k + 1}${contentOr(p.content) === 'screenshot' ? ' (a screenshot)' : ''} on slide ${index + 1}`} onClick={() => void pick(p.id)}>
            {urlOf(p.id) ? <img src={urlOf(p.id)!} alt="" draggable={false} /> : <span className="small">{k + 1}</span>}
          </button>
        ))}
      </div>
      {msg && <p className="small muted" role="status" data-testid={`pick-${index}-msg`}>{msg}</p>}
      {offer && <button type="button" className="btn btn-outline btn-sm" disabled={busy} data-testid={`pick-${index}-offer`} onClick={() => void pick(offer)}>Use a layout with a picture</button>}
    </div>
  );
}
