// Photo tools: the treatment gallery (one test photo under every treatment, shape, frame, background and object effect), grouped.
import { AreaContext, Pic, VerdictBox, useResults, type RecordBase } from './common';
import { LabelChip } from './labui';
import { useLab } from './labdata';

const GROUPS: { title: string; blurb: string; from: string[] }[] = [
  { title: 'Treatments', blurb: 'What can be done to the colours and sharpness of a photo.', from: ['Gallery: treatments'] },
  { title: 'Shapes and frames', blurb: 'A photo cut to a shape, or set inside a phone, laptop, polaroid, ticket, strip or colour block.', from: ['Gallery: masks', 'Gallery: frames'] },
  { title: 'Backgrounds', blurb: 'Soft colour fields, a glow, and glass cards that blur what is behind them.', from: ['Gallery: backgrounds'] },
  { title: 'Objects', blurb: 'A transparent object with a shadow, reflection or glow. The object here is a stand-in drawn in code, not a real cutout.', from: ['Objects (stand-in, not a real cutout)'] },
  { title: 'Findings and weak points', blurb: 'What the photo work cannot do yet, and what it needs from you.', from: ['Findings and weak points'] },
];

export default function PhotoTools() {
  const { manifests } = useLab();
  const { records, setRecord } = useResults();
  const m = manifests.find((x) => x.file === 'step11.json');
  if (!m) return <p className="small muted" role="status">No photo results yet. Run the photo tests (<code>npm run test:image</code>) to make them.</p>;
  return (
    <AreaContext.Provider value="photo">
      {GROUPS.map((grp) => {
        const parts = m.groups.filter((g) => grp.from.includes(g.title));
        const items = parts.flatMap((g) => g.items.map((it) => ({ g, it })));
        if (items.length === 0) return null;
        return (
          <div key={grp.title} className="res-source">
            <h3 className="h3">{grp.title}</h3>
            <p className="small muted">{grp.blurb}</p>
            <div className="res-gallery">
              {items.map(({ g, it }) => {
                // Same key as before the screen was reorganised, so earlier verdicts are still there.
                const key = `step11|${g.title}|${it.id}`;
                const base: RecordBase = { key, step: 'step11', kind: 'item', image: g.title, option: it.title };
                const im = it.images[0];
                return (
                  <figure key={key} className="res-gal-card">
                    {im && <Pic src={im.url} alt={it.title} />}
                    <figcaption>
                      <p className="small"><b>{it.title}</b> <LabelChip tag={it.tag} /></p>
                      {it.facts?.[0] && <p className="small muted">{it.facts[0]}</p>}
                    </figcaption>
                    <VerdictBox label={`${it.title} (${grp.title})`} rec={records[key]} k={key} onChange={(v, r) => setRecord(base, v, r)} />
                  </figure>
                );
              })}
            </div>
          </div>
        );
      })}
    </AreaContext.Provider>
  );
}
