// Any later step shows up here with no page changes: its tests write out/image-engine/results/<step>.json
// (see tests/image-engine/results.ts). Items get pictures, a checker result, notes and verdict boxes like everywhere else.
import { Pic, Section, VerdictBox, CheckLine, useResults, type RecordBase } from './common';

export interface StepManifest {
  file: string;
  /** For example "Step 5: Style system". */
  title: string;
  /** Sort key: bigger is newer. Defaults to the step number. */
  order?: number;
  intro?: string;
  groups: {
    title: string;
    note?: string;
    items: {
      id: string;
      title: string;
      images: { url: string; label?: string; full?: string; background?: 'checker' | 'dark' | 'light' | 'colour' }[];
      /** Omit when the item has no automatic check. */
      checker?: { pass: boolean; reasons: string[] };
      /** One-liners such as "model: x", "backend: webgpu", "total 420 ms". */
      facts?: string[];
      /** A label such as "TOY: plumbing test only" or "REAL". */
      tag?: string;
      /** Words for the verdict buttons, in place of good / meh / bad (for example matches, close, off, wrong). */
      verdictWords?: string[];
      error?: string;
    }[];
  }[];
}

export default function Generic({ manifest, lastRun, onRefresh, busy }: { manifest: StepManifest; lastRun: number; onRefresh: () => void; busy: boolean }) {
  const { records, setRecord } = useResults();
  const id = manifest.file.replace(/\.json$/, '');
  return (
    <Section id={id} title={manifest.title} intro={manifest.intro} lastRun={lastRun} onRefresh={onRefresh} busy={busy}>
      {manifest.groups.map((g) => (
        <div key={g.title} className="res-source">
          <h3 className="h3">{g.title}</h3>
          {g.note && <p className="small muted">{g.note}</p>}
          <div className="res-items">
            {g.items.map((it) => {
              const key = `${id}|${g.title}|${it.id}`;
              const failed = it.checker && !it.checker.pass ? it.checker.reasons.map((r, i) => ({ id: String(i), reason: r })) : [];
              const base: RecordBase = { key, step: id, kind: 'item', image: g.title, option: it.title, ...(it.checker ? { checker: { pass: it.checker.pass, failed } } : {}) };
              return (
                <div key={key} className="res-item">
                  <h4>{it.title} {it.tag && <span className={/TOY/.test(it.tag) ? 'chip chip-warn' : 'chip chip-tag'}>{it.tag}</span>}</h4>
                  <div className="res-row">
                    {it.images.map((im) => (
                      <figure key={im.url} className={`res-fig${im.background ? ' lab-tile bg-' + im.background : ''}`}>
                        <Pic src={im.url} full={im.full} alt={`${it.title}${im.label ? ', ' + im.label : ''}`} />
                        {im.label && <figcaption className="small">{im.label}</figcaption>}
                      </figure>
                    ))}
                  </div>
                  {it.facts && it.facts.length > 0 && <p className="small muted">{it.facts.join(' · ')}</p>}
                  {it.error && <p className="lab-err" role="alert">{it.error}</p>}
                  {it.checker && <CheckLine failed={failed} />}
                  <VerdictBox label={`${it.title} (${g.title})`} rec={records[key]} onChange={(v, r) => setRecord(base, v, r)} {...(it.verdictWords ? { options: it.verdictWords.map((w) => ({ value: w, label: w })) } : {})} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </Section>
  );
}
