import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import {
  addDays,
  addMonths,
  dayLabel,
  dayMonth,
  endOfMonth,
  mondayOnOrBefore,
  monthTitle,
  parseDay,
  startOfMonth,
  today,
} from '../dates';
import * as engine from '../engine';
import { grad } from '../format';
import { useDocumentTitle } from '../useDocumentTitle';

type Selected = { kind: 'entry' | 'item'; id: string } | null;

const STATUS: Record<engine.CalendarStatus, { cls: string; text: string }> = {
  ready: { cls: 'chip chip-ok', text: 'Ready' },
  'needs-thumbnail': { cls: 'chip chip-warn', text: 'Needs thumbnail' },
  'render-retry': { cls: 'chip chip-error', text: 'Render retry' },
  suggestion: { cls: 'chip', text: 'Suggestion' },
  posted: { cls: 'chip', text: 'Posted' },
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function Slot({
  entry,
  selected,
  onSelect,
  compact,
}: {
  entry: engine.CalendarEntry;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  const st = STATUS[entry.status];
  return (
    <button
      type="button"
      className={`slot${entry.status === 'suggestion' ? ' is-suggestion' : ''}${selected ? ' is-selected' : ''}${compact ? ' is-compact' : ''}`}
      aria-pressed={selected}
      draggable={!compact}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', `entry:${entry.id}`)}
      onClick={onSelect}
    >
      <span className="chip chip-tag">{entry.channel}</span>
      <span className="slot-title">{entry.title}</span>
      {!compact && <span className={`${st.cls} slot-status`}>{st.text}</span>}
    </button>
  );
}

export default function Calendar() {
  useDocumentTitle('Calendar');
  const { brand } = useApp();
  const brandId = brand?.id;
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'month' ? 'month' : 'week';

  const [anchor, setAnchor] = useState(today());
  const [data, setData] = useState<engine.CalendarData | null>(null);
  const [failed, setFailed] = useState(false);
  const [goal, setGoal] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [selected, setSelected] = useState<Selected>(null);
  const [pickDay, setPickDay] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === 'week') return { from: anchor, to: addDays(anchor, 6) };
    const first = startOfMonth(anchor);
    const gridStart = mondayOnOrBefore(first);
    const last = endOfMonth(anchor);
    return { from: gridStart, to: addDays(mondayOnOrBefore(last), 6) };
  }, [view, anchor]);

  const load = useCallback(() => {
    if (!brandId) return Promise.resolve();
    setFailed(false);
    return engine
      .getCalendar(brandId, range.from, range.to)
      .then((d) => {
        setData(d);
        setGoal((g) => g ?? d.goal);
      })
      .catch(() => setFailed(true));
  }, [brandId, range.from, range.to]);
  useEffect(() => {
    load();
  }, [load]);

  const entries = data?.entries ?? [];
  const byDate = useMemo(() => {
    const m = new Map<string, engine.CalendarEntry[]>();
    for (const e of entries) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [entries]);

  const entry = selected?.kind === 'entry' ? entries.find((e) => e.id === selected.id) : undefined;
  const item = selected?.kind === 'item' ? data?.unscheduled.find((u) => u.id === selected.id) : undefined;

  // Keep the day picker pointing at something sensible whenever the selection changes.
  useEffect(() => {
    setCopied(null);
    setPickDay(entry ? entry.date : today());
  }, [entry?.id, entry?.date, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dayOptions = useMemo(() => Array.from({ length: 28 }, (_, i) => addDays(today(), i)), []);

  /** Runs one engine change, reloads, and reports problems in plain words. */
  const act = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await load();
      if (done) setInfo(done);
    } catch (e) {
      setError((e as Error).message || 'That did not work. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  const plan = async () => {
    if (!brandId || !goal?.trim()) return;
    setPlanning(true);
    setError('');
    try {
      const added = await engine.planForGoal(brandId, goal);
      await load();
      setInfo(
        added.length
          ? `Added ${added.length} ${added.length === 1 ? 'suggestion' : 'suggestions'} to your calendar. Nothing is posted until you do it.`
          : 'Your next two weeks are already full, so there was nothing to add.',
      );
    } catch (e) {
      setError((e as Error).message || 'We could not plan that. Nothing was changed.');
    } finally {
      setPlanning(false);
    }
  };

  const drop = (e: DragEvent, date: string) => {
    e.preventDefault();
    setDragOver(null);
    const [type, id] = e.dataTransfer.getData('text/plain').split(':');
    if (!brandId || !id) return;
    if (type === 'entry') act(() => engine.moveEntry(brandId, id, date), `Moved to ${dayLabel(date)}`);
    if (type === 'item') act(() => engine.scheduleItem(brandId, id, date), `Scheduled on ${dayLabel(date)}`);
  };

  const step = (dir: -1 | 1) => setAnchor((a) => (view === 'week' ? addDays(a, dir * 7) : addMonths(a, dir)));
  const heading = view === 'week' ? `Week of ${dayMonth(anchor)}` : monthTitle(anchor);
  const isThisPeriod = view === 'week' ? anchor === today() : startOfMonth(anchor) === startOfMonth(today());

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(anchor, i));
  const monthDays: string[] = [];
  if (view === 'month') for (let d = range.from; d <= range.to; d = addDays(d, 1)) monthDays.push(d);

  const dayOpts = (
    <select className="plain-select" value={pickDay} onChange={(e) => setPickDay(e.target.value)} aria-label="Day">
      {dayOptions.map((d) => (
        <option key={d} value={d}>{d === today() ? `${dayLabel(d)} (today)` : dayLabel(d)}</option>
      ))}
    </select>
  );

  return (
    <div className="page page-tight">
      <header className="page-header">
        <div className="page-header-text cal-title">
          <h1 className="page-title">Calendar</h1>
          <span className="chip">Planning only</span>
        </div>
        <div className="seg seg-2" role="group" aria-label="Calendar view">
          {(['week', 'month'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setParams(v === 'week' ? {} : { view: v }, { replace: true })}
            >
              {v === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </header>

      <section className="card ws-card" aria-labelledby="goal-h">
        <h2 id="goal-h" className="visually-hidden">Plan your calendar</h2>
        <div className="goalbox">
          <label className="field goal-field">
            <span className="field-label">Your goal</span>
            <input
              type="text"
              className="text-input"
              value={goal ?? ''}
              placeholder="For example: get 20 demo requests in the next 2 weeks"
              onChange={(e) => setGoal(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn-primary btn-lg" disabled={planning || !goal?.trim()} onClick={plan}>
            {planning ? 'Planning…' : 'Plan it for me'}
          </button>
        </div>
        <p className="small muted">
          We fill in the calendar from your videos and this goal. You drag things around, accept or remove suggestions,
          then post each one yourself.
        </p>
      </section>

      <p className="visually-hidden" role="status" aria-live="polite">{info}</p>
      {info && <div className="notice notice-ok" role="presentation"><span>{info}</span></div>}
      {error && (
        <div className="notice notice-error" role="alert">
          <strong>That did not work</strong>
          <span>{error}</span>
        </div>
      )}
      {failed && (
        <div className="card empty" role="alert">
          <strong>We could not load your calendar.</strong>
          <span className="muted">Nothing was lost. Check your connection and try again.</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => load()}>Try again</button>
        </div>
      )}

      <div className="cal-bar">
        <strong className="h4">{heading}</strong>
        <div className="grow" />
        {!isThisPeriod && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setAnchor(today())}>Today</button>
        )}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => step(-1)}>‹ Previous</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => step(1)}>Next ›</button>
      </div>

      <div className="cwrap">
        <div className="cal-main">
          {!data && !failed && <p className="muted" role="status">Loading your calendar…</p>}

          {data && view === 'week' && (
            <div className="week">
              {weekDays.map((d) => {
                const list = byDate.get(d) ?? [];
                return (
                  <section
                    key={d}
                    aria-label={dayLabel(d)}
                    className={`wcol${d === today() ? ' is-today' : ''}${dragOver === d ? ' is-over' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(d);
                    }}
                    onDragLeave={() => setDragOver((o) => (o === d ? null : o))}
                    onDrop={(e) => drop(e, d)}
                  >
                    <h3 className="wday">{dayLabel(d)}{d === today() ? ' · Today' : ''}</h3>
                    {list.length === 0 && <span className="small muted wempty">Nothing planned</span>}
                    {list.map((e) => (
                      <Slot
                        key={e.id}
                        entry={e}
                        selected={selected?.kind === 'entry' && selected.id === e.id}
                        onSelect={() => setSelected({ kind: 'entry', id: e.id })}
                      />
                    ))}
                  </section>
                );
              })}
            </div>
          )}

          {data && view === 'month' && (
            <div className="month">
              <div className="mhead" aria-hidden="true">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>
              <div className="mgrid">
                {monthDays.map((d) => {
                  const list = byDate.get(d) ?? [];
                  const inMonth = d.slice(0, 7) === startOfMonth(anchor).slice(0, 7);
                  return (
                    <div key={d} className={`mcell${inMonth ? '' : ' is-out'}${d === today() ? ' is-today' : ''}`}>
                      <button
                        type="button"
                        className="mnum"
                        aria-label={`${dayLabel(d)}, ${list.length} ${list.length === 1 ? 'post' : 'posts'}. Open this week`}
                        onClick={() => {
                          setAnchor(d);
                          setParams({}, { replace: true });
                        }}
                      >
                        {parseDay(d).getDate()}
                        {list.length > 0 && <span className="mcount">{list.length}</span>}
                      </button>
                      <div className="mslots">
                        {list.map((e) => (
                          <Slot
                            key={e.id}
                            entry={e}
                            compact
                            selected={selected?.kind === 'entry' && selected.id === e.id}
                            onSelect={() => setSelected({ kind: 'entry', id: e.id })}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {data && (
            <section className="card ws-card" aria-labelledby="unsched-h">
              <h2 id="unsched-h" className="h4">Not scheduled yet</h2>
              {data.unscheduled.length === 0 ? (
                <p className="small muted">
                  Everything you have made has a day. New articles, quote cards and clips will wait here until you place them.
                </p>
              ) : (
                <>
                  <div className="chip-group">
                    {data.unscheduled.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="chip-btn plain"
                        aria-pressed={selected?.kind === 'item' && selected.id === u.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', `item:${u.id}`)}
                        onClick={() => setSelected({ kind: 'item', id: u.id })}
                      >
                        {u.label}
                      </button>
                    ))}
                  </div>
                  <p className="small muted">Drag these onto a day, or tap one and pick a day.</p>
                </>
              )}
            </section>
          )}
        </div>

        <aside className="card ws-card slot-panel" aria-label="Selected post" aria-live="polite">
          {!entry && !item && (
            <>
              <strong>Nothing selected</strong>
              <p className="small muted">
                Tap a post on the calendar to see its text and cover, copy it, move it or mark it as posted. Tap something
                under "Not scheduled yet" to give it a day.
              </p>
            </>
          )}

          {item && (
            <>
              <span className="label">Not scheduled</span>
              <strong>{item.label}</strong>
              <div className="img-tags"><span className="chip chip-tag">{item.channel}</span></div>
              {item.text && <p className="small slot-text">{item.text}</p>}
              <label className="field">
                <span className="field-label">Pick a day</span>
                {dayOpts}
              </label>
              <div>
                <button
                  type="button"
                  className="btn btn-dark btn-sm"
                  disabled={busy}
                  onClick={() =>
                    brandId &&
                    act(async () => {
                      await engine.scheduleItem(brandId, item.id, pickDay);
                      setSelected(null);
                    }, `Scheduled on ${dayLabel(pickDay)}`)
                  }
                >
                  {busy ? 'Scheduling…' : 'Schedule'}
                </button>
              </div>
            </>
          )}

          {entry && (
            <>
              <span className="label">Selected</span>
              <strong>{entry.title}</strong>
              <div className="img-tags">
                <span className="chip chip-tag">{entry.channel}</span>
                <span className="mini">{dayLabel(entry.date)} · {entry.time}</span>
                <span className={STATUS[entry.status].cls}>{STATUS[entry.status].text}</span>
              </div>

              {entry.image ? (
                <div className="slot-img" style={grad(entry.image, 135)} role="img" aria-label={entry.imageLabel ?? 'Cover image'}>
                  {entry.imageLabel && <span>{entry.imageLabel}</span>}
                </div>
              ) : (
                <div className="slot-img is-empty small muted">No cover image yet</div>
              )}
              {entry.text && <p className="small slot-text">{entry.text}</p>}

              {entry.status === 'needs-thumbnail' && entry.projectId && (
                <div><Link to={`/videos/${entry.projectId}`} className="btn btn-dark btn-sm">Choose a thumbnail</Link></div>
              )}
              {entry.status === 'render-retry' && entry.projectId && (
                <div><Link to={`/videos/${entry.projectId}`} className="btn btn-dark btn-sm">Open the video to retry</Link></div>
              )}
              {entry.status === 'suggestion' && brandId && (
                <div className="row-actions">
                  <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={() => act(() => engine.acceptSuggestion(brandId, entry.id), 'Suggestion accepted')}>
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        await engine.removeEntry(brandId, entry.id);
                        setSelected(null);
                      }, 'Suggestion removed')
                    }
                  >
                    Remove
                  </button>
                </div>
              )}
              <div className="row-actions">
                {entry.text && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={async () => {
                      setCopied((await copyText(entry.text!)) ? 'yes' : 'no');
                    }}
                  >
                    {copied === 'yes' ? 'Copied' : 'Copy text'}
                  </button>
                )}
                {entry.status === 'ready' && brandId && (
                  <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => act(() => engine.markPosted(brandId, entry.id), 'Marked as posted')}>
                    Mark as posted
                  </button>
                )}
              </div>
              {copied === 'no' && (
                <p className="small" role="alert">We could not copy it. Select the text above and copy it yourself.</p>
              )}
              {entry.status !== 'posted' && brandId && (
                <div className="move-row">
                  <label className="field">
                    <span className="field-label">Move to</span>
                    {dayOpts}
                  </label>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busy || pickDay === entry.date}
                    onClick={() => act(() => engine.moveEntry(brandId, entry.id, pickDay), `Moved to ${dayLabel(pickDay)}`)}
                  >
                    Move
                  </button>
                </div>
              )}
              <p className="small muted">We don't post for you yet. Copy it, then post from the app itself.</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
