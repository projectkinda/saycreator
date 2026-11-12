// The "Picture" control of one slide (Round 14): Auto / None / thumbnails of the uploaded pictures. A pick redraws the slide in the browser with no writer call and is pinned on the slide.
// Round 18: each thumbnail is big enough to tell apart (its number, its name as a tooltip and in a larger preview, a badge with the slides that use it), and the line under the row names the picture
// the slide shows ("Picture 3: style step").
import { useState } from 'react';
import type { PictureMeta } from './photoLibrary';
import { contentOr } from './pictureKind';
import { PictureThumb, pictureCaption } from './PictureThumb';

export function SlidePicker({ index, pictures, current, shown, usage, onPick }: {
  index: number;
  /** The project's photos (the uploaded pictures). */
  pictures: PictureMeta[];
  /** "auto", "none" or the id of the pinned picture. */
  current: string;
  /** The id of the picture this slide shows now (pinned or placed by the deck), if any. */
  shown?: string;
  /** For each picture id, the slides (1-based) that use it. */
  usage?: Record<string, number[]>;
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
  const at = shown ? photos.findIndex((p) => p.id === shown) : -1;
  return (
    <div className="tn-field cr-pick" data-testid={`picker-${index}`}>
      <span className="field-label" id={`cr-pick-l-${index}`}>Picture</span>
      <div className="cr-pick-row" role="group" aria-labelledby={`cr-pick-l-${index}`}>
        <div className="cr-pick-modes">
          <button type="button" className="chip-btn" disabled={busy} aria-pressed={current === 'auto'} data-testid={`pick-${index}-auto`} title="The picture the deck gave this slide" onClick={() => void pick('auto')}>Auto</button>
          <button type="button" className="chip-btn" disabled={busy} aria-pressed={current === 'none'} data-testid={`pick-${index}-none`} title="No picture on this slide" onClick={() => void pick('none')}>None</button>
        </div>
        <div className="cr-pick-thumbs">
          {photos.map((p, k) => {
            const on = usage?.[p.id] ?? [];
            return (
              <button key={p.id} type="button" className="cr-pick-thumb" disabled={busy} aria-pressed={current === p.id} data-testid={`pick-${index}-${k}`} aria-label={`Use ${pictureCaption(p, k + 1)}${contentOr(p.content) === 'screenshot' ? ' (a screenshot)' : ''} on slide ${index + 1}`} onClick={() => void pick(p.id)}>
                <PictureThumb meta={p} number={k + 1} badge={on.length ? `on slide ${on.join(', ')}` : undefined} />
              </button>
            );
          })}
        </div>
      </div>
      <p className="small" data-testid={`pick-${index}-shown`}>{at >= 0 ? pictureCaption(photos[at], at + 1) : 'No picture on this slide.'}</p>
      {msg && <p className="small muted" role="status" data-testid={`pick-${index}-msg`}>{msg}</p>}
      {offer && <button type="button" className="btn btn-outline btn-sm" disabled={busy} data-testid={`pick-${index}-offer`} onClick={() => void pick(offer)}>Use a layout with a picture</button>}
    </div>
  );
}
