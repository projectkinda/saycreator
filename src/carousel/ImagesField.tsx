// "Add images" next to the text input of the creation form: optional pictures for the slides. Choose files, drop them, or paste them; each one is checked, scaled to at most 2400 px on its
// long side and stripped of metadata; a thumbnail with its orientation (portrait, landscape or square) shows what was added, and the order can be changed (the order is the order the code
// tries the pictures in when it places them) or a picture removed. Only metadata (the pixel size) ever reaches the writer: never the pixels.
import { useRef, useState } from 'react';
import { orientationOf } from './layouts/images';
import { prepareForSlots } from './imagePrep';
import type { PictureMeta } from './photoLibrary';
import { PictureThumb } from './PictureThumb';
import type { AddFiles } from './PhotoControls';
import { contentOr } from './pictureKind';
import { fillSentence } from './layouts/fillSlide';
import type { SlideFill } from './layouts/build';

const LABEL = { portrait: 'Portrait', landscape: 'Landscape', square: 'Square' } as const;

export function ImagesField({ pictures, addFiles, onRemove, onMove, onContent, onLabel, onFullPicture, fillInfo, onFill, describe, onDescribe, disabled }: {
  /** The project's pictures (photos only are listed here). */
  pictures: PictureMeta[];
  addFiles: AddFiles;
  onRemove: (id: string) => void;
  /** Moves a picture one place earlier (-1) or later (+1). */
  onMove: (id: string, dir: -1 | 1) => void;
  /** Switches a picture between a screenshot and a photo. */
  onContent?: (id: string, content: 'screenshot' | 'photo') => void;
  /** Round 18: sets what the person calls a picture (the "What is in it?" box, at most 40 characters). */
  onLabel?: (id: string, label: string) => void;
  /** Round N: a photo with letterbox bars: keep the full picture (true) or draw it without its bars (false). */
  onFullPicture?: (id: string, full: boolean) => void;
  /** Round U: per photo on a full-bleed slide where filling is a question (a cover crop would cut 25% to 40%): what the slide draws. */
  fillInfo?: Record<string, SlideFill>;
  /** Round U: "Fill the slide" on or off for a photo. */
  onFill?: (id: string, on: boolean) => void;
  /** Round AE: "Describe my pictures automatically" (the switch is shown only when the page can describe). */
  describe?: boolean;
  onDescribe?: (on: boolean) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const photos = pictures.filter((p) => p.kind === 'photo');
  const go = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    const messages: string[] = [];
    const ready: File[] = [];
    for (const f of files) {
      const r = await prepareForSlots(f);
      if ('message' in r) messages.push(r.message);
      else {
        ready.push(r.file);
        if (r.note) messages.push(r.note);
      }
    }
    let added = 0;
    if (ready.length) {
      const res = await addFiles(ready, 'photo');
      added = res.added.length;
      messages.push(...res.messages);
    }
    setBusy(false);
    setStatus(`${added ? `Added ${added} image${added === 1 ? '' : 's'}. ` : ''}${messages.join(' ')}`.trim());
  };
  return (
    <div
      className={`cr-images${over ? ' over' : ''}`}
      data-testid="images-field"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void go([...e.dataTransfer.files]); }}
      onPaste={(e) => { const files = [...(e.clipboardData?.files ?? [])]; if (files.length) { e.preventDefault(); void go(files); } }}
      tabIndex={-1}
    >
      <div className="row-actions" style={{ alignItems: 'center', gap: 8 }}>
        <strong className="field-label">Images (optional)</strong>
        <button type="button" className="btn btn-outline btn-sm" disabled={disabled || busy} onClick={() => input.current?.click()}>Add images</button>
        <span className="small muted">Choose, drop or paste pictures. They stay in this browser. The writer sees only each picture's number, its shape and the name you give it, never the picture itself.</span>
      </div>
      {onDescribe && (
        <label className="cr-pic-bars-switch small" data-testid="images-describe">
          <input type="checkbox" checked={!!describe} disabled={disabled} onChange={(e) => onDescribe(e.target.checked)} /> Describe my pictures automatically
        </label>
      )}
      <input ref={input} type="file" multiple accept="image/*" className="visually-hidden" tabIndex={-1} aria-label="Choose images for the slides" onChange={(e) => { void go([...(e.target.files ?? [])]); e.target.value = ''; }} />
      {photos.length > 0 && (
        <ul className="cr-pic-list" aria-label={`${photos.length} image${photos.length === 1 ? '' : 's'} for the slides`} data-testid="images-list">
          {photos.map((p, i) => {
            const o = orientationOf(p.width, p.height);
            return (
              <li key={p.id} className="cr-pic-item" data-testid={`image-${i}`} data-orientation={o} aria-label={`Picture ${i + 1}, ${LABEL[o]}`}>
                <PictureThumb meta={p} number={i + 1} />
                <label className="cr-pic-name small">
                  <span className="visually-hidden">What is picture {i + 1}?</span>
                  <input type="text" maxLength={40} value={p.label ?? ''} placeholder="What is in it? (puts it on the right slide)" data-testid={`image-${i}-label`} disabled={disabled || !onLabel} onChange={(e) => onLabel?.(p.id, e.target.value.slice(0, 40))} />
                  {p.labelAuto && p.label?.trim() && <span className="chip-btn small" data-testid={`image-${i}-auto`} title="Filled in automatically from what is in the picture. Type to change it.">auto</span>}
                </label>
                <span className="small" data-testid={`image-${i}-orientation`}>{LABEL[o]} · {p.width}×{p.height}</span>
                <button type="button" className="chip-btn" data-testid={`image-${i}-content`} data-content={contentOr(p.content) === 'screenshot' ? 'screenshot' : 'photo'} aria-label={contentOr(p.content) === 'screenshot' ? `Image ${i + 1} is a screenshot. Switch it to a photo.` : `Image ${i + 1} is a photo. Switch it to a screenshot.`} title={contentOr(p.content) === 'screenshot' ? 'A screenshot never goes behind text. Click to make it a photo.' : 'Click if this is a screenshot: a screenshot never goes behind text.'} disabled={disabled || !onContent} onClick={() => onContent?.(p.id, contentOr(p.content) === 'screenshot' ? 'photo' : 'screenshot')}>{contentOr(p.content) === 'screenshot' ? 'Screenshot' : 'Photo'}</button>
                {p.crop && contentOr(p.content) !== 'screenshot' && (
                  <span className="cr-pic-bars small" data-testid={`image-${i}-bars`}>
                    {p.fullPicture ? 'This picture has black bars; the full picture is used.' : 'Black bars were cropped off.'}
                    <label className="cr-pic-bars-switch">
                      <input type="checkbox" role="switch" aria-checked={!!p.fullPicture} checked={!!p.fullPicture} disabled={disabled || !onFullPicture} data-testid={`image-${i}-full`} onChange={(e) => onFullPicture?.(p.id, e.target.checked)} />
                      <span>Keep the full picture</span>
                    </label>
                  </span>
                )}
                {fillInfo?.[p.id] && contentOr(p.content) !== 'screenshot' && (() => {
                  const fi = fillInfo[p.id];
                  // a photo kept with its letterbox bars is never cut: the switch is off and says why (the two switches never pull against each other)
                  const keepsBars = !!(p.crop && p.fullPicture);
                  return (
                    <span className="cr-pic-bars cr-pic-fill small" data-testid={`image-${i}-fill`}>
                      <label className="cr-pic-bars-switch">
                        <input type="checkbox" role="switch" aria-checked={fi.fill && !keepsBars} checked={fi.fill && !keepsBars} disabled={disabled || !onFill || keepsBars} data-testid={`image-${i}-fill-switch`} onChange={(e) => onFill?.(p.id, e.target.checked)} />
                        <span>Fill the slide</span>
                      </label>
                      <span data-testid={`image-${i}-fill-note`}>{keepsBars ? 'Off while the full picture is kept: a photo kept with its black bars is never cut.' : fillSentence(fi)}</span>
                    </span>
                  );
                })()}
                <span className="row-actions">
                  <button type="button" className="btn btn-outline btn-sm" disabled={i === 0} onClick={() => onMove(p.id, -1)} aria-label={`Move image ${i + 1} earlier`}>←</button>
                  <button type="button" className="btn btn-outline btn-sm" disabled={i === photos.length - 1} onClick={() => onMove(p.id, 1)} aria-label={`Move image ${i + 1} later`}>→</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => onRemove(p.id)} aria-label={`Remove image ${i + 1}`}>Remove</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {/* Round V: what the switch does, said once for the whole row (not under every picture) */}
      {photos.some((p) => fillInfo?.[p.id] && contentOr(p.content) !== 'screenshot') && <p className="small muted" data-testid="images-fill-help">Fill the slide. On: the photo covers the slide edge to edge, and its edges are cut. Off: the whole photo is shown, and its edges melt into the slide.</p>}
      {/* Round AD: said only while no picture has a name */}
      {photos.length > 0 && !photos.some((p) => p.label?.trim()) && <p className="small muted" data-testid="images-name-hint">Name your pictures so they go on the slides that talk about them</p>}
      {status && <p className="small" role="status" aria-live="polite" data-testid="images-status">{status}</p>}
    </div>
  );
}
