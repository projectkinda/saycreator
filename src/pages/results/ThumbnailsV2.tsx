// Thumbnails (v2): for each style, every option the app makes from the test photos, drawn at full size, with the checker's result in plain
// words and a verdict box (matches / close / off / wrong) with a one-line reason. Plus the new checks shown failing, and the timings.
import { AreaContext, CheckLine, Pic, VerdictBox, useResults, type RecordBase } from './common';
import { LabelChip } from './labui';
import { useLab, VERDICT_WORDS } from './labdata';

const STEP = 'thumbs-v2';

export default function ThumbnailsV2() {
  const { manifests } = useLab();
  const { records, setRecord } = useResults();
  const m = manifests.find((x) => x.file === 'thumbs-v2.json');
  if (!m) return <p className="small muted" role="status">No thumbnail results yet. Run the thumbnail tests (<code>npm run test:image</code>) to make them.</p>;
  return (
    <AreaContext.Provider value="thumbnails">
      {m.intro && <p className="small muted">{m.intro}</p>}
      {m.groups.map((g) => (
        <div key={g.title} className="res-source">
          <h3 className="h3">{g.title}</h3>
          {g.note && <p className="small muted">{g.note}</p>}
          <div className="res-gallery">
            {g.items.map((it) => {
              // The same key every run, so a verdict stays with its picture.
              const key = `${STEP}|${g.title}|${it.id}`;
              const base: RecordBase = { key, step: STEP, kind: 'item', image: g.title, option: it.title };
              const im = it.images[0];
              const failed = (it.checker?.reasons ?? []).map((r, i) => ({ id: `${it.id}-${i}`, reason: r }));
              return (
                <figure key={key} className="res-gal-card">
                  {im && <Pic src={im.url} alt={it.title} />}
                  <figcaption>
                    <p className="small"><b>{it.title}</b> <LabelChip tag={it.tag} /></p>
                    {it.checker && <CheckLine failed={failed} passText="PASS (all 13 checks)" />}
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
    </AreaContext.Provider>
  );
}
