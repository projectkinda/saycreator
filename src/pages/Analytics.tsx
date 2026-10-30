import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../AppContext';
import { PlatformBadge } from '../components/PlatformBadge';
import { dayMonth } from '../dates';
import * as engine from '../engine';
import { grad } from '../format';
import { useDocumentTitle } from '../useDocumentTitle';

const PLATFORM_NAME: Record<engine.Platform, string> = { instagram: 'Instagram', youtube: 'YouTube' };
const PLATFORMS: engine.Platform[] = ['instagram', 'youtube'];

export default function Analytics() {
  useDocumentTitle('Analytics');
  const { brand } = useApp();
  const brandId = brand?.id;
  const [data, setData] = useState<engine.AnalyticsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<engine.Platform | null>(null);
  const [error, setError] = useState('');
  const [announce, setAnnounce] = useState('');

  const load = useCallback(() => {
    if (!brandId) return;
    setFailed(false);
    engine.getAnalytics(brandId).then(setData).catch(() => setFailed(true));
  }, [brandId]);
  useEffect(() => {
    load();
  }, [load]);

  const change = async (platform: engine.Platform, connect: boolean) => {
    if (!brandId) return;
    setBusy(platform);
    setError('');
    try {
      setData(await (connect ? engine.connectAccount(brandId, platform) : engine.disconnectAccount(brandId, platform)));
      setAnnounce(`${PLATFORM_NAME[platform]} ${connect ? 'connected' : 'disconnected'}`);
    } catch (e) {
      setError((e as Error).message || 'That did not work. Nothing was changed.');
    } finally {
      setBusy(null);
    }
  };

  const max = data ? Math.max(...data.daily.map((d) => d.views)) : 0;
  const peakValue = data ? data.daily.reduce((a, b) => (b.views > a.views ? b : a)) : null;
  const firstUnconnected = data ? PLATFORMS.find((p) => !data.connected[p]) : undefined;

  return (
    <div className="page page-tight">
      <header className="page-header">
        <div className="page-header-text cal-title">
          <h1 className="page-title">Analytics</h1>
          <span className="chip">Phase 1</span>
          {data?.isExample && <span className="chip chip-warn">Example data</span>}
        </div>
      </header>

      <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>

      {failed && (
        <div className="card empty" role="alert">
          <strong>We could not load your analytics.</strong>
          <span className="muted">Nothing was lost. Check your connection and try again.</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={load}>Try again</button>
        </div>
      )}
      {!data && !failed && <p className="muted" role="status">Loading your numbers…</p>}

      {data && (
        <>
          <section className="card ws-card" aria-labelledby="connect-h">
            <div className="connect-head">
              <div className="connect-text">
                <h2 id="connect-h" className="h4">
                  {data.isExample ? 'Connect an account to see your real numbers' : 'Connected accounts'}
                </h2>
                <p className="small muted">
                  {data.isExample
                    ? 'What you see below is an example of what appears once an account is connected.'
                    : 'Numbers update about once a day. We only read your results; we never post for you.'}
                </p>
              </div>
              <div className="connect-actions">
                {PLATFORMS.map((p) =>
                  data.connected[p] ? (
                    <span key={p} className="connected">
                      <span className="chip chip-ok">{PLATFORM_NAME[p]} connected</span>
                      <button type="button" className="btn btn-outline btn-sm" disabled={busy !== null} onClick={() => change(p, false)}>
                        {busy === p ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      className={`btn btn-lg ${p === firstUnconnected && data.isExample ? 'btn-primary' : 'btn-outline'}`}
                      disabled={busy !== null}
                      onClick={() => change(p, true)}
                    >
                      {busy === p ? 'Connecting…' : `Connect ${PLATFORM_NAME[p]}`}
                    </button>
                  ),
                )}
              </div>
            </div>
            {error && (
              <div className="notice notice-error" role="alert">
                <strong>Not connected</strong>
                <span>{error}</span>
              </div>
            )}
          </section>

          {data.posts.length === 0 ? (
            <div className="card empty">
              <strong>No numbers yet</strong>
              <span className="muted">
                Numbers appear about a day after your first post goes live. Mark a post as posted on your calendar and we
                will start watching it.
              </span>
              <Link to="/calendar" className="btn btn-dark btn-sm">Open calendar</Link>
            </div>
          ) : (
            <>
              <ul className="stats" aria-label="Summary">
                {data.stats.map((s) => (
                  <li key={s.id} className="card stat">
                    <span className="label">{s.label}</span>
                    <strong className="stat-value">{s.value}</strong>
                    <span className="small muted">{s.detail}</span>
                  </li>
                ))}
              </ul>

              <div className="two">
                <section className="card ws-card" aria-labelledby="views-h">
                  <h2 id="views-h" className="h3">Views by day</h2>
                  <figure className="chart">
                    <div
                      className="spark"
                      role="img"
                      aria-label={`Views per day for the last 28 days, from ${dayMonth(data.daily[0].date)} to ${dayMonth(data.daily[data.daily.length - 1].date)}. Highest day: ${peakValue?.views.toLocaleString('en-US')} views on ${dayMonth(peakValue!.date)}.`}
                    >
                      {data.daily.map((d) => (
                        <i key={d.date} className={d === peakValue ? 'hi' : ''} style={{ height: `${Math.max(4, (d.views / max) * 100)}%` }} />
                      ))}
                    </div>
                    <figcaption className="chart-axis small muted">
                      <span>{dayMonth(data.daily[0].date)}</span>
                      <span>{dayMonth(data.daily[data.daily.length - 1].date)}</span>
                    </figcaption>
                  </figure>
                  <table className="visually-hidden">
                    <caption>Views per day</caption>
                    <thead><tr><th scope="col">Day</th><th scope="col">Views</th></tr></thead>
                    <tbody>
                      {data.daily.map((d) => (
                        <tr key={d.date}><td>{dayMonth(d.date)}</td><td>{d.views}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <span className="small muted">Peak: {data.peak}</span>
                </section>

                <section className="card ws-card" aria-labelledby="works-h">
                  <h2 id="works-h" className="h3">What seems to work</h2>
                  <span className="chip chip-warn self-start">Early patterns, not proof</span>
                  {data.insights.map((t) => (
                    <p key={t} className="quote small">{t}</p>
                  ))}
                </section>

                <section className="card ws-card" aria-labelledby="next-h">
                  <h2 id="next-h" className="h3">Try next</h2>
                  <ul className="next-list">
                    {data.suggestions.map((s) => (
                      <li key={s.id}>
                        <span className="small">{s.text}</span>
                        <Link
                          to={s.target === 'calendar' ? '/calendar' : '/videos/new'}
                          className="btn btn-outline btn-sm"
                        >
                          {s.actionLabel}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              <section aria-labelledby="posts-h">
                <h2 id="posts-h" className="h2 made-title">Your posts</h2>
                <div className="card table-card">
                  <table className="vtable">
                    <thead>
                      <tr>
                        <th scope="col">Post</th>
                        <th scope="col">Platform</th>
                        <th scope="col">Views</th>
                        <th scope="col">Watched</th>
                        <th scope="col">How it was edited</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.posts.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div className="c-video">
                              <div className={`vt-thumb ${p.landscape ? 'land' : 'port'}`} style={grad(p.poster)} aria-hidden="true" />
                              {p.projectId ? (
                                <Link to={`/videos/${p.projectId}`} className="vt-link">{p.title}</Link>
                              ) : (
                                <strong>{p.title}</strong>
                              )}
                            </div>
                          </td>
                          <td data-label="Platform"><PlatformBadge channel={p.channel}/></td>
                          <td className="c-length" data-label="Views">{p.views.toLocaleString('en-US')}</td>
                          <td className="c-length" data-label="Watched">{p.watchedPercent}%</td>
                          <td data-label="How it was edited">
                            <div className="mini-chips">
                              {p.edit.map((e) => (
                                <span key={e} className="mini">{e}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="small muted analytics-note">
                  Because we made the edit, we know how each post was cut and can compare. Every finding is labelled early,
                  never proven.
                </p>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
