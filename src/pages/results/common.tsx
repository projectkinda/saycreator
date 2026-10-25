// Shared pieces of the Results screen (dev only): verdict boxes, section header with last run and refresh, full-size viewer.
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';

/** good / meh / bad for most items; other sections use their own words (right / partly right / wrong). */
export type Verdict = string;
export const GOOD_MEH_BAD: { value: string; label: string }[] = [{ value: 'good', label: 'good' }, { value: 'meh', label: 'meh' }, { value: 'bad', label: 'bad' }];
export interface Record_ {
  key: string;
  step: string;
  kind: string;
  image: string;
  option: string;
  verdict: Verdict | null;
  reason: string;
  checker?: { pass: boolean; failed: { id: string; reason: string }[] };
  timings?: Record<string, number | string | boolean>;
  updatedAt: string;
}
export type RecordBase = Omit<Record_, 'verdict' | 'reason' | 'updatedAt'>;
export interface State {
  records: Record<string, Record_>;
  picks: Record<string, string>;
}

export interface ResultsCtx {
  records: Record<string, Record_>;
  setRecord: (base: RecordBase, verdict: Verdict | null, reason: string) => void;
  /** Opens a picture full size. */
  view: (url: string, alt: string) => void;
  /** Sections hand extra facts to the exported JSON (machine, models, settings). */
  addExport: (key: string, value: unknown) => void;
}
export const ResultsContext = createContext<ResultsCtx | null>(null);
export const useResults = () => {
  const c = useContext(ResultsContext);
  if (!c) throw new Error('Results context is missing.');
  return c;
};

export const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
export const msText = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);
export const slug = (f: string) => f.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
export const testImageUrl = (name: string) => '/test-images/' + encodeURIComponent(name);

const when = (ms: number) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/** One step of the Results screen: heading, when it was last run, and a refresh button. */
export function Section({ id, title, intro, lastRun, onRefresh, busy, children }: { id: string; title: string; intro?: ReactNode; lastRun?: number | null; onRefresh: () => void; busy?: boolean; children: ReactNode }) {
  return (
    <section id={id} className="card res-section" aria-labelledby={`${id}-h`}>
      <header className="res-section-head">
        <h2 id={`${id}-h`} className="h3">{title}</h2>
        <div className="res-last">
          <span className="small muted" role="status">{busy ? 'Refreshing…' : lastRun ? `Last run ${when(lastRun)}` : 'Not run yet'}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={onRefresh} disabled={busy} aria-label={`Refresh ${title}`}>
            Refresh
          </button>
        </div>
      </header>
      {intro && <p className="small muted res-intro">{intro}</p>}
      {children}
    </section>
  );
}

export function VerdictBox({ rec, onChange, label, options = GOOD_MEH_BAD }: { rec: Record_ | undefined; onChange: (v: Verdict | null, reason: string) => void; label: string; options?: { value: string; label: string }[] }) {
  const v = rec?.verdict ?? null;
  return (
    <div className="lab-verdict" role="group" aria-label={`Verdict for ${label}`}>
      {options.map((o, i) => (
        <button key={o.value} type="button" className={`v-${['good', 'meh', 'bad', 'bad'][Math.min(i, 3)]}`} aria-pressed={v === o.value} onClick={() => onChange(v === o.value ? null : o.value, rec?.reason ?? '')}>
          {o.label}
        </button>
      ))}
      <input type="text" aria-label={`One-line reason for ${label}`} placeholder="why? (one line)" value={rec?.reason ?? ''} onChange={(e) => onChange(v, e.target.value)} />
    </div>
  );
}

/** PASS or FAIL pill with the plain-language reasons under it. */
export function CheckLine({ failed, passText = 'PASS' }: { failed: { id: string; reason: string }[]; passText?: string }) {
  return (
    <>
      <span className={failed.length ? 'chip chip-error' : 'chip chip-ok'}>{failed.length ? `FAIL (${failed.length})` : passText}</span>
      {failed.length > 0 && (
        <ul className="lab-fails">
          {failed.map((f) => (
            <li key={f.id}>{f.reason}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/** A picture that opens full size on click. */
export function Pic({ src, alt, full, className }: { src: string; alt: string; full?: string; className?: string }) {
  const { view } = useResults();
  return (
    <button type="button" className={`res-pic${className ? ' ' + className : ''}`} onClick={() => view(full ?? src, alt)} aria-label={`Open ${alt} full size`}>
      <img src={src} alt={alt} loading="lazy" />
    </button>
  );
}

/** The full size viewer: a native dialog, closes with Escape or the button. */
export function Viewer({ shown, onClose }: { shown: { url: string; alt: string } | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (shown && !d.open) d.showModal();
    if (!shown && d.open) d.close();
  }, [shown]);
  return (
    <dialog ref={ref} className="res-viewer" onClose={onClose} aria-label={shown?.alt ?? 'Picture'}>
      <button type="button" className="btn btn-dark btn-sm res-viewer-close" onClick={onClose}>
        <Icon name="close" size={16} /> Close
      </button>
      {shown && <img src={shown.url} alt={shown.alt} />}
    </dialog>
  );
}
