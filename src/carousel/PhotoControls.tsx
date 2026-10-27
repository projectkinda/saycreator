// The photo controls of one slide card: a slot to put a photo in (add, drop, replace, remove), how it is treated, framed and
// cropped, and a transparent object. Every change is a patch, so Undo and Redo cover it. Pictures stay in this browser.
import { useEffect, useRef, useState } from 'react';
import type { Palette } from '../image-engine/carousel/types';
import type { StyledSlide } from '../image-engine/styles/compose';
import { OBJECT_FX, DEFAULT_OBJECT, type ObjectChoice, type ObjectFxChoice } from '../image-engine/photo/objects';
import { renderPhoto } from '../image-engine/draw/treat';
import { resolveTreatments } from '../image-engine/photo/resolve';
import type { SlideScript } from '../image-engine/carousel/types';
import { patches } from './doc';
import type { Apply } from './parts';
import { FRAME_CHOICES, SHAPE_CHOICES, TREATMENT_CHOICES, treatmentsFor, type PhotoChoice, type TreatmentChoice } from './photoChoices';
import { PRIVACY_LINE, isMissing, resolutionNote, urlOf, type PictureMeta } from './photoLibrary';

export const PICTURE_DRAG = 'application/x-cr-picture';

export type AddFiles = (files: File[], kind: 'photo' | 'object') => Promise<{ added: PictureMeta[]; messages: string[] }>;

/** Shows the whole photo with a dot where the crop is centred. Drag the dot (or use the arrow keys) to keep the subject in the crop. */
export function FocalPicker({ url, focal, onMove, label }: { url: string; focal: { x: number; y: number }; onMove: (f: { x: number; y: number }) => void; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const at = drag ?? focal;
  const from = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  return (
    <div
      ref={box}
      className="cr-focal"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(from(e));
      }}
      onPointerMove={(e) => drag && setDrag(from(e))}
      onPointerUp={(e) => {
        if (!drag) return;
        const f = from(e);
        setDrag(null);
        onMove(f);
      }}
    >
      <img src={url} alt="" draggable={false} />
      <button
        type="button"
        className="cr-focal-dot"
        style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
        aria-label={label}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.02;
          const d = e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0] : e.key === 'ArrowUp' ? [0, -step] : e.key === 'ArrowDown' ? [0, step] : null;
          if (!d) return;
          e.preventDefault();
          onMove({ x: Math.min(1, Math.max(0, focal.x + d[0])), y: Math.min(1, Math.max(0, focal.y + d[1])) });
        }}
      />
    </div>
  );
}

/** A small live picture of the photo with a treatment, as it will look in a card-sized crop. */
function TreatmentPreview({ url, choice, focal, palette }: { url: string; choice: TreatmentChoice; focal?: { x: number; y: number }; palette: Palette }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (!live || !ref.current) return;
      const list = treatmentsFor(choice);
      const c = renderPhoto(img, 96, 120, 'cover', focal, list ? resolveTreatments(list, palette as unknown as Record<string, unknown>) : []);
      const g = ref.current.getContext('2d')!;
      g.clearRect(0, 0, 96, 120);
      g.drawImage(c, 0, 0);
    };
    img.src = url;
    return () => {
      live = false;
    };
  }, [url, choice, focal?.x, focal?.y, palette]);
  return <canvas ref={ref} width={96} height={120} className="cr-treat-prev" aria-hidden="true" />;
}

export function PhotoControls({ index, slide, script, choice, object, pictures, palette, hasPhotoStyle, apply, addFiles }: {
  index: number;
  slide: StyledSlide;
  script: SlideScript;
  choice: PhotoChoice | undefined;
  object: ObjectChoice | undefined;
  pictures: PictureMeta[];
  palette: Palette;
  /** The style has photo layouts (so a photo can go on its slides). */
  hasPhotoStyle: boolean;
  apply: Apply;
  addFiles: AddFiles;
}) {
  const slots = slide.plan.meta?.photoSlots ?? [];
  const hasSlot = slots.length > 0;
  const fileRef = useRef<HTMLInputElement>(null);
  const objRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState('');
  const [problem, setProblem] = useState('');
  const photos = pictures.filter((p) => p.kind === 'photo');
  const objects = pictures.filter((p) => p.kind === 'object');
  const shownId = slots[0]?.photo ?? null;
  const shownUrl = shownId ? urlOf(shownId) : null;
  const run = (r: ReturnType<Apply>) => setProblem(r.ok ? '' : r.reasons[0]);
  const hint = (script as { photo_hint?: string }).photo_hint;
  const imgLayer = slide.plan.layers.find((l) => l.kind === 'image' && shownUrl && l.src === shownUrl);
  const soft = shownId && imgLayer ? resolutionNote(shownId, imgLayer.width, imgLayer.height, choice?.focal) : null;
  const treatment: TreatmentChoice = choice?.treatment ?? 'style';
  const focal = choice?.focal ?? { x: 0.5, y: 0.5 };

  const take = async (files: File[], kind: 'photo' | 'object') => {
    if (files.length === 0) return;
    setStatus(files.length > 1 ? `Adding ${files.length} files…` : 'Adding…');
    const r = await addFiles(files, kind);
    setStatus(r.messages.join(' '));
    if (r.added[0]) {
      if (kind === 'photo') run(apply(patches.photo(index, r.added[0].id)));
      else run(apply(patches.object(index, { id: r.added[0].id, ...DEFAULT_OBJECT })));
    }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const id = e.dataTransfer.getData(PICTURE_DRAG);
    if (id) return run(apply(patches.photo(index, id)));
    void take([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)), 'photo');
  };

  if (!hasSlot && !hasPhotoStyle) return null;
  const o = object;
  // Where the object really is now (free space is found by the slide when the person has not placed it).
  const placedLayer = slide.plan.layers.find((l) => l.id === 'object');
  const atX = o ? o.x ?? (placedLayer ? Math.round(((placedLayer.x + placedLayer.width / 2) / slide.plan.canvas.width) * 100) / 100 : 0.5) : 0.5;
  const atY = o ? o.y ?? (placedLayer ? Math.round(((placedLayer.y + placedLayer.height / 2) / slide.plan.canvas.height) * 100) / 100 : 0.62) : 0.62;
  const setObject = (patch: Partial<ObjectChoice>) => o && run(apply(patches.object(index, { ...o, ...patch })));
  // Moving it by hand fixes both numbers; "Place automatically" gives the choice back to the slide.
  const moveObject = (patch: { x?: number; y?: number }) => setObject({ x: atX, y: atY, ...patch });

  return (
    <div className="cr-photo">
      {(hasSlot || hasPhotoStyle) && (
        <section aria-label={`Photo for slide ${index + 1}`}>
          <h4 className="h4">Photo</h4>
          {hint && <p className="small muted cr-hint">Ideal photo: {hint}</p>}
          <div className={`cr-drop${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop} data-testid={`photo-drop-${index}`}>
            {shownId && shownUrl ? (
              <>
                <FocalPicker url={shownUrl} focal={focal} label={`Crop point of the photo on slide ${index + 1}. Drag it, or use the arrow keys.`} onMove={(f) => run(apply(patches.focal(index, f)))} />
                <p className="small muted">Drag the dot so the crop keeps your subject.</p>
              </>
            ) : (
              <p className="small muted">{choice?.id === null ? 'No photo on this slide. ' : ''}Drop a photo here{photos.length ? ', or drag one from the Photos strip' : ''}.</p>
            )}
          </div>
          {!hasSlot && <p className="small muted">{typeof choice?.id === 'string' ? 'This kind of slide has no photo layout in this style, so the photo is not shown here.' : 'This slide has no photo slot. Add a photo, and it switches to a photo layout.'}</p>}
          {isMissing(slots[0]?.photo ?? '') && <p className="small cr-problem" role="alert">This photo is no longer in the browser’s storage. Add it again.</p>}
          <div className="cr-photo-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>{shownId ? 'Replace photo' : 'Add photo'}</button>
            {(shownId || slots[0]?.filled) && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => run(apply(patches.photo(index, null)))}>Remove photo</button>
            )}
            {photos.length > 0 && (
              <select className="plain-select cr-select" aria-label={`Use one of your photos on slide ${index + 1}`} value="" onChange={(e) => e.target.value && run(apply(patches.photo(index, e.target.value)))}>
                <option value="">Use a photo…</option>
                {photos.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <input ref={fileRef} type="file" accept="image/*,.heic,.heif" className="visually-hidden" tabIndex={-1} aria-label={`Choose a photo for slide ${index + 1}`} onChange={(e) => { void take([...(e.target.files ?? [])], 'photo'); e.target.value = ''; }} />
          </div>
          <p className="small muted">{PRIVACY_LINE}</p>
          {status && <p className="small" role="status" aria-live="polite">{status}</p>}
          {soft && <p className="small cr-warn" role="status"><span aria-hidden="true">⚠ </span>{soft}</p>}

          {shownId && shownUrl && (
            <>
              <div className="cr-treat">
                <span className="field-label" id={`cr-treat-l-${index}`}>Treatment</span>
                <div className="cr-treat-row">
                  <div role="radiogroup" aria-labelledby={`cr-treat-l-${index}`} className="chip-group">
                    {TREATMENT_CHOICES.map((t) => (
                      <button key={t.id} type="button" role="radio" aria-checked={treatment === t.id} className="chip-btn" onClick={() => run(apply(patches.treatment(index, t.id)))}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <TreatmentPreview url={shownUrl} choice={treatment} focal={choice?.focal} palette={palette} />
                </div>
              </div>
              {slide.layout === 'content-photo-frame' && (
                <label className="cr-inline">
                  <span className="field-label">Frame</span>
                  <select className="plain-select cr-select" value={choice?.frame ?? ''} onChange={(e) => e.target.value && run(apply(patches.frame(index, e.target.value)))}>
                    <option value="">The style’s own</option>
                    {FRAME_CHOICES.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </label>
              )}
              {slide.layout === 'cover-photo-shape' && (
                <label className="cr-inline">
                  <span className="field-label">Shape</span>
                  <select className="plain-select cr-select" value={choice?.shape ?? ''} onChange={(e) => e.target.value && run(apply(patches.shape(index, e.target.value)))}>
                    <option value="">The style’s own</option>
                    {SHAPE_CHOICES.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </label>
              )}
              {slide.layout === 'content-photo-strip' && <p className="small muted">This layout shows three photos from your list. Change the layout to pick one photo.</p>}
              {slide.layout !== 'content-photo-frame' && slide.layout !== 'cover-photo-shape' && slide.layout !== 'content-photo-strip' && <p className="small muted">This layout has no frame or shape to choose.</p>}
            </>
          )}
        </section>
      )}

      {hasPhotoStyle && (
        <section aria-label={`Object on slide ${index + 1}`} className="cr-object">
          <h4 className="h4">Object</h4>
          <div className="cr-photo-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => objRef.current?.click()}>{o ? 'Replace object' : 'Add an object (transparent PNG)'}</button>
            {o && <button type="button" className="btn btn-outline btn-sm" onClick={() => run(apply(patches.object(index, undefined)))}>Remove object</button>}
            {objects.length > 0 && (
              <select className="plain-select cr-select" aria-label={`Use one of your objects on slide ${index + 1}`} value={o?.id ?? ''} onChange={(e) => e.target.value && run(apply(patches.object(index, { ...(o ?? DEFAULT_OBJECT), id: e.target.value })))}>
                <option value="">Use an object…</option>
                {objects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <input ref={objRef} type="file" accept="image/png,image/webp" className="visually-hidden" tabIndex={-1} aria-label={`Choose an object for slide ${index + 1}`} onChange={(e) => { void take([...(e.target.files ?? [])], 'object'); e.target.value = ''; }} />
          </div>
          {o && (
            <div className="cr-object-ctl">
              <label className="cr-range"><span className="small">Size</span><input type="range" min={0.15} max={2.5} step={0.05} value={o.scale} aria-label={`Object size on slide ${index + 1}`} onChange={(e) => setObject({ scale: Number(e.target.value) })} /></label>
              <label className="cr-range"><span className="small">Turn</span><input type="range" min={-180} max={180} step={1} value={o.rotation} aria-label={`Object rotation on slide ${index + 1}`} onChange={(e) => setObject({ rotation: Number(e.target.value) })} /></label>
              <label className="cr-range"><span className="small">Across</span><input type="range" min={0} max={1} step={0.01} value={atX} aria-label={`Object position across on slide ${index + 1}`} onChange={(e) => moveObject({ x: Number(e.target.value) })} /></label>
              <label className="cr-range"><span className="small">Down</span><input type="range" min={0} max={1} step={0.01} value={atY} aria-label={`Object position down on slide ${index + 1}`} onChange={(e) => moveObject({ y: Number(e.target.value) })} /></label>
              <label className="cr-inline">
                <span className="field-label">Effect</span>
                <select className="plain-select cr-select" value={o.fx} onChange={(e) => setObject({ fx: e.target.value as ObjectFxChoice })}>
                  {OBJECT_FX.map((f) => (
                    <option key={f} value={f}>{{ none: 'None', contact: 'Soft shadow on the floor', drop: 'Drop shadow', glow: 'Glow' }[f]}</option>
                  ))}
                </select>
              </label>
              {o.x !== undefined || o.y !== undefined ? (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setObject({ x: undefined, y: undefined })}>Place automatically</button>
              ) : (
                <p className="small muted">Placed in the free space of the slide, off the words. Move it with Across and Down if you want it elsewhere.</p>
              )}
              {slide.notes.filter((n) => /object/i.test(n)).map((n) => (
                <p key={n} className="small cr-warn" role="status"><span aria-hidden="true">⚠ </span>{n}</p>
              ))}
            </div>
          )}
        </section>
      )}
      {problem && <p className="small cr-problem" role="alert">{problem}</p>}
    </div>
  );
}
