import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../AppContext';
import { UploadProgress } from '../components/UploadProgress';
import * as engine from '../engine';
import { grad } from '../format';

type Filter = 'all' | 'suggested' | 'mine' | 'reference';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'suggested', label: 'Suggested' },
  { id: 'mine', label: 'My styles' },
  { id: 'reference', label: 'From references' },
];

export function VideoStyles() {
  const { brand } = useApp();
  const brandId = brand?.id;
  const [styles, setStyles] = useState<engine.VideoStyle[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(() => {
    if (!brandId) return;
    setFailed(false);
    engine.listStyles(brandId).then(setStyles).catch(() => setFailed(true));
  }, [brandId]);
  useEffect(() => {
    load();
  }, [load]);

  const shown = (styles ?? []).filter((s) =>
    filter === 'suggested' ? s.origin === 'suggested' : filter === 'mine' ? s.origin === 'mine' : filter === 'reference' ? s.fromReference : true,
  );

  return (
    <>
      <div className="styles-bar">
        <div role="group" aria-label="Filter styles" className="chip-group">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="chip-btn"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {brandId && (
          <UploadProgress
            label="Upload a reference video"
            buttonClass="btn btn-outline btn-sm"
            run={async (file, onProgress) => {
              await engine.createStyleFromReference(brandId, file, onProgress);
              load();
            }}
          />
        )}
      </div>
      <p className="muted small styles-intro">
        A style is how a video is cut: pace, zooms, captions, music. Upload a video you like and we'll build a style from
        it. Your styles are private to you.
      </p>

      {failed && (
        <div className="card empty" role="alert">
          <strong>We could not load your styles.</strong>
          <button type="button" className="btn btn-outline btn-sm" onClick={load}>Try again</button>
        </div>
      )}
      {!styles && !failed && <p className="muted" role="status">Loading styles…</p>}

      {styles && shown.length === 0 && (
        <div className="card empty">
          <strong>{filter === 'all' ? 'No styles yet' : 'Nothing here yet'}</strong>
          <span className="muted">
            {filter === 'reference' || filter === 'mine'
              ? 'Upload a video you like with "Upload a reference video" and we will build a style from it.'
              : 'Add a video and we will suggest styles that fit it.'}
          </span>
        </div>
      )}

      {shown.length > 0 && (
        <ul className="grid grid-three">
          {shown.map((s) => (
            <li key={s.id} className="card style-card">
              <div className="style-thumb" style={grad(s.poster)} role="img" aria-label={`Preview of ${s.name}`} />
              <div className="style-title-row">
                <h3 className="card-title">{s.name}</h3>
                <span className="chip">{s.origin === 'suggested' ? 'Suggested' : 'Mine'}</span>
              </div>
              <p className="small muted">{s.description}</p>
              <div>
                <Link to={`/videos/new?style=${s.id}`} className="btn btn-dark btn-sm">Use</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
