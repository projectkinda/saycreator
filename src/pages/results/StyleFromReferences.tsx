// Style from references: for each real run, every round with the reference on the left and our replica on the right, the closeness panel,
// the missing tools, the time taken, and verdict boxes (matches / close / off / wrong) with a one-line reason. Then the missing tools ranked.
import { AreaContext, Pic, VerdictBox, useResults, type RecordBase } from './common';
import { LabelChip } from './labui';
import { useLab, VERDICT_WORDS } from './labdata';

const STEP = 'style-from-references';

export default function StyleFromReferences() {
  const { manifests } = useLab();
  const { records, setRecord } = useResults();
  // Round 1 first, then round 2 (the same screen after the 14b changes), each with its own title.
  const ms = ['style-from-references.json', 'style-from-references-round2.json'].map((file) => manifests.find((x) => x.file === file)).filter((x): x is NonNullable<typeof x> => !!x);
  if (ms.length === 0) return <p className="small muted" role="status">No results yet. Run the reference tests with the real reader (<code>REAL_REFERENCE=1 npm run test:image</code>) to make them.</p>;
  return (
    <AreaContext.Provider value="styles">
      {ms.map((m) => (
        <section key={m.file} aria-label={m.title}>
          <h2 className="h2">{m.title}</h2>
          {m.intro && <p className="small muted">{m.intro}</p>}
      {m.groups.map((g) => (
        <div key={g.title} className="res-source">
          <h3 className="h3">{g.title}</h3>
          {g.note && <p className="small muted">{g.note}</p>}
          <div className="res-gallery">
            {g.items.map((it) => {
              const step = m.file.includes('round2') ? `${STEP}-round2` : STEP;
              const key = `${step}|${g.title}|${it.id}`;
              const base: RecordBase = { key, step, kind: 'item', image: g.title, option: it.title };
              return (
                <figure key={key} className="res-gal-card">
                  {it.images.length > 0 && (
                    <div className="rf-pair-imgs">
                      {it.images.map((im) => (
                        <div key={im.url}>
                          <Pic src={im.url} alt={`${it.title}: ${im.label ?? ''}`} />
                          {im.label && <p className="small muted">{im.label}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  <figcaption>
                    <p className="small"><b>{it.title}</b> <LabelChip tag={it.tag} /></p>
                    {it.facts?.map((f) => (
                      <p key={f} className="small muted">{f}</p>
                    ))}
                  </figcaption>
                  {it.verdictWords ? <VerdictBox label={`${it.title} (${g.title})`} rec={records[key]} k={key} options={VERDICT_WORDS} onChange={(v, r) => setRecord(base, v, r)} /> : null}
                </figure>
              );
            })}
          </div>
        </div>
      ))}
        </section>
      ))}
    </AreaContext.Provider>
  );
}
