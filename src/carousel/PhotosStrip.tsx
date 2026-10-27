// The "Photos" strip at the top of the editor: every picture the project has, so one can be dragged onto several slides.
import { useRef, useState } from 'react';
import { PICTURE_DRAG, type AddFiles } from './PhotoControls';
import { PRIVACY_LINE, isMissing, urlOf, type PictureMeta } from './photoLibrary';

const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function PhotosStrip({ pictures, supported, styleTitle, addFiles, onRemove, usedOn, storageProblem, lowRoom }: {
  pictures: PictureMeta[];
  /** The chosen style has photo layouts. */
  supported: boolean;
  styleTitle: string;
  addFiles: AddFiles;
  onRemove: (id: string) => void;
  /** How many slides each picture is on. */
  usedOn: (id: string) => number;
  storageProblem: string;
  lowRoom: string;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const objRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const go = async (files: File[], kind: 'photo' | 'object') => {
    if (files.length === 0) return;
    setBusy(true);
    setStatus(`Adding ${files.length} file${files.length === 1 ? '' : 's'}…`);
    const r = await addFiles(files, kind);
    setBusy(false);
    setStatus(r.messages.length ? r.messages.join(' ') : r.added.length ? `Added ${r.added.length} ${kind === 'photo' ? 'photo' : 'object'}${r.added.length === 1 ? '' : 's'}.` : '');
  };
  const photos = pictures.filter((p) => p.kind === 'photo');
  const objects = pictures.filter((p) => p.kind === 'object');
  return (
    <section className="card cr-strip" aria-labelledby="cr-photos-h">
      <div className="cr-strip-head">
        <h2 id="cr-photos-h" className="h3">Photos</h2>
        <div className="row-actions">
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => photoRef.current?.click()}>Add photos</button>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => objRef.current?.click()}>Add objects</button>
        </div>
        <input ref={photoRef} type="file" multiple accept="image/*,.heic,.heif" className="visually-hidden" tabIndex={-1} aria-label="Choose photos to add" onChange={(e) => { void go([...(e.target.files ?? [])], 'photo'); e.target.value = ''; }} />
        <input ref={objRef} type="file" multiple accept="image/png,image/webp" className="visually-hidden" tabIndex={-1} aria-label="Choose transparent objects to add" onChange={(e) => { void go([...(e.target.files ?? [])], 'object'); e.target.value = ''; }} />
      </div>
      <p className="small muted">{PRIVACY_LINE} Drag a photo from here onto a slide’s photo area, or drop files here.</p>
      {!supported && <p className="small cr-warn" role="status"><span aria-hidden="true">⚠ </span>{styleTitle} has no photo slots. Choose Mono photo poster, Film photo and paper, or Soft gradient and glass to use photos.</p>}
      <div
        className={`cr-strip-drop${over ? ' over' : ''}`}
        data-testid="photos-drop"
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void go([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)), 'photo');
        }}
      >
        {pictures.length === 0 ? (
          <p className="small muted">No photos yet. Add some, or drop them here.</p>
        ) : (
          <ul className="cr-strip-list" aria-label={`${photos.length} photos and ${objects.length} objects`}>
            {pictures.map((p) => {
              const url = urlOf(p.id);
              const n = usedOn(p.id);
              return (
                <li key={p.id} className={`cr-strip-item${isMissing(p.id) ? ' missing' : ''}`} draggable={p.kind === 'photo' && !!url} onDragStart={(e) => e.dataTransfer.setData(PICTURE_DRAG, p.id)} aria-label={`${p.kind === 'photo' ? 'Photo' : 'Object'} ${p.name}`}>
                  {url ? <img src={url} alt="" draggable={false} /> : <span className="cr-strip-gone small">Not in storage</span>}
                  <span className="small cr-strip-name" title={p.name}>{p.name}</span>
                  <span className="small muted">{p.width}×{p.height} · {mb(p.bytes)}{p.kind === 'object' ? ' · object' : n ? ` · on ${n} slide${n === 1 ? '' : 's'}` : ''}</span>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => onRemove(p.id)} aria-label={`Remove ${p.name} from the project`}>Remove</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {status && <p className="small" role="status" aria-live="polite" data-testid="photos-status">{status}</p>}
      {storageProblem && <p className="small cr-problem" role="alert">{storageProblem}</p>}
      {lowRoom && <p className="small cr-warn" role="status">{lowRoom}</p>}
    </section>
  );
}
