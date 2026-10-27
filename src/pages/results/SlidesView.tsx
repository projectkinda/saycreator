// Slides: pick a style and a script, see each slide as its own card with its phone-size check in plain words and a verdict box.
import { useEffect, useMemo } from 'react';
import { AreaContext, Pic, VerdictBox, useResults, type RecordBase } from './common';
import { LabelChip } from './labui';
import { PHOTO_STYLES, VERDICT_WORDS, parsePhotoSlides, photoDecks, useLab, type RecSlide } from './labdata';

function Check({ failed, total }: { failed: string[]; total?: number }) {
  return failed.length === 0 ? (
    <p className="small"><span className="chip chip-ok">PASS</span> {total ? `Passes all ${total} phone-size checks.` : 'Passes the phone-size checks.'}</p>
  ) : (
    <>
      <p className="small"><span className="chip chip-error">FAIL ({failed.length})</span> Does not pass at phone size:</p>
      <ul className="lab-fails">{failed.map((f, i) => <li key={i}>{f}</li>)}</ul>
    </>
  );
}

export default function SlidesView() {
  const { recreation, manifests, sel, setSel } = useLab();
  const { records, setRecord, register } = useResults();
  const styles = recreation?.styles ?? [];
  const slides = recreation?.slides ?? [];
  // Every slide of every style counts as waiting until it has a verdict, whichever one is on show.
  useEffect(() => {
    if (!register) return;
    for (const s of slides) register('styles', `style-recreation|${s.style}|${s.script}|${s.index}`);
    for (const st of PHOTO_STYLES)
      for (const d of photoDecks(manifests, st)) {
        register('photo', `step11|${d.groupTitle}|${d.item.id}`);
        for (const p of parsePhotoSlides(d.item)) register('photo', `slides|${st}|${d.deckId}|${p.n}`);
      }
  }, [slides, manifests, register]);
  const style = styles.find((s) => s.name === sel.style) ?? styles[0];
  const regular = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of slides) if (style && s.style === style.name) m.set(s.script, s.scriptTitle);
    return [...m.entries()].map(([id, title]) => ({ id, title, photo: false }));
  }, [slides, style]);
  const photos = style ? photoDecks(manifests, style.name) : [];
  const scripts = [...regular, ...photos.map((p) => ({ id: `photo:${p.deckId}`, title: p.deckId === 'no-photos' ? 'The same deck with no photos (placeholders)' : `${p.item.title.replace(/^[^:]*:\s*/, '')} (with test photos)`, photo: true }))];
  const script = scripts.find((s) => s.id === sel.script) ?? scripts[0];
  if (!recreation || !style || !script) return <p role="status">Loading the slides…</p>;

  const photoDeck = script.photo ? photos.find((p) => `photo:${p.deckId}` === script.id) : undefined;
  const list: RecSlide[] = script.photo ? [] : slides.filter((s) => s.style === style.name && s.script === script.id).sort((a, b) => a.index - b.index);
  const photoSlides = photoDeck ? parsePhotoSlides(photoDeck.item) : [];
  const deckKey = photoDeck ? `step11|${photoDeck.groupTitle}|${photoDeck.item.id}` : '';
  const total = script.photo ? photoSlides.length : list.length;
  const keyOf = (n: number, s?: RecSlide) => (script.photo ? `slides|${style.name}|${photoDeck?.deckId}|${n}` : `style-recreation|${style.name}|${s!.script}|${s!.index}`);
  const waiting = Array.from({ length: total }).filter((_, i) => !records[keyOf(script.photo ? photoSlides[i].n : list[i].index, list[i])]?.verdict).length;

  return (
    <div>
      <div className="res-pickers">
        <label>
          <span className="small">Style</span>
          <select value={style.name} onChange={(e) => setSel({ style: e.target.value, script: '' })} aria-label="Style">
            {styles.map((s) => <option key={s.name} value={s.name}>{s.title}</option>)}
          </select>
        </label>
        <label>
          <span className="small">Script</span>
          <select value={script.id} onChange={(e) => setSel({ style: style.name, script: e.target.value })} aria-label="Script">
            {scripts.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </label>
        <p className="small" role="status"><b>Rate these {total} slides: matches, close, off or wrong.</b> <span className="muted">{waiting} still waiting for your verdict.</span></p>
      </div>

      {script.photo && photoDeck && (
        <AreaContext.Provider value="photo">
          <div className="res-item">
            <p className="small">
              <LabelChip tag={photoDeck.item.tag} /> {(photoDeck.item.facts ?? []).join(' ')}
            </p>
            <p className="small"><b>The whole deck:</b></p>
            <VerdictBox
              label={`${photoDeck.item.title} (the whole deck)`}
              options={VERDICT_WORDS}
              rec={records[deckKey]}
              k={deckKey}
              onChange={(v, r) => setRecord({ key: deckKey, step: 'step11', kind: 'item', image: photoDeck.groupTitle, option: photoDeck.item.title } as RecordBase, v, r)}
            />
          </div>
          <div className="res-rec-cards">
            {photoSlides.map((s) => {
              const key = keyOf(s.n);
              const base: RecordBase = { key, step: 'slides', kind: 'photo-slide', image: `${style.name} / ${photoDeck.deckId}`, option: s.label, checker: { pass: s.failed.length === 0, failed: s.failed.map((f, i) => ({ id: String(i), reason: f })) } };
              return (
                <div key={key} className="res-rec-card">
                  <Pic src={s.url} alt={`${style.title}, ${s.label}`} />
                  <p className="small"><b>{s.label}</b></p>
                  <p className="small"><LabelChip tag={photoDeck.item.tag} /></p>
                  <Check failed={s.failed} />
                  <VerdictBox label={`${style.title} ${photoDeck.deckId} slide ${s.n}`} options={VERDICT_WORDS} rec={records[key]} k={key} onChange={(v, r) => setRecord(base, v, r)} />
                </div>
              );
            })}
          </div>
        </AreaContext.Provider>
      )}

      {!script.photo && (
        <AreaContext.Provider value="styles">
          <div className="res-rec-cards">
            {list.map((s) => {
              const key = keyOf(s.index, s);
              const failed = s.lint.filter((l) => !l.pass);
              const quote = s.script === 'quote-cards';
              const base: RecordBase = { key, step: 'style-recreation', kind: 'style-slide', image: `${style.name} / ${s.scriptTitle}`, option: `${quote ? 'card' : 'slide'} ${s.index} (${s.type}, ${s.layout})`, checker: { pass: failed.length === 0, failed: failed.map((f) => ({ id: f.id, reason: f.reason })) } };
              return (
                <div key={key} className="res-rec-card">
                  <Pic src={s.pngUrl} alt={`${style.title}, ${quote ? 'quote card' : 'slide'} ${s.index}, ${s.type}`} />
                  <p className="small"><b>{quote ? 'Card' : 'Slide'} {s.index}</b> · {s.type}</p>
                  <p className="small muted" title={s.because}>Layout {s.layout} · palette {s.palette}</p>
                  <Check failed={failed.map((f) => f.reason)} total={s.lint.length} />
                  <VerdictBox label={`${style.title} ${s.script} ${s.index}`} options={VERDICT_WORDS} rec={records[key]} k={key} onChange={(v, r) => setRecord(base, v, r)} />
                </div>
              );
            })}
          </div>
        </AreaContext.Provider>
      )}
    </div>
  );
}
