import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import { Icon } from '../components/Icon';
import { Tabs, tabPanelProps } from '../components/Tabs';
import * as engine from '../engine';
import { fmtTime, grad } from '../format';
import { useDocumentTitle } from '../useDocumentTitle';

const TABS: { id: 'all' | engine.AssetKind; label: string; noun: string }[] = [
  { id: 'all', label: 'All', noun: 'assets' },
  { id: 'product', label: 'Product images', noun: 'product images' },
  { id: 'logo', label: 'Logos', noun: 'logos' },
  { id: 'screenshot', label: 'Screenshots', noun: 'screenshots' },
  { id: 'music', label: 'Music', noun: 'music' },
];

const usage = (a: engine.AssetItem) =>
  a.status === 'processing'
    ? 'Just uploaded'
    : a.usedEverywhere
      ? 'Used everywhere'
      : a.usedIn === 0
        ? 'Not used yet'
        : `Used in ${a.usedIn} video${a.usedIn === 1 ? '' : 's'}`;

/** Same bars every time for the same asset, so the picture does not jump around. */
const bars = (id: string) => {
  let h = 7;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return Array.from({ length: 12 }, (_, i) => 25 + ((h * (i + 3) * 37) % 46));
};

const noteClass = { ok: 'chip chip-ok', warn: 'chip chip-warn', progress: 'chip', plain: 'chip' } as const;

export default function Assets() {
  useDocumentTitle('Assets');
  const { brand } = useApp();
  const brandId = brand?.id;
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('type') ?? 'all';
  const tab = TABS.some((t) => t.id === tabParam) ? tabParam : 'all';

  const [assets, setAssets] = useState<engine.AssetItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<File[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [rejected, setRejected] = useState<engine.AssetUploadResult['rejected']>([]);
  const [announce, setAnnounce] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    if (!brandId) return Promise.resolve();
    setFailed(false);
    return engine.listAssets(brandId).then(setAssets).catch(() => setFailed(true));
  }, [brandId]);
  useEffect(() => {
    load();
  }, [load]);

  // Labelling takes a few seconds: keep checking until nothing is processing.
  const processing = assets?.some((a) => a.status === 'processing') ?? false;
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [processing, load]);

  const upload = async (files: File[]) => {
    if (!brandId || files.length === 0) return;
    setPending(files);
    setProgress(0);
    setUploadError('');
    setRejected([]);
    try {
      const res = await engine.uploadAssets(brandId, files, setProgress);
      setRejected(res.rejected);
      setPending(null);
      setAnnounce(
        res.added.length
          ? `Added ${res.added.length} ${res.added.length === 1 ? 'asset' : 'assets'}. We are labelling them now.`
          : 'Nothing was added.',
      );
      await load();
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    upload([...e.dataTransfer.files]);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: assets?.length ?? 0 };
    for (const a of assets ?? []) c[a.kind] = (c[a.kind] ?? 0) + 1;
    return c;
  }, [assets]);

  const shown = (assets ?? []).filter((a) => tab === 'all' || a.kind === tab);
  const tabDef = TABS.find((t) => t.id === tab)!;
  const uploading = progress !== null;

  return (
    <div className="page page-tight">
      <header className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Assets</h1>
          <p className="lead asset-lead">
            Things you want in your videos and images: product shots, logos, screenshots, music. We label them, cut out
            the background, and place them when you mention them.
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-lg" disabled={uploading} onClick={() => input.current?.click()}>
          <Icon name="plus" size={18} strokeWidth={2.2} />
          Upload assets
        </button>
      </header>

      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/svg+xml,audio/mpeg,audio/wav,.mp3,.wav"
        className="visually-hidden"
        aria-label="Choose asset files"
        tabIndex={-1}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          upload(files);
        }}
      />
      <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>

      <Tabs
        label="Asset types"
        idPrefix="asset"
        tabs={TABS.map((t) => ({ id: t.id, label: assets ? `${t.label} · ${counts[t.id] ?? 0}` : t.label }))}
        value={tab}
        onChange={(t) => setParams(t === 'all' ? {} : { type: t }, { replace: true })}
      />

      <div {...tabPanelProps('asset', tab)} className="panel">
        <div
          className={`drop${dragging ? ' is-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {uploading && pending ? (
            <div className="drop-progress" role="status">
              <span className="small">
                Uploading {pending.length === 1 ? pending[0].name : `${pending.length} files`} · {Math.round((progress ?? 0) * 100)}%
              </span>
              <div
                className="bar"
                role="progressbar"
                aria-label="Upload progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((progress ?? 0) * 100)}
              >
                <div style={{ width: `${(progress ?? 0) * 100}%` }} />
              </div>
            </div>
          ) : (
            <>
              <span className="muted small drop-text">Drop files here. Images (PNG, JPG, WebP), logos (SVG) and audio (MP3, WAV).</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => input.current?.click()}>
                Choose files
              </button>
            </>
          )}
        </div>

        {uploadError && pending && (
          <div className="notice notice-error" role="alert">
            <strong>Upload failed</strong>
            <span>{uploadError}</span>
            <div className="notice-actions">
              <button type="button" className="btn btn-outline btn-sm" disabled={uploading} onClick={() => upload(pending)}>
                Try again
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setPending(null);
                  setUploadError('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {rejected.length > 0 && (
          <div className="notice notice-warn" role="alert">
            <strong>{rejected.length === 1 ? 'One file was skipped' : `${rejected.length} files were skipped`}</strong>
            {rejected.map((r) => (
              <span key={r.name}>
                {r.name}: {r.reason}
              </span>
            ))}
          </div>
        )}

        {failed && (
          <div className="card empty" role="alert">
            <strong>We could not load your assets.</strong>
            <span className="muted">Nothing was lost. Check your connection and try again.</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => load()}>Try again</button>
          </div>
        )}
        {!assets && !failed && <p className="muted" role="status">Loading your assets…</p>}

        {assets && assets.length === 0 && (
          <div className="card empty">
            <strong>No assets yet</strong>
            <span className="muted">
              Upload product shots, logos, screenshots or music. Say their names in a video or a prompt and we will place
              them for you.
            </span>
            <button type="button" className="btn btn-dark btn-sm" onClick={() => input.current?.click()}>
              Upload your first asset
            </button>
          </div>
        )}
        {assets && assets.length > 0 && shown.length === 0 && (
          <div className="card empty" role="status">
            <strong>No {tabDef.noun} yet</strong>
            <span className="muted">Drop files above and we will sort them into the right tab.</span>
          </div>
        )}

        {shown.length > 0 && (
          <ul className="grid asset-grid" aria-label={`${shown.length} ${tabDef.noun}`}>
            {shown.map((a) => (
              <li key={a.id} className="card asset-card">
                {a.kind === 'music' ? (
                  <div className="wave" aria-hidden="true">
                    {bars(a.id).map((h, i) => (
                      <i key={i} style={{ height: `${h}%` }} />
                    ))}
                  </div>
                ) : (
                  <div
                    className={`asset-pic${a.kind === 'logo' ? ' is-logo' : ''}`}
                    style={grad(a.poster, 135)}
                    role="img"
                    aria-label={a.name}
                  >
                    <span>{a.name}</span>
                  </div>
                )}
                <strong className="small">{a.name}</strong>
                <div className="img-tags">
                  {a.durationSec !== undefined && <span className="mini">{fmtTime(a.durationSec)}</span>}
                  <span className={noteClass[a.note.tone]}>{a.note.text}</span>
                </div>
                <span className="small muted">{usage(a)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
