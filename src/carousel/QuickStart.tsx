// The one door for a new style: the "New style" card in the style list opens this box inline, right under the list. Two tabs: from a reference (drop images, a deck or a PDF where each
// PDF page becomes a slide, then "Read it") and from a description. Reading a reference saves a Mine style, selects it, and closes the box. The full reference reader sits in Advanced; this only drives it.
import { useRef, useState, type ReactNode } from 'react';
import type { ReaderControl, ReaderState } from '../reference/ReferenceStylePage';

export function NewStyleBox({ open, onClose, control, state, saved, description }: { open: boolean; onClose: () => void; control: { current: ReaderControl | null }; state: ReaderState | null; saved: string; description: ReactNode }) {
  const [tab, setTab] = useState<'reference' | 'description'>('reference');
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const count = state?.count ?? 0;
  // The reader loads a moment after the page (and again after Reset page): files dropped before it is there wait for it.
  const add = (files: File[]) =>
    void (async () => {
      for (let i = 0; i < 150 && !control.current; i++) await new Promise((r) => setTimeout(r, 100));
      await control.current?.addFiles(files);
    })();
  return (
    <div className="cr-refbox" data-testid="quick-start">
      {open && (
        <section className="card ws-card ns-flow" role="group" aria-label="New style" data-testid="new-style">
          <div className="row-actions">
            <h3 className="h4">New style</h3>
            <button type="button" className="btn btn-outline btn-sm cr-quiet" onClick={onClose}>Close</button>
          </div>
          <div role="group" aria-label="How to make the style" className="chip-group">
            <button type="button" className="chip-btn" aria-pressed={tab === 'reference'} disabled={!!state?.busy} onClick={() => setTab('reference')}>From a reference</button>
            <button type="button" className="chip-btn" aria-pressed={tab === 'description'} disabled={!!state?.busy} onClick={() => setTab('description')}>From a description</button>
          </div>
          {tab === 'reference' ? (
            <div className="create-form">
              <div
                className={`cr-drop rf-drop${over ? ' over' : ''}`}
                data-testid="quick-drop"
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); add([...e.dataTransfer.files]); }}
              >
                <p className="small muted">Drop images, a deck (several images) or a PDF: each PDF page becomes a slide. Up to 10 pictures. They stay on this device.</p>
                <div className="cr-photo-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>Add a reference</button>
                  <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="visually-hidden" tabIndex={-1} aria-label="Choose reference images or a PDF" onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ''; }} />
                  <span className="small muted" data-testid="quick-count">{count} picture{count === 1 ? '' : 's'} added</span>
                </div>
              </div>
              {state?.notice && <p className="small" role="status">{state.notice}</p>}
              <div className="cr-photo-actions">
                <button type="button" className="btn btn-dark" disabled={!state?.canRead} onClick={() => void control.current?.readAndSave()}>{state?.busy ? 'Reading…' : 'Read it'}</button>
                {state?.busy && <button type="button" className="btn btn-outline btn-sm" onClick={() => control.current?.cancel()}>Cancel</button>}
              </div>
              {state?.noReader && <p className="small cr-warn" role="status">No reader is connected, so a reference cannot be read here. You can still generate with a built-in style.</p>}
              {!state?.canRead && !state?.busy && !state?.noReader && <p className="small muted">Add a reference first.</p>}
              {state?.phase && <p className="small" role="status" aria-live="polite">{state.phase}</p>}
              {state?.problem && <p className="small cr-problem" role="alert" style={{ whiteSpace: 'pre-line' }}>{state.problem}</p>}
            </div>
          ) : (
            description
          )}
        </section>
      )}
      {saved && <p className="small" role="status" data-testid="quick-saved">Saved “{saved}” as a Mine style and selected it. It is in the list above.</p>}
    </div>
  );
}
