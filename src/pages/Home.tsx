import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../AppContext';
import { Icon, PlayIcon } from '../components/Icon';
import { PlatformBadge } from '../components/PlatformBadge';
import * as engine from '../engine';
import { fmtTime, grad } from '../format';
import { useDocumentTitle } from '../useDocumentTitle';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const planStatus = (status: engine.PlanEntry['status']) => {
  if (status === 'ready') return { text: 'Ready to post', tone: 'ok' };
  if (status === 'needs-thumbnail') return { text: 'Add a thumbnail before posting', tone: 'warn' };
  if (status === 'render-retry') return { text: 'The video render needs another try', tone: 'error' };
  if (status === 'posted') return { text: 'Already posted', tone: 'plain' };
  if (status === 'suggested') return { text: 'Suggested for an open day', tone: 'plain' };
  return null;
};

function SectionHead({
  id,
  title,
  sub,
  badge,
  link,
}: {
  id: string;
  title: string;
  sub: string;
  badge?: React.ReactNode;
  link?: { to: string; label: string };
}) {
  return (
    <div className="section-head">
      <div className="section-title-row">
        <h2 id={id} className="h2">{title}</h2>
        {badge}
        {link && (
          <Link to={link.to} className="section-link">
            {link.label}
          </Link>
        )}
      </div>
      <p className="muted section-sub">{sub}</p>
    </div>
  );
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card empty">
      <strong>{title}</strong>
      <span className="muted">{children}</span>
    </div>
  );
}

export default function Home() {
  useDocumentTitle('Home');
  const { session, brand } = useApp();
  const [data, setData] = useState<engine.HomeData | null>(null);
  const [failed, setFailed] = useState(false);
  const [retries, setRetries] = useState<Record<string, { progress: number; error?: string }>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const brandId = brand?.id;
  const load = useCallback(() => {
    if (!brandId) return;
    setFailed(false);
    engine.getHome(brandId).then(setData).catch(() => setFailed(true));
  }, [brandId]);

  useEffect(() => {
    load();
  }, [load]);

  const retryRender = (projectId: string) => {
    setRetries((r) => ({ ...r, [projectId]: { progress: 0 } }));
    engine
      .startRender(projectId, (job) =>
        setRetries((r) => ({ ...r, [projectId]: { progress: job.progress, error: job.error } })),
      )
      .then((job) => {
        if (job.status === 'done') {
          setRetries(({ [projectId]: _gone, ...rest }) => rest);
          load();
        }
      })
      .catch(() =>
        setRetries((r) => ({ ...r, [projectId]: { progress: 0, error: 'Something went wrong. Try again.' } })),
      );
  };

  const acceptSuggestion = (entryId: string) => {
    if (!brandId) return;
    setAdding(entryId);
    engine
      .acceptSuggestion(brandId, entryId)
      .then(load)
      .catch(() => setFailed(true))
      .finally(() => setAdding(null));
  };

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">
            {greeting()}
            {session ? `, ${session.userName}` : ''}
          </h1>
          <p className="lead">Start something new, or pick up where you left off.</p>
        </div>
        <button type="button" className="search-pill">
          <Icon name="search" size={16} strokeWidth={2} />
          Search everything
        </button>
      </header>

      {/* Start a new video: Upload or Record only */}
      <section className="card start" aria-labelledby="start-h">
        <div className="start-main">
          <span className="chip">New video</span>
          <h2 id="start-h" className="start-title">Upload a video you shot, or record one now</h2>
          <p className="muted start-copy">
            We listen to it first, then ask you three quick questions about visuals, style and feel.
            After that, you get a directed edit.
          </p>
          <div className="start-actions">
            <Link to="/videos/new?source=upload" className="btn btn-primary btn-lg">
              <Icon name="upload" size={18} strokeWidth={2.2} />
              Upload a video
            </Link>
            <Link to="/videos/record" className="btn btn-outline-strong btn-lg">
              <span className="rec-dot" aria-hidden="true" />
              Record now
            </Link>
          </div>
        </div>
        <ol className="steps">
          {[
            ['Add your video', 'Any length, phone or laptop.'],
            ['Pick a style', 'We suggest 3 to 5 that fit it.'],
            ['Get a directed edit', 'Plus a thumbnail and posts.'],
          ].map(([t, d], i) => (
            <li key={t}>
              <span className="step-num" aria-hidden="true">{i + 1}</span>
              <span>
                <strong>{t}</strong>
                <br />
                <span className="muted small">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {failed && (
        <div className="card empty" role="alert">
          <strong>We could not load your Home screen.</strong>
          <span className="muted">Your videos are safe. Check your connection and try again.</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={load}>
            Try again
          </button>
        </div>
      )}

      {!data && !failed && (
        <p className="muted" role="status">
          Loading your Home screen…
        </p>
      )}

      {data && (
        <>
          <div className="two-col">
            {/* To-do */}
            <section aria-labelledby="todo-h" className="col">
              <SectionHead
                id="todo-h"
                title="Your to-do list"
                sub="Things we can't do without you."
                badge={
                  data.todo.length > 0 && (
                    <span className="chip chip-warn">
                      {data.todo.length} {data.todo.length === 1 ? 'task' : 'tasks'}
                    </span>
                  )
                }
              />
              {data.todo.length === 0 ? (
                <Empty title="Nothing needs you right now">
                  When a video needs a decision, like picking a style or approving a thumbnail, it
                  shows up here.
                </Empty>
              ) : (
                <ul className="card list">
                  {data.todo.map((t) => {
                    const r = retries[t.projectId];
                    const isRetry = t.kind === 'retry-render';
                    return (
                      <li key={t.id} className="row">
                        <span className={`dot dot-${t.severity}`} aria-hidden="true" />
                        <div className="row-main">
                          <div className="row-title">{t.title}</div>
                          <div className="small muted">{t.detail}</div>
                          {isRetry && r && (
                            <div className="small" role="status" style={r.error ? { color: 'var(--error)' } : undefined}>
                              {r.error ?? `Rendering… ${Math.round(r.progress * 100)}%`}
                            </div>
                          )}
                        </div>
                        {isRetry ? (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={!!r && !r.error}
                            onClick={() => retryRender(t.projectId)}
                          >
                            {r && !r.error ? 'Rendering…' : 'Retry'}
                          </button>
                        ) : (
                          <Link
                            to={`/videos/${t.projectId}`}
                            className={`btn btn-sm ${t.kind === 'choose-style' ? 'btn-dark' : 'btn-outline'}`}
                          >
                            {t.actionLabel}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Posting plan */}
            <section aria-labelledby="plan-h" className="col">
              <SectionHead
                id="plan-h"
                title="Posting plan this week"
                sub="What goes out and when. You post; we get it ready."
                link={{ to: '/calendar', label: 'Open calendar' }}
              />
              {data.week.length === 0 ? (
                <Empty title="Nothing planned this week">
                  Finish a video and we will suggest what to post and when.
                </Empty>
              ) : (
                <ul className="card list">
                  {data.week.map((e, i) => (
                    <li key={e.id} className={`row row-plan${i === 0 ? ' row-today' : ''}`}>
                      <div className="day">{e.day}</div>
                      {e.status === 'empty' ? (
                        <div className="row-main small muted">Nothing planned</div>
                      ) : (
                        <>
                          <div className="row-main plan-main">
                            <div className="plan-line">
                              <PlatformBadge channel={e.channel!}/>
                              <span className={e.status === 'suggested' ? 'muted' : 'row-title-plain'}>{e.title}</span>
                            </div>
                            {planStatus(e.status) && <span className={`plan-status is-${planStatus(e.status)!.tone}`}>{planStatus(e.status)!.text}</span>}
                          </div>
                          {e.status === 'suggested' && (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              disabled={adding === e.id}
                              onClick={() => acceptSuggestion(e.id)}
                            >
                              {adding === e.id ? 'Adding…' : 'Add'}
                            </button>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Continue */}
          <section aria-labelledby="continue-h">
            <SectionHead
              id="continue-h"
              title="Continue where you left off"
              sub="Your latest videos and how far along each one is."
              link={{ to: '/videos', label: 'All videos' }}
            />
            {data.recent.length === 0 ? (
              <Empty title="No videos yet">
                Upload or record your first video above. It will appear here with its progress.
              </Empty>
            ) : (
              <ul className="grid grid-continue">
                {data.recent.map((p) => (
                  <li key={p.id}>
                    <Link to={`/videos/${p.id}`} className="card vcard">
                      <div className="vthumb" style={grad(p.poster)}>
                        <span className="play"><PlayIcon /></span>
                        <span className="duration">{fmtTime(p.durationSec)}</span>
                      </div>
                      <div className="vbody">
                        <div className="row-title">{p.title}</div>
                        <div className="progress" aria-hidden="true">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <i key={n} className={n <= p.step ? 'on' : ''} />
                          ))}
                        </div>
                        <div
                          className="small"
                          style={p.status === 'render-failed' ? { color: 'var(--error)', fontWeight: 600 } : { color: 'var(--text-2)' }}
                        >
                          Step {p.step} of 5 · {p.stepLabel}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Trends */}
          <section aria-labelledby="trends-h">
            <SectionHead
              id="trends-h"
              title="Trending in your niche"
              sub="What is working for others, with the source. Example content."
            />
            <ul className="grid grid-three">
              {data.trends.map((t) => (
                <li key={t.id} className="card tcard">
                  {t.image && <div className="timg" style={grad(t.image, 135)} role="img" aria-label="" />}
                  <div className="tbody">
                    <span className="chip small-chip">{t.kind}</span>
                    <div className="card-title">{t.title}</div>
                    <div className="small muted">{t.summary}</div>
                    <div className="tiny muted source">{t.source}</div>
                    <Link to={`/videos/new?trend=${t.id}`} className="btn btn-outline-strong btn-sm self-start">
                      Make this
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Ideas */}
          <section aria-labelledby="ideas-h">
            <SectionHead id="ideas-h" title="Ideas for you" sub="Suggestions based on your own videos and your niche." />
            <ul className="grid grid-three">
              {data.ideas.map((idea) => (
                <li key={idea.id} className="card icard">
                  <div className="card-title">{idea.title}</div>
                  <div className="small muted">{idea.detail}</div>
                  <div className="idea-actions">
                    <Link to={`/videos/new?idea=${idea.id}`} className="btn btn-dark btn-sm">
                      Start
                    </Link>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      aria-pressed={saved.has(idea.id)}
                      onClick={() => setSaved((s) => toggle(s, idea.id))}
                    >
                      {saved.has(idea.id) ? 'Saved' : 'Save'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
