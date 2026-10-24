import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as engine from '../../engine';
import { fmtTime, grad } from '../../format';
import { PlayIcon } from '../../components/Icon';

const CHIPS = ['Slower cuts', 'Bigger captions', 'Add a stat callout at 0:12', 'Fewer effects'];
const PRESETS: { id: engine.DirectionPreset; label: string }[] = [
  { id: 'punchy', label: 'Punchy' },
  { id: 'calm', label: 'Calm' },
  { id: 'cinematic', label: 'Cinematic' },
];

export function EditTab({ project }: { project: engine.Project }) {
  const id = project.id;
  const [ds, setDs] = useState<engine.DirectionState | null>(null);
  const [timeline, setTimeline] = useState<engine.Timeline | null>(null);
  const [history, setHistory] = useState<engine.History | null>(null);
  const [thumbs, setThumbs] = useState<engine.ThumbnailOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState('');

  const [prompt, setPrompt] = useState('');
  const [pending, setPending] = useState<engine.InterpretedRequest | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [intensity, setIntensity] = useState(60);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async () => {
    const [d, t, h] = await Promise.all([engine.getDirection(id), engine.getTimeline(id), engine.getHistory(id)]);
    setDs(d);
    setTimeline(t);
    setHistory(h);
    setIntensity(d.direction.intensity);
  }, [id]);

  const loadAll = useCallback(() => {
    setFailed(false);
    Promise.all([refresh(), engine.listThumbnails(id).then(setThumbs)]).catch(() => setFailed(true));
  }, [refresh, id]);
  useEffect(loadAll, [loadAll]);

  /** Runs an engine call with all controls locked, then re-reads everything that may have changed. */
  const run = async (work: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await work();
      await refresh();
      if (ok) setAnnounce(ok);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const setPreset = (preset: engine.DirectionPreset) =>
    run(async () => {
      await engine.setDirection(id, { preset, intensity });
    }, `Direction set to ${preset}`);

  // Intensity commits once the slider has been still for a moment, so one drag is one history entry.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!ds || intensity === ds.direction.intensity) return;
    const t = setTimeout(() => {
      run(async () => {
        await engine.setDirection(id, { preset: ds.direction.preset, intensity });
      }, `Intensity ${intensity}`);
    }, 600);
    return () => clearTimeout(t);
  }, [intensity]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewChange = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setRejected([]);
    try {
      setPending(await engine.interpretRequest(id, prompt));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const applyPending = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await engine.applyPatch(id, pending.patch);
      if (res.ok) {
        await refresh();
        setAnnounce(`Applied: ${pending.patch.label}`);
        setPending(null);
        setPrompt('');
      } else {
        setRejected(res.reasons);
        setPending(null);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const fillPrompt = (text: string) => {
    setPrompt(text);
    setPending(null);
    setRejected([]);
    promptRef.current?.focus();
  };

  const useThumb = (tid: string) =>
    run(async () => {
      setThumbs(await engine.selectThumbnail(id, tid));
    }, 'Thumbnail chosen');

  if (failed)
    return (
      <div className="card empty" role="alert">
        <strong>That did not work.</strong>
        <span className="muted">Nothing was lost. Check your connection and try again.</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={loadAll}>Try again</button>
      </div>
    );

  const warn = ds?.checks.find((c) => c.severity !== 'ok' && c.detail);
  const res = project.resolution;

  return (
    <div className="ws">
      <div className="ws-main">
        <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>

        {/* Preview and timeline */}
        <section className="card ws-card ws-player" aria-label="Preview and timeline">
          <div className="phone" style={grad(project.poster, 180)}>
            <span className="phone-play" aria-hidden="true"><PlayIcon size={20} /></span>
            {timeline && <div className="phone-cap">{timeline.previewCaption}</div>}
          </div>
          <div className="ws-player-side">
            <div className="ws-player-chips">
              <span className="label">Preview</span>
              <span className="mini">0:00 / {fmtTime(project.durationSec)}</span>
              {res && <span className="mini">{res.width} × {res.height}</span>}
            </div>
            <div className="tl" aria-label="Simplified timeline">
              {(timeline?.tracks ?? []).map((t) => (
                <div key={t.id} className="tl-row">
                  <span className="tl-label">{t.label}</span>
                  <div className="tl-lane">
                    {t.blocks.map((b, i) => (
                      <i key={i} className={`tl-${b.tone}`} style={{ left: `${b.left}%`, width: `${b.width}%` }} />
                    ))}
                  </div>
                </div>
              ))}
              {!timeline && <p className="muted small" role="status">Loading the timeline…</p>}
            </div>
            <p className="muted small">
              A simple view: clips, camera moves, captions, assets and audio. The preview is a placeholder here, and
              changing the edit is done in the box below.
            </p>
          </div>
        </section>

        {/* Change the edit */}
        <section className="card ws-card" aria-labelledby="change-h">
          <h2 id="change-h" className="h3">Change the edit</h2>
          <div className="chip-group" role="group" aria-label="Suggestions">
            {CHIPS.map((c) => (
              <button key={c} type="button" className="chip-btn plain" onClick={() => fillPrompt(c)}>
                {c}
              </button>
            ))}
          </div>
          <label className="field">
            <span className="field-label">Describe a change</span>
            <textarea
              ref={promptRef}
              rows={3}
              value={prompt}
              placeholder="Describe what to change, or tap a suggestion"
              onChange={(e) => {
                setPrompt(e.target.value);
                setPending(null);
                setRejected([]);
              }}
            />
          </label>

          <div aria-live="polite" className="reading-wrap">
            {pending && (
              <div className="reading">
                <p>
                  <strong>Reading this as:</strong> {pending.reading}
                </p>
                <p className="small muted">Short preview of only the changed part: {pending.previewNote}. You can edit your request first.</p>
              </div>
            )}
            {rejected.length > 0 && (
              <div className="notice notice-warn" role="alert">
                <strong>We can't do that as asked</strong>
                {rejected.map((r) => (
                  <span key={r}>{r}</span>
                ))}
                <span>Change the request and try again. Nothing was changed.</span>
              </div>
            )}
          </div>

          <div className="row-actions">
            {!pending ? (
              <button type="button" className="btn btn-dark btn-lg" disabled={busy || !prompt.trim()} onClick={previewChange}>
                {busy ? 'Working…' : 'Preview change'}
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-dark btn-lg" disabled={busy} onClick={applyPending}>
                  {busy ? 'Applying…' : 'Apply change'}
                </button>
                <button type="button" className="btn btn-outline btn-lg" disabled={busy} onClick={() => setPending(null)}>
                  Cancel
                </button>
              </>
            )}
            <span className="small muted">You see a short preview of only the changed part first.</span>
          </div>
        </section>

        {/* Thumbnails */}
        <section className="card ws-card" aria-labelledby="thumb-h">
          <div className="sec-line">
            <h2 id="thumb-h" className="h3">Thumbnail</h2>
            <span className="small muted">Built from frames in your video. Each option is checked at phone size.</span>
          </div>
          {!thumbs && <p className="muted" role="status">Making thumbnail options…</p>}
          {thumbs && (
            <ul className="thumb-grid">
              {thumbs.map((t) => (
                <li key={t.id} className={`thumb-opt${t.selected ? ' is-selected' : ''}`}>
                  <div className="thumb-img" style={grad(t.poster, 135)} role="img" aria-label={t.headline ? `${t.label}: ${t.headline}` : t.label}>
                    {t.headline && <span>{t.headline}</span>}
                  </div>
                  <div className="thumb-meta">
                    <strong>{t.label}</strong>
                    <span className={`chip ${t.phoneCheck.ok ? 'chip-ok' : 'chip-warn'}`}>{t.phoneCheck.note}</span>
                  </div>
                  <button
                    type="button"
                    className={`btn btn-sm ${t.selected ? 'btn-dark' : 'btn-outline'}`}
                    aria-pressed={t.selected}
                    disabled={busy}
                    onClick={() => useThumb(t.id)}
                  >
                    {t.selected ? 'In use' : 'Use this'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="small muted">
            Want to make something from scratch? <Link to="/images">Open Images</Link>
          </p>
        </section>
      </div>

      <aside className="ws-side" aria-label="Direction and notes">
        <section className="card ws-card" aria-labelledby="dir-h">
          <h2 id="dir-h" className="h4">Direction</h2>
          <div className="seg" role="group" aria-label="Direction preset">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={ds?.direction.preset === p.id}
                disabled={busy || !ds}
                onClick={() => setPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="field">
            <span className="field-label">Intensity: {intensity}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={intensity}
              disabled={!ds}
              onChange={(e) => setIntensity(Number(e.target.value))}
            />
          </label>
        </section>

        <section className="card ws-card" aria-labelledby="notes-h">
          <h2 id="notes-h" className="h4">Director's notes</h2>
          {!ds && <p className="muted small" role="status">Reading your edit…</p>}
          <ul className="notes">
            {ds?.notes.map((n) => (
              <li key={n.id}>
                <span>{n.text}</span>
                <button type="button" className="chip-btn plain sm" onClick={() => fillPrompt(n.alternative)}>
                  {n.alternative}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card ws-card" aria-labelledby="checks-h">
          <h2 id="checks-h" className="h4">Checks</h2>
          <div className="chips-row">
            {ds?.checks.map((c) => (
              <span key={c.id} className={`chip ${c.severity === 'ok' ? 'chip-ok' : c.severity === 'warn' ? 'chip-warn' : 'chip-error'}`}>
                {c.label}
              </span>
            ))}
          </div>
          {warn && (
            <>
              <p className="small muted">{warn.detail}</p>
              {warn.fixPatch && (
                <div>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const res = await engine.applyPatch(id, warn.fixPatch!);
                        if (!res.ok) setRejected(res.reasons);
                      }, `Applied: ${warn.fixLabel}`)
                    }
                  >
                    {warn.fixLabel}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <section className="card ws-card" aria-labelledby="hist-h">
          <div className="hist-head">
            <h2 id="hist-h" className="h4">History</h2>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={busy || !history?.canUndo}
              onClick={() => run(async () => void (await engine.undo(id)), 'Undone')}
            >
              Undo
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={busy || !history?.canRedo}
              onClick={() => run(async () => void (await engine.redo(id)), 'Redone')}
            >
              Redo
            </button>
          </div>
          <ol className="hist">
            {history?.entries.map((e) => (
              <li key={e.revision} className={e.current ? 'is-current' : ''} aria-current={e.current ? 'step' : undefined}>
                <span className="rev">v{e.revision}</span>
                <span>{e.label}</span>
                {e.current && <span className="chip">current</span>}
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}
