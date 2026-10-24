import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Tabs, tabPanelProps } from '../components/Tabs';
import * as engine from '../engine';
import { useDocumentTitle } from '../useDocumentTitle';
import { EditTab } from './workspace/EditTab';
import { MakeMore } from './workspace/MakeMore';
import { RenderPanel } from './workspace/RenderPanel';
import { StylePick } from './workspace/StylePick';

const TABS = [
  { id: 'edit', label: 'Edit' },
  { id: 'more', label: 'Make more from this video' },
];

function statusChip(p: engine.Project) {
  switch (p.status) {
    case 'listening':
      return <span className="chip">Analysing</span>;
    case 'choose-style':
      return <span className="chip">Choose a style</span>;
    case 'rendering':
      return <span className="chip">Rendering</span>;
    case 'render-failed':
      return <span className="chip chip-error">Render needs a retry</span>;
    case 'ready':
      return <span className="chip chip-ok">Ready to post</span>;
    default:
      return <span className="chip chip-ok">Edit rendered</span>;
  }
}

export default function Workspace() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'more' ? 'more' : 'edit';

  const [project, setProject] = useState<engine.Project | null>(null);
  const [error, setError] = useState<'missing' | 'failed' | null>(null);
  const [render, setRender] = useState<{ progress: number; error?: string } | null>(null);
  const [note, setNote] = useState('');

  useDocumentTitle(project?.title ?? 'Video');

  const reload = useCallback(() => {
    setError(null);
    return engine
      .getProject(id)
      .then(setProject)
      .catch((e: engine.EngineError) => setError(e.code === 'NOT_FOUND' ? 'missing' : 'failed'));
  }, [id]);

  useEffect(() => {
    setProject(null);
    setRender(null);
    reload();
  }, [reload]);

  // Footage still being listened to: ask the engine to finish analysing, once.
  const analysing = useRef<string | null>(null);
  useEffect(() => {
    if (project?.status !== 'listening' || analysing.current === project.id) return;
    analysing.current = project.id;
    engine.analyse(project.id).then(reload).catch(() => setError('failed'));
  }, [project, reload]);

  // Render running somewhere else (left the page and came back): poll until it settles.
  const polling = project?.status === 'rendering' && !render;
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(reload, 1000);
    return () => clearInterval(t);
  }, [polling, reload]);

  const runRender = () => {
    setRender({ progress: 0 });
    setProject((p) => (p ? { ...p, status: 'rendering' } : p));
    engine
      .startRender(id, (job) => setRender({ progress: job.progress, error: job.error }))
      .then((job) => {
        if (job.status === 'done') setRender(null);
        return reload();
      })
      .catch(() => {
        setRender({ progress: 0, error: 'Something went wrong. Your footage is safe, try again.' });
        reload();
      });
  };

  if (error === 'missing')
    return (
      <div className="page page-tight">
        <h1 className="page-title">We can't find this video</h1>
        <p className="lead">It may have been removed.</p>
        <div>
          <Link to="/videos" className="btn btn-outline btn-lg">Back to Videos</Link>
        </div>
      </div>
    );
  if (error === 'failed' && !project)
    return (
      <div className="page page-tight">
        <div className="card empty" role="alert">
          <strong>We could not load this video.</strong>
          <span className="muted">Your video is safe. Check your connection and try again.</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={reload}>Try again</button>
        </div>
      </div>
    );
  if (!project)
    return (
      <div className="page page-tight">
        <p className="muted" role="status">Loading your video…</p>
      </div>
    );

  const rendered = project.step >= 4;
  const lowRes = !!project.resolution && Math.min(project.resolution.width, project.resolution.height) < 1080;

  return (
    <div className="page page-tight">
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link to="/videos">Videos</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{project.title}</span>
      </nav>

      <header className="page-header ws-head">
        <h1 className="ws-title">{project.title}</h1>
        {statusChip(project)}
        <div className="grow" />
        <button
          type="button"
          className="btn btn-outline btn-lg"
          disabled={!rendered}
          onClick={() => setNote('Sharing for review is not connected yet. The engine will provide the link.')}
        >
          Share for review
        </button>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!rendered}
          onClick={() => setNote('Export is not connected yet. The engine will provide the file.')}
        >
          Export
        </button>
      </header>
      {note && (
        <div className="notice notice-warn" role="status">
          <span>{note}</span>
        </div>
      )}

      {lowRes && project.resolution && (
        <div className="notice notice-warn" role="status">
          <strong>Low resolution</strong>
          <span>
            This video is {project.resolution.width} × {project.resolution.height}. Zooms can look soft, so we keep them small.
          </span>
        </div>
      )}

      {project.status === 'listening' && (
        <section className="card empty" role="status">
          <strong>Listening to your video…</strong>
          <span className="muted">
            We find what you say and where the shots change first. Long videos take a few minutes. You can leave this page; it keeps going.
          </span>
        </section>
      )}

      {project.status === 'choose-style' && <StylePick project={project} onChosen={runRender} />}

      {(project.status === 'rendering' || project.status === 'render-failed') && (
        <RenderPanel
          failed={project.status === 'render-failed'}
          progress={render?.progress ?? project.renderProgress ?? 0}
          error={render?.error}
          onRetry={runRender}
        />
      )}

      {rendered && (
        <>
          <Tabs
            label="Video workspace"
            idPrefix="ws"
            tabs={TABS}
            value={tab}
            onChange={(t) => setParams(t === 'edit' ? {} : { tab: t }, { replace: true })}
          />
          {tab === 'edit' ? (
            <div {...tabPanelProps('ws', 'edit')}>
              <EditTab project={project} />
            </div>
          ) : (
            <div {...tabPanelProps('ws', 'more')}>
              <MakeMore project={project} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
