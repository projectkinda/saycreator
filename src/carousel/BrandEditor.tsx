// Round H part B: the brand editor. A name and one to three colours with a live preview of the current carousel (or a sample), what the colour guard adjusted, Save / Cancel / Delete.
// Plain words only. Storage and the carousel are changed by the caller (onSave / onDelete); this file only edits a draft.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BRAND_NAME_MAX, normaliseHex, type SavedBrand } from './brandStore';
import { brandPreview, mergeChanges, type BrandPreview } from './brandPreview';
import { svgToPng } from '../reference/faithful';
import type { Doc } from './doc';

const LABELS = ['Main colour', 'Second colour', 'Extra colour'];
const NOT_A_COLOUR = 'That is not a colour. Try something like #14213D.';
const HEXISH = /^#[0-9a-f]{6}$/i;

export interface BrandDraft { id?: string; name: string; colours: string[] }

export function BrandEditor({ doc, styleName, brand, others, onSave, onDelete, onClose }: {
  doc: Doc;
  styleName: string;
  /** null: a new brand. */
  brand: SavedBrand | null;
  /** The other saved brands (for the "same name" warning). */
  others: SavedBrand[];
  onSave: (b: BrandDraft) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement);
  const [name, setName] = useState(brand?.name ?? '');
  const [texts, setTexts] = useState<string[]>(brand?.colours.length ? [...brand.colours] : ['']);
  const [touched, setTouched] = useState<boolean[]>([false, false, false]);
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [prev, setPrev] = useState<BrandPreview | null>(null);
  const [pngs, setPngs] = useState<(string | null)[]>([]);

  const hexes = texts.map(normaliseHex);
  const bad = (i: number) => texts[i].trim() !== '' && !hexes[i];
  const valid = hexes.filter((h): h is string => !!h);
  const mainOk = !!hexes[0];
  const nameOk = name.trim().length > 0;
  const sameName = useMemo(() => name.trim() !== '' && others.some((b) => b.id !== brand?.id && b.name.trim().toLowerCase() === name.trim().toLowerCase()), [name, others, brand?.id]);
  const dirty = name !== (brand?.name ?? '') || JSON.stringify(valid) !== JSON.stringify(brand?.colours ?? []);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    d?.querySelector<HTMLInputElement>("[data-testid=brand-name]")?.focus();
  }, []);
  const close = () => {
    ref.current?.close();
  };
  const closed = () => {
    onClose();
    const o = opener.current as HTMLElement | null;
    if (o && typeof o.focus === 'function' && document.contains(o)) window.setTimeout(() => o.focus(), 0);
  };

  // the preview: the colours being typed, drawn by the real code, about 150 ms after the last change
  const key = JSON.stringify([mainOk ? valid : null, name, styleName]);
  useEffect(() => {
    if (!mainOk) return;
    let live = true;
    const t = window.setTimeout(async () => {
      try {
        const p = await brandPreview(doc, styleName, valid, name.trim() || 'Your brand');
        if (!live) return;
        setPrev(p);
        const urls = await Promise.all(p.svgs.map(async (s) => { try { return s ? URL.createObjectURL(await svgToPng(s, 360)) : null; } catch { return null; } }));
        if (live) setPngs((old) => { old.forEach((u) => u && URL.revokeObjectURL(u)); return urls; }); else urls.forEach((u) => u && URL.revokeObjectURL(u));
      } catch {
        if (live) setPrev(null);
      }
    }, 150);
    return () => { live = false; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setText = (i: number, v: string) => setTexts((a) => a.map((x, k) => (k === i ? v : x)));
  const touch = (i: number) => setTouched((t) => t.map((x, k) => (k === i ? true : x)));
  const normalise = (i: number) => { touch(i); const h = normaliseHex(texts[i]); if (h) setText(i, h); };
  const [focusNew, setFocusNew] = useState<number | null>(null);
  const add = () => { setFocusNew(texts.length); setTexts((a) => (a.length < 3 ? [...a, ''] : a)); };
  useEffect(() => { if (focusNew !== null) { ref.current?.querySelector<HTMLInputElement>(`[data-testid=brand-hex-${focusNew}]`)?.focus(); setFocusNew(null); } }, [focusNew, texts.length]);
  const remove = (i: number) => setTexts((a) => a.filter((_, k) => k !== i));

  const colourProblem = (i: number): string => (bad(i) && (touched[i] || tried) ? NOT_A_COLOUR : i === 0 && texts[0].trim() === '' && tried ? 'Add a main colour.' : '');
  const canSave = nameOk && mainOk && texts.every((_, i) => !bad(i));
  const save = () => {
    setTried(true);
    if (!canSave) return;
    onSave({ id: brand?.id, name: name.trim(), colours: valid });
    close();
  };

  const merged = prev ? mergeChanges(prev.changes) : [];
  const close12 = prev?.changes.find((c) => c.kind === 'close');
  const swatch = (c?: string) => (c && HEXISH.test(c) ? <span className="cr-sw" style={{ background: c }} aria-hidden="true" /> : null);

  return (
    <dialog ref={ref} className="cr-dialog cr-brand-editor" aria-label={brand ? 'Edit brand' : 'Add brand'} data-testid="brand-editor" onClose={closed} onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'color') { e.preventDefault(); save(); } }}>
      <div className="cr-sp-head">
        <h2 className="h3">{brand ? 'Edit brand' : 'Add brand'}</h2>
        <button type="button" className="btn btn-outline btn-sm cr-be-done" onClick={close} data-testid="brand-done">Done</button>
      </div>
      <div className="cr-be-body">
        <div className="cr-be-form">
          <label className="field cr-be-field">
            <span className="cr-be-label">Brand name</span>
            <input className="input" type="text" value={name} maxLength={BRAND_NAME_MAX} autoFocus onChange={(e) => setName(e.target.value)} aria-invalid={tried && !nameOk} aria-describedby="be-name-note" data-testid="brand-name" />
          </label>
          <p id="be-name-note" className="small cr-be-note" role="status">{tried && !nameOk ? 'Give your brand a name.' : sameName ? 'You already have a brand with this name. You can still save it.' : ''}</p>
          {texts.map((t, i) => {
            const problem = colourProblem(i);
            const tooClose = i === 1 && !!close12 && !problem && hexes[1];
            return (
              <div key={i} className="cr-be-colour" data-testid={`brand-colour-${i}`}>
                <label className="cr-be-label" htmlFor={`be-hex-${i}`}>{LABELS[i]}{i === 0 ? '' : ' (optional)'}</label>
                <div className="cr-be-row">
                  <input type="color" className={'cr-be-swatch' + (hexes[i] ? '' : ' swatch-empty')} data-empty={hexes[i] ? undefined : 'true'} value={hexes[i] ?? '#000000'} onChange={(e) => { setText(i, e.target.value.toLowerCase()); touch(i); }} aria-label={`${LABELS[i]}: pick a colour`} data-testid={`brand-swatch-${i}`} />
                  <input id={`be-hex-${i}`} className="input cr-be-hex" type="text" inputMode="text" autoComplete="off" spellCheck={false} placeholder="#14213D" value={t} onChange={(e) => setText(i, e.target.value)} onBlur={() => normalise(i)} aria-invalid={!!problem} aria-describedby={`be-note-${i}`} data-testid={`brand-hex-${i}`} />
                  {i > 0 && <button type="button" className="btn btn-outline btn-sm cr-be-btn" onClick={() => remove(i)} aria-label={`Remove the ${LABELS[i].toLowerCase()}`}>Remove</button>}
                </div>
                <p id={`be-note-${i}`} className="small cr-be-note" role={problem ? 'alert' : undefined}>{problem || (tooClose ? 'This is very close to your main colour.' : '')}</p>
              </div>
            );
          })}
          {texts.length < 3 && <button type="button" className="btn btn-outline cr-be-btn cr-be-add" onClick={add} data-testid="brand-add-colour">{texts.length === 1 ? 'Add second colour' : 'Add extra colour'}</button>}
        </div>
        <div className="cr-be-side">
          <h3 className="small cr-be-label">Preview</h3>
          <p className="small muted cr-be-note">{prev?.own === false ? 'A sample carousel in the current style.' : 'The first slides of your carousel in the current style.'}</p>
          <ol className="cr-be-prev" aria-label="Preview slides" data-testid="brand-preview" data-key={key}>
            {(pngs.length ? pngs : [null, null, null]).map((u, i) => (
              <li key={i}>{u ? <img src={u} alt={`Preview slide ${i + 1}`} /> : <span className="small muted">{mainOk ? 'Drawing…' : 'Add a main colour to see it.'}</span>}</li>
            ))}
          </ol>
          <h3 className="small cr-be-label">What we adjusted</h3>
          <div data-testid="brand-adjusted" aria-live="polite">
            {!mainOk ? <p className="small muted">Add a main colour to see this.</p> : prev && merged.length === 0 ? <p className="small">Your colours work as they are.</p> : (
              <>
                <ul className="cr-be-adj">
                  {merged.map((m) => (
                    <li key={m.text} data-kind={m.kind}>
                      <span className="small">{m.text}</span>
                    </li>
                  ))}
                </ul>
                {/* Round J: ONE Details fold for the whole list (closed by default): the colour codes and the ratios, line by line, for a designer */}
                {merged.some((m) => m.detail || (m.from && m.to)) && (
                  <details className="cr-be-details" data-testid="brand-details">
                    <summary className="small">Details</summary>
                    <ul className="cr-be-adj cr-be-detail-list">
                      {merged.filter((m) => m.detail || (m.from && m.to)).map((m) => (
                        <li key={m.text} data-kind={m.kind}>
                          {m.detail && <p className="small muted cr-be-detail">{m.detail}</p>}
                          {m.from && m.to && HEXISH.test(m.from) && HEXISH.test(m.to) && <span className="cr-be-pair" aria-label={`Your colour ${m.from}, what we use ${m.to}`}>{swatch(m.from)}<span aria-hidden="true">&rarr;</span>{swatch(m.to)}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {confirmDelete && (
        <div className="cr-be-confirm" role="alertdialog" aria-label="Delete this brand?">
          <p>Delete this brand? Carousels already using it keep their colours.</p>
          <p className="small muted">It is also removed from the Branding page, with its details there.</p>
          <div className="row-actions">
            <button type="button" className="btn btn-dark" onClick={() => { if (brand && onDelete) onDelete(brand.id); close(); }} data-testid="brand-delete-yes">Delete</button>
            <button type="button" className="btn btn-outline" onClick={() => setConfirmDelete(false)}>Keep it</button>
          </div>
        </div>
      )}
      <div className="row-actions cr-be-actions">
        <button type="button" className="btn btn-dark" onClick={save} data-testid="brand-save">Save</button>
        <button type="button" className="btn btn-outline" onClick={close} data-testid="brand-cancel">Cancel</button>
        {brand && onDelete && <button type="button" className="btn btn-outline cr-be-delete" onClick={() => setConfirmDelete(true)} data-testid="brand-delete">Delete</button>}
        {dirty && <span className="small muted">Press Save to keep your changes.</span>}
      </div>
    </dialog>
  );
}
