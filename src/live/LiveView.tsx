// The Live view: a panel that opens by itself when a long job starts (style from references, one-shot carousel, thumbnail). It lists the stages
// with a status and the seconds each took, shows the reference beside the latest replica, keeps earlier rounds as small pictures to click, and says
// in plain words what the reader decided (marking what the code measured and what the model said).
import { useEffect, useState } from 'react';
import { cancelJob, JOB_LABEL, timingTable, useJob, type Decision, type Job, type Stage } from './jobs';
import '../styles/live.css';

const WORD: Record<Stage['status'], string> = { waiting: 'waiting', running: 'running', done: 'done', skipped: 'skipped', failed: 'failed' };
const SRC_TIP: Record<Decision['source'], string> = { MEASURED: 'measured by the code from the picture', READER: 'said by the model that looked at the picture', CLAMPED: 'moved to what the toolbox supports', REJECTED: 'turned down' };

export const clock = (ms: number) => `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;

export function StageList({ job, now }: { job: Job; now: number }) {
  return (
    <ol className="lv-stages" aria-label="Stages">
      {job.stages.map((s) => {
        const secs = s.status === 'running' && s.startedAt ? clock(now - s.startedAt) : s.seconds !== undefined ? `${s.seconds} s` : '';
        return (
          <li key={s.id} className={`lv-stage lv-${s.status}`} data-status={s.status} aria-label={`${s.label}: ${WORD[s.status]}${secs ? `, ${secs}` : ''}`}>
            <span className="lv-dot" aria-hidden="true" />
            <span className="lv-name">{s.label}</span>
            <span className="lv-state">{WORD[s.status]}</span>
            <span className="lv-secs">{secs}</span>
            {s.note && <span className="lv-note small muted">{s.note}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function DecisionList({ list }: { list: Decision[] }) {
  if (list.length === 0) return <p className="small muted">No changes asked for in this round.</p>;
  return (
    <ul className="lv-decisions" aria-label="What the reader decided">
      {list.map((d, i) => (
        <li key={i} className="small">
          <span className={`lv-src lv-src-${d.source.toLowerCase()}`} title={SRC_TIP[d.source]}>{d.source}</span> {d.text}
          {d.why && <span className="muted"> ({d.why})</span>}
        </li>
      ))}
    </ul>
  );
}

export default function LiveView() {
  const job = useJob();
  const [closed, setClosed] = useState<string | null>(null);
  /** A finished job shrinks to a small bar so it does not sit over the page; the person opens it again to look. */
  const [open, setOpen] = useState<string | null>(null);
  const [pickRound, setPickRound] = useState<number | null>(null);
  const [pickRef, setPickRef] = useState(0);
  const [now, setNow] = useState(Date.now());
  const running = job?.status === 'running';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);
  // A new job opens the panel again and follows the newest round.
  useEffect(() => setPickRound(null), [job?.id, job?.rounds.length]);
  if (!job || closed === job.id) return null;
  // A thumbnail redraws on every edit: its panel appears only when it takes long enough to notice.
  if (job.kind === 'thumbnail' && (job.endedAt ?? now) - job.startedAt < 1500) return null;
  if (job.status !== 'running' && open !== job.id)
    return (
      <button type="button" className="lv-pill btn btn-outline btn-sm" aria-label="Open the Live view" data-status={job.status} onClick={() => setOpen(job.id)}>
        Live view: {JOB_LABEL[job.kind]} {job.status}, {clock((job.endedAt ?? now) - job.startedAt)}
      </button>
    );
  const shown = pickRound !== null ? job.rounds[pickRound] : job.rounds[job.rounds.length - 1];
  const ref = job.references[Math.min(pickRef, Math.max(0, job.references.length - 1))];
  const total = (job.endedAt ?? now) - job.startedAt;
  return (
    <aside className="lv" aria-label="Live view" data-job={job.kind} data-status={job.status}>
      <header className="lv-head">
        <h2 className="h4">Live view: {JOB_LABEL[job.kind]}</h2>
        <span className={`chip ${job.status === 'running' ? '' : job.status === 'done' ? 'chip-ok' : 'chip-warn'}`} role="status">{job.status === 'running' ? `running, ${clock(total)}` : `${job.status}, ${clock(total)}`}</span>
        {running && <button type="button" className="btn btn-outline btn-sm" onClick={cancelJob}>Cancel</button>}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => (running ? setClosed(job.id) : setOpen(null))} aria-label="Close the Live view">Close</button>
      </header>
      <p className="small muted">{job.title}{job.cached ? ' · from cache' : ''}</p>
      {job.note && <p className="small muted">{job.note}</p>}
      {job.waiting && running && <p className="small lv-wait" role="status">Waiting on {job.waiting.label}, {clock(now - job.waiting.since)}</p>}
      {job.message && <p className="small cr-warn" role="status">{job.message}</p>}
      <StageList job={job} now={now} />
      {(shown || ref) && (
        <div className="lv-pic">
          {ref?.url && (
            <figure>
              <img src={ref.url} alt={`Reference: ${ref.name}`} />
              <figcaption className="small muted">Reference{job.references.length > 1 ? ` ${Math.min(pickRef, job.references.length - 1) + 1} of ${job.references.length}` : ''}</figcaption>
            </figure>
          )}
          {shown && (
            <figure>
              <img src={shown.big[Math.min(pickRef, Math.max(0, shown.big.length - 1))] ?? shown.thumb} alt={`Our version: ${shown.label}`} />
              <figcaption className="small muted">{shown.draft ? 'Quick draft, from the measured numbers only' : shown.label}{shown.kept ? ' · kept' : ''}</figcaption>
            </figure>
          )}
        </div>
      )}
      {job.references.length > 1 && (
        <div className="lv-refs" role="group" aria-label="Which reference to compare">
          {job.references.map((r, i) => (
            <button key={r.name + i} type="button" className="btn btn-outline btn-sm" aria-pressed={i === pickRef} onClick={() => setPickRef(i)}>{i + 1}</button>
          ))}
        </div>
      )}
      {job.rounds.length > 0 && (
        <ul className="lv-rounds" aria-label="Earlier pictures">
          {job.rounds.map((r, i) => (
            <li key={`${r.n}-${r.draft ? 'd' : 'r'}`}>
              <button type="button" className="lv-thumb" aria-pressed={shown === r} aria-label={`${r.draft ? 'Quick draft' : r.label}${r.kept ? ' (kept)' : ''}: measured ${r.measuredPct}%`} onClick={() => setPickRound(i)}>
                <img src={r.thumb} alt="" />
                <span className="small">{r.draft ? 'Draft' : r.n === 0 ? 'First' : `Round ${r.n}`}{r.kept ? ' ✓' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown && (
        <>
          <p className="small"><b>{shown.draft ? 'Quick draft' : shown.label}</b>: measured {shown.measuredPct}%{shown.readerScore !== null ? `, the reader scores it ${Math.round(shown.readerScore)}/100` : ''}.</p>
          <DecisionList list={shown.decisions} />
        </>
      )}
      {job.status !== 'running' && (
        <details className="lv-table">
          <summary className="small">Where the time went</summary>
          <table className="small">
            <thead><tr><th>Stage</th><th>Seconds</th><th>Share</th></tr></thead>
            <tbody>{timingTable(job).map((r) => <tr key={r.stage}><td>{r.stage}</td><td>{r.seconds}</td><td>{r.share}%</td></tr>)}</tbody>
          </table>
        </details>
      )}
    </aside>
  );
}
