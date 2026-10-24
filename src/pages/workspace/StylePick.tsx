import { useEffect, useState } from 'react';
import * as engine from '../../engine';

/** Step 2 of a video: pick one of the suggested styles. Choosing sets the direction and starts the render. */
export function StylePick({ project, onChosen }: { project: engine.Project; onChosen: () => void }) {
  const [styles, setStyles] = useState<engine.StyleSuggestion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setFailed(false);
    engine.suggestStyles(project.id).then(setStyles).catch(() => setFailed(true));
  };
  useEffect(load, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (s: engine.StyleSuggestion) => {
    setBusy(s.id);
    engine
      .setDirection(project.id, { preset: s.preset, intensity: 60 })
      .then(onChosen)
      .catch(() => {
        setBusy(null);
        setFailed(true);
      });
  };

  return (
    <section className="card ws-card" aria-labelledby="style-h">
      <h2 id="style-h" className="h2">Choose a style</h2>
      <p className="muted small">
        We suggest these because of how you speak and how the shots change. You can change the direction later.
      </p>
      {failed && (
        <div className="notice notice-error" role="alert">
          <strong>That did not work</strong>
          <span>Nothing was changed. Try again.</span>
          <div className="notice-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={load}>Try again</button>
          </div>
        </div>
      )}
      {!styles && !failed && <p className="muted" role="status">Finding styles that fit your video…</p>}
      {styles && (
        <ul className="grid grid-three">
          {styles.map((s) => (
            <li key={s.id} className="card style-card">
              <h3 className="card-title">{s.name}</h3>
              <p className="small muted">{s.description}</p>
              <div>
                <button type="button" className="btn btn-dark btn-sm" disabled={!!busy} onClick={() => choose(s)}>
                  {busy === s.id ? 'Starting…' : 'Use this style'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
