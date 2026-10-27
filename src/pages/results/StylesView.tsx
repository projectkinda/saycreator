// Styles: one card per stored style, with its reference deck beside a sample of ours and a verdict for the whole style.
import { Pic, VerdictBox, useResults, type RecordBase } from './common';
import { PHOTO_STYLE_REFS, PHOTO_STYLES, REF, VERDICT_WORDS, photoDecks, useLab, type RecSlide } from './labdata';

/** The three slides shown as the sample: first, middle, last of the first script. */
function sample(slides: RecSlide[], style: string): RecSlide[] {
  const mine = slides.filter((s) => s.style === style && s.script !== 'quote-cards');
  const script = mine.find((s) => s.script === 'howto-linkedin')?.script ?? mine[0]?.script;
  const deck = mine.filter((s) => s.script === script).sort((a, b) => a.index - b.index);
  return [deck[0], deck[Math.floor(deck.length / 2)], deck[deck.length - 1]].filter(Boolean);
}

export default function StylesView() {
  const { recreation, manifests, setSel, go } = useLab();
  const { records, setRecord } = useResults();
  if (!recreation) return <p role="status">Loading the styles…</p>;
  const { styles, slides, clusters } = recreation;
  return (
    <div className="res-style-grid">
      {styles.map((st) => {
        const key = `style|${st.name}`;
        const base: RecordBase = { key, step: 'styles', kind: 'style', image: st.name, option: st.title };
        const refs = PHOTO_STYLES.includes(st.name) ? PHOTO_STYLE_REFS[st.name] : clusters?.clusters.find((c) => c.id === st.basedOn.cluster)?.images ?? [];
        const mine = slides.filter((s) => s.style === st.name);
        const photo = PHOTO_STYLES.includes(st.name) ? photoDecks(manifests, st.name) : [];
        const failing = mine.filter((s) => !s.pass).length;
        const rated = mine.filter((s) => records[`style-recreation|${st.name}|${s.script}|${s.index}`]?.verdict).length;
        return (
          <article key={st.name} className="card res-style-card" aria-label={`Style ${st.title}`}>
            <header>
              <h3 className="h3">{st.title}</h3>
              <p className="small">{st.description ?? 'No description yet.'}</p>
              {photo.length > 0 && <span className="chip chip-tag">Uses photos</span>}
            </header>
            <div className="res-style-pair">
              <div>
                <p className="small muted">Reference deck (comparison only)</p>
                {refs[0] ? <Pic src={REF + encodeURIComponent(refs[0])} alt={`Reference deck for ${st.title}`} /> : <p className="small muted">No reference deck: this style was not made from one.</p>}
              </div>
              <div>
                <p className="small muted">Ours (sample slides)</p>
                <div className="res-style-sample">
                  {sample(slides, st.name).map((s) => <Pic key={s.pngUrl} src={s.pngUrl} alt={`${st.title}, slide ${s.index} (${s.type}) of ${s.scriptTitle}`} />)}
                </div>
              </div>
            </div>
            <p className="small muted">
              {mine.length} slides drawn, {failing === 0 ? 'all pass the phone-size checks' : `${failing} fail a phone-size check`} · {rated} rated
              {photo.length > 0 ? ` · plus ${photo.length} decks with test photos (TEST ASSETS)` : ''}
            </p>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setSel({ style: st.name, script: mine.find((s) => s.script === 'howto-linkedin')?.script ?? mine[0]?.script ?? '' }); go('slides'); }} aria-label={`Open the slides of ${st.title}`}>
              Open slides
            </button>
            <VerdictBox label={`${st.title} (the whole style)`} options={VERDICT_WORDS} rec={records[key]} onChange={(v, r) => setRecord(base, v, r)} k={key} />
          </article>
        );
      })}
    </div>
  );
}
