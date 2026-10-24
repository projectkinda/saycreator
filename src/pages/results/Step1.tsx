// Step 1: plan and patch proof. Shows the proof pictures the Step 1 tests wrote.
import { useCallback, useEffect, useState } from 'react';
import { CheckLine, Pic, Section, VerdictBox, useResults } from './common';

interface Data {
  files: string[];
  findings: { carouselSlideMs?: number; quoteCardMs?: number; patchCycle?: { undoIsByteIdentical: boolean; revisions: Record<string, number>; history?: { done?: { label: string }[] } } } | null;
}
const url = (f: string) => '/out/image-engine/' + f;

export default function Step1({ lastRun, refreshKey, onRefreshed }: { lastRun: number; refreshKey: number; onRefreshed: () => void }) {
  const { records, setRecord } = useResults();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    setBusy(true);
    fetch('/__lab/step1').then((r) => r.json()).then(setData).catch(() => setData({ files: [], findings: null })).finally(() => { setBusy(false); onRefreshed(); });
  }, [onRefreshed]);
  useEffect(refresh, [refresh, refreshKey]);

  const has = (f: string) => data?.files.includes(f);
  const item = (key: string, title: string, note: string, files: [string, string][], timing?: number) => {
    const present = files.filter(([f]) => has(f));
    const base = { key: `step1|${key}`, step: 'step1', kind: 'proof', image: title, option: key, ...(timing ? { timings: { drawMs: timing } } : {}), checker: { pass: present.length === files.length, failed: present.length === files.length ? [] : [{ id: 'missing', reason: 'Some proof pictures are missing. Run the tests again.' }] } };
    return (
      <div className={"res-item" + (present.length > 2 ? " res-wide" : "")} key={key}>
        <h3 className="h3">{title}</h3>
        <p className="small muted">{note}</p>
        <div className="res-row">
          {present.map(([f, label]) => (
            <figure key={f} className="res-fig">
              <Pic src={url(f)} alt={`${title}: ${label}`} />
              <figcaption className="small">{label}</figcaption>
            </figure>
          ))}
        </div>
        <CheckLine failed={base.checker.failed} passText="Drawn" />
        <VerdictBox label={title} rec={records[base.key]} onChange={(v, r) => setRecord(base, v, r)} />
      </div>
    );
  };

  const pc = data?.findings?.patchCycle;
  return (
    <Section id="step1" title="Step 1: Plan and patch proof" lastRun={lastRun} onRefresh={refresh} busy={busy} intro="A slide and a quote card drawn from plans (a synthetic drawing, not a photo), and an edit made by a patch, undone and redone.">
      {data === null && <p role="status">Loading…</p>}
      {data && data.files.length === 0 && <p className="lab-err">No Step 1 pictures found. Run <code>npm run test:image</code>.</p>}
      {data && (
        <div className="res-items">
          {item('carousel-slide', 'Carousel slide proof', `Drawn from a plan${data.findings?.carouselSlideMs ? ` in ${data.findings.carouselSlideMs} ms` : ''}.`, [['step1-carousel-slide.png', 'full size'], ['step1-carousel-slide-quarter-size.png', 'quarter size']], data.findings?.carouselSlideMs)}
          {item('quote-card', 'Quote card proof', `Drawn from a plan${data.findings?.quoteCardMs ? ` in ${data.findings.quoteCardMs} ms` : ''}.`, [['step1-quote-card.png', 'quote card']], data.findings?.quoteCardMs)}
          {item('highlight', 'Highlighted word check', 'A word with a background behind it, to check the box sits on the right letters.', [['step1-highlight-check.png', 'highlight']])}
          {item(
            'patch-test',
            'Patch test: before, after, undone',
            pc ? `The change "${pc.history?.done?.[0]?.label ?? 'edit'}". Undo gives back the same pixels: ${pc.undoIsByteIdentical ? 'yes' : 'NO'}. Revisions ${Object.entries(pc.revisions).map(([k, v]) => `${k} ${v}`).join(', ')}.` : 'A change, then undo, then redo.',
            [['step1-patch-before.png', 'before'], ['step1-patch-after.png', 'after'], ['step1-patch-undone.png', 'undone'], ['step1-patch-redone.png', 'redone']],
          )}
          {item('after-drag', 'Drag proposal', 'A real mouse drag on the editable canvas, turned into a patch proposal.', [['step1-after-drag.png', 'after the drag']])}
        </div>
      )}
    </Section>
  );
}
