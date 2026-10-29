// "Match a reference", inside the thumbnail and carousel screens. The reference flow itself is the one page that was Images > Styles > New style from references,
// mounted here in its embedded form; this adds the panel frame and the "Reference" chip that stays on the screen while a reference is active.
import { lazy, Suspense, useEffect, useState } from 'react';
import { ACTIVE_STYLE, clearActiveReference, setShowDetected, useActiveReference } from './active';
import { LEARN_LABEL, type Target } from './types';

const ReferenceStylePage = lazy(() => import('./ReferenceStylePage'));

export interface MatchPhoto {
  url: string;
  width: number;
  height: number;
  name: string;
}

export function MatchPanel({ target, title, photo, current, onUse, onRemove }: { target: Target; title?: string; photo?: MatchPhoto | null; current: string; onUse: () => void; onRemove: () => void }) {
  const { active, showDetected } = useActiveReference();
  const [opened, setOpened] = useState(false);
  // A new reference style (the draft, then the reader's answer) is used by the screen at once.
  useEffect(() => {
    if (active && current !== ACTIVE_STYLE) onUse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.spec, current]);
  return (
    <div className="rf-match">
      {active && (
        <div className="rf-chip-bar" role="group" aria-label="Reference">
          {active.thumb && <img src={active.thumb} alt="Your reference" width={44} />}
          <span className="small">Reference · learning from: {LEARN_LABEL[active.learn]}</span>
          {active.ratioNote && <span className="small muted">{active.ratioNote}</span>}
          <button type="button" className="btn btn-outline btn-sm" aria-pressed={showDetected} onClick={() => setShowDetected(!showDetected)}>Show what I detected</button>
          <button type="button" className="btn btn-outline btn-sm" aria-label="Remove the reference" onClick={() => { clearActiveReference(true); onRemove(); }}>✕</button>
        </div>
      )}
      <details className="tn-more" open={opened || !!active} onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && setOpened(true)}>
        <summary className="small">Match a reference</summary>
        <p className="small muted">Drop, pick or paste (Ctrl+V) 1 to 10 images of a look you like. Your own text and photo appear in that look at once; one reader call then refines it.</p>
        {(opened || !!active) && (
          <Suspense fallback={<p className="small muted" role="status">Loading…</p>}>
            <ReferenceStylePage embedded target={target} title={title} photo={photo ?? undefined} />
          </Suspense>
        )}
      </details>
    </div>
  );
}
