import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import { Icon } from '../components/Icon';
import { Tabs, tabPanelProps } from '../components/Tabs';
import { UploadProgress } from '../components/UploadProgress';
import * as engine from '../engine';
import { grad } from '../format';
import { mockCarousel } from '../carousel/flags';
import { useDocumentTitle } from '../useDocumentTitle';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'thumbnail', label: 'Thumbnails' },
  { id: 'carousel', label: 'Carousels' },
  { id: 'quote', label: 'Quote cards' },
];
const TAB_NOUN: Record<string, string> = { thumbnail: 'thumbnails', carousel: 'carousels', quote: 'quote cards' };

type Start = 'upload' | 'template' | 'frame' | 'ai';
const STARTS: { id: Start; title: string; text: string }[] = [
  { id: 'upload', title: 'Upload an image', text: 'Add text, crop, cut out a subject.' },
  { id: 'template', title: 'Start from a template', text: 'Thumbnail, carousel or quote card in your brand.' },
  { id: 'frame', title: 'Use a video frame', text: 'Pick a moment from any of your videos.' },
  { id: 'ai', title: 'Generate with AI', text: `Costs ${engine.AI_IMAGE_CREDITS} credits. Text is added separately, so it stays sharp.` },
];

type Sort = 'newest' | 'oldest' | 'title';
const ALL_SOURCES = 'all';
const OWN = 'own';

function CreatePanel({
  brandId,
  videos,
  onCreated,
}: {
  brandId: string;
  videos: engine.Project[];
  onCreated: (item: engine.ImageItem) => void;
}) {
  const [start, setStart] = useState<Start | null>(null);
  const [kind, setKind] = useState<'thumbnail' | 'carousel' | 'quote'>('thumbnail');
  const [videoId, setVideoId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async (input: engine.ImageStart) => {
    setBusy(true);
    setError('');
    try {
      onCreated(await engine.createImage(brandId, input));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="create-panel" className="card ws-card" aria-labelledby="create-h">
      <h2 id="create-h" className="h3">Create an image</h2>
      <p className="small muted">Pick a starting point.</p>
      <ul className="grid start-grid">
        {STARTS.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className="card start-opt"
              aria-pressed={start === s.id}
              onClick={() => {
                setStart(s.id);
                setError('');
              }}
            >
              <strong>{s.title}</strong>
              <span className="small muted">{s.text}</span>
            </button>
          </li>
        ))}
      </ul>

      {start === 'upload' && (
        <UploadProgress
          label="Choose an image"
          accept="image/*"
          buttonClass="btn btn-dark btn-lg"
          hint="PNG, JPG or WebP."
          run={async (file, onProgress) => {
            onCreated(await engine.uploadImage(brandId, file, onProgress));
          }}
        />
      )}

      {start === 'template' && (
        <fieldset className="create-form">
          <legend className="field-label">What do you want to make?</legend>
          <div className="chip-group">
            {(['thumbnail', 'carousel', 'quote'] as const).map((k) => (
              <button key={k} type="button" className="chip-btn" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {k === 'thumbnail' ? 'Thumbnail' : k === 'carousel' ? 'Carousel' : 'Quote card'}
              </button>
            ))}
          </div>
          <div>
            <button type="button" className="btn btn-dark btn-lg" disabled={busy} onClick={() => create({ start: 'template', kind })}>
              {busy ? 'Creating…' : 'Create draft'}
            </button>
          </div>
        </fieldset>
      )}

      {start === 'frame' && (
        <div className="create-form">
          {videos.length === 0 ? (
            <p className="small muted">You have no videos yet. Add one and you can pick a frame from it.</p>
          ) : (
            <>
              <label className="field">
                <span className="field-label">Which video?</span>
                <select className="plain-select" value={videoId} onChange={(e) => setVideoId(e.target.value)}>
                  <option value="">Choose a video</option>
                  {videos.map((v) => (
                    <option key={v.id} value={v.id}>{v.title}</option>
                  ))}
                </select>
              </label>
              <div>
                <button type="button" className="btn btn-dark btn-lg" disabled={busy || !videoId} onClick={() => create({ start: 'frame', projectId: videoId })}>
                  {busy ? 'Creating…' : 'Use a frame from this video'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {start === 'ai' && (
        <div className="create-form">
          <label className="field">
            <span className="field-label">Describe the image</span>
            <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="For example: a calm desk with a laptop, soft morning light" />
          </label>
          <div className="row-actions">
            <button type="button" className="btn btn-dark btn-lg" disabled={busy || !prompt.trim()} onClick={() => create({ start: 'ai', prompt })}>
              {busy ? 'Generating…' : `Generate (${engine.AI_IMAGE_CREDITS} credits)`}
            </button>
            <span className="small muted">You are only charged if an image is made.</span>
          </div>
        </div>
      )}

      {error && (
        <div className="notice notice-error" role="alert">
          <strong>Could not make it</strong>
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}

export default function Images() {
  useDocumentTitle('Images');
  const { brand } = useApp();
  const brandId = brand?.id;
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('type') ?? 'all';
  const tab = TABS.some((t) => t.id === tabParam) ? tabParam : 'all';

  const [images, setImages] = useState<engine.ImageItem[] | null>(null);
  const [videos, setVideos] = useState<engine.Project[]>([]);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [added, setAdded] = useState('');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState(ALL_SOURCES);
  const [sort, setSort] = useState<Sort>('newest');

  const load = useCallback(() => {
    if (!brandId) return;
    setFailed(false);
    Promise.all([engine.listImages(brandId), engine.listProjects(brandId)])
      .then(([i, v]) => {
        setImages(i);
        setVideos(v);
      })
      .catch(() => setFailed(true));
  }, [brandId]);
  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    if (!images) return [];
    const q = query.trim().toLowerCase();
    const list = images.filter((i) => {
      if (tab !== 'all' && i.kind !== tab) return false;
      if (source === OWN && i.projectId) return false;
      if (source !== ALL_SOURCES && source !== OWN && i.projectId !== source) return false;
      if (q && !`${i.title} ${i.caption} ${i.source}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === 'oldest') return [...list].sort((a, b) => a.createdAt - b.createdAt);
    if (sort === 'title') return [...list].sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [images, tab, source, query, sort]);

  const filtering = query.trim() !== '' || source !== ALL_SOURCES;

  return (
    <div className="page page-tight">
      <header className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Images</h1>
          <p className="lead">Thumbnails, carousels and quote cards from your videos, plus anything you make on its own.</p>
        </div>
        <div className="row-actions">
          {mockCarousel() ? (
            <button type="button" className="btn btn-outline btn-lg" onClick={() => setCreating(true)}>Make a carousel (mock)</button>
          ) : (
            <Link to="/images/carousel" className="btn btn-outline btn-lg">Make a carousel</Link>
          )}
          <Link to="/images/thumbnail" className="btn btn-outline btn-lg">Make a thumbnail</Link>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          aria-expanded={creating}
          aria-controls="create-panel"
          onClick={() => setCreating((c) => !c)}
        >
          <Icon name={creating ? 'close' : 'plus'} size={18} strokeWidth={2.2} />
          {creating ? 'Close' : 'Create image'}
        </button>
        </div>
      </header>

      <p className="visually-hidden" role="status" aria-live="polite">{added}</p>

      {creating && brandId && (
        <CreatePanel
          brandId={brandId}
          videos={videos}
          onCreated={(item) => {
            setImages((cur) => (cur ? [item, ...cur] : [item]));
            setAdded(`Added a draft: ${item.title}`);
            setCreating(false);
            setParams({}, { replace: true });
          }}
        />
      )}

      <Tabs label="Image types" idPrefix="img" tabs={TABS} value={tab} onChange={(t) => setParams(t === 'all' ? {} : { type: t }, { replace: true })} />

      <div {...tabPanelProps('img', tab)} className="panel">
        <div className="filters">
          <label className="search-field">
            <Icon name="search" size={16} strokeWidth={2} />
            <span className="visually-hidden">Search images</span>
            <input type="search" placeholder="Search images" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="select-pill">
            <span>From:</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value={ALL_SOURCES}>All videos</option>
              {videos.map((v) => (
                <option key={v.id} value={v.id}>{v.title}</option>
              ))}
              <option value={OWN}>Made on its own</option>
            </select>
          </label>
          <label className="select-pill">
            <span>Sort:</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="title">Title</option>
            </select>
          </label>
        </div>

        {failed && (
          <div className="card empty" role="alert">
            <strong>We could not load your images.</strong>
            <span className="muted">Nothing was lost. Check your connection and try again.</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={load}>Try again</button>
          </div>
        )}
        {!images && !failed && <p className="muted" role="status">Loading your images…</p>}

        {images && images.length === 0 && (
          <div className="card empty">
            <strong>No images yet</strong>
            <span className="muted">
              Thumbnails you pick in a video show up here. You can also make one on its own: upload one, start from a
              template, grab a video frame or generate one.
            </span>
            <button type="button" className="btn btn-dark btn-sm" onClick={() => setCreating(true)}>Create your first image</button>
          </div>
        )}

        {images && images.length > 0 && shown.length === 0 && (
          <div className="card empty" role="status">
            <strong>{filtering ? 'No images match' : `No ${TAB_NOUN[tab]} yet`}</strong>
            <span className="muted">
              {filtering
                ? 'Try a different word or source.'
                : 'Use Create image to make one, or finish a video and its pieces will appear here.'}
            </span>
            {filtering && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setQuery('');
                  setSource(ALL_SOURCES);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {shown.length > 0 && (
          <ul className="grid img-grid" aria-label={`${shown.length} images`}>
            {shown.map((i) => (
              <li key={i.id} className="img-card">
                <div
                  className={`img-pic r${i.ratio.replace(':', '-')} tone-${i.textTone}`}
                  style={grad(i.poster, 135)}
                  role="img"
                  aria-label={i.caption ? `${i.title}: ${i.caption}` : i.title}
                >
                  {i.caption && <span>{i.caption}</span>}
                </div>
                <strong className="small">{i.title}</strong>
                <div className="img-tags">
                  <span className="mini">{i.ratio}</span>
                  {i.status === 'draft' && <span className="chip">Draft</span>}
                  {i.status === 'ready' && !i.note && <span className="chip chip-ok">Ready</span>}
                  {i.note && <span className={`chip ${i.note.ok ? 'chip-ok' : 'chip-warn'}`}>{i.note.text}</span>}
                </div>
                {i.projectId ? (
                  <Link to={`/videos/${i.projectId}`} className="small muted img-source">{i.source}</Link>
                ) : (
                  <span className="small muted">{i.source}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
