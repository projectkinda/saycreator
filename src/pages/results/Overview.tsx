// Overview: one small card per area (status, one sentence, how many items wait for a verdict) and a progress bar over everything.
import { AREA_STATUS, StatusChip } from './labui';
import { useLab, type View } from './labdata';

export interface Counts {
  [area: string]: { waiting: number; total: number };
}

export default function Overview({ counts }: { counts: Counts }) {
  const { go } = useLab();
  const all = Object.values(counts).reduce((a, c) => ({ waiting: a.waiting + c.waiting, total: a.total + c.total }), { waiting: 0, total: 0 });
  const rated = all.total - all.waiting;
  const pct = all.total ? Math.round((rated / all.total) * 100) : 0;
  return (
    <div>
      <div className="card res-progress">
        <p><b>{rated} of {all.total} items rated</b> <span className="muted">({pct}%)</span></p>
        <div className="res-bar-track" role="progressbar" aria-label="Items rated" aria-valuemin={0} aria-valuemax={all.total} aria-valuenow={rated}>
          <div className="res-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="res-areas">
        {Object.entries(AREA_STATUS).map(([area, a]) => {
          const c = counts[area] ?? { waiting: 0, total: 0 };
          return (
            <article key={area} className="card res-area" aria-label={a.title}>
              <header>
                <h3 className="h3">{a.title}</h3>
                <StatusChip status={a.status} />
              </header>
              <p className="small">{a.sentence}</p>
              <p className="small"><b>{c.waiting}</b> {c.waiting === 1 ? 'item' : 'items'} waiting for your verdict{c.total ? ` (of ${c.total})` : ''}</p>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => go(a.view as View)} aria-label={`Open ${a.title}`}>Open</button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
