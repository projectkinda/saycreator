import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import { Icon } from '../components/Icon';
import { Tabs, tabPanelProps } from '../components/Tabs';
import * as engine from '../engine';
import { fmtTime, grad, isLandscape } from '../format';
import { useDocumentTitle } from '../useDocumentTitle';
import { VideoStyles } from './VideoStyles';

type StatusFilter = 'all' | 'needs-you' | 'in-progress' | 'ready';
type Sort = 'edited' | 'title' | 'length';

const NEEDS_YOU: engine.ProjectStatus[] = ['choose-style', 'thumbnail', 'render-failed'];

function whereItIs(p: engine.Project) {
  switch (p.status) {
    case 'ready':
      return <span className="chip chip-ok">Ready to post</span>;
    case 'render-failed':
      return <span className="chip chip-error">Render needs a retry</span>;
    case 'listening':
      return <span className="chip">Analysing</span>;
    case 'rendering':
      return <span className="chip">Rendering</span>;
    default:
      return (
        <span className="chip">
          Step {p.step} · {p.stepLabel}
        </span>
      );
  }
}

function madeFrom(p: engine.Project) {
  const { videos, thumbnails, posts } = p.madeFrom;
  const bits = [
    videos && `${videos} video${videos === 1 ? '' : 's'}`,
    thumbnails && `${thumbnails} thumbnail${thumbnails === 1 ? '' : 's'}`,
    posts && `${posts} post${posts === 1 ? '' : 's'}`,
  ].filter(Boolean) as string[];
  if (bits.length) {
    return (
      <div className="mini-chips">
        {bits.map((b) => (
          <span key={b} className="mini">{b}</span>
        ))}
      </div>
    );
  }
  return (
    <span className="small muted">
      {p.status === 'listening' ? 'Clips appear when it is ready' : 'Nothing yet'}
    </span>
  );
}

const TABS = [
  { id: 'all', label: 'All videos' },
  { id: 'styles', label: 'Styles' },
];

export default function Videos() {
  useDocumentTitle('Videos');
  const { brand } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'styles' ? 'styles' : 'all';

  const [videos, setVideos] = useState<engine.Project[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<Sort>('edited');

  const brandId = brand?.id;
  const load = useCallback(() => {
    if (!brandId) return;
    setFailed(false);
    engine.listProjects(brandId).then(setVideos).catch(() => setFailed(true));
  }, [brandId]);
  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    if (!videos) return [];
    const q = query.trim().toLowerCase();
    const list = videos.filter((p) => {
      if (q && !p.title.toLowerCase().includes(q)) return false;
      if (status === 'needs-you') return NEEDS_YOU.includes(p.status);
      if (status === 'in-progress') return p.status === 'listening' || p.status === 'rendering';
      if (status === 'ready') return p.status === 'ready';
      return true;
    });
    // The list from the engine is already newest first, so "edited" keeps that order.
    if (sort === 'title') return [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'length') return [...list].sort((a, b) => b.durationSec - a.durationSec);
    return list;
  }, [videos, query, status, sort]);

  const filtering = query.trim() !== '' || status !== 'all';

  return (
    <div className="page page-tight">
      <header className="page-header">
        <h1 className="page-title page-header-text">Videos</h1>
        <Link to="/videos/new" className="btn btn-primary btn-lg">
          <Icon name="plus" size={18} strokeWidth={2.2} />
          New project
        </Link>
      </header>

      <Tabs
        label="Videos sections"
        idPrefix="videos"
        tabs={TABS}
        value={tab}
        onChange={(id) => setParams(id === 'all' ? {} : { tab: id }, { replace: true })}
      />

      {tab === 'all' ? (
        <div {...tabPanelProps('videos', 'all')} className="panel">
          <div className="filters">
            <label className="search-field">
              <Icon name="search" size={16} strokeWidth={2} />
              <span className="visually-hidden">Search videos</span>
              <input type="search" placeholder="Search videos" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label className="select-pill">
              <span>Status:</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                <option value="all">All</option>
                <option value="needs-you">Needs you</option>
                <option value="in-progress">In progress</option>
                <option value="ready">Ready to post</option>
              </select>
            </label>
            <label className="select-pill">
              <span>Sort:</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="edited">Last edited</option>
                <option value="title">Title</option>
                <option value="length">Length</option>
              </select>
            </label>
          </div>

          {failed && (
            <div className="card empty" role="alert">
              <strong>We could not load your videos.</strong>
              <span className="muted">Your videos are safe. Check your connection and try again.</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={load}>Try again</button>
            </div>
          )}
          {!videos && !failed && <p className="muted" role="status">Loading your videos…</p>}

          {videos && videos.length === 0 && (
            <div className="card empty">
              <strong>No videos yet</strong>
              <span className="muted">
                Upload a video you shot or record one. We listen to it first, then it shows up here with how far along it is.
              </span>
              <Link to="/videos/new" className="btn btn-primary btn-sm">Add your first video</Link>
            </div>
          )}

          {videos && videos.length > 0 && shown.length === 0 && (
            <div className="card empty" role="status">
              <strong>No videos match</strong>
              <span className="muted">Try a different word, or clear the filters.</span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setQuery('');
                  setStatus('all');
                }}
              >
                Clear filters
              </button>
            </div>
          )}

          {shown.length > 0 && (
            <div className="card table-card">
              <table className="vtable">
                <caption className="visually-hidden">
                  Your videos{filtering ? ', filtered' : ''}: {shown.length} shown
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Video</th>
                    <th scope="col">Length</th>
                    <th scope="col">Where it is</th>
                    <th scope="col">Made from this video</th>
                    <th scope="col">Edited</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id}>
                      <td><div className="c-video">
                        <div className={`vt-thumb ${isLandscape(p) ? 'land' : 'port'}`} style={grad(p.poster)} aria-hidden="true" />
                        <Link to={`/videos/${p.id}`} className="vt-link">{p.title}</Link>
                      </div></td>
                      <td className="c-length" data-label="Length">{p.durationSec ? fmtTime(p.durationSec) : '–'}</td>
                      <td data-label="Where it is">{whereItIs(p)}</td>
                      <td data-label="Made from this video">{madeFrom(p)}</td>
                      <td className="c-edited small muted" data-label="Edited">{p.updatedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div {...tabPanelProps('videos', 'styles')} className="panel">
          <VideoStyles />
        </div>
      )}
    </div>
  );
}
