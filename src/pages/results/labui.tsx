// Small parts used by every view of the Results screen: the two-line guide box, status chips, the label chips.
import type { ReactNode } from 'react';

export type Status = 'working' | 'partly' | 'blocked';
export const STATUS_TEXT: Record<Status, string> = { working: 'Working', partly: 'Partly working', blocked: 'Blocked' };

export function StatusChip({ status }: { status: Status }) {
  return <span className={`chip ${status === 'working' ? 'chip-ok' : status === 'partly' ? 'chip-warn' : 'chip-error'}`}>{STATUS_TEXT[status]}</span>;
}

/** The kind of material a picture is made from, as a clear chip. */
export function LabelChip({ tag }: { tag?: string }) {
  if (!tag) return null;
  const warn = /TEST ASSETS|TOY|SYNTHETIC|NO PHOTOS/i.test(tag);
  return <span className={warn ? 'chip chip-warn' : 'chip chip-tag'}>{tag}</span>;
}

const when = (ms: number) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/** One part of the screen: its heading, "latest run", and the two-line guide ("What you're looking at" / "What to do here"). */
export function ViewFrame({ id, title, looking, todo, latest, count, children }: { id: string; title: string; looking: ReactNode; todo: ReactNode; latest?: number | null; count?: { waiting: number; total: number }; children: ReactNode }) {
  return (
    <section id={`view-${id}`} className="res-view" aria-labelledby={`view-${id}-h`}>
      <header className="res-view-head">
        <h2 id={`view-${id}-h`} className="h2">{title}</h2>
        <p className="small muted res-view-meta">
          {latest ? `Latest run ${when(latest)}` : 'Latest run: not recorded'}
          {count && count.total > 0 ? ` · ${count.waiting} of ${count.total} waiting for your verdict` : ''}
        </p>
      </header>
      <div className="res-guide" role="note">
        <p><b>What you&apos;re looking at.</b> {looking}</p>
        <p><b>What to do here.</b> {todo}</p>
      </div>
      {children}
    </section>
  );
}

/** Status and one plain sentence for each area, written by hand. Change them when the work changes. */
export const AREA_STATUS: Record<string, { title: string; status: Status; sentence: string; view: string }> = {
  styles: { title: 'Carousel styles', status: 'working', sentence: 'Seven styles draw seven-slide decks from a script, and every slide passes the phone-size checks.', view: 'styles' },
  photo: { title: 'Photo tools', status: 'partly', sentence: 'Treatments, shapes, frames, glass and the photo styles work in the engine. Not in the app yet, and nothing is cut out of a photo.', view: 'photo' },
  thumbnails: { title: 'Thumbnails (v2)', status: 'partly', sentence: 'Thumbnails in six styles, with a subject pointer, twelve phone-size checks and written titles. Made from still photos only, with no reference thumbnails to compare against.', view: 'thumbnails' },
  cutouts: { title: 'Cutouts', status: 'blocked', sentence: 'No real background-removal model has produced a cutout on this computer, so cutouts are parked.', view: 'cutouts' },
  elements: { title: 'Element library', status: 'working', sentence: 'Icons, objects and doodles are placed in free space and follow what each slide says.', view: 'elements' },
  checks: { title: 'Checks and tests', status: 'working', sentence: 'Older results and technical details are kept here, closed by default.', view: 'checks' },
};
