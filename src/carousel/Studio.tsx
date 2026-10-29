// The layout of "Make a carousel": a sticky preview (the selected slide large, a filmstrip under it) and the controls in four groups of which one is open at a time.
// Looks and layout only: every control inside keeps what it did. "Open all" keeps every group open at once (remembered in this browser).
import { useState, type ReactNode } from 'react';
import '../styles/studio.css';

export type GroupId = 'content' | 'style' | 'reference' | 'edit';
const KEY = 'creator.groups';

export function useGroups(initial: GroupId = 'content') {
  const [all, setAllState] = useState(() => {
    try {
      return localStorage.getItem(KEY) === 'all';
    } catch {
      return false;
    }
  });
  const [one, setOne] = useState<GroupId>(initial);
  const setAll = (b: boolean) => {
    setAllState(b);
    try {
      localStorage.setItem(KEY, b ? 'all' : 'one');
    } catch {
      /* not remembered */
    }
  };
  return { all, setAll, one, show: setOne, isOpen: (id: GroupId) => all || one === id };
}
export type Groups = ReturnType<typeof useGroups>;

export function Group({ id, title, hint, g, children }: { id: GroupId; title: string; hint: string; g: Groups; children: ReactNode }) {
  const open = g.isOpen(id);
  return (
    <section className="cr-group" data-open={open}>
      <div className="cr-group-bar">
        <h2 className="cr-group-h h4">
          <button type="button" className="cr-group-btn" aria-expanded={open} aria-controls={`cr-g-${id}`} onClick={() => g.show(id)}>
            {title}
          </button>
        </h2>
        <span className="cr-group-hint small muted">{hint}</span>
      </div>
      <div id={`cr-g-${id}`} className="cr-group-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/** The selected slide large, and the filmstrip. Display only: the slide cards keep every edit. */
export function PreviewStage({ items, selected, onSelect, onOpen, count }: { items: { url?: string; status: string }[]; selected: number; onSelect: (i: number) => void; onOpen: (i: number) => void; count: number }) {
  if (count === 0)
    return (
      <div className="cr-stage-empty">
        <strong>Your slides appear here</strong>
        <span className="small muted">Paste your text in Content and press Generate.</span>
      </div>
    );
  const i = Math.min(selected, count - 1);
  const cur = items[i];
  return (
    <div className="cr-stage">
      <button type="button" className="cr-stage-pic" onClick={() => onOpen(i)} disabled={!cur?.url} aria-label="Open the selected slide full size">
        {cur?.url ? <img src={cur.url} alt="Preview" /> : <span className="small muted">{cur?.status === 'error' ? 'Could not draw this slide' : 'Drawing…'}</span>}
      </button>
      <p className="small muted cr-stage-n">{i + 1} / {count}</p>
      <ol className="cr-film" aria-label="Filmstrip">
        {Array.from({ length: count }, (_, k) => (
          <li key={k}>
            <button type="button" className="cr-film-btn" aria-pressed={k === i} aria-label={`Show slide ${k + 1}`} onClick={() => onSelect(k)}>
              {items[k]?.url ? <img src={items[k].url} alt={`Thumbnail ${k + 1}`} /> : <span className="small muted">{k + 1}</span>}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
