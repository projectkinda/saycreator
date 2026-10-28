// "Latest run": the last long jobs this browser ran, as the Live view saved them: the stage times, the share of the total, and every round with
// its numbers. The reference pictures are never saved, so only our own pictures are shown.
import { useEffect, useState } from 'react';
import { JOB_LABEL, loadSaved, timingTable, type Job } from '../../live/jobs';

export default function LatestRun() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  useEffect(() => {
    void loadSaved().then(setJobs);
  }, []);
  if (jobs === null) return null;
  if (jobs.length === 0) return <p className="small muted" role="status">Latest run: no job has been run in this browser yet. Run one (Images, Styles, New style from references) and its stage times and rounds appear here.</p>;
  return (
    <section aria-label="Latest run" className="res-source">
      <h3 className="h3">Latest run (kept in this browser)</h3>
      {jobs.slice(0, 3).map((j) => (
        <article key={j.id} className="card" aria-label={`${JOB_LABEL[j.kind]}, ${new Date(j.startedAt).toLocaleString()}`} style={{ padding: 12, marginBottom: 8 }}>
          <p className="small"><b>{JOB_LABEL[j.kind]}</b>: {j.title}. {j.status}, {Math.round((((j.endedAt ?? j.startedAt) - j.startedAt) / 1000) * 10) / 10} s{j.cached ? ', read from cache' : ''}.</p>
          <table className="small">
            <thead><tr><th>Stage</th><th>Seconds</th><th>Share</th></tr></thead>
            <tbody>{timingTable(j).map((r) => <tr key={r.stage}><td>{r.stage}</td><td>{r.seconds}</td><td>{r.share}%</td></tr>)}</tbody>
          </table>
          {j.rounds.length > 0 && (
            <ul className="lv-rounds" aria-label="Rounds of this run">
              {j.rounds.map((r) => (
                <li key={`${r.n}-${r.draft ? 'd' : 'r'}`} className="lv-thumb">
                  <img src={r.thumb} alt={`${r.draft ? 'Quick draft' : r.label}${r.kept ? ' (kept)' : ''}`} />
                  <span className="small">{r.draft ? 'Draft' : r.n === 0 ? 'First' : `Round ${r.n}`}{r.kept ? ' ✓' : ''}: {r.measuredPct}%{r.readerScore !== null ? ` / ${Math.round(r.readerScore)}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </section>
  );
}
