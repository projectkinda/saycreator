// Background picker and "More looks" for a thumbnail with a cutout. Instant, no model; a saved look is style only (colours and treatments, never a photo).
import { useEffect, useRef, useState } from 'react';
import { FocalPicker } from '../carousel/PhotoControls';
import { urlOf } from '../carousel/photoLibrary';
import { BACKDROP_KINDS, PATTERNS, makeVariants, type BackdropKind, type VariantSpec } from '../image-engine/thumbnail/v2/backdrop';
import { thumbRenderer } from './render';
import { composeVariant, variantInputs } from './render';
import { thumbPatches, type DocBackdrop, type ThumbDoc } from './doc';

type Apply = (p: ReturnType<typeof thumbPatches.backdrop>) => void;
const KIND_LABEL: Record<BackdropKind, string> = { blur: 'Blurred copy of the photo', photo: 'Another photo', colour: 'Solid colour', gradient: 'Gradient', pattern: 'Pattern', block: 'Colour block behind the subject' };
const TREATS = [['blur', 'Blur'], ['darken', 'Darken'], ['duotone', 'Duotone'], ['vignette', 'Vignette'], ['grain', 'Grain']] as const;
const hex = (c: string | undefined, dflt: string) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : dflt);

interface Look {
  v: VariantSpec;
  url?: string;
  error?: string;
}

export function BackdropPanel({ doc, apply, addPhoto, onSaveLook }: { doc: ThumbDoc; apply: Apply; addPhoto: (f: File) => void; onSaveLook: (v: VariantSpec, previewUrl: string) => Promise<string> }) {
  const bd: DocBackdrop = doc.backdrop ?? { kind: 'blur' };
  const set = (patch: Partial<DocBackdrop>, label: string) => apply(thumbPatches.backdrop({ ...bd, ...patch }, label));
  const fileRef = useRef<HTMLInputElement>(null);
  const [looks, setLooks] = useState<Look[]>([]);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const round = useRef(0);
  const photoUrl = bd.photoId ? urlOf(bd.photoId) : null;

  const moreLooks = () => {
    const { palettes, hasBackPhoto } = variantInputs(doc);
    const made = makeVariants({ palettes, hasBackPhoto, count: 12, seed: 7 + 13 * round.current++ });
    setLooks(made.map((v) => ({ v })));
    setNote('');
  };
  // Draw the looks one after the other.
  useEffect(() => {
    let live = true;
    (async () => {
      for (let i = 0; i < looks.length; i++) {
        if (looks[i].url || looks[i].error) continue;
        try {
          const c = await composeVariant(doc, looks[i].v);
          const drawn = c ? await thumbRenderer.render(c.option, c.pictures) : null;
          if (!live) return;
          setLooks((cur) => cur.map((x, k) => (k === i ? (drawn ? { ...x, url: drawn.url } : { ...x, error: 'Could not draw this one' }) : x)));
        } catch (e) {
          if (!live) return;
          setLooks((cur) => cur.map((x, k) => (k === i ? { ...x, error: (e as Error).message } : x)));
        }
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looks.length, looks.map((l) => l.v.id + (l.url ? '1' : '0')).join()]);

  return (
    <section className="tn-backdrop" aria-label="Background behind the cutout">
      <h3 className="h4">Background behind the subject</h3>
      <div className="row-actions">
        <label className="cr-inline small">
          <span className="field-label">Background</span>
          <select className="plain-select cr-select" aria-label="Background kind" value={bd.kind} onChange={(e) => set({ kind: e.target.value as BackdropKind }, 'Change the background')}>
            {BACKDROP_KINDS.map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>
        </label>
        {(bd.kind === 'colour' || bd.kind === 'block' || bd.kind === 'pattern' || bd.kind === 'gradient') && (
          <label className="cr-inline small"><span className="field-label">{bd.kind === 'pattern' ? 'Ground' : 'Colour'}</span><input type="color" aria-label="Background colour" value={hex(bd.colour, '#2255cc')} onChange={(e) => set({ colour: e.target.value }, 'Change the background colour')} /></label>
        )}
        {bd.kind === 'gradient' && (
          <>
            <label className="cr-inline small"><span className="field-label">Second colour</span><input type="color" aria-label="Background second colour" value={hex(bd.to, '#111111')} onChange={(e) => set({ to: e.target.value }, 'Change the second colour')} /></label>
            <label className="cr-inline small"><span className="field-label">Angle: {bd.angle ?? 160}</span><input type="range" min={0} max={360} aria-label="Background gradient angle" value={bd.angle ?? 160} onChange={(e) => set({ angle: Number(e.target.value) }, 'Change the gradient angle')} /></label>
          </>
        )}
        {bd.kind === 'pattern' && (
          <>
            <label className="cr-inline small">
              <span className="field-label">Pattern</span>
              <select className="plain-select cr-select" aria-label="Background pattern" value={bd.pattern ?? 'halftone'} onChange={(e) => set({ pattern: e.target.value as DocBackdrop['pattern'] }, 'Change the pattern')}>
                {PATTERNS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="cr-inline small"><span className="field-label">Pattern colour</span><input type="color" aria-label="Pattern colour" value={hex(bd.ink, '#ffffff')} onChange={(e) => set({ ink: e.target.value }, 'Change the pattern colour')} /></label>
          </>
        )}
        {bd.kind === 'photo' && (
          <>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>{bd.photoId ? 'Replace background photo' : 'Add a background photo'}</button>
            <input ref={fileRef} type="file" accept="image/*,.heic,.heif" className="visually-hidden" tabIndex={-1} aria-label="Choose a background photo" onChange={(e) => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = ''; }} />
          </>
        )}
      </div>
      {bd.kind === 'photo' && photoUrl && <FocalPicker url={photoUrl} focal={bd.focal ?? { x: 0.5, y: 0.5 }} label="Crop point of the background photo. Drag it, or use the arrow keys." onMove={(f) => set({ focal: f }, 'Move the background photo')} />}
      {(bd.kind === 'blur' || bd.kind === 'photo') && (
        <div className="row-actions" role="group" aria-label="Background treatments">
          {TREATS.map(([k, l]) => (
            <label key={k} className="small rf-toggle"><input type="checkbox" checked={!!bd.treat?.[k]} onChange={(e) => set({ treat: { ...(bd.treat ?? {}), [k]: e.target.checked } }, `${e.target.checked ? 'Add' : 'Remove'} ${l.toLowerCase()} on the background`)} /> {l}</label>
          ))}
        </div>
      )}
      <label className="small rf-toggle"><input type="checkbox" checked={!!bd.match} onChange={(e) => set({ match: e.target.checked }, e.target.checked ? 'Match the subject to the background' : 'Stop matching the subject')} /> Match the subject to the background (the glow takes the background’s colour)</label>
      {doc.backdrop && <button type="button" className="btn btn-outline btn-sm" onClick={() => apply(thumbPatches.backdrop(undefined, 'Use the style’s own background'))}>Use the style’s own background</button>}
      <p className="small muted">The title sits on a plate on plain colours, gradients, patterns and undarkened photos, so it stays readable.</p>

      <div className="row-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={moreLooks}>{looks.length ? 'More looks (new set)' : 'More looks'}</button>
        {note && <span className="small" role="status">{note}</span>}
      </div>
      {looks.length > 0 && (
        <ol className="tn-grid" aria-label={`${looks.length} more looks`}>
          {looks.map((l, i) => (
            <li key={l.v.id} className="card tn-card" aria-label={`Look ${i + 1}`} data-status={l.url ? 'ready' : l.error ? 'error' : 'drawing'} data-backdrop={l.v.backdrop.kind}>
              <div className="tn-pic" style={{ aspectRatio: doc.aspect.replace(':', ' / ') }}>
                {l.url ? <img src={l.url} alt={`Look ${i + 1}: ${l.v.backdrop.kind} background`} /> : <span className="small muted" role="status">{l.error ?? 'Drawing…'}</span>}
              </div>
              <div className="row-actions">
                <button type="button" className="btn btn-outline btn-sm" aria-pressed={starred.has(l.v.id)} aria-label={`Star look ${i + 1}`} onClick={() => setStarred((s) => { const n = new Set(s); if (!n.delete(l.v.id)) n.add(l.v.id); return n; })}>{starred.has(l.v.id) ? '★ Starred' : '☆ Star'}</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={!l.url} aria-label={`Use look ${i + 1}`} onClick={() => apply(thumbPatches.useLook(l.v, bd.photoId, doc.objectLook))}>Use this look</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={!l.url} aria-label={`Save look ${i + 1} as a template`} onClick={() => l.url && void onSaveLook(l.v, l.url).then(setNote)}>Save as template</button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
